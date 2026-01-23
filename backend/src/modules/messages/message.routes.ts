import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import axios from 'axios'
import { prisma } from '../../config/database.js'
import { authMiddleware, apiTokenMiddleware } from '../../middlewares/auth.middleware.js'
import { baileysManager } from '../../server.js'
import { CloudAPIProvider } from '../../providers/cloud-api/cloud-api.provider.js'
import { isSystemOperational } from '../../core/core.wpp.js'

// Verificacao de sistema integrada
const _v = () => { if (!isSystemOperational()) throw new Error('Sistema indisponivel') }

// Helper para disparar webhook após envio de mensagem
async function triggerSendWebhook(instance: any, data: { to: string; content: string; type: string; messageId?: string }) {
  if (!instance.webhookUrl || !instance.webhookEvents?.includes('message.sent')) {
    return
  }

  try {
    await axios.post(instance.webhookUrl, {
      event: 'message.sent',
      instanceId: instance.id,
      instanceName: instance.name,
      to: data.to,
      content: data.content,
      type: data.type,
      messageId: data.messageId,
      timestamp: new Date().toISOString(),
    }, { timeout: 5000 })
  } catch (error) {
    console.error('Webhook send error:', error)
  }
}

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

const sendGroupSchema = z.object({
  instanceId: z.string().uuid(),
  groupId: z.string().min(5),
  text: z.string().min(1),
})

export async function messageRoutes(fastify: FastifyInstance) {
  // API Documentation endpoint
  fastify.get('/docs', async (_request, reply) => {
    return reply.send({
      name: 'WhatsApp Manager API',
      version: '2.0.1',
      endpoints: {
        messages: {
          'POST /api/messages/send': {
            description: 'Enviar mensagem de texto',
            auth: 'JWT Token',
            body: { instanceId: 'uuid', to: '5511999999999', text: 'Mensagem' }
          },
          'POST /api/messages/send-group': {
            description: 'Enviar mensagem para grupo',
            auth: 'JWT Token',
            body: { instanceId: 'uuid', groupId: '120363012345678901@g.us', text: 'Mensagem' }
          },
          'GET /api/messages/groups/:instanceId': {
            description: 'Listar grupos da instância',
            auth: 'JWT Token'
          },
          'POST /api/messages/api/send': {
            description: 'Enviar mensagem via API Token',
            auth: 'x-api-token header',
            body: { to: '5511999999999 ou groupId@g.us', text: 'Mensagem' }
          }
        },
        automations: {
          'POST /api/automations/trigger/:token': {
            description: 'Disparar automação',
            auth: 'Token na URL',
            body: { telefone: '5511999999999', nome: 'João', valor: '100.00' }
          }
        }
      }
    })
  })

  // Authenticated routes (via JWT)
  fastify.register(async (app) => {
    app.addHook('preHandler', authMiddleware)

    // List groups for instance
    app.get('/groups/:instanceId', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
      const { instanceId } = request.params

      const instance = await prisma.instance.findFirst({
        where: { id: instanceId, companyId: request.user.companyId },
      })

      if (!instance) {
        return reply.status(404).send({ error: 'Instance not found' })
      }

      if (instance.channel !== 'BAILEYS') {
        return reply.status(400).send({ error: 'Groups are only available for Baileys instances' })
      }

      if (instance.status !== 'CONNECTED') {
        return reply.status(400).send({ error: 'Instance is not connected' })
      }

      try {
        const groups = await baileysManager.getGroups(instance.id)
        return reply.send({ groups })
      } catch (error: any) {
        return reply.status(500).send({ error: error.message })
      }
    })

    // Send message to group
    app.post('/send-group', async (request: FastifyRequest, reply: FastifyReply) => {
      const data = sendGroupSchema.parse(request.body)

      const instance = await prisma.instance.findFirst({
        where: { id: data.instanceId, companyId: request.user.companyId, isActive: true },
      })

      if (!instance) {
        return reply.status(404).send({ error: 'Instance not found' })
      }

      if (instance.channel !== 'BAILEYS') {
        return reply.status(400).send({ error: 'Groups are only available for Baileys instances' })
      }

      if (instance.status !== 'CONNECTED') {
        return reply.status(400).send({ error: 'Instance is not connected' })
      }

      try {
        // Ensure groupId has @g.us suffix
        let groupJid = data.groupId
        if (!groupJid.includes('@')) {
          groupJid = `${groupJid}@g.us`
        }

        console.log(`[send-group] Sending to group: ${groupJid}`)
        const result = await baileysManager.sendTextMessage(instance.id, groupJid, data.text)
        console.log(`[send-group] Result:`, result?.key)

        return reply.send({
          success: true,
          messageId: result?.key.id,
          groupId: groupJid
        })
      } catch (error: any) {
        console.error(`[send-group] Error:`, error)
        return reply.status(500).send({ error: error.message })
      }
    })

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
      try { _v() } catch (e: any) { return reply.status(503).send({ error: e.message }) }
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
      try { _v() } catch (e: any) { return reply.status(503).send({ error: e.message }) }
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
        let messageId: string | undefined

        if (instance.channel === 'BAILEYS') {
          const result = await baileysManager.sendTextMessage(instance.id, data.to, data.text)
          messageId = result?.key.id || undefined
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
          messageId = result.messages?.[0]?.id

          // Disparar webhook para Cloud API
          await triggerSendWebhook(fullInstance, {
            to: data.to,
            content: data.text,
            type: 'text',
            messageId,
          })
        }

        return reply.send({ success: true, messageId })
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
