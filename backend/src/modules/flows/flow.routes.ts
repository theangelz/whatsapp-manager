import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { Prisma } from '@prisma/client'

// Helper para extrair companyId do JWT (pode estar em diferentes propriedades)
function getCompanyId(request: FastifyRequest): string {
  const user = request.user as any
  return user.companyId || user.company_id
}

// Schema flexível para aceitar qualquer dado do node
const nodeDataSchema = z.record(z.any())

const flowNodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    'START', 'MESSAGE', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT',
    'BUTTONS', 'LIST', 'CONDITION', 'DELAY', 'SET_VARIABLE',
    'HTTP_REQUEST', 'TRANSFER', 'GO_TO_FLOW', 'END'
  ]),
  positionX: z.number(),
  positionY: z.number(),
  data: nodeDataSchema,
  label: z.string().optional(),
})

const flowEdgeSchema = z.object({
  id: z.string(),
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  condition: z.any().optional(),
})

export async function flowRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('onRequest', authMiddleware)

  // List all flows
  fastify.get('/', async (request, reply) => {
    const companyId = getCompanyId(request)

    const flows = await prisma.flow.findMany({
      where: { companyId },
      include: {
        _count: {
          select: {
            nodes: true,
            sessions: { where: { isActive: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return flows.map((flow: any) => ({
      ...flow,
      nodesCount: flow._count.nodes,
      activeSessions: flow._count.sessions,
      _count: undefined,
    }))
  })

  // Get single flow with nodes and edges
  fastify.get('/:id', async (request, reply) => {
    const companyId = getCompanyId(request)
    const { id } = request.params as { id: string }

    const flow = await prisma.flow.findFirst({
      where: { id, companyId },
      include: {
        nodes: true,
        edges: true,
        _count: {
          select: {
            sessions: { where: { isActive: true } },
          },
        },
      },
    })

    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' })
    }

    return {
      ...flow,
      activeSessions: flow._count.sessions,
      _count: undefined,
    }
  })

  // Create new flow
  fastify.post('/', async (request, reply) => {
    try {
      const companyId = getCompanyId(request)

      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        instanceId: z.string().nullable().optional(),
        triggerType: z.enum(['KEYWORD', 'ALL', 'BUTTON_REPLY', 'LIST_REPLY', 'WEBHOOK']).default('KEYWORD'),
        triggerValue: z.string().optional(),
      })

      const data = schema.parse(request.body)

      // Remove instanceId if it's empty string or null
      const flowData: any = {
        name: data.name,
        description: data.description,
        triggerType: data.triggerType,
        triggerValue: data.triggerValue,
        companyId,
      }

      if (data.instanceId && data.instanceId.trim() !== '') {
        flowData.instanceId = data.instanceId
      }

      const flow = await prisma.flow.create({
        data: flowData,
      })

      // Create default START node
      await prisma.flowNode.create({
        data: {
          flowId: flow.id,
          type: 'START',
          positionX: 250,
          positionY: 50,
          data: { label: 'Início' },
          label: 'Início',
        },
      })

      return reply.status(201).send(flow)
    } catch (error: any) {
      console.error('Flow creation error:', error)
      return reply.status(500).send({ error: error.message || 'Error creating flow' })
    }
  })

  // Update flow metadata
  fastify.put('/:id', async (request, reply) => {
    const companyId = getCompanyId(request)
    const { id } = request.params as { id: string }

    const schema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      instanceId: z.string().nullable().optional(),
      triggerType: z.enum(['KEYWORD', 'ALL', 'BUTTON_REPLY', 'LIST_REPLY', 'WEBHOOK']).optional(),
      triggerValue: z.string().nullable().optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).optional(),
      variables: z.record(z.any()).optional(),
      settings: z.record(z.any()).optional(),
    })

    const data = schema.parse(request.body)

    const flow = await prisma.flow.findFirst({
      where: { id, companyId },
    })

    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' })
    }

    const updated = await prisma.flow.update({
      where: { id },
      data: {
        ...data,
        version: { increment: 1 },
      },
    })

    return updated
  })

  // Save flow canvas (nodes and edges)
  fastify.put('/:id/canvas', async (request, reply) => {
    const companyId = getCompanyId(request)
    const { id } = request.params as { id: string }

    const schema = z.object({
      nodes: z.array(flowNodeSchema),
      edges: z.array(flowEdgeSchema),
    })

    const { nodes, edges } = schema.parse(request.body)

    const flow = await prisma.flow.findFirst({
      where: { id, companyId },
    })

    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' })
    }

    // Transaction to update nodes and edges
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Delete existing nodes and edges
      await tx.flowEdge.deleteMany({ where: { flowId: id } })
      await tx.flowNode.deleteMany({ where: { flowId: id } })

      // Create new nodes
      for (const node of nodes) {
        await tx.flowNode.create({
          data: {
            id: node.id,
            flowId: id,
            type: node.type,
            positionX: node.positionX,
            positionY: node.positionY,
            data: node.data,
            label: node.label,
          },
        })
      }

      // Create new edges
      for (const edge of edges) {
        await tx.flowEdge.create({
          data: {
            id: edge.id,
            flowId: id,
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            sourceHandle: edge.sourceHandle || undefined,
            targetHandle: edge.targetHandle || undefined,
            label: edge.label || undefined,
            condition: edge.condition,
          },
        })
      }

      // Increment version
      await tx.flow.update({
        where: { id },
        data: { version: { increment: 1 } },
      })
    })

    return { success: true }
  })

  // Delete flow
  fastify.delete('/:id', async (request, reply) => {
    const companyId = getCompanyId(request)
    const { id } = request.params as { id: string }

    const flow = await prisma.flow.findFirst({
      where: { id, companyId },
    })

    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' })
    }

    await prisma.flow.delete({ where: { id } })

    return { success: true }
  })

  // Duplicate flow
  fastify.post('/:id/duplicate', async (request, reply) => {
    const companyId = getCompanyId(request)
    const { id } = request.params as { id: string }

    const flow = await prisma.flow.findFirst({
      where: { id, companyId },
      include: {
        nodes: true,
        edges: true,
      },
    })

    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' })
    }

    // Create new flow
    const newFlow = await prisma.flow.create({
      data: {
        companyId,
        name: `${flow.name} (cópia)`,
        description: flow.description,
        instanceId: flow.instanceId,
        triggerType: flow.triggerType,
        triggerValue: flow.triggerValue,
        variables: flow.variables as any,
        settings: flow.settings as any,
        status: 'DRAFT',
      },
    })

    // Map old node IDs to new IDs
    const nodeIdMap = new Map<string, string>()

    // Create nodes
    for (const node of flow.nodes) {
      const newNodeId = crypto.randomUUID()
      nodeIdMap.set(node.id, newNodeId)

      await prisma.flowNode.create({
        data: {
          id: newNodeId,
          flowId: newFlow.id,
          type: node.type,
          positionX: node.positionX,
          positionY: node.positionY,
          data: node.data as any,
          label: node.label,
        },
      })
    }

    // Create edges with updated node IDs
    for (const edge of flow.edges) {
      const newSourceId = nodeIdMap.get(edge.sourceNodeId)
      const newTargetId = nodeIdMap.get(edge.targetNodeId)

      if (newSourceId && newTargetId) {
        await prisma.flowEdge.create({
          data: {
            flowId: newFlow.id,
            sourceNodeId: newSourceId,
            targetNodeId: newTargetId,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            label: edge.label,
            condition: edge.condition as any,
          },
        })
      }
    }

    return reply.status(201).send(newFlow)
  })

  // Get flow statistics
  fastify.get('/:id/stats', async (request, reply) => {
    const companyId = getCompanyId(request)
    const { id } = request.params as { id: string }

    const flow = await prisma.flow.findFirst({
      where: { id, companyId },
    })

    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' })
    }

    const [totalSessions, activeSessions, completedSessions] = await Promise.all([
      prisma.flowSession.count({ where: { flowId: id } }),
      prisma.flowSession.count({ where: { flowId: id, isActive: true } }),
      prisma.flowSession.count({ where: { flowId: id, completedAt: { not: null } } }),
    ])

    return {
      totalSessions,
      activeSessions,
      completedSessions,
      completionRate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
    }
  })

  // List active sessions for a flow
  fastify.get('/:id/sessions', async (request, reply) => {
    const companyId = getCompanyId(request)
    const { id } = request.params as { id: string }

    const flow = await prisma.flow.findFirst({
      where: { id, companyId },
    })

    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' })
    }

    const sessions = await prisma.flowSession.findMany({
      where: { flowId: id, isActive: true },
      orderBy: { lastActivity: 'desc' },
      take: 100,
    })

    return sessions
  })

  // Manually end a session
  fastify.delete('/:flowId/sessions/:sessionId', async (request, reply) => {
    const companyId = getCompanyId(request)
    const { flowId, sessionId } = request.params as { flowId: string; sessionId: string }

    const flow = await prisma.flow.findFirst({
      where: { id: flowId, companyId },
    })

    if (!flow) {
      return reply.status(404).send({ error: 'Flow not found' })
    }

    await prisma.flowSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        completedAt: new Date(),
      },
    })

    return { success: true }
  })
}
