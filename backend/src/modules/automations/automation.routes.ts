import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { env } from '../../config/env.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { baileysManager } from '../../server.js'
import { CloudAPIProvider } from '../../providers/cloud-api/cloud-api.provider.js'

// Schemas
const createAutomationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  instanceId: z.string().uuid(),
  delayBetweenMessages: z.number().min(1000).default(3000),
  metaTemplateName: z.string().optional(),
  metaTemplateLanguage: z.string().default('pt_BR'),
  messageBody: z.any().optional(),
  variableMapping: z.record(z.string()).optional(),
  phoneField: z.string().default('telefone'),
})

const updateAutomationSchema = createAutomationSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})

/**
 * Apply variables to message body
 */
function applyVariables(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
}

/**
 * Extract phone number from payload using mapping
 */
function extractPhone(payload: any, phoneField: string): string | null {
  const parts = phoneField.split('.')
  let value = payload
  for (const part of parts) {
    value = value?.[part]
  }
  if (value && typeof value === 'string') {
    return value.replace(/\D/g, '')
  }
  return null
}

/**
 * Build variables from payload using mapping
 */
function buildVariables(payload: any, mapping: Record<string, string> | null): Record<string, string> {
  const result: Record<string, string> = {}

  if (!mapping) {
    // Auto-extract all string values
    const flatten = (obj: any, prefix = ''): void => {
      for (const [key, value] of Object.entries(obj || {})) {
        const fullKey = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'string' || typeof value === 'number') {
          result[fullKey] = String(value)
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          flatten(value, fullKey)
        }
      }
    }
    flatten(payload)
    return result
  }

  for (const [varName, payloadField] of Object.entries(mapping)) {
    const parts = payloadField.split('.')
    let value = payload
    for (const part of parts) {
      value = value?.[part]
    }
    if (value !== undefined && value !== null) {
      result[varName] = String(value)
    }
  }
  return result
}

export async function automationRoutes(fastify: FastifyInstance) {
  // =============================================
  // PUBLIC ENDPOINT - Trigger automation by token
  // =============================================
  fastify.post(
    '/trigger/:token',
    async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
      const { token } = request.params
      const payload = request.body as any

      // Find automation by token
      const automation = await prisma.automation.findUnique({
        where: { token },
        include: {
          instance: true,
        },
      })

      if (!automation) {
        return reply.status(404).send({ error: 'Automation not found' })
      }

      if (automation.status !== 'ACTIVE') {
        return reply.status(400).send({ error: 'Automation is not active' })
      }

      if (automation.instance.status !== 'CONNECTED') {
        return reply.status(400).send({ error: 'Instance is not connected' })
      }

      // Extract phone number
      const phoneNumber = extractPhone(payload, automation.phoneField)
      if (!phoneNumber) {
        // Log failed attempt
        await prisma.automationLog.create({
          data: {
            automationId: automation.id,
            phoneNumber: 'unknown',
            payload,
            status: 'FAILED',
            errorMessage: `Campo de telefone '${automation.phoneField}' não encontrado no payload`,
            processedAt: new Date(),
          },
        })

        return reply.status(400).send({
          error: 'Phone number not found',
          message: `Campo '${automation.phoneField}' não encontrado no payload`,
        })
      }

      // Create log entry
      const log = await prisma.automationLog.create({
        data: {
          automationId: automation.id,
          phoneNumber,
          payload,
          status: 'PROCESSING',
        },
      })

      try {
        let messageId: string | undefined
        let messageContent: string | undefined

        // Build variables from payload
        const variables = buildVariables(payload, automation.variableMapping as Record<string, string> | null)

        if (automation.instance.channel === 'CLOUD_API') {
          // Cloud API - send template message
          if (!automation.metaTemplateName) {
            throw new Error('Template Meta não configurado para Cloud API')
          }

          const cloudApi = new CloudAPIProvider(automation.instance)

          // Build template components with variables if needed
          const components: any[] = []
          if (Object.keys(variables).length > 0) {
            // Add body parameters
            const bodyParams = Object.values(variables).map(value => ({
              type: 'text',
              text: value,
            }))
            if (bodyParams.length > 0) {
              components.push({
                type: 'body',
                parameters: bodyParams,
              })
            }
          }

          const result = await cloudApi.sendTemplateMessage(
            phoneNumber,
            automation.metaTemplateName,
            automation.metaTemplateLanguage || 'pt_BR',
            components.length > 0 ? components : undefined
          )

          messageId = result?.messages?.[0]?.id
          messageContent = `Template: ${automation.metaTemplateName}`
        } else {
          // Baileys - send text message
          const messageBody = automation.messageBody as any
          if (!messageBody?.text) {
            throw new Error('Corpo da mensagem não configurado')
          }

          // Apply variables to message
          messageContent = applyVariables(messageBody.text, variables)

          const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`
          const result = await baileysManager.sendTextMessage(automation.instance.id, jid, messageContent)
          messageId = result?.key?.id || undefined
        }

        // Update log as sent
        await prisma.automationLog.update({
          where: { id: log.id },
          data: {
            status: 'SENT',
            messageContent,
            apiMessageId: messageId,
            processedAt: new Date(),
          },
        })

        // Update automation stats
        await prisma.automation.update({
          where: { id: automation.id },
          data: {
            totalSent: { increment: 1 },
            lastTriggeredAt: new Date(),
          },
        })

        return reply.send({
          success: true,
          logId: log.id,
          messageId,
          phoneNumber,
        })
      } catch (error: any) {
        // Update log as failed
        await prisma.automationLog.update({
          where: { id: log.id },
          data: {
            status: 'FAILED',
            errorMessage: error.message,
            processedAt: new Date(),
          },
        })

        // Update automation stats
        await prisma.automation.update({
          where: { id: automation.id },
          data: {
            totalFailed: { increment: 1 },
            lastTriggeredAt: new Date(),
          },
        })

        return reply.status(500).send({
          success: false,
          error: error.message,
        })
      }
    }
  )

  // =============================================
  // PROTECTED ENDPOINTS - Require authentication
  // =============================================
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authMiddleware)

    // List automations
    protectedRoutes.get(
      '/',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const automations = await prisma.automation.findMany({
          where: { companyId: request.user.companyId },
          include: {
            instance: {
              select: { id: true, name: true, channel: true, status: true },
            },
            _count: {
              select: { logs: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        })

        return reply.send(automations)
      }
    )

    // Get automation details
    protectedRoutes.get(
      '/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params

        const automation = await prisma.automation.findFirst({
          where: { id, companyId: request.user.companyId },
          include: {
            instance: true,
          },
        })

        if (!automation) {
          return reply.status(404).send({ error: 'Automation not found' })
        }

        return reply.send(automation)
      }
    )

    // Create automation
    protectedRoutes.post(
      '/',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const data = createAutomationSchema.parse(request.body)

        // Verify instance belongs to company
        const instance = await prisma.instance.findFirst({
          where: { id: data.instanceId, companyId: request.user.companyId },
        })

        if (!instance) {
          return reply.status(400).send({ error: 'Instance not found' })
        }

        const automation = await prisma.automation.create({
          data: {
            companyId: request.user.companyId,
            instanceId: data.instanceId,
            name: data.name,
            description: data.description,
            delayBetweenMessages: data.delayBetweenMessages,
            metaTemplateName: data.metaTemplateName,
            metaTemplateLanguage: data.metaTemplateLanguage,
            messageBody: data.messageBody,
            variableMapping: data.variableMapping,
            phoneField: data.phoneField,
          },
          include: {
            instance: {
              select: { id: true, name: true, channel: true },
            },
          },
        })

        return reply.status(201).send(automation)
      }
    )

    // Update automation
    protectedRoutes.put(
      '/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params
        const data = updateAutomationSchema.parse(request.body)

        const automation = await prisma.automation.findFirst({
          where: { id, companyId: request.user.companyId },
        })

        if (!automation) {
          return reply.status(404).send({ error: 'Automation not found' })
        }

        // If changing instance, verify it belongs to company
        if (data.instanceId) {
          const instance = await prisma.instance.findFirst({
            where: { id: data.instanceId, companyId: request.user.companyId },
          })

          if (!instance) {
            return reply.status(400).send({ error: 'Instance not found' })
          }
        }

        const updated = await prisma.automation.update({
          where: { id },
          data: {
            name: data.name,
            description: data.description,
            instanceId: data.instanceId,
            status: data.status,
            delayBetweenMessages: data.delayBetweenMessages,
            metaTemplateName: data.metaTemplateName,
            metaTemplateLanguage: data.metaTemplateLanguage,
            messageBody: data.messageBody,
            variableMapping: data.variableMapping,
            phoneField: data.phoneField,
          },
          include: {
            instance: {
              select: { id: true, name: true, channel: true },
            },
          },
        })

        return reply.send(updated)
      }
    )

    // Toggle automation status
    protectedRoutes.patch(
      '/:id/toggle',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params

        const automation = await prisma.automation.findFirst({
          where: { id, companyId: request.user.companyId },
        })

        if (!automation) {
          return reply.status(404).send({ error: 'Automation not found' })
        }

        const updated = await prisma.automation.update({
          where: { id },
          data: {
            status: automation.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
          },
        })

        return reply.send(updated)
      }
    )

    // Regenerate token
    protectedRoutes.post(
      '/:id/regenerate-token',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params

        const automation = await prisma.automation.findFirst({
          where: { id, companyId: request.user.companyId },
        })

        if (!automation) {
          return reply.status(404).send({ error: 'Automation not found' })
        }

        const crypto = await import('crypto')
        const newToken = crypto.randomUUID()

        const updated = await prisma.automation.update({
          where: { id },
          data: { token: newToken },
        })

        return reply.send({
          success: true,
          token: updated.token,
        })
      }
    )

    // Delete automation
    protectedRoutes.delete(
      '/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params

        const automation = await prisma.automation.findFirst({
          where: { id, companyId: request.user.companyId },
        })

        if (!automation) {
          return reply.status(404).send({ error: 'Automation not found' })
        }

        await prisma.automation.delete({ where: { id } })

        return reply.send({ success: true })
      }
    )

    // Get automation logs
    protectedRoutes.get(
      '/:id/logs',
      async (request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; limit?: string; status?: string } }>, reply: FastifyReply) => {
        const { id } = request.params
        const { page = '1', limit = '50', status } = request.query

        const automation = await prisma.automation.findFirst({
          where: { id, companyId: request.user.companyId },
        })

        if (!automation) {
          return reply.status(404).send({ error: 'Automation not found' })
        }

        const skip = (parseInt(page) - 1) * parseInt(limit)
        const where: any = { automationId: id }
        if (status) {
          where.status = status
        }

        const [logs, total] = await Promise.all([
          prisma.automationLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit),
          }),
          prisma.automationLog.count({ where }),
        ])

        return reply.send({
          logs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        })
      }
    )

    // Get automation endpoint info
    protectedRoutes.get(
      '/:id/endpoint',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params

        const automation = await prisma.automation.findFirst({
          where: { id, companyId: request.user.companyId },
          include: {
            instance: {
              select: { name: true, channel: true },
            },
          },
        })

        if (!automation) {
          return reply.status(404).send({ error: 'Automation not found' })
        }

        const triggerUrl = `${env.BACKEND_URL}/api/automations/trigger/${automation.token}`

        return reply.send({
          name: automation.name,
          triggerUrl,
          token: automation.token,
          method: 'POST',
          contentType: 'application/json',
          instance: automation.instance,
          phoneField: automation.phoneField,
          status: automation.status,
          example: {
            [automation.phoneField]: '5511999999999',
            nome: 'João Silva',
            valor: '150.00',
          },
          curlExample: `curl -X POST "${triggerUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"${automation.phoneField}": "5511999999999", "nome": "João", "valor": "100"}'`,
        })
      }
    )

    // Get available Meta templates for instance
    protectedRoutes.get(
      '/meta-templates/:instanceId',
      async (request: FastifyRequest<{ Params: { instanceId: string } }>, reply: FastifyReply) => {
        const { instanceId } = request.params

        const instance = await prisma.instance.findFirst({
          where: { id: instanceId, companyId: request.user.companyId },
        })

        if (!instance) {
          return reply.status(404).send({ error: 'Instance not found' })
        }

        if (instance.channel !== 'CLOUD_API') {
          return reply.status(400).send({ error: 'Instance is not Cloud API' })
        }

        if (!instance.wabaId || !instance.accessToken) {
          return reply.status(400).send({ error: 'WABA not configured' })
        }

        try {
          const cloudApi = new CloudAPIProvider(instance)
          const templates = await cloudApi.getTemplates(instance.wabaId)

          // Filter to only approved templates
          const approvedTemplates = templates.filter((t: any) => t.status === 'APPROVED')

          return reply.send(approvedTemplates)
        } catch (error: any) {
          return reply.status(500).send({ error: error.message })
        }
      }
    )
  })
}
