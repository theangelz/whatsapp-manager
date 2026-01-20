import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import axios from 'axios'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { env } from '../../config/env.js'

const configureTypebotSchema = z.object({
  instanceId: z.string().uuid(),
  typebotId: z.string(),
  typebotUrl: z.string().url(),
  triggerType: z.enum(['all', 'keyword', 'new_conversation']).default('all'),
  triggerValue: z.string().optional(),
  variables: z.record(z.string()).optional(),
})

const updateTypebotSchema = configureTypebotSchema.partial().omit({ instanceId: true })

export async function typebotRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // Get Typebot integration for instance
  fastify.get('/:instanceId', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id: instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const integration = await prisma.typebotIntegration.findUnique({
      where: { instanceId },
    })

    return reply.send(integration)
  })

  // Configure Typebot integration
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = configureTypebotSchema.parse(request.body)

    const instance = await prisma.instance.findFirst({
      where: { id: data.instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const integration = await prisma.typebotIntegration.upsert({
      where: { instanceId: data.instanceId },
      create: {
        instanceId: data.instanceId,
        typebotId: data.typebotId,
        typebotUrl: data.typebotUrl,
        triggerType: data.triggerType,
        triggerValue: data.triggerValue,
        variables: data.variables,
      },
      update: {
        typebotId: data.typebotId,
        typebotUrl: data.typebotUrl,
        triggerType: data.triggerType,
        triggerValue: data.triggerValue,
        variables: data.variables,
      },
    })

    return reply.send(integration)
  })

  // Update Typebot integration
  fastify.put('/:instanceId', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params
    const data = updateTypebotSchema.parse(request.body)

    const instance = await prisma.instance.findFirst({
      where: { id: instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const integration = await prisma.typebotIntegration.update({
      where: { instanceId },
      data,
    })

    return reply.send(integration)
  })

  // Toggle Typebot integration
  fastify.post('/:instanceId/toggle', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id: instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const integration = await prisma.typebotIntegration.findUnique({
      where: { instanceId },
    })

    if (!integration) {
      return reply.status(404).send({ error: 'Typebot integration not configured' })
    }

    const updated = await prisma.typebotIntegration.update({
      where: { instanceId },
      data: { isActive: !integration.isActive },
    })

    return reply.send(updated)
  })

  // Delete Typebot integration
  fastify.delete('/:instanceId', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id: instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    await prisma.typebotIntegration.delete({
      where: { instanceId },
    }).catch(() => null)

    return reply.status(204).send()
  })

  // Test Typebot connection
  fastify.post('/:instanceId/test', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params

    const integration = await prisma.typebotIntegration.findUnique({
      where: { instanceId },
    })

    if (!integration) {
      return reply.status(404).send({ error: 'Typebot integration not configured' })
    }

    try {
      const response = await axios.get(`${integration.typebotUrl}/api/typebots/${integration.typebotId}`, {
        headers: env.TYPEBOT_API_KEY ? { Authorization: `Bearer ${env.TYPEBOT_API_KEY}` } : {},
        timeout: 5000,
      })

      return reply.send({ success: true, typebot: response.data })
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: error.response?.data?.message || error.message,
      })
    }
  })
}

// Typebot message handler (called from Baileys/Cloud API events)
export async function handleTypebotMessage(instanceId: string, from: string, message: string) {
  const integration = await prisma.typebotIntegration.findUnique({
    where: { instanceId },
  })

  if (!integration || !integration.isActive) {
    return null
  }

  // Check trigger conditions
  if (integration.triggerType === 'keyword' && integration.triggerValue) {
    if (!message.toLowerCase().includes(integration.triggerValue.toLowerCase())) {
      return null
    }
  }

  try {
    // Start or continue Typebot session
    const response = await axios.post(
      `${integration.typebotUrl}/api/v1/sendMessage`,
      {
        sessionId: `${instanceId}-${from}`,
        message,
        ...(integration.variables && typeof integration.variables === 'object' ? integration.variables as Record<string, unknown> : {}),
      },
      {
        headers: env.TYPEBOT_API_KEY ? { Authorization: `Bearer ${env.TYPEBOT_API_KEY}` } : {},
      }
    )

    return response.data
  } catch (error) {
    console.error('Typebot error:', error)
    return null
  }
}
