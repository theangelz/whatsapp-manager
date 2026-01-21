import Queue from 'bull'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { baileysManager } from '../server.js'
import { CloudAPIProvider } from '../providers/cloud-api/cloud-api.provider.js'

export const campaignQueue = new Queue('campaign-queue', {
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
})

campaignQueue.process('process-campaign', async (job) => {
  const { campaignId } = job.data

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      campaignInstances: {
        include: {
          instance: true,
        },
      },
      campaignContacts: {
        where: { status: 'PENDING' },
        include: {
          contact: true,
        },
        take: 50,
      },
    },
  })

  if (!campaign || campaign.status !== 'RUNNING') {
    return { message: 'Campaign not running or not found' }
  }

  const availableInstances = campaign.campaignInstances
    .filter((ci) => ci.instance.status === 'CONNECTED')
    .map((ci) => ci.instance)

  if (availableInstances.length === 0) {
    return { message: 'No connected instances available' }
  }

  let sentCount = 0
  let failedCount = 0
  let instanceIndex = 0

  for (const campaignContact of campaign.campaignContacts) {
    const instance = availableInstances[instanceIndex % availableInstances.length]
    instanceIndex++

    try {
      const phoneNumber = campaignContact.contact.phoneNumber.replace(/\D/g, '')

      if (instance.channel === 'BAILEYS') {
        const jid = `${phoneNumber}@s.whatsapp.net`
        await baileysManager.sendTextMessage(instance.id, jid, campaign.messageContent)
      } else if (instance.channel === 'CLOUD_API') {
        const cloudApi = new CloudAPIProvider(instance)
        await cloudApi.sendTextMessage(phoneNumber, campaign.messageContent)
      }

      await prisma.campaignContact.update({
        where: { id: campaignContact.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      })

      sentCount++

      // Delay between messages
      await new Promise((resolve) => setTimeout(resolve, campaign.delay))
    } catch (error: any) {
      await prisma.campaignContact.update({
        where: { id: campaignContact.id },
        data: {
          status: 'FAILED',
          error: error.message,
        },
      })
      failedCount++
    }
  }

  // Update campaign stats
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: { increment: sentCount },
      failedCount: { increment: failedCount },
    },
  })

  // Check if there are more contacts to process
  const pendingContacts = await prisma.campaignContact.count({
    where: { campaignId, status: 'PENDING' },
  })

  if (pendingContacts > 0) {
    // Add job to process more contacts
    await campaignQueue.add(
      'process-campaign',
      { campaignId },
      { delay: 5000 }
    )
  } else {
    // Campaign completed
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    })
  }

  return { sent: sentCount, failed: failedCount }
})

campaignQueue.on('failed', (job, err) => {
  console.error(`Campaign queue job ${job.id} failed:`, err)
})
