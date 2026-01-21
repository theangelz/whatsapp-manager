import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { env } from '../../config/env.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { channelValidationService } from '../../services/channel-validation.service.js'
import { instanceLockService } from '../../services/instance-lock.service.js'
import { rateLimiterService } from '../../services/rate-limiter.service.js'
import { baileysManager } from '../../server.js'

// Schema for webhook payload (flexible - accepts any JSON)
const webhookPayloadSchema = z.record(z.any())

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSED', 'ERROR', 'IGNORED']),
  errorMessage: z.string().optional(),
})

const applyTemplateSchema = z.object({
  templateId: z.string().uuid(),
  instanceId: z.string().uuid(),
  phoneNumberField: z.string().optional(),
  variableMapping: z.record(z.string()).optional(),
})

const directSendSchema = z.object({
  instanceId: z.string().uuid(),
  phoneNumber: z.string(),
  message: z.string(),
})

/**
 * Extract variables from a JSON payload recursively
 */
function extractVariables(obj: any, prefix = ''): Record<string, { value: string; type: string }> {
  const result: Record<string, { value: string; type: string }> = {}

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (value === null || value === undefined) {
      result[fullKey] = { value: '', type: 'null' }
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, extractVariables(value, fullKey))
    } else if (Array.isArray(value)) {
      result[fullKey] = { value: JSON.stringify(value), type: 'array' }
    } else {
      result[fullKey] = {
        value: String(value),
        type: typeof value,
      }
    }
  }

  return result
}

/**
 * Extract phone number from payload (tries common patterns)
 */
function extractPhoneNumber(payload: any): string | null {
  const phoneFields = [
    'phone',
    'phoneNumber',
    'phone_number',
    'telefone',
    'celular',
    'whatsapp',
    'mobile',
    'contact.phone',
    'customer.phone',
    'data.phone',
  ]

  for (const field of phoneFields) {
    const parts = field.split('.')
    let value = payload
    for (const part of parts) {
      value = value?.[part]
    }
    if (value && typeof value === 'string') {
      const cleaned = value.replace(/\D/g, '')
      if (cleaned.length >= 10) {
        return cleaned
      }
    }
  }

  return null
}

export async function webhookEntradaRoutes(fastify: FastifyInstance) {
  // =============================================
  // PUBLIC ENDPOINT - Receives webhook data (with token auth)
  // =============================================
  fastify.post(
    '/:companyId',
    async (request: FastifyRequest<{ Params: { companyId: string }; Querystring: { token?: string } }>, reply: FastifyReply) => {
      const { companyId } = request.params
      const payload = request.body

      // Get token from header or query param
      const token =
        (request.headers['x-webhook-token'] as string) ||
        (request.headers['authorization']?.replace('Bearer ', '')) ||
        request.query.token

      // Verify company exists
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      })

      if (!company) {
        return reply.status(404).send({ error: 'Company not found' })
      }

      // Verify token if company has one configured
      if (company.webhookToken) {
        if (!token) {
          return reply.status(401).send({
            error: 'Token required',
            message: 'Use header X-Webhook-Token or query param ?token=xxx'
          })
        }
        if (token !== company.webhookToken) {
          return reply.status(401).send({ error: 'Invalid token' })
        }
      }

      // Extract phone number from payload
      const phoneNumber = extractPhoneNumber(payload)

      // Create webhook event
      const event = await prisma.webhookEvent.create({
        data: {
          companyId,
          rawPayload: payload as any,
          phoneNumber,
          eventType: (payload as any).event || (payload as any).type || 'unknown',
          ipAddress: request.ip || 'unknown',
          userAgent: request.headers['user-agent'] || null,
          status: 'PENDING',
        },
      })

      // Extract and store variables
      const variables = extractVariables(payload)
      const variableRecords = Object.entries(variables).map(([key, data]) => ({
        webhookEventId: event.id,
        key,
        value: data.value,
        valueType: data.type,
      }))

      if (variableRecords.length > 0) {
        await prisma.webhookVariable.createMany({
          data: variableRecords,
        })
      }

      return reply.status(201).send({
        success: true,
        eventId: event.id,
        phoneNumber,
        variablesExtracted: Object.keys(variables).length,
      })
    }
  )

  // =============================================
  // PROTECTED ENDPOINTS - Require authentication
  // =============================================
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authMiddleware)

    // List webhook events
    protectedRoutes.get(
      '/events',
      async (request: FastifyRequest<{ Querystring: { status?: string; page?: string; limit?: string } }>, reply: FastifyReply) => {
        const { status, page = '1', limit = '20' } = request.query
        const skip = (parseInt(page) - 1) * parseInt(limit)

        const where: any = { companyId: request.user.companyId }
        if (status) {
          where.status = status
        }

        const [events, total] = await Promise.all([
          prisma.webhookEvent.findMany({
            where,
            include: {
              instance: { select: { id: true, name: true } },
              variables: true,
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit),
          }),
          prisma.webhookEvent.count({ where }),
        ])

        return reply.send({
          events,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        })
      }
    )

    // Get event details
    protectedRoutes.get(
      '/events/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params

        const event = await prisma.webhookEvent.findFirst({
          where: { id, companyId: request.user.companyId },
          include: {
            instance: true,
            variables: true,
          },
        })

        if (!event) {
          return reply.status(404).send({ error: 'Event not found' })
        }

        return reply.send(event)
      }
    )

    // Update event status
    protectedRoutes.patch(
      '/events/:id/status',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params
        const data = updateStatusSchema.parse(request.body)

        const event = await prisma.webhookEvent.findFirst({
          where: { id, companyId: request.user.companyId },
        })

        if (!event) {
          return reply.status(404).send({ error: 'Event not found' })
        }

        const updated = await prisma.webhookEvent.update({
          where: { id },
          data: {
            status: data.status,
            errorMessage: data.errorMessage,
            processedAt: data.status === 'PROCESSED' ? new Date() : undefined,
          },
        })

        return reply.send(updated)
      }
    )

    // Apply template and enqueue message
    protectedRoutes.post(
      '/events/:id/apply-template',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params
        const data = applyTemplateSchema.parse(request.body)

        // Get the event
        const event = await prisma.webhookEvent.findFirst({
          where: { id, companyId: request.user.companyId },
          include: { variables: true },
        })

        if (!event) {
          return reply.status(404).send({ error: 'Event not found' })
        }

        // Get the template
        const template = await prisma.messageTemplate.findFirst({
          where: { id: data.templateId, companyId: request.user.companyId },
        })

        if (!template) {
          return reply.status(404).send({ error: 'Template not found' })
        }

        // Get the instance
        const instance = await prisma.instance.findFirst({
          where: { id: data.instanceId, companyId: request.user.companyId },
        })

        if (!instance) {
          return reply.status(404).send({ error: 'Instance not found' })
        }

        // Validate template compatibility
        const validation = await channelValidationService.isTemplateCompatible(
          data.templateId,
          data.instanceId
        )

        if (!validation.valid) {
          return reply.status(400).send({ error: validation.error })
        }

        // Determine phone number
        let phoneNumber = event.phoneNumber
        if (data.phoneNumberField) {
          const variable = event.variables.find((v) => v.key === data.phoneNumberField)
          if (variable) {
            phoneNumber = variable.value.replace(/\D/g, '')
          }
        }

        if (!phoneNumber) {
          return reply.status(400).send({ error: 'No phone number available' })
        }

        // Build variables from event data
        const variables: Record<string, string> = {}
        if (data.variableMapping) {
          for (const [templateVar, eventVar] of Object.entries(data.variableMapping)) {
            const variable = event.variables.find((v) => v.key === eventVar)
            if (variable) {
              variables[templateVar] = variable.value
            }
          }
        } else {
          // Auto-map variables by name
          for (const variable of event.variables) {
            variables[variable.key] = variable.value
          }
        }

        // Apply variables to template
        const messageContent = channelValidationService.applyVariables(template.bodyText, variables)

        // Add to send queue
        const queueItem = await prisma.sendQueue.create({
          data: {
            companyId: request.user.companyId,
            instanceId: data.instanceId,
            phoneNumber,
            messageContent,
            templateId: data.templateId,
            variables,
            webhookEventId: id,
            status: 'WAITING',
          },
        })

        // Update event
        await prisma.webhookEvent.update({
          where: { id },
          data: {
            status: 'PROCESSED',
            instanceId: data.instanceId,
            templateId: data.templateId,
            processedAt: new Date(),
          },
        })

        return reply.status(201).send({
          success: true,
          queueItemId: queueItem.id,
          message: 'Message queued successfully',
          preview: messageContent,
        })
      }
    )

    // Direct send (Baileys only, immediate)
    protectedRoutes.post(
      '/events/:id/send',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params
        const data = directSendSchema.parse(request.body)

        // Get the event
        const event = await prisma.webhookEvent.findFirst({
          where: { id, companyId: request.user.companyId },
        })

        if (!event) {
          return reply.status(404).send({ error: 'Event not found' })
        }

        // Get the instance
        const instance = await prisma.instance.findFirst({
          where: { id: data.instanceId, companyId: request.user.companyId },
        })

        if (!instance) {
          return reply.status(404).send({ error: 'Instance not found' })
        }

        // Only allow direct send for Baileys
        if (instance.channel !== 'BAILEYS') {
          return reply.status(400).send({
            error: 'Direct send is only available for Baileys instances. Use templates for Cloud API.',
          })
        }

        if (instance.status !== 'CONNECTED') {
          return reply.status(400).send({ error: 'Instance is not connected' })
        }

        // Check rate limit
        const rateCheck = await rateLimiterService.checkRateLimit(data.instanceId, 'BAILEYS')
        if (!rateCheck.allowed) {
          return reply.status(429).send({
            error: rateCheck.reason,
            waitTimeMs: rateCheck.waitTimeMs,
            retryAfter: Math.ceil(rateCheck.waitTimeMs / 1000),
          })
        }

        // Check instance lock
        const isAvailable = await instanceLockService.isAvailable(data.instanceId)
        if (!isAvailable) {
          return reply.status(423).send({
            error: 'Instance is currently busy. Please try again.',
          })
        }

        // Acquire lock
        const lockAcquired = await instanceLockService.acquireLock(
          data.instanceId,
          request.user.id,
          'Direct webhook send'
        )

        if (!lockAcquired) {
          return reply.status(423).send({
            error: 'Could not acquire lock on instance',
          })
        }

        try {
          // Create message log
          const messageLog = await prisma.messageLog.create({
            data: {
              companyId: request.user.companyId,
              instanceId: data.instanceId,
              phoneNumber: data.phoneNumber,
              messageContent: data.message,
              webhookEventId: id,
              status: 'PROCESSING',
            },
          })

          const startTime = Date.now()

          // Send message via Baileys
          const jid = data.phoneNumber.includes('@') ? data.phoneNumber : `${data.phoneNumber}@s.whatsapp.net`
          const result = await baileysManager.sendTextMessage(data.instanceId, jid, data.message)

          // Record rate limit
          await rateLimiterService.recordSend(data.instanceId, 'BAILEYS')

          // Update message log
          await prisma.messageLog.update({
            where: { id: messageLog.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              apiMessageId: result?.key?.id,
              processingTimeMs: Date.now() - startTime,
            },
          })

          // Release lock
          await instanceLockService.releaseLock(data.instanceId)

          // Update event
          await prisma.webhookEvent.update({
            where: { id },
            data: {
              status: 'PROCESSED',
              instanceId: data.instanceId,
              messageLogId: messageLog.id,
              processedAt: new Date(),
            },
          })

          return reply.send({
            success: true,
            messageId: result?.key?.id,
            messageLogId: messageLog.id,
          })
        } catch (error: any) {
          // Record error
          await instanceLockService.recordError(data.instanceId, error.message)

          // Update message log
          await prisma.messageLog.updateMany({
            where: { webhookEventId: id, status: 'PROCESSING' },
            data: {
              status: 'FAILED',
              failedAt: new Date(),
              errorMessage: error.message,
            },
          })

          throw error
        }
      }
    )

    // Get company's webhook URL info
    protectedRoutes.get(
      '/info',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const company = await prisma.company.findUnique({
          where: { id: request.user.companyId },
          select: { webhookToken: true }
        })

        const baseUrl = `${env.BACKEND_URL}/api/webhook-entrada/${request.user.companyId}`

        return reply.send({
          webhookUrl: baseUrl,
          webhookUrlWithToken: company?.webhookToken
            ? `${baseUrl}?token=${company.webhookToken}`
            : null,
          companyId: request.user.companyId,
          webhookToken: company?.webhookToken || null,
          tokenConfigured: !!company?.webhookToken,
          method: 'POST',
          contentType: 'application/json',
          authentication: {
            description: 'Token pode ser enviado via header ou query param',
            headerName: 'X-Webhook-Token',
            headerExample: `X-Webhook-Token: ${company?.webhookToken || 'seu-token'}`,
            queryExample: `?token=${company?.webhookToken || 'seu-token'}`,
          },
          description: 'Envie qualquer JSON. Telefones serão detectados automaticamente.',
          commonPhoneFields: [
            'phone',
            'phoneNumber',
            'phone_number',
            'telefone',
            'celular',
            'whatsapp',
          ],
          example: {
            nome: 'João Silva',
            telefone: '5511999999999',
            valor: '150.00',
            vencimento: '25/01/2026',
          },
        })
      }
    )

    // Generate or regenerate webhook token
    protectedRoutes.post(
      '/generate-token',
      async (request: FastifyRequest, reply: FastifyReply) => {
        // Generate a secure random token
        const crypto = await import('crypto')
        const newToken = crypto.randomBytes(32).toString('hex')

        const company = await prisma.company.update({
          where: { id: request.user.companyId },
          data: { webhookToken: newToken },
          select: { id: true, webhookToken: true }
        })

        return reply.send({
          success: true,
          webhookToken: company.webhookToken,
          message: 'Token gerado com sucesso. Use este token para autenticar chamadas ao webhook.',
          usage: {
            header: `X-Webhook-Token: ${company.webhookToken}`,
            queryParam: `?token=${company.webhookToken}`,
          }
        })
      }
    )

    // Remove webhook token (make endpoint public again)
    protectedRoutes.delete(
      '/remove-token',
      async (request: FastifyRequest, reply: FastifyReply) => {
        await prisma.company.update({
          where: { id: request.user.companyId },
          data: { webhookToken: null }
        })

        return reply.send({
          success: true,
          message: 'Token removido. O webhook agora aceita requisições sem autenticação.'
        })
      }
    )

    // Get event statistics
    protectedRoutes.get(
      '/stats',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const companyId = request.user.companyId

        const [total, pending, processed, error, ignored] = await Promise.all([
          prisma.webhookEvent.count({ where: { companyId } }),
          prisma.webhookEvent.count({ where: { companyId, status: 'PENDING' } }),
          prisma.webhookEvent.count({ where: { companyId, status: 'PROCESSED' } }),
          prisma.webhookEvent.count({ where: { companyId, status: 'ERROR' } }),
          prisma.webhookEvent.count({ where: { companyId, status: 'IGNORED' } }),
        ])

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const todayCount = await prisma.webhookEvent.count({
          where: {
            companyId,
            createdAt: { gte: today },
          },
        })

        return reply.send({
          total,
          pending,
          processed,
          error,
          ignored,
          todayCount,
        })
      }
    )
  })
}
