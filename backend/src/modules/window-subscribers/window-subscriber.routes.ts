import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { CloudAPIProvider } from '../../providers/cloud-api/cloud-api.provider.js'

// Schemas
const createSubscriberSchema = z.object({
  instanceId: z.string().uuid(),
  phoneNumber: z.string().min(10),
  name: z.string().optional(),
})

const updateSubscriberSchema = z.object({
  name: z.string().optional(),
  isActive: z.boolean().optional(),
})

/**
 * Check if 24h window is open for a phone number
 */
async function isWindowOpen(companyId: string, phoneNumber: string): Promise<{ open: boolean; expiresAt?: Date }> {
  const contact = await prisma.contact.findUnique({
    where: {
      companyId_phoneNumber: {
        companyId,
        phoneNumber,
      },
    },
    select: { lastInboundAt: true },
  })

  if (!contact?.lastInboundAt) {
    return { open: false }
  }

  const now = new Date()
  const expiresAt = new Date(contact.lastInboundAt.getTime() + 24 * 60 * 60 * 1000)
  const isOpen = now < expiresAt

  return { open: isOpen, expiresAt: isOpen ? expiresAt : undefined }
}

// Default template for window notification
// Template UTILITY with QUICK_REPLY buttons for window renewal
const DEFAULT_WINDOW_TEMPLATE = 'janela_renovar'
const DEFAULT_WINDOW_TEMPLATE_LANG = 'pt_BR'

/**
 * Send window renewal notification using a template (works outside 24h window)
 * Templates with QUICK_REPLY buttons work anytime - they're pre-approved by Meta
 */
async function sendWindowNotification(
  instance: any,
  phoneNumber: string,
  templateName: string = DEFAULT_WINDOW_TEMPLATE,
  templateLang: string = DEFAULT_WINDOW_TEMPLATE_LANG
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (instance.channel !== 'CLOUD_API' && instance.channel !== 'COEXISTENCE') {
    return { success: false, error: 'Instance must be Cloud API or Coexistence' }
  }

  try {
    const cloudApi = new CloudAPIProvider(instance)

    console.log(`[WindowNotify] Sending template "${templateName}" to ${phoneNumber}`)

    // Send template message (works outside 24h window)
    // The template should have QUICK_REPLY buttons configured
    // When user clicks a button, it counts as inbound message and opens the window
    const result = await cloudApi.sendTemplateMessage(
      phoneNumber,
      templateName,
      templateLang,
      [] // No body parameters needed for simple notification template
    )

    console.log(`[WindowNotify] Meta response:`, JSON.stringify(result))

    return { success: true, messageId: result?.messages?.[0]?.id }
  } catch (error: any) {
    console.error('[WindowNotify] Error sending:', error.message, error.response?.data)
    return { success: false, error: error.message }
  }
}

export async function windowSubscriberRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.register(async (app) => {
    app.addHook('preHandler', authMiddleware)

    // List all window subscribers for company
    app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
      const subscribers = await prisma.windowSubscriber.findMany({
        where: { companyId: request.user.companyId },
        include: {
          instance: {
            select: { id: true, name: true, phoneNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Enrich with window status
      const enriched = await Promise.all(
        subscribers.map(async (sub) => {
          const windowStatus = await isWindowOpen(sub.companyId, sub.phoneNumber)
          return {
            ...sub,
            windowOpen: windowStatus.open,
            windowExpiresAt: windowStatus.expiresAt,
          }
        })
      )

      return reply.send(enriched)
    })

    // Create new subscriber
    app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
      const data = createSubscriberSchema.parse(request.body)

      // Verify instance belongs to company
      const instance = await prisma.instance.findFirst({
        where: { id: data.instanceId, companyId: request.user.companyId },
      })

      if (!instance) {
        return reply.status(404).send({ error: 'Instance not found' })
      }

      if (instance.channel !== 'CLOUD_API' && instance.channel !== 'COEXISTENCE') {
        return reply.status(400).send({ error: 'Instance must be Cloud API or Coexistence' })
      }

      // Clean phone number
      const phoneNumber = data.phoneNumber.replace(/\D/g, '')

      const subscriber = await prisma.windowSubscriber.create({
        data: {
          companyId: request.user.companyId,
          instanceId: data.instanceId,
          phoneNumber,
          name: data.name,
        },
        include: {
          instance: {
            select: { id: true, name: true, phoneNumber: true },
          },
        },
      })

      return reply.status(201).send(subscriber)
    })

    // Update subscriber
    app.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params
      const data = updateSubscriberSchema.parse(request.body)

      const subscriber = await prisma.windowSubscriber.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!subscriber) {
        return reply.status(404).send({ error: 'Subscriber not found' })
      }

      const updated = await prisma.windowSubscriber.update({
        where: { id },
        data,
        include: {
          instance: {
            select: { id: true, name: true, phoneNumber: true },
          },
        },
      })

      return reply.send(updated)
    })

    // Delete subscriber
    app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const subscriber = await prisma.windowSubscriber.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!subscriber) {
        return reply.status(404).send({ error: 'Subscriber not found' })
      }

      await prisma.windowSubscriber.delete({ where: { id } })

      return reply.send({ success: true })
    })

    // Check window status for a subscriber
    app.get('/:id/status', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const subscriber = await prisma.windowSubscriber.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!subscriber) {
        return reply.status(404).send({ error: 'Subscriber not found' })
      }

      const windowStatus = await isWindowOpen(subscriber.companyId, subscriber.phoneNumber)

      return reply.send({
        phoneNumber: subscriber.phoneNumber,
        windowOpen: windowStatus.open,
        windowExpiresAt: windowStatus.expiresAt,
      })
    })

    // Manually send notification to a subscriber
    app.post('/:id/notify', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const subscriber = await prisma.windowSubscriber.findFirst({
        where: { id, companyId: request.user.companyId },
        include: { instance: true },
      })

      if (!subscriber) {
        return reply.status(404).send({ error: 'Subscriber not found' })
      }

      if (subscriber.instance.status !== 'CONNECTED') {
        return reply.status(400).send({ error: 'Instance is not connected' })
      }

      const result = await sendWindowNotification(subscriber.instance, subscriber.phoneNumber)

      if (result.success) {
        await prisma.windowSubscriber.update({
          where: { id },
          data: { lastNotified: new Date() },
        })
      }

      return reply.send(result)
    })

    // Notify all subscribers (manual trigger - sends to everyone regardless of window status)
    app.post('/notify-all', async (request: FastifyRequest, reply: FastifyReply) => {
      const subscribers = await prisma.windowSubscriber.findMany({
        where: {
          companyId: request.user.companyId,
          isActive: true,
        },
        include: { instance: true },
      })

      const results: any[] = []

      for (const subscriber of subscribers) {
        const windowStatus = await isWindowOpen(subscriber.companyId, subscriber.phoneNumber)

        if (subscriber.instance.status !== 'CONNECTED') {
          results.push({
            phoneNumber: subscriber.phoneNumber,
            name: subscriber.name,
            success: false,
            error: 'Instance not connected',
            windowOpen: windowStatus.open,
          })
          continue
        }

        const result = await sendWindowNotification(subscriber.instance, subscriber.phoneNumber)

        if (result.success) {
          await prisma.windowSubscriber.update({
            where: { id: subscriber.id },
            data: { lastNotified: new Date() },
          })
        }

        results.push({
          phoneNumber: subscriber.phoneNumber,
          name: subscriber.name,
          windowOpen: windowStatus.open,
          windowExpiresAt: windowStatus.expiresAt,
          ...result,
        })

        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      return reply.send({ notified: results.filter(r => r.success).length, results })
    })
  })
}

// Export the notification function for the scheduler
export { sendWindowNotification, isWindowOpen }
