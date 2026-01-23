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
  disableConflictingFlows: z.boolean().optional(), // Se true, desativa flows conflitantes automaticamente
})

// Helper para verificar conflito com Flows ativos
async function checkFlowConflict(instanceId: string, companyId: string) {
  // Busca flows ativos que podem conflitar (da instância ou globais)
  const activeFlows = await prisma.flow.findMany({
    where: {
      companyId,
      status: 'ACTIVE',
      OR: [
        { instanceId: null }, // Flows globais
        { instanceId },       // Flows específicos da instância
      ],
    },
    select: {
      id: true,
      name: true,
      instanceId: true,
      triggerType: true,
    },
  })

  return activeFlows
}

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

    // Verificar conflito com Flows ativos
    const conflictingFlows = await checkFlowConflict(data.instanceId, request.user.companyId)

    if (conflictingFlows.length > 0 && !data.disableConflictingFlows) {
      return reply.status(409).send({
        error: 'Conflito detectado',
        message: 'Existem Flows ativos que podem conflitar com o Typebot. O Flow nativo tem prioridade sobre o Typebot.',
        conflictingFlows: conflictingFlows.map(f => ({
          id: f.id,
          name: f.name,
          isGlobal: f.instanceId === null,
          triggerType: f.triggerType,
        })),
        hint: 'Desative os Flows conflitantes ou envie disableConflictingFlows: true para desativá-los automaticamente.',
      })
    }

    // Se solicitado, desativar flows conflitantes
    if (data.disableConflictingFlows && conflictingFlows.length > 0) {
      await prisma.flow.updateMany({
        where: {
          id: { in: conflictingFlows.map(f => f.id) },
        },
        data: { status: 'INACTIVE' },
      })
      console.log(`[Typebot] Desativados ${conflictingFlows.length} flows conflitantes`)
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

    return reply.send({
      ...integration,
      flowsDisabled: data.disableConflictingFlows ? conflictingFlows.length : 0,
    })
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
  fastify.post('/:instanceId/toggle', async (request: FastifyRequest<{ Params: { instanceId: string }; Body: { disableConflictingFlows?: boolean } }>, reply: FastifyReply) => {
    const { instanceId } = request.params
    const { disableConflictingFlows } = (request.body as any) || {}

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

    // Se está ativando, verificar conflito com Flows
    const willBeActive = !integration.isActive
    let flowsDisabled = 0

    if (willBeActive) {
      const conflictingFlows = await checkFlowConflict(instanceId, request.user.companyId)

      if (conflictingFlows.length > 0 && !disableConflictingFlows) {
        return reply.status(409).send({
          error: 'Conflito detectado',
          message: 'Existem Flows ativos que podem conflitar com o Typebot. O Flow nativo tem prioridade sobre o Typebot.',
          conflictingFlows: conflictingFlows.map(f => ({
            id: f.id,
            name: f.name,
            isGlobal: f.instanceId === null,
            triggerType: f.triggerType,
          })),
          hint: 'Desative os Flows conflitantes ou envie disableConflictingFlows: true para desativá-los automaticamente.',
        })
      }

      // Se solicitado, desativar flows conflitantes
      if (disableConflictingFlows && conflictingFlows.length > 0) {
        await prisma.flow.updateMany({
          where: {
            id: { in: conflictingFlows.map(f => f.id) },
          },
          data: { status: 'INACTIVE' },
        })
        flowsDisabled = conflictingFlows.length
        console.log(`[Typebot] Desativados ${flowsDisabled} flows conflitantes ao ativar`)
      }
    }

    const updated = await prisma.typebotIntegration.update({
      where: { instanceId },
      data: { isActive: willBeActive },
    })

    return reply.send({
      ...updated,
      flowsDisabled,
    })
  })

  // Check for conflicts with active Flows
  fastify.get('/:instanceId/check-conflict', async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
    const { instanceId } = request.params

    const instance = await prisma.instance.findFirst({
      where: { id: instanceId, companyId: request.user.companyId },
    })

    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' })
    }

    const conflictingFlows = await checkFlowConflict(instanceId, request.user.companyId)

    return reply.send({
      hasConflict: conflictingFlows.length > 0,
      conflictingFlows: conflictingFlows.map(f => ({
        id: f.id,
        name: f.name,
        isGlobal: f.instanceId === null,
        triggerType: f.triggerType,
      })),
      message: conflictingFlows.length > 0
        ? 'Flows ativos detectados. O Flow nativo tem prioridade - desative-os para usar o Typebot.'
        : 'Nenhum conflito detectado. Typebot pode ser ativado.',
    })
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
