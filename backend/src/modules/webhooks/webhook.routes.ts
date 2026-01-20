import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { MessageStatus } from '@prisma/client'
import { prisma } from '../../config/database.js'
import { env } from '../../config/env.js'
import { io } from '../../server.js'
import { handleTypebotMessage } from '../typebot/typebot.routes.js'
import { getFlowEngine } from '../flows/flow.engine.js'

// Send message via Cloud API (used by FlowEngine)
async function sendCloudApiMessage(instance: any, to: string, content: any, type: string): Promise<void> {
  const axios = (await import('axios')).default

  // Format phone number
  const phoneNumber = to.replace('@s.whatsapp.net', '').replace(/\D/g, '')

  const baseUrl = 'https://graph.facebook.com/v18.0'
  const url = `${baseUrl}/${instance.phoneNumberId}/messages`

  let messagePayload: any = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
  }

  switch (type) {
    case 'text':
      messagePayload.type = 'text'
      messagePayload.text = { body: content.text || String(content) }
      break
    case 'image':
      messagePayload.type = 'image'
      messagePayload.image = { link: content.image?.url, caption: content.caption }
      break
    case 'audio':
      messagePayload.type = 'audio'
      messagePayload.audio = { link: content.audio?.url }
      break
    case 'video':
      messagePayload.type = 'video'
      messagePayload.video = { link: content.video?.url, caption: content.caption }
      break
    case 'document':
      messagePayload.type = 'document'
      messagePayload.document = { link: content.document?.url, filename: content.fileName, caption: content.caption }
      break
    case 'buttons':
      // Cloud API uses interactive messages for buttons
      messagePayload.type = 'interactive'
      messagePayload.interactive = {
        type: 'button',
        body: { text: content.text || '' },
        action: {
          buttons: content.buttons?.slice(0, 3).map((btn: any) => ({
            type: 'reply',
            reply: { id: btn.buttonId, title: btn.buttonText?.displayText || btn.text }
          }))
        }
      }
      break
    case 'list':
      messagePayload.type = 'interactive'
      messagePayload.interactive = {
        type: 'list',
        body: { text: content.text || '' },
        action: {
          button: content.buttonText || 'Menu',
          sections: content.sections
        }
      }
      break
    default:
      messagePayload.type = 'text'
      messagePayload.text = { body: content.text || String(content) }
  }

  try {
    await axios.post(url, messagePayload, {
      headers: {
        Authorization: `Bearer ${instance.accessToken}`,
        'Content-Type': 'application/json',
      },
    })
    console.log('Cloud API message sent:', type, 'to:', phoneNumber)
  } catch (error: any) {
    console.error('Cloud API send error:', error.response?.data || error.message)
  }
}

export async function webhookRoutes(fastify: FastifyInstance) {
  // Meta Cloud API Webhook Verification
  fastify.get('/cloud', async (request: FastifyRequest<{ Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string } }>, reply: FastifyReply) => {
    const mode = request.query['hub.mode']
    const token = request.query['hub.verify_token']
    const challenge = request.query['hub.challenge']

    console.log('Webhook verification request:', { mode, token, challenge })

    // Accept verification if mode is subscribe and token matches (or if no token is configured)
    if (mode === 'subscribe') {
      if (!env.META_WEBHOOK_VERIFY_TOKEN || token === env.META_WEBHOOK_VERIFY_TOKEN) {
        console.log('Webhook verified successfully')
        // Meta expects the challenge as plain text
        return reply.type('text/plain').send(challenge)
      }
    }

    console.log('Webhook verification failed - token mismatch or invalid mode')
    return reply.status(403).send({ error: 'Forbidden' })
  })

  // Health check for webhook (can be used to test if endpoint is accessible)
  fastify.get('/cloud/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ok',
      endpoint: '/api/webhook/cloud',
      verifyToken: env.META_WEBHOOK_VERIFY_TOKEN ? 'configured' : 'not configured'
    })
  })

  // Meta Cloud API Webhook Verification (per instance)
  fastify.get('/cloud-api/:instanceId', async (request: FastifyRequest<{
    Params: { instanceId: string },
    Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string }
  }>, reply: FastifyReply) => {
    const { instanceId } = request.params
    const mode = request.query['hub.mode']
    const token = request.query['hub.verify_token']
    const challenge = request.query['hub.challenge']

    console.log('Webhook verification request for instance:', instanceId, { mode, token, challenge })

    // Find instance to validate webhook secret
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
      select: { webhookSecret: true, name: true }
    })

    if (!instance) {
      console.log('Instance not found:', instanceId)
      return reply.status(404).send({ error: 'Instance not found' })
    }

    // Accept verification if mode is subscribe and token matches
    if (mode === 'subscribe') {
      // If instance has webhookSecret, validate it; otherwise accept any token
      if (!instance.webhookSecret || token === instance.webhookSecret) {
        console.log('Webhook verified successfully for instance:', instance.name)
        return reply.type('text/plain').send(challenge)
      }
    }

    console.log('Webhook verification failed for instance:', instanceId)
    return reply.status(403).send({ error: 'Forbidden' })
  })

  // Meta Cloud API Webhook Events (per instance)
  fastify.post('/cloud-api/:instanceId', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params
    const body = request.body as any

    console.log('=== WEBHOOK POST RECEIVED ===')
    console.log('Instance ID:', instanceId)
    console.log('Body:', JSON.stringify(body, null, 2))

    // Find instance
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
      include: {
        typebotIntegration: true,
        n8nIntegration: true,
      },
    })

    if (!instance) {
      console.log('Instance not found:', instanceId)
      return reply.status(404).send({ error: 'Instance not found' })
    }

    console.log('Instance found:', instance.name)

    if (body.object !== 'whatsapp_business_account') {
      console.log('Invalid webhook object:', body.object)
      return reply.status(400).send({ error: 'Invalid webhook' })
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        console.log('Change field:', change.field)
        if (change.field !== 'messages') continue

        const value = change.value
        console.log('Messages in payload:', value.messages?.length || 0)
        console.log('Statuses in payload:', value.statuses?.length || 0)

        // Handle incoming messages
        for (const message of value.messages || []) {
          const from = message.from
          let content = ''
          let type = 'text'

          console.log('Processing message from:', from, 'type:', message.type)

          switch (message.type) {
            case 'text':
              content = message.text?.body || ''
              type = 'text'
              break
            case 'image':
              content = message.image?.caption || '[Image]'
              type = 'image'
              break
            case 'video':
              content = message.video?.caption || '[Video]'
              type = 'video'
              break
            case 'audio':
              content = '[Audio]'
              type = 'audio'
              break
            case 'document':
              content = message.document?.filename || '[Document]'
              type = 'document'
              break
            case 'button':
              content = message.button?.text || message.button?.payload || '[Button Response]'
              type = 'text'
              break
            case 'interactive':
              content = message.interactive?.button_reply?.title ||
                       message.interactive?.list_reply?.title ||
                       '[Interactive Response]'
              type = 'text'
              break
          }

          console.log('Saving message:', { from, type, content: content.substring(0, 50) })

          // Save message
          const savedMessage = await prisma.message.create({
            data: {
              instanceId: instance.id,
              remoteJid: from,
              messageId: message.id,
              direction: 'INBOUND',
              status: 'DELIVERED',
              type,
              content,
              deliveredAt: new Date(),
            },
          })

          console.log('Message saved with ID:', savedMessage.id)

          // Update metrics
          await prisma.instance.update({
            where: { id: instance.id },
            data: { messagesReceived: { increment: 1 } },
          })

          // Emit to socket
          io.to(`instance:${instance.id}`).emit('message-received', {
            instanceId: instance.id,
            from,
            content,
            type,
            timestamp: new Date(),
          })

          // Trigger webhooks
          await triggerInstanceWebhooks(instance, {
            event: 'message.received',
            from,
            content,
            type,
            timestamp: new Date(),
          })

          // Trigger Typebot if configured
          if (type === 'text' && content) {
            console.log('Triggering Typebot for instance:', instance.id, 'from:', from, 'message:', content.substring(0, 50))
            try {
              const typebotResponse = await handleTypebotMessage(instance.id, from, content)
              if (typebotResponse) {
                console.log('Typebot response:', JSON.stringify(typebotResponse).substring(0, 200))
              }
            } catch (typebotError) {
              console.error('Error triggering Typebot:', typebotError)
            }
          }

          // Process with FlowEngine (chatbot flows)
          try {
            const flowEngine = getFlowEngine()
            if (flowEngine && type === 'text' && content) {
              console.log('Processing with FlowEngine for instance:', instance.id)

              // Create a custom send function for this instance
              const originalSendFn = (flowEngine as any).sendMessage
              ;(flowEngine as any).sendMessage = async (to: string, msgContent: any, msgType: string) => {
                await sendCloudApiMessage(instance, to, msgContent, msgType)
              }

              const buttonId = message.button?.payload || message.interactive?.button_reply?.id
              const listRowId = message.interactive?.list_reply?.id

              const handled = await flowEngine.processMessage({
                instanceId: instance.id,
                remoteJid: from,
                message: content,
                messageType: buttonId ? 'button_reply' : listRowId ? 'list_reply' : 'text',
                buttonId,
                listRowId,
              })

              // Restore original send function
              ;(flowEngine as any).sendMessage = originalSendFn

              if (handled) {
                console.log('FlowEngine handled message from:', from)
              }
            }
          } catch (flowError) {
            console.error('FlowEngine error:', flowError)
          }
        }

        // Handle status updates
        for (const status of value.statuses || []) {
          const statusMap: Record<string, MessageStatus> = {
            sent: MessageStatus.SENT,
            delivered: MessageStatus.DELIVERED,
            read: MessageStatus.READ,
            failed: MessageStatus.FAILED,
          }

          await prisma.message.updateMany({
            where: { messageId: status.id },
            data: {
              status: statusMap[status.status] || MessageStatus.SENT,
              ...(status.status === 'sent' && { sentAt: new Date() }),
              ...(status.status === 'delivered' && { deliveredAt: new Date() }),
              ...(status.status === 'read' && { readAt: new Date() }),
              ...(status.status === 'failed' && {
                failedAt: new Date(),
                failReason: status.errors?.[0]?.title,
              }),
            },
          })
        }
      }
    }

    return reply.send({ status: 'ok' })
  })

  // Meta Cloud API Webhook Events
  fastify.post('/cloud', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any

    if (body.object !== 'whatsapp_business_account') {
      return reply.status(400).send({ error: 'Invalid webhook' })
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const phoneNumberId = value.metadata?.phone_number_id

        // Find instance by phone number ID
        const instance = await prisma.instance.findFirst({
          where: { phoneNumberId, channel: 'CLOUD_API', isActive: true },
          include: {
            typebotIntegration: true,
            n8nIntegration: true,
          },
        })

        if (!instance) continue

        // Handle incoming messages
        for (const message of value.messages || []) {
          const from = message.from
          let content = ''
          let type = 'text'

          switch (message.type) {
            case 'text':
              content = message.text?.body || ''
              type = 'text'
              break
            case 'image':
              content = message.image?.caption || '[Image]'
              type = 'image'
              break
            case 'video':
              content = message.video?.caption || '[Video]'
              type = 'video'
              break
            case 'audio':
              content = '[Audio]'
              type = 'audio'
              break
            case 'document':
              content = message.document?.filename || '[Document]'
              type = 'document'
              break
          }

          // Save message
          await prisma.message.create({
            data: {
              instanceId: instance.id,
              remoteJid: from,
              messageId: message.id,
              direction: 'INBOUND',
              status: 'DELIVERED',
              type,
              content,
              deliveredAt: new Date(),
            },
          })

          // Update metrics
          await prisma.instance.update({
            where: { id: instance.id },
            data: { messagesReceived: { increment: 1 } },
          })

          // Emit to socket
          io.to(`instance:${instance.id}`).emit('message-received', {
            instanceId: instance.id,
            from,
            content,
            type,
            timestamp: new Date(),
          })

          // Trigger webhooks
          await triggerInstanceWebhooks(instance, {
            event: 'message.received',
            from,
            content,
            type,
            timestamp: new Date(),
          })
        }

        // Handle status updates
        for (const status of value.statuses || []) {
          const statusMap: Record<string, MessageStatus> = {
            sent: MessageStatus.SENT,
            delivered: MessageStatus.DELIVERED,
            read: MessageStatus.READ,
            failed: MessageStatus.FAILED,
          }

          await prisma.message.updateMany({
            where: { messageId: status.id },
            data: {
              status: statusMap[status.status] || MessageStatus.SENT,
              ...(status.status === 'sent' && { sentAt: new Date() }),
              ...(status.status === 'delivered' && { deliveredAt: new Date() }),
              ...(status.status === 'read' && { readAt: new Date() }),
              ...(status.status === 'failed' && {
                failedAt: new Date(),
                failReason: status.errors?.[0]?.title,
              }),
            },
          })
        }
      }
    }

    return reply.send({ status: 'ok' })
  })
}

async function triggerInstanceWebhooks(instance: any, data: any) {
  const axios = (await import('axios')).default

  // Custom webhook
  if (instance.webhookUrl && instance.webhookEvents?.includes(data.event)) {
    try {
      await axios.post(instance.webhookUrl, {
        instanceId: instance.id,
        instanceName: instance.name,
        ...data,
      })
    } catch (error) {
      console.error('Webhook error:', error)
    }
  }

  // n8n integration
  if (instance.n8nIntegration?.isActive && instance.n8nIntegration.events?.includes(data.event)) {
    try {
      await axios.post(instance.n8nIntegration.webhookUrl, {
        instanceId: instance.id,
        instanceName: instance.name,
        ...data,
      })
    } catch (error) {
      console.error('n8n webhook error:', error)
    }
  }
}
