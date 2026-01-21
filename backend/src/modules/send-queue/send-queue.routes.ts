import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { channelValidationService } from '../../services/channel-validation.service.js'

const addToQueueSchema = z.object({
  instanceId: z.string().uuid(),
  phoneNumber: z.string().min(10),
  messageContent: z.string().optional(),
  messageType: z.string().default('text'),
  templateId: z.string().uuid().optional(),
  variables: z.record(z.string()).optional(),
  priority: z.number().min(1).max(10).default(5),
  scheduledFor: z.string().datetime().optional(),
})

const batchAddSchema = z.object({
  instanceId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  messageContent: z.string().optional(),
  contacts: z.array(z.object({
    phoneNumber: z.string().min(10),
    variables: z.record(z.string()).optional(),
  })),
  priority: z.number().min(1).max(10).default(5),
  scheduledFor: z.string().datetime().optional(),
})

export async function sendQueueRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // List queue items
  fastify.get(
    '/',
    async (request: FastifyRequest<{ Querystring: { status?: string; instanceId?: string; page?: string; limit?: string } }>, reply: FastifyReply) => {
      const { status, instanceId, page = '1', limit = '50' } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)

      const where: any = { companyId: request.user.companyId }

      if (status) {
        where.status = status
      }

      if (instanceId) {
        where.instanceId = instanceId
      }

      const [items, total] = await Promise.all([
        prisma.sendQueue.findMany({
          where,
          include: {
            instance: { select: { id: true, name: true, channel: true, status: true } },
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          skip,
          take: parseInt(limit),
        }),
        prisma.sendQueue.count({ where }),
      ])

      return reply.send({
        items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      })
    }
  )

  // Get queue statistics
  fastify.get(
    '/stats',
    async (request: FastifyRequest<{ Querystring: { instanceId?: string } }>, reply: FastifyReply) => {
      const { instanceId } = request.query
      const companyId = request.user.companyId

      const where: any = { companyId }
      if (instanceId) {
        where.instanceId = instanceId
      }

      const [total, waiting, scheduled, processing, completed, failed, cancelled] = await Promise.all([
        prisma.sendQueue.count({ where }),
        prisma.sendQueue.count({ where: { ...where, status: 'WAITING' } }),
        prisma.sendQueue.count({ where: { ...where, status: 'SCHEDULED' } }),
        prisma.sendQueue.count({ where: { ...where, status: 'PROCESSING' } }),
        prisma.sendQueue.count({ where: { ...where, status: 'COMPLETED' } }),
        prisma.sendQueue.count({ where: { ...where, status: 'FAILED' } }),
        prisma.sendQueue.count({ where: { ...where, status: 'CANCELLED' } }),
      ])

      // Get by instance breakdown
      const byInstance = await prisma.sendQueue.groupBy({
        by: ['instanceId', 'status'],
        where: { companyId },
        _count: true,
      })

      // Get instances for names
      const instanceIds = [...new Set(byInstance.map((i) => i.instanceId))]
      const instances = await prisma.instance.findMany({
        where: { id: { in: instanceIds } },
        select: { id: true, name: true },
      })

      const instanceMap = new Map(instances.map((i) => [i.id, i.name]))

      const instanceBreakdown = byInstance.reduce((acc, item) => {
        const instanceName = instanceMap.get(item.instanceId) || 'Unknown'
        if (!acc[instanceName]) {
          acc[instanceName] = {}
        }
        acc[instanceName][item.status] = item._count
        return acc
      }, {} as Record<string, Record<string, number>>)

      return reply.send({
        total,
        waiting,
        scheduled,
        processing,
        completed,
        failed,
        cancelled,
        pending: waiting + scheduled,
        byInstance: instanceBreakdown,
      })
    }
  )

  // Add single item to queue
  fastify.post(
    '/',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = addToQueueSchema.parse(request.body)

      // Get instance
      const instance = await prisma.instance.findFirst({
        where: { id: data.instanceId, companyId: request.user.companyId },
      })

      if (!instance) {
        return reply.status(404).send({ error: 'Instance not found' })
      }

      // Validate send request
      const validation = await channelValidationService.validateSendRequest({
        instanceId: data.instanceId,
        phoneNumber: data.phoneNumber,
        messageContent: data.messageContent,
        templateId: data.templateId,
        variables: data.variables,
      })

      if (!validation.valid) {
        return reply.status(400).send({ error: validation.error })
      }

      // Build final message content
      let finalContent = data.messageContent || ''
      if (data.templateId) {
        const template = await prisma.messageTemplate.findUnique({
          where: { id: data.templateId },
        })
        if (template) {
          finalContent = channelValidationService.applyVariables(
            template.bodyText,
            data.variables || {}
          )

          // Update template usage
          await prisma.messageTemplate.update({
            where: { id: data.templateId },
            data: {
              usageCount: { increment: 1 },
              lastUsedAt: new Date(),
            },
          })
        }
      }

      // Create queue item
      const item = await prisma.sendQueue.create({
        data: {
          companyId: request.user.companyId,
          instanceId: data.instanceId,
          phoneNumber: data.phoneNumber.replace(/\D/g, ''),
          messageContent: finalContent,
          messageType: data.messageType,
          templateId: data.templateId,
          variables: data.variables,
          priority: data.priority,
          scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
          status: data.scheduledFor ? 'SCHEDULED' : 'WAITING',
        },
        include: {
          instance: { select: { id: true, name: true } },
        },
      })

      return reply.status(201).send(item)
    }
  )

  // Add batch to queue
  fastify.post(
    '/batch',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = batchAddSchema.parse(request.body)

      // Get instance
      const instance = await prisma.instance.findFirst({
        where: { id: data.instanceId, companyId: request.user.companyId },
      })

      if (!instance) {
        return reply.status(404).send({ error: 'Instance not found' })
      }

      // Get template if specified
      let template: any = null
      if (data.templateId) {
        template = await prisma.messageTemplate.findUnique({
          where: { id: data.templateId },
        })

        if (!template) {
          return reply.status(404).send({ error: 'Template not found' })
        }

        // Validate template compatibility
        const validation = await channelValidationService.isTemplateCompatible(
          data.templateId,
          data.instanceId
        )

        if (!validation.valid) {
          return reply.status(400).send({ error: validation.error })
        }
      }

      // Validate that we have either template or message content
      if (!template && !data.messageContent) {
        return reply.status(400).send({
          error: 'Either templateId or messageContent is required',
        })
      }

      // Create queue items
      const items: any[] = []
      const errors: { phoneNumber: string; error: string }[] = []

      for (const contact of data.contacts) {
        try {
          // Build message content
          let finalContent = data.messageContent || ''
          if (template) {
            finalContent = channelValidationService.applyVariables(
              template.bodyText,
              contact.variables || {}
            )
          }

          items.push({
            companyId: request.user.companyId,
            instanceId: data.instanceId,
            phoneNumber: contact.phoneNumber.replace(/\D/g, ''),
            messageContent: finalContent,
            messageType: 'text',
            templateId: data.templateId,
            variables: contact.variables,
            priority: data.priority,
            scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
            status: data.scheduledFor ? 'SCHEDULED' : 'WAITING',
          })
        } catch (error: any) {
          errors.push({
            phoneNumber: contact.phoneNumber,
            error: error.message,
          })
        }
      }

      // Batch insert
      if (items.length > 0) {
        await prisma.sendQueue.createMany({ data: items })

        // Update template usage count
        if (template) {
          await prisma.messageTemplate.update({
            where: { id: data.templateId },
            data: {
              usageCount: { increment: items.length },
              lastUsedAt: new Date(),
            },
          })
        }
      }

      return reply.status(201).send({
        success: true,
        added: items.length,
        errors: errors.length,
        errorDetails: errors.length > 0 ? errors : undefined,
      })
    }
  )

  // Cancel queue item
  fastify.delete(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const item = await prisma.sendQueue.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!item) {
        return reply.status(404).send({ error: 'Queue item not found' })
      }

      // Only allow cancellation of waiting/scheduled items
      if (!['WAITING', 'SCHEDULED'].includes(item.status)) {
        return reply.status(400).send({
          error: 'Can only cancel waiting or scheduled items',
        })
      }

      await prisma.sendQueue.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })

      return reply.status(204).send()
    }
  )

  // Cancel all waiting items for an instance
  fastify.delete(
    '/instance/:instanceId',
    async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
      const { instanceId } = request.params

      const result = await prisma.sendQueue.updateMany({
        where: {
          companyId: request.user.companyId,
          instanceId,
          status: { in: ['WAITING', 'SCHEDULED'] },
        },
        data: { status: 'CANCELLED' },
      })

      return reply.send({ cancelled: result.count })
    }
  )

  // Retry failed items
  fastify.post(
    '/retry/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const item = await prisma.sendQueue.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!item) {
        return reply.status(404).send({ error: 'Queue item not found' })
      }

      if (item.status !== 'FAILED') {
        return reply.status(400).send({ error: 'Can only retry failed items' })
      }

      const updated = await prisma.sendQueue.update({
        where: { id },
        data: {
          status: 'WAITING',
          attempts: 0,
          error: null,
          lastAttemptAt: null,
          nextAttemptAt: null,
        },
      })

      return reply.send(updated)
    }
  )

  // Retry all failed items for an instance
  fastify.post(
    '/retry-all/:instanceId',
    async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
      const { instanceId } = request.params

      const result = await prisma.sendQueue.updateMany({
        where: {
          companyId: request.user.companyId,
          instanceId,
          status: 'FAILED',
        },
        data: {
          status: 'WAITING',
          attempts: 0,
          error: null,
          lastAttemptAt: null,
          nextAttemptAt: null,
        },
      })

      return reply.send({ retried: result.count })
    }
  )

  // Get queue item details
  fastify.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const item = await prisma.sendQueue.findFirst({
        where: { id, companyId: request.user.companyId },
        include: {
          instance: { select: { id: true, name: true, channel: true } },
        },
      })

      if (!item) {
        return reply.status(404).send({ error: 'Queue item not found' })
      }

      return reply.send(item)
    }
  )

  // Clear completed/cancelled items older than X days
  fastify.delete(
    '/cleanup',
    async (request: FastifyRequest<{ Querystring: { days?: string } }>, reply: FastifyReply) => {
      const days = parseInt(request.query.days || '7')
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      const result = await prisma.sendQueue.deleteMany({
        where: {
          companyId: request.user.companyId,
          status: { in: ['COMPLETED', 'CANCELLED'] },
          updatedAt: { lt: cutoffDate },
        },
      })

      return reply.send({ deleted: result.count })
    }
  )
}
