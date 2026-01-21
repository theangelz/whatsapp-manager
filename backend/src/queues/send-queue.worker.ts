import Queue from 'bull'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { baileysManager } from '../server.js'
import { CloudAPIProvider } from '../providers/cloud-api/cloud-api.provider.js'
import { instanceLockService } from '../services/instance-lock.service.js'
import { rateLimiterService, RATE_LIMIT } from '../services/rate-limiter.service.js'

export const sendQueue = new Queue('send-queue', {
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
})

// Main processor - checks for items to send
sendQueue.process('process-queue', async (job) => {
  // Get instances that are not locked
  const availableInstances = await prisma.instanceLock.findMany({
    where: { status: 'LIVRE' },
    include: {
      instance: {
        select: {
          id: true,
          companyId: true,
          channel: true,
          status: true,
          phoneNumberId: true,
          accessToken: true,
        },
      },
    },
  })

  // Filter to only connected instances
  const connectedInstances = availableInstances.filter(
    (lock) => lock.instance.status === 'CONNECTED'
  )

  if (connectedInstances.length === 0) {
    return { message: 'No available instances' }
  }

  let processedCount = 0

  for (const lock of connectedInstances) {
    const instance = lock.instance

    // Check rate limit
    const rateCheck = await rateLimiterService.checkRateLimit(instance.id, instance.channel)
    if (!rateCheck.allowed) {
      continue
    }

    // Get next item in queue for this instance
    const now = new Date()
    const queueItem = await prisma.sendQueue.findFirst({
      where: {
        instanceId: instance.id,
        status: { in: ['WAITING', 'SCHEDULED'] },
        OR: [
          { scheduledFor: null },
          { scheduledFor: { lte: now } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    })

    if (!queueItem) {
      continue
    }

    // Try to acquire lock
    const lockAcquired = await instanceLockService.acquireLock(
      instance.id,
      'send-queue-worker',
      `Processing queue item ${queueItem.id}`
    )

    if (!lockAcquired) {
      continue
    }

    try {
      // Update queue item status
      await prisma.sendQueue.update({
        where: { id: queueItem.id },
        data: {
          status: 'PROCESSING',
          lastAttemptAt: new Date(),
          attempts: { increment: 1 },
        },
      })

      // Create message log
      const messageLog = await prisma.messageLog.create({
        data: {
          companyId: queueItem.companyId,
          instanceId: queueItem.instanceId,
          phoneNumber: queueItem.phoneNumber,
          messageContent: queueItem.messageContent,
          messageType: queueItem.messageType,
          webhookEventId: queueItem.webhookEventId || undefined,
          templateId: queueItem.templateId || undefined,
          appliedVariables: queueItem.variables || undefined,
          status: 'PROCESSING',
        },
      })

      const startTime = Date.now()
      let apiMessageId: string | undefined

      // Send message based on channel
      const jid = queueItem.phoneNumber.includes('@')
        ? queueItem.phoneNumber
        : `${queueItem.phoneNumber}@s.whatsapp.net`

      if (instance.channel === 'BAILEYS') {
        const result = await baileysManager.sendTextMessage(
          instance.id,
          jid,
          queueItem.messageContent
        )
        apiMessageId = result?.key?.id || undefined
      } else if (instance.channel === 'CLOUD_API') {
        // Cloud API - must use template
        if (!queueItem.templateId) {
          throw new Error('Cloud API requires a template')
        }

        const template = await prisma.messageTemplate.findUnique({
          where: { id: queueItem.templateId },
        })

        if (!template || !template.metaTemplateName) {
          throw new Error('Template or Meta template name not found')
        }

        const cloudApi = new CloudAPIProvider(instance)
        const result = await cloudApi.sendTemplateMessage(
          queueItem.phoneNumber,
          template.metaTemplateName,
          'pt_BR'
        )
        apiMessageId = result?.messages?.[0]?.id
      }

      // Record rate limit
      await rateLimiterService.recordSend(instance.id, instance.channel)

      // Update message log
      await prisma.messageLog.update({
        where: { id: messageLog.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          apiMessageId,
          processingTimeMs: Date.now() - startTime,
        },
      })

      // Update queue item
      await prisma.sendQueue.update({
        where: { id: queueItem.id },
        data: {
          status: 'COMPLETED',
          messageLogId: messageLog.id,
        },
      })

      // Release lock
      await instanceLockService.releaseLock(instance.id)

      processedCount++
    } catch (error: any) {
      console.error(`Error processing queue item ${queueItem.id}:`, error.message)

      // Record error
      await instanceLockService.recordError(instance.id, error.message)

      // Update queue item
      const queueItemUpdated = await prisma.sendQueue.findUnique({
        where: { id: queueItem.id },
      })

      if (queueItemUpdated && queueItemUpdated.attempts >= queueItemUpdated.maxAttempts) {
        // Max attempts reached
        await prisma.sendQueue.update({
          where: { id: queueItem.id },
          data: {
            status: 'FAILED',
            error: error.message,
          },
        })

        // Update message log if exists
        await prisma.messageLog.updateMany({
          where: {
            companyId: queueItem.companyId,
            instanceId: queueItem.instanceId,
            phoneNumber: queueItem.phoneNumber,
            status: 'PROCESSING',
          },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            errorMessage: error.message,
          },
        })
      } else {
        // Schedule retry
        const retryDelay = Math.min(30000 * (queueItemUpdated?.attempts || 1), 300000) // Max 5 min
        await prisma.sendQueue.update({
          where: { id: queueItem.id },
          data: {
            status: 'WAITING',
            error: error.message,
            nextAttemptAt: new Date(Date.now() + retryDelay),
          },
        })
      }
    }
  }

  return { processed: processedCount }
})

// Schedule periodic processing
export function startSendQueueProcessor() {
  // Process every 5 seconds
  setInterval(async () => {
    try {
      await sendQueue.add('process-queue', {}, { removeOnComplete: true })
    } catch (error) {
      console.error('Error adding process-queue job:', error)
    }
  }, 5000)

  // Also release stale locks every 5 minutes
  setInterval(async () => {
    try {
      const released = await instanceLockService.releaseStaleLocksLocks()
      if (released > 0) {
        console.log(`Released ${released} stale locks`)
      }
    } catch (error) {
      console.error('Error releasing stale locks:', error)
    }
  }, 300000)

  console.log('Send queue processor started')
}

sendQueue.on('failed', (job, err) => {
  console.error(`Send queue job ${job.id} failed:`, err)
})

sendQueue.on('completed', (job, result) => {
  if (result?.processed > 0) {
    console.log(`Send queue processed ${result.processed} messages`)
  }
})
