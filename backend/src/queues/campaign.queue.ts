import Queue from 'bull'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { baileysManager } from '../server.js'
import { CloudAPIProvider } from '../providers/cloud-api/cloud-api.provider.js'

export const campaignQueue = new Queue('campaign', {
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
        include: { instance: true },
      },
      campaignContacts: {
        where: { status: 'PENDING' },
        include: { contact: true },
        take: 100,
      },
    },
  })

  if (!campaign || campaign.status !== 'RUNNING') {
    return { message: 'Campaign not running' }
  }

  const connectedInstances = campaign.campaignInstances
    .filter((ci) => ci.instance.status === 'CONNECTED')
    .map((ci) => ci.instance)

  if (connectedInstances.length === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED' },
    })
    return { message: 'No connected instances' }
  }

  let instanceIndex = 0

  for (const campaignContact of campaign.campaignContacts) {
    // Check if campaign is still running
    const currentCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    })

    if (currentCampaign?.status !== 'RUNNING') {
      break
    }

    const instance = connectedInstances[instanceIndex % connectedInstances.length]
    instanceIndex++

    try {
      if (instance.channel === 'BAILEYS') {
        if (campaign.messageType === 'text') {
          await baileysManager.sendTextMessage(
            instance.id,
            campaignContact.contact.phoneNumber,
            campaign.messageContent
          )
        } else if (campaign.mediaUrl) {
          await baileysManager.sendMediaMessage(
            instance.id,
            campaignContact.contact.phoneNumber,
            campaign.messageType as 'image' | 'video' | 'audio' | 'document',
            campaign.mediaUrl,
            campaign.messageContent
          )
        }
      } else if (instance.channel === 'CLOUD_API') {
        const cloudApi = new CloudAPIProvider(instance)

        if (campaign.messageType === 'text') {
          await cloudApi.sendTextMessage(
            campaignContact.contact.phoneNumber,
            campaign.messageContent
          )
        } else if (campaign.messageType === 'template' && campaign.templateId) {
          const template = await prisma.template.findUnique({
            where: { id: campaign.templateId },
          })
          if (template) {
            await cloudApi.sendTemplateMessage(
              campaignContact.contact.phoneNumber,
              template.name,
              template.language
            )
          }
        }
      }

      await prisma.campaignContact.update({
        where: { id: campaignContact.id },
        data: { status: 'SENT', sentAt: new Date() },
      })

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } },
      })
    } catch (error: any) {
      await prisma.campaignContact.update({
        where: { id: campaignContact.id },
        data: { status: 'FAILED', error: error.message },
      })

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { failedCount: { increment: 1 } },
      })
    }

    // Delay between messages (anti-ban)
    await new Promise((resolve) => setTimeout(resolve, campaign.delay))
  }

  // Check if there are more pending contacts
  const pendingCount = await prisma.campaignContact.count({
    where: { campaignId, status: 'PENDING' },
  })

  if (pendingCount > 0) {
    // Add back to queue for next batch
    await campaignQueue.add('process-campaign', { campaignId }, { delay: 1000 })
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

  return { message: 'Batch processed' }
})

campaignQueue.on('failed', (job, err) => {
  console.error(`Campaign job ${job.id} failed:`, err)
})
