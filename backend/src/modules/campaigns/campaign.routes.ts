import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { campaignQueue } from '../../queues/campaign.queue.js'

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  messageType: z.enum(['text', 'image', 'video', 'document', 'template']).default('text'),
  messageContent: z.string().min(1),
  mediaUrl: z.string().url().optional(),
  templateId: z.string().uuid().optional(),
  delay: z.number().min(1000).max(60000).default(3000),
  instanceIds: z.array(z.string().uuid()).min(1),
  contactIds: z.array(z.string().uuid()).optional(),
  contactTags: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
})

export async function campaignRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // List campaigns
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const campaigns = await prisma.campaign.findMany({
      where: { companyId: request.user.companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { campaignContacts: true },
        },
      },
    })

    return reply.send(campaigns)
  })

  // Get campaign by ID
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: request.user.companyId },
      include: {
        campaignInstances: {
          include: { instance: { select: { id: true, name: true, status: true } } },
        },
        campaignContacts: {
          include: { contact: { select: { id: true, name: true, phoneNumber: true } } },
          take: 100,
        },
      },
    })

    if (!campaign) {
      return reply.status(404).send({ error: 'Campaign not found' })
    }

    return reply.send(campaign)
  })

  // Create campaign
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = createCampaignSchema.parse(request.body)

    // Get contacts
    let contacts: { id: string }[] = []

    if (data.contactIds && data.contactIds.length > 0) {
      contacts = await prisma.contact.findMany({
        where: {
          id: { in: data.contactIds },
          companyId: request.user.companyId,
          isActive: true,
        },
        select: { id: true },
      })
    } else if (data.contactTags && data.contactTags.length > 0) {
      contacts = await prisma.contact.findMany({
        where: {
          companyId: request.user.companyId,
          isActive: true,
          tags: { hasSome: data.contactTags },
        },
        select: { id: true },
      })
    } else {
      contacts = await prisma.contact.findMany({
        where: { companyId: request.user.companyId, isActive: true },
        select: { id: true },
      })
    }

    if (contacts.length === 0) {
      return reply.status(400).send({ error: 'No contacts found for this campaign' })
    }

    // Verify instances
    const instances = await prisma.instance.findMany({
      where: {
        id: { in: data.instanceIds },
        companyId: request.user.companyId,
        isActive: true,
      },
    })

    if (instances.length === 0) {
      return reply.status(400).send({ error: 'No valid instances found' })
    }

    const campaign = await prisma.campaign.create({
      data: {
        companyId: request.user.companyId,
        name: data.name,
        description: data.description,
        messageType: data.messageType,
        messageContent: data.messageContent,
        mediaUrl: data.mediaUrl,
        templateId: data.templateId,
        delay: data.delay,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        totalContacts: contacts.length,
        campaignInstances: {
          create: instances.map((i) => ({ instanceId: i.id })),
        },
        campaignContacts: {
          create: contacts.map((c) => ({ contactId: c.id })),
        },
      },
    })

    return reply.status(201).send(campaign)
  })

  // Start campaign
  fastify.post('/:id/start', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: request.user.companyId },
      include: {
        campaignInstances: { include: { instance: true } },
        campaignContacts: { include: { contact: true }, where: { status: 'PENDING' } },
      },
    })

    if (!campaign) {
      return reply.status(404).send({ error: 'Campaign not found' })
    }

    if (!['DRAFT', 'PAUSED'].includes(campaign.status)) {
      return reply.status(400).send({ error: 'Campaign cannot be started' })
    }

    const connectedInstances = campaign.campaignInstances.filter(
      (ci) => ci.instance.status === 'CONNECTED'
    )

    if (connectedInstances.length === 0) {
      return reply.status(400).send({ error: 'No connected instances available' })
    }

    await prisma.campaign.update({
      where: { id },
      data: {
        status: 'RUNNING',
        startedAt: campaign.startedAt || new Date(),
      },
    })

    // Add to queue
    await campaignQueue.add('process-campaign', {
      campaignId: id,
    })

    return reply.send({ message: 'Campaign started' })
  })

  // Pause campaign
  fastify.post('/:id/pause', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!campaign) {
      return reply.status(404).send({ error: 'Campaign not found' })
    }

    if (campaign.status !== 'RUNNING') {
      return reply.status(400).send({ error: 'Campaign is not running' })
    }

    await prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    })

    return reply.send({ message: 'Campaign paused' })
  })

  // Cancel campaign
  fastify.post('/:id/cancel', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!campaign) {
      return reply.status(404).send({ error: 'Campaign not found' })
    }

    if (['COMPLETED', 'CANCELLED'].includes(campaign.status)) {
      return reply.status(400).send({ error: 'Campaign already finished' })
    }

    await prisma.campaign.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    return reply.send({ message: 'Campaign cancelled' })
  })

  // Get campaign report
  fastify.get('/:id/report', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!campaign) {
      return reply.status(404).send({ error: 'Campaign not found' })
    }

    const stats = await prisma.campaignContact.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    })

    const report = {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalContacts: campaign.totalContacts,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
      },
      stats: {
        pending: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
      },
    }

    stats.forEach((s) => {
      const key = s.status.toLowerCase() as keyof typeof report.stats
      if (key in report.stats) {
        report.stats[key] = s._count
      }
    })

    return reply.send(report)
  })

  // Delete campaign
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!campaign) {
      return reply.status(404).send({ error: 'Campaign not found' })
    }

    if (campaign.status === 'RUNNING') {
      return reply.status(400).send({ error: 'Cannot delete a running campaign' })
    }

    await prisma.campaign.delete({ where: { id } })

    return reply.status(204).send()
  })
}
