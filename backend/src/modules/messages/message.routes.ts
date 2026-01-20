import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { authMiddleware, apiTokenMiddleware } from '../../middlewares/auth.middleware.js'
import { baileysManager } from '../../server.js'
import { CloudAPIProvider } from '../../providers/cloud-api/cloud-api.provider.js'

const sendTextSchema = z.object({
  instanceId: z.string().uuid().optional(),
  to: z.string().min(10),
  text: z.string().min(1),
})

const sendMediaSchema = z.object({
  instanceId: z.string().uuid().optional(),
  to: z.string().min(10),
  mediaType: z.enum(['image', 'video', 'audio', 'document']),
  mediaUrl: z.string().url(),
  caption: z.string().optional(),
  fileName: z.string().optional(),
})

const sendTemplateSchema = z.object({
  instanceId: z.string().uuid().optional(),
  to: z.string().min(10),
  templateName: z.string(),
  language: z.string().default('pt_BR'),
  components: z.array(z.any()).optional(),
})

export async function messageRoutes(fastify: FastifyInstance) {
  // Authenticated routes (via JWT)
  fastify.register(async (app) => {
    app.addHook('preHandler', authMiddleware)

    // Get messages for instance (last 3 days only)
    app.get('/:instanceId', async (request: FastifyRequest<{ Params: { instanceId: string }; Querystring: { page?: string; limit?: string; remoteJid?: string } }>, reply: FastifyReply) => {
      const { instanceId } = request.params
      const page = parseInt(request.query.page || '1')
      const limit = parseInt(request.query.limit || '50')
      const remoteJid = request.query.remoteJid

      const instance = await prisma.instance.findFirst({
        where: { id: instanceId, companyId: request.user.companyId },
      })

      if (!instance) {
        return reply.status(404).send({ error: 'Instance not found' })
      }

      // Filter messages from last 3 days only
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      const where: any = {
        instanceId,
        createdAt: { gte: threeDaysAgo },
      }
      if (remoteJid) {
        where.remoteJid = remoteJid
      }

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.message.count({ where }),
      ])

      return reply.send({
        messages,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      })
    })

    // Send text message (authenticated)
    app.post('/send', async (request: FastifyRequest, reply: FastifyReply) => {
      const data = sendTextSchema.parse(request.body)

      if (!data.instanceId) {
        return reply.status(400).send({ error: 'instanceId is required' })
      }

      const instance = await prisma.instance.findFirst({
        where: { id: data.instanceId, companyId: request.user.companyId, isActive: true },
      })

      if (!instance) {
        return reply.status(404).send({ error: 'Instance not found' })
      }

      if (instance.status !== 'CONNECTED') {
        return reply.status(400).send({ error: 'Instance is not connected' })
      }

      try {
        if (instance.channel === 'BAILEYS') {
          const result = await baileysManager.sendTextMessage(instance.id, data.to, data.text)
          return reply.send({ success: true, messageId: result?.key.id })
        } else {
          const cloudApi = new CloudAPIProvider(instance)
          const result = await cloudApi.sendTextMessage(data.to, data.text)
          return reply.send({ success: true, messageId: result.messages?.[0]?.id })
        }
      } catch (error: any) {
        return reply.status(500).send({ error: error.message })
      }
    })

    // Send media message (authenticated)
    app.post('/send-media', async (request: FastifyRequest, reply: FastifyReply) => {
      const data = sendMediaSchema.parse(request.body)

      if (!data.instanceId) {
        return reply.status(400).send({ error: 'instanceId is required' })
      }

      const instance = await prisma.instance.findFirst({
        where: { id: data.instanceId, companyId: request.user.companyId, isActive: true },
      })

      if (!instance) {
        return reply.status(404).send({ error: 'Instance not found' })
      }

      if (instance.status !== 'CONNECTED') {
        return reply.status(400).send({ error: 'Instance is not connected' })
      }

      try {
        if (instance.channel === 'BAILEYS') {
          const result = await baileysManager.sendMediaMessage(
            instance.id,
            data.to,
            data.mediaType,
            data.mediaUrl,
            data.caption,
            data.fileName
          )
          return reply.send({ success: true, messageId: result?.key.id })
        } else {
          const cloudApi = new CloudAPIProvider(instance)
          const result = await cloudApi.sendMediaMessage(data.to, data.mediaType, data.mediaUrl, data.caption)
          return reply.send({ success: true, messageId: result.messages?.[0]?.id })
        }
      } catch (error: any) {
        return reply.status(500).send({ error: error.message })
      }
    })
  })

  // API Token routes (for external integrations)
  fastify.register(async (app) => {
    app.addHook('preHandler', apiTokenMiddleware)

    // Send text via API token
    app.post('/api/send', async (request: FastifyRequest, reply: FastifyReply) => {
      const data = sendTextSchema.parse(request.body)
      const instance = request.instance!

      if (instance.status !== 'CONNECTED') {
        return reply.status(400).send({ error: 'Instance is not connected' })
      }

      try {
        if (instance.channel === 'BAILEYS') {
          const result = await baileysManager.sendTextMessage(instance.id, data.to, data.text)
          return reply.send({ success: true, messageId: result?.key.id })
        } else {
          const fullInstance = await prisma.instance.findUnique({ where: { id: instance.id } })

          if (!fullInstance) {
            return reply.status(404).send({ error: 'Instance not found' })
          }

          if (!fullInstance.phoneNumberId || !fullInstance.accessToken) {
            return reply.status(400).send({
              error: 'Cloud API credentials not configured. Please add Phone Number ID and Access Token in the instance settings.'
            })
          }

          const cloudApi = new CloudAPIProvider(fullInstance)
          const result = await cloudApi.sendTextMessage(data.to, data.text)
          return reply.send({ success: true, messageId: result.messages?.[0]?.id })
        }
      } catch (error: any) {
        console.error('API send error:', error)
        return reply.status(500).send({ error: error.message || 'Error sending message' })
      }
    })

    // Send media via API token
    app.post('/api/send-media', async (request: FastifyRequest, reply: FastifyReply) => {
      const data = sendMediaSchema.parse(request.body)
      const instance = request.instance!

      if (instance.status !== 'CONNECTED') {
        return reply.status(400).send({ error: 'Instance is not connected' })
      }

      try {
        if (instance.channel === 'BAILEYS') {
          const result = await baileysManager.sendMediaMessage(
            instance.id,
            data.to,
            data.mediaType,
            data.mediaUrl,
            data.caption,
            data.fileName
          )
          return reply.send({ success: true, messageId: result?.key.id })
        } else {
          const fullInstance = await prisma.instance.findUnique({ where: { id: instance.id } })

          if (!fullInstance) {
            return reply.status(404).send({ error: 'Instance not found' })
          }

          if (!fullInstance.phoneNumberId || !fullInstance.accessToken) {
            return reply.status(400).send({
              error: 'Cloud API credentials not configured. Please add Phone Number ID and Access Token in the instance settings.'
            })
          }

          const cloudApi = new CloudAPIProvider(fullInstance)
          const result = await cloudApi.sendMediaMessage(data.to, data.mediaType, data.mediaUrl, data.caption)
          return reply.send({ success: true, messageId: result.messages?.[0]?.id })
        }
      } catch (error: any) {
        console.error('API send-media error:', error)
        return reply.status(500).send({ error: error.message || 'Error sending media message' })
      }
    })

    // Send template via API token
    app.post('/api/send-template', async (request: FastifyRequest, reply: FastifyReply) => {
      const data = sendTemplateSchema.parse(request.body)
      const instance = request.instance!

      if (instance.channel !== 'CLOUD_API') {
        return reply.status(400).send({ error: 'Templates are only available for Cloud API instances' })
      }

      try {
        const fullInstance = await prisma.instance.findUnique({ where: { id: instance.id } })

        if (!fullInstance) {
          return reply.status(404).send({ error: 'Instance not found' })
        }

        if (!fullInstance.phoneNumberId || !fullInstance.accessToken) {
          return reply.status(400).send({
            error: 'Cloud API credentials not configured. Please add Phone Number ID and Access Token in the instance settings.'
          })
        }

        const cloudApi = new CloudAPIProvider(fullInstance)
        const result = await cloudApi.sendTemplateMessage(data.to, data.templateName, data.language, data.components)
        return reply.send({ success: true, messageId: result.messages?.[0]?.id })
      } catch (error: any) {
        console.error('Cloud API send-template error:', error)
        return reply.status(500).send({ error: error.message || 'Error sending template message' })
      }
    })
  })
}
