import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database.js'
import { env } from '../../config/env.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { baileysManager } from '../../server.js'
import { CloudAPIProvider } from '../../providers/cloud-api/cloud-api.provider.js'

// Schemas
const createAutomationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  instanceId: z.string().uuid(),
  delayBetweenMessages: z.number().min(1000).default(3000),
  metaTemplateName: z.string().optional().nullable(),
  metaTemplateLanguage: z.string().default('pt_BR'),
  messageBody: z.any().optional().nullable(),
  variableMapping: z.record(z.string()).optional().nullable(),
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

        // Add automatic date/time variables
        const now = new Date()
        const brDate = now.toLocaleDateString('pt-BR')
        const brTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const brDateTime = `${brDate} ${brTime}`

        variables.dataehora = brDateTime
        variables.data = brDate
        variables.hora = brTime
        variables.timestamp = now.toISOString()

        if (automation.instance.channel === 'CLOUD_API') {
          const cloudApi = new CloudAPIProvider(automation.instance)

          if (automation.metaTemplateName) {
            // Cloud API - send template message
            const components: any[] = []
            const variableMapping = automation.variableMapping as Record<string, string> | null

            if (variableMapping && Object.keys(variableMapping).length > 0) {
              const headerVars: { index: number; value: string }[] = []
              const bodyVars: { index: number; value: string }[] = []

              for (const [key, payloadField] of Object.entries(variableMapping)) {
                const match = key.match(/^(header|body)_(\d+)$/)
                if (match) {
                  const type = match[1]
                  const index = parseInt(match[2])

                  const parts = payloadField.split('.')
                  let value = payload
                  for (const part of parts) {
                    value = value?.[part]
                  }
                  const textValue = value !== undefined && value !== null ? String(value) : ''

                  if (type === 'header') {
                    headerVars.push({ index, value: textValue })
                  } else {
                    bodyVars.push({ index, value: textValue })
                  }
                }
              }

              headerVars.sort((a, b) => a.index - b.index)
              bodyVars.sort((a, b) => a.index - b.index)

              if (headerVars.length > 0) {
                components.push({
                  type: 'header',
                  parameters: headerVars.map(v => ({ type: 'text', text: v.value })),
                })
              }

              if (bodyVars.length > 0) {
                components.push({
                  type: 'body',
                  parameters: bodyVars.map(v => ({ type: 'text', text: v.value })),
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
            // Cloud API - send text message (no template)
            const messageBody = automation.messageBody as any

            if (messageBody?.messaging_product) {
              // Custom JSON body - apply variables to the entire JSON
              let jsonStr = JSON.stringify(messageBody)

              // Apply all variables to the JSON string
              for (const [key, value] of Object.entries(variables)) {
                jsonStr = jsonStr.replace(new RegExp(`{{${key}}}`, 'g'), value)
              }

              // Replace phone number in "to" field
              jsonStr = jsonStr.replace(/\{\{to\}\}/g, phoneNumber)
              jsonStr = jsonStr.replace(/\{\{telefone\}\}/g, phoneNumber)
              jsonStr = jsonStr.replace(/\{\{phone\}\}/g, phoneNumber)

              const finalBody = JSON.parse(jsonStr)
              // Ensure "to" has the phone number
              finalBody.to = phoneNumber

              // Send raw request to Cloud API
              const result = await cloudApi.sendRawMessage(finalBody)
              messageId = result?.messages?.[0]?.id
              messageContent = finalBody.text?.body || JSON.stringify(finalBody).substring(0, 100)
            } else if (messageBody?.text) {
              // Simple text message
              messageContent = applyVariables(messageBody.text, variables)
              const result = await cloudApi.sendTextMessage(phoneNumber, messageContent)
              messageId = result?.messages?.[0]?.id
            } else {
              throw new Error('Corpo da mensagem não configurado')
            }
          }
        } else {
          // Baileys - send text message
          const messageBody = automation.messageBody as any
          if (!messageBody?.text) {
            throw new Error('Corpo da mensagem não configurado')
          }

          // Apply variables to message
          messageContent = applyVariables(messageBody.text, variables)

          // sendTextMessage handles JID formatting for both individuals and groups
          const result = await baileysManager.sendTextMessage(automation.instance.id, phoneNumber, messageContent)
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
            description: data.description || null,
            delayBetweenMessages: data.delayBetweenMessages,
            metaTemplateName: data.metaTemplateName || null,
            metaTemplateLanguage: data.metaTemplateLanguage,
            messageBody: data.messageBody ?? Prisma.DbNull,
            variableMapping: data.variableMapping ?? Prisma.DbNull,
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

        // Prepare update data - convert empty strings to null for optional fields
        const updateData: any = {}
        if (data.name !== undefined) updateData.name = data.name
        if (data.description !== undefined) updateData.description = data.description || null
        if (data.instanceId !== undefined) updateData.instanceId = data.instanceId
        if (data.status !== undefined) updateData.status = data.status
        if (data.delayBetweenMessages !== undefined) updateData.delayBetweenMessages = data.delayBetweenMessages
        if (data.metaTemplateName !== undefined) updateData.metaTemplateName = data.metaTemplateName || null
        if (data.metaTemplateLanguage !== undefined) updateData.metaTemplateLanguage = data.metaTemplateLanguage
        if (data.messageBody !== undefined) updateData.messageBody = data.messageBody ?? Prisma.DbNull
        if (data.variableMapping !== undefined) {
          updateData.variableMapping = data.variableMapping && Object.keys(data.variableMapping).length > 0
            ? data.variableMapping
            : Prisma.DbNull
        }
        if (data.phoneField !== undefined) updateData.phoneField = data.phoneField

        const updated = await prisma.automation.update({
          where: { id },
          data: updateData,
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

        // Extract variables from message body
        const messageBody = automation.messageBody as any

        // Check if it's a custom JSON (full Cloud API format) or simple text
        const isCustomJson = messageBody?.messaging_product === 'whatsapp'

        // Get message text for variable extraction
        let messageText = ''
        if (isCustomJson) {
          messageText = messageBody?.text?.body || ''
        } else {
          messageText = messageBody?.text || ''
        }

        // Find all {{variable}} patterns in the message
        const variableMatches = messageText.match(/\{\{(\w+)\}\}/g) || []
        const extractedVars = variableMatches.map((v: string) => v.replace(/[{}]/g, ''))

        // Build example payload with phone field and extracted variables
        const examplePayload: Record<string, string> = {
          [automation.phoneField]: '5511999999999',
        }
        extractedVars.forEach((v: string) => {
          if (v !== automation.phoneField && v !== 'dataehora' && v !== 'data' && v !== 'hora' && v !== 'timestamp') {
            examplePayload[v] = v === 'mensagem' ? 'Sua mensagem aqui' : `valor_${v}`
          }
        })

        // Build Cloud API body preview
        let cloudApiBody: any = null
        if (automation.instance.channel === 'CLOUD_API') {
          if (automation.metaTemplateName) {
            // Template message format
            cloudApiBody = {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: `{{${automation.phoneField}}}`,
              type: 'template',
              template: {
                name: automation.metaTemplateName,
                language: { code: automation.metaTemplateLanguage || 'pt_BR' },
                components: [],
              },
            }
          } else if (isCustomJson) {
            // Custom JSON - show as saved
            cloudApiBody = messageBody
          } else {
            // Simple text message format
            cloudApiBody = {
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: `{{${automation.phoneField}}}`,
              type: 'text',
              text: {
                preview_url: false,
                body: messageText || '{{mensagem}}',
              },
            }
          }
        }

        const curlPayload = JSON.stringify(examplePayload)

        return reply.send({
          name: automation.name,
          triggerUrl,
          token: automation.token,
          method: 'POST',
          contentType: 'application/json',
          instance: automation.instance,
          phoneField: automation.phoneField,
          status: automation.status,
          messageType: automation.metaTemplateName ? 'template' : 'text',
          cloudApiBody,
          example: examplePayload,
          curlExample: `curl -X POST "${triggerUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${curlPayload}'`,
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
