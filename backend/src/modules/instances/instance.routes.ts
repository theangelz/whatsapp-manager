import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { baileysManager } from '../../server.js'
import { CloudAPIProvider } from '../../providers/cloud-api/cloud-api.provider.js'

const createInstanceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  channel: z.enum(['BAILEYS', 'CLOUD_API']).default('BAILEYS'),
  webhookUrl: z.string().url().optional(),
  webhookEvents: z.array(z.string()).optional(),
  // Cloud API fields
  wabaId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  accessToken: z.string().optional(),
})

const updateInstanceSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  webhookUrl: z.string().url().optional().nullable(),
  webhookEvents: z.array(z.string()).optional(),
  rejectCalls: z.boolean().optional(),
  alwaysOnline: z.boolean().optional(),
  readMessages: z.boolean().optional(),
  wabaId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  accessToken: z.string().optional(),
})

const cloudApiConfigSchema = z.object({
  wabaId: z.string().optional(),
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  webhookSecret: z.string().optional(),
})

export async function instanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // List instances
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const instances = await prisma.instance.findMany({
      where: {
        companyId: request.user.companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        channel: true,
        status: true,
        phoneNumber: true,
        profileName: true,
        profilePicture: true,
        messagesSent: true,
        messagesReceived: true,
        createdAt: true,
        apiToken: true,
        // Cloud API fields
        wabaId: true,
        phoneNumberId: true,
        accessToken: true,
        webhookSecret: true,
        // Webhook config
        webhookUrl: true,
        webhookEvents: true,
        // Integrations
        typebotIntegration: true,
        n8nIntegration: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send(instances)
  })

  // Get instance by ID
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const instance = await prisma.instance.findFirst({
      where: {
        id,
        companyId: request.user.companyId,
        isActive: true,
      },
      include: {
        typebotIntegration: true,
        n8nIntegration: true,
      },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    return reply.send(instance)
  })

  // Create instance
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = createInstanceSchema.parse(request.body)

    const instance = await prisma.instance.create({
      data: {
        ...data,
        companyId: request.user.companyId,
        apiToken: uuid(),
        webhookEvents: data.webhookEvents || ['message.received', 'message.sent'],
      },
    })

    return reply.status(201).send(instance)
  })

  // Update instance
  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const data = updateInstanceSchema.parse(request.body)

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const updated = await prisma.instance.update({
      where: { id },
      data,
    })

    return reply.send(updated)
  })

  // Update Cloud API configuration
  fastify.put('/:id/cloud-api-config', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const data = cloudApiConfigSchema.parse(request.body)

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    if (instance.channel !== 'CLOUD_API') {
      return reply.status(400).send({ error: 'This configuration is only for Cloud API instances' })
    }

    // Try to fetch phone number info from Meta
    let phoneNumber: string | null = null
    let profileName: string | null = null

    try {
      const cloudApi = new CloudAPIProvider({
        phoneNumberId: data.phoneNumberId,
        accessToken: data.accessToken,
      })
      const phoneInfo = await cloudApi.getPhoneNumberInfo()
      phoneNumber = phoneInfo.display_phone_number?.replace(/\D/g, '') || null
      profileName = phoneInfo.verified_name || null
    } catch (error: any) {
      console.error('Error fetching phone info from Meta:', error.message)
    }

    const updated = await prisma.instance.update({
      where: { id },
      data: {
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        accessToken: data.accessToken,
        webhookSecret: data.webhookSecret,
        phoneNumber,
        profileName,
        status: 'CONNECTED',
      },
    })

    return reply.send(updated)
  })

  // Sync templates from Meta
  fastify.post('/:id/sync-templates', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    if (instance.channel !== 'CLOUD_API') {
      return reply.status(400).send({ error: 'Templates sync is only for Cloud API instances' })
    }

    if (!instance.wabaId || !instance.accessToken) {
      return reply.status(400).send({ error: 'Cloud API credentials not configured' })
    }

    try {
      const cloudApi = new CloudAPIProvider({
        phoneNumberId: instance.phoneNumberId,
        accessToken: instance.accessToken,
      })

      const metaTemplates = await cloudApi.getTemplates(instance.wabaId)

      // Sync templates to database
      let synced = 0
      for (const template of metaTemplates) {
        const status = template.status === 'APPROVED' ? 'APPROVED'
          : template.status === 'REJECTED' ? 'REJECTED'
          : 'PENDING'

        // Extract components
        const components = template.components || []
        const header = components.find((c: any) => c.type === 'HEADER')
        const body = components.find((c: any) => c.type === 'BODY')
        const footer = components.find((c: any) => c.type === 'FOOTER')
        const buttons = components.find((c: any) => c.type === 'BUTTONS')

        await prisma.template.upsert({
          where: {
            companyId_name: {
              companyId: instance.companyId,
              name: template.name,
            },
          },
          update: {
            status,
            category: template.category || 'MARKETING',
            language: template.language || 'pt_BR',
            headerType: header?.format || null,
            headerContent: header?.text || header?.example?.header_handle?.[0] || null,
            bodyText: body?.text || '',
            footerText: footer?.text || null,
            buttons: buttons?.buttons || null,
            metaId: template.id,
          },
          create: {
            companyId: instance.companyId,
            name: template.name,
            status,
            category: template.category || 'MARKETING',
            language: template.language || 'pt_BR',
            headerType: header?.format || null,
            headerContent: header?.text || header?.example?.header_handle?.[0] || null,
            bodyText: body?.text || '',
            footerText: footer?.text || null,
            buttons: buttons?.buttons || null,
            metaId: template.id,
          },
        })
        synced++
      }

      return reply.send({
        success: true,
        message: `${synced} templates sincronizados`,
        total: metaTemplates.length
      })
    } catch (error: any) {
      console.error('Error syncing templates:', error)
      return reply.status(500).send({ error: error.message })
    }
  })

  // Delete instance
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    if (instance.channel === 'BAILEYS') {
      try {
        await baileysManager.logoutInstance(id)
      } catch (error) {
        console.error('Error logging out instance:', error)
      }
    }

    await prisma.instance.update({
      where: { id },
      data: { isActive: false },
    })

    return reply.status(204).send()
  })

  // Connect instance (Baileys - generates QR code)
  fastify.post('/:id/connect', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId, isActive: true },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    if (instance.channel !== 'BAILEYS') {
      return reply.status(400).send({ error: 'Only Baileys instances can be connected via QR code' })
    }

    try {
      await baileysManager.initInstance(id)
      return reply.send({ message: 'Connection initiated. Waiting for QR code.' })
    } catch (error: any) {
      return reply.status(500).send({ error: error.message })
    }
  })

  // Disconnect instance
  fastify.post('/:id/disconnect', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    if (instance.channel === 'BAILEYS') {
      await baileysManager.disconnectInstance(id)
    }

    return reply.send({ message: 'Instance disconnected' })
  })

  // Logout instance (removes session)
  fastify.post('/:id/logout', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    if (instance.channel === 'BAILEYS') {
      await baileysManager.logoutInstance(id)
    }

    return reply.send({ message: 'Instance logged out' })
  })

  // Get QR code
  fastify.get('/:id/qrcode', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const qrCode = baileysManager.getQRCode(id) || instance.qrCode

    if (!qrCode) {
      return reply.status(404).send({ error: 'QR code not available' })
    }

    return reply.send({ qrCode })
  })

  // Regenerate API token
  fastify.post('/:id/regenerate-token', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const updated = await prisma.instance.update({
      where: { id },
      data: { apiToken: uuid() },
      select: { apiToken: true },
    })

    return reply.send({ apiToken: updated.apiToken })
  })

  // Get groups
  fastify.get('/:id/groups', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId, isActive: true },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    if (instance.status !== 'CONNECTED') {
      return reply.status(400).send({ error: 'Instance is not connected' })
    }

    if (instance.channel !== 'BAILEYS') {
      return reply.status(400).send({ error: 'Groups are only available for Baileys instances' })
    }

    try {
      const groups = await baileysManager.getGroups(id)
      return reply.send(groups)
    } catch (error: any) {
      return reply.status(500).send({ error: error.message })
    }
  })

  // Get group info
  fastify.get('/:id/groups/:groupId', async (request: FastifyRequest<{ Params: { id: string; groupId: string } }>, reply: FastifyReply) => {
    const { id, groupId } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id, companyId: request.user.companyId, isActive: true },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    if (instance.status !== 'CONNECTED') {
      return reply.status(400).send({ error: 'Instance is not connected' })
    }

    if (instance.channel !== 'BAILEYS') {
      return reply.status(400).send({ error: 'Groups are only available for Baileys instances' })
    }

    try {
      const group = await baileysManager.getGroupInfo(id, groupId)
      return reply.send(group)
    } catch (error: any) {
      return reply.status(500).send({ error: error.message })
    }
  })
}
