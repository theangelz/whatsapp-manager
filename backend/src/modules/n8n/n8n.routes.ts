import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import axios from 'axios'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'

const configureN8nSchema = z.object({
  instanceId: z.string().uuid(),
  webhookUrl: z.string().url(),
  events: z.array(z.enum([
    'message.received',
    'message.sent',
    'message.delivered',
    'message.read',
    'message.failed',
    'connection.open',
    'connection.close',
  ])).default(['message.received']),
})

const updateN8nSchema = configureN8nSchema.partial().omit({ instanceId: true })

export async function n8nRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // Get n8n integration for instance
  fastify.get('/:instanceId', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id: instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const integration = await prisma.n8nIntegration.findUnique({
      where: { instanceId },
    })

    return reply.send(integration)
  })

  // Configure n8n integration
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = configureN8nSchema.parse(request.body)

    const instance = await prisma.instance.findFirst({
      where: { id: data.instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const integration = await prisma.n8nIntegration.upsert({
      where: { instanceId: data.instanceId },
      create: {
        instanceId: data.instanceId,
        webhookUrl: data.webhookUrl,
        events: data.events,
      },
      update: {
        webhookUrl: data.webhookUrl,
        events: data.events,
      },
    })

    return reply.send(integration)
  })

  // Update n8n integration
  fastify.put('/:instanceId', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params
    const data = updateN8nSchema.parse(request.body)

    const instance = await prisma.instance.findFirst({
      where: { id: instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const integration = await prisma.n8nIntegration.update({
      where: { instanceId },
      data,
    })

    return reply.send(integration)
  })

  // Toggle n8n integration
  fastify.post('/:instanceId/toggle', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id: instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const integration = await prisma.n8nIntegration.findUnique({
      where: { instanceId },
    })

    if (!integration) {
      return reply.status(404).send({ error: 'n8n integration not configured' })
    }

    const updated = await prisma.n8nIntegration.update({
      where: { instanceId },
      data: { isActive: !integration.isActive },
    })

    return reply.send(updated)
  })

  // Delete n8n integration
  fastify.delete('/:instanceId', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id: instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    await prisma.n8nIntegration.delete({
      where: { instanceId },
    }).catch(() => null)

    return reply.status(204).send()
  })

  // Test n8n webhook
  fastify.post('/:instanceId/test', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params

    const integration = await prisma.n8nIntegration.findUnique({
      where: { instanceId },
      include: { instance: { select: { name: true } } },
    })

    if (!integration) {
      return reply.status(404).send({ error: 'n8n integration not configured' })
    }

    try {
      await axios.post(integration.webhookUrl, {
        event: 'test',
        instanceId,
        instanceName: integration.instance.name,
        message: 'Test webhook from WhatsApp Manager',
        timestamp: new Date().toISOString(),
      }, {
        timeout: 5000,
      })

      return reply.send({ success: true, message: 'Test webhook sent successfully' })
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error.response?.data?.message || error.message,
      })
    }
  })
}
