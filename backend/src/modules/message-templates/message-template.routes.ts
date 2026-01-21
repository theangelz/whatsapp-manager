import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { channelValidationService } from '../../services/channel-validation.service.js'

const createTemplateSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  type: z.enum(['COBRANCA', 'LEMBRETE', 'AVISO', 'PROMOCAO', 'CONFIRMACAO', 'CUSTOM']).default('CUSTOM'),
  channelType: z.enum(['BOTH', 'BAILEYS', 'CLOUD_API']).default('BOTH'),
  isHomologated: z.boolean().default(false),
  metaTemplateName: z.string().optional(),
  metaTemplateId: z.string().optional(),
  bodyText: z.string().min(1),
  headerText: z.string().optional(),
  footerText: z.string().optional(),
  variableSchema: z.record(z.object({
    required: z.boolean().default(false),
    type: z.string().default('string'),
    description: z.string().optional(),
    defaultValue: z.string().optional(),
  })).optional(),
})

const updateTemplateSchema = createTemplateSchema.partial()

const previewSchema = z.object({
  variables: z.record(z.string()),
})

export async function messageTemplateRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // List templates
  fastify.get(
    '/',
    async (request: FastifyRequest<{ Querystring: { type?: string; channelType?: string; search?: string } }>, reply: FastifyReply) => {
      const { type, channelType, search } = request.query

      const where: any = {
        companyId: request.user.companyId,
        isActive: true,
      }

      if (type) {
        where.type = type
      }

      if (channelType) {
        where.channelType = channelType
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { bodyText: { contains: search, mode: 'insensitive' } },
        ]
      }

      const templates = await prisma.messageTemplate.findMany({
        where,
        orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
      })

      // Extract variables from each template
      const templatesWithVars = templates.map((t) => ({
        ...t,
        extractedVariables: channelValidationService.extractVariables(t.bodyText),
      }))

      return reply.send(templatesWithVars)
    }
  )

  // Get template by ID
  fastify.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const template = await prisma.messageTemplate.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!template) {
        return reply.status(404).send({ error: 'Template not found' })
      }

      const extractedVariables = channelValidationService.extractVariables(template.bodyText)

      return reply.send({
        ...template,
        extractedVariables,
      })
    }
  )

  // Create template
  fastify.post(
    '/',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = createTemplateSchema.parse(request.body)

      // Check for duplicate name
      const existing = await prisma.messageTemplate.findFirst({
        where: {
          companyId: request.user.companyId,
          name: data.name,
        },
      })

      if (existing) {
        return reply.status(400).send({ error: 'Template name already exists' })
      }

      // Validate Cloud API requirements
      if (data.channelType === 'CLOUD_API' || data.isHomologated) {
        if (!data.metaTemplateName) {
          return reply.status(400).send({
            error: 'Cloud API templates require Meta template name',
          })
        }
      }

      // Auto-extract variable schema if not provided
      let variableSchema = data.variableSchema
      if (!variableSchema) {
        const extractedVars = channelValidationService.extractVariables(data.bodyText)
        if (extractedVars.length > 0) {
          variableSchema = extractedVars.reduce((acc, varName) => {
            acc[varName] = { required: false, type: 'string' }
            return acc
          }, {} as Record<string, any>)
        }
      }

      const template = await prisma.messageTemplate.create({
        data: {
          companyId: request.user.companyId,
          name: data.name,
          description: data.description,
          type: data.type,
          channelType: data.channelType,
          isHomologated: data.isHomologated,
          metaTemplateName: data.metaTemplateName,
          metaTemplateId: data.metaTemplateId,
          bodyText: data.bodyText,
          headerText: data.headerText,
          footerText: data.footerText,
          variableSchema: variableSchema || undefined,
        },
      })

      return reply.status(201).send(template)
    }
  )

  // Update template
  fastify.put(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params
      const data = updateTemplateSchema.parse(request.body)

      const template = await prisma.messageTemplate.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!template) {
        return reply.status(404).send({ error: 'Template not found' })
      }

      // Check name uniqueness if changed
      if (data.name && data.name !== template.name) {
        const existing = await prisma.messageTemplate.findFirst({
          where: {
            companyId: request.user.companyId,
            name: data.name,
            id: { not: id },
          },
        })

        if (existing) {
          return reply.status(400).send({ error: 'Template name already exists' })
        }
      }

      // Update variable schema if body text changed
      let variableSchema = data.variableSchema
      if (data.bodyText && !data.variableSchema) {
        const extractedVars = channelValidationService.extractVariables(data.bodyText)
        if (extractedVars.length > 0) {
          variableSchema = extractedVars.reduce((acc, varName) => {
            // Preserve existing schema for variable if exists
            const existingSchema = (template.variableSchema as any)?.[varName]
            acc[varName] = existingSchema || { required: false, type: 'string' }
            return acc
          }, {} as Record<string, any>)
        }
      }

      const updated = await prisma.messageTemplate.update({
        where: { id },
        data: {
          ...data,
          variableSchema: variableSchema !== undefined ? variableSchema : undefined,
        },
      })

      return reply.send(updated)
    }
  )

  // Delete template
  fastify.delete(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const template = await prisma.messageTemplate.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!template) {
        return reply.status(404).send({ error: 'Template not found' })
      }

      // Soft delete
      await prisma.messageTemplate.update({
        where: { id },
        data: { isActive: false },
      })

      return reply.status(204).send()
    }
  )

  // Preview template with variables
  fastify.post(
    '/:id/preview',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params
      const { variables } = previewSchema.parse(request.body)

      const template = await prisma.messageTemplate.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!template) {
        return reply.status(404).send({ error: 'Template not found' })
      }

      const headerPreview = template.headerText
        ? channelValidationService.applyVariables(template.headerText, variables)
        : null
      const bodyPreview = channelValidationService.applyVariables(template.bodyText, variables)
      const footerPreview = template.footerText
        ? channelValidationService.applyVariables(template.footerText, variables)
        : null

      // Check for missing variables
      const requiredVars = template.variableSchema
        ? Object.entries(template.variableSchema as Record<string, any>)
            .filter(([_, config]) => config.required)
            .map(([key]) => key)
        : []

      const missingVars = requiredVars.filter((v) => !variables[v])

      return reply.send({
        header: headerPreview,
        body: bodyPreview,
        footer: footerPreview,
        missingVariables: missingVars,
        hasAllRequiredVariables: missingVars.length === 0,
      })
    }
  )

  // Get templates compatible with an instance
  fastify.get(
    '/compatible/:instanceId',
    async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
      const { instanceId } = request.params

      try {
        const templates = await channelValidationService.getCompatibleTemplates(
          instanceId,
          request.user.companyId
        )

        return reply.send(templates)
      } catch (error: any) {
        return reply.status(400).send({ error: error.message })
      }
    }
  )

  // Duplicate template
  fastify.post(
    '/:id/duplicate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const template = await prisma.messageTemplate.findFirst({
        where: { id, companyId: request.user.companyId },
      })

      if (!template) {
        return reply.status(404).send({ error: 'Template not found' })
      }

      // Generate unique name
      let newName = `${template.name} (cópia)`
      let counter = 1
      while (
        await prisma.messageTemplate.findFirst({
          where: { companyId: request.user.companyId, name: newName },
        })
      ) {
        counter++
        newName = `${template.name} (cópia ${counter})`
      }

      const duplicate = await prisma.messageTemplate.create({
        data: {
          companyId: request.user.companyId,
          name: newName,
          description: template.description,
          type: template.type,
          channelType: template.channelType,
          isHomologated: false, // New template is not homologated
          metaTemplateName: null,
          metaTemplateId: null,
          bodyText: template.bodyText,
          headerText: template.headerText,
          footerText: template.footerText,
          variableSchema: template.variableSchema || undefined,
        },
      })

      return reply.status(201).send(duplicate)
    }
  )

  // Get template statistics
  fastify.get(
    '/stats/overview',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const companyId = request.user.companyId

      const [total, homologated, byType, byChannel, mostUsed] = await Promise.all([
        prisma.messageTemplate.count({ where: { companyId, isActive: true } }),
        prisma.messageTemplate.count({ where: { companyId, isActive: true, isHomologated: true } }),
        prisma.messageTemplate.groupBy({
          by: ['type'],
          where: { companyId, isActive: true },
          _count: true,
        }),
        prisma.messageTemplate.groupBy({
          by: ['channelType'],
          where: { companyId, isActive: true },
          _count: true,
        }),
        prisma.messageTemplate.findMany({
          where: { companyId, isActive: true },
          orderBy: { usageCount: 'desc' },
          take: 5,
          select: { id: true, name: true, usageCount: true },
        }),
      ])

      return reply.send({
        total,
        homologated,
        byType: byType.reduce((acc, item) => {
          acc[item.type] = item._count
          return acc
        }, {} as Record<string, number>),
        byChannel: byChannel.reduce((acc, item) => {
          acc[item.channelType] = item._count
          return acc
        }, {} as Record<string, number>),
        mostUsed,
      })
    }
  )
}
