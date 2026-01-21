import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { env } from '../../config/env.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'

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

export async function webhookEntradaRoutes(fastify: FastifyInstance) {
  // =============================================
  // PUBLIC ENDPOINT - Receives webhook data (with optional token auth)
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

      // Create webhook event
      const event = await prisma.webhookEvent.create({
        data: {
          companyId,
          rawPayload: payload as any,
          ipAddress: request.ip || 'unknown',
          userAgent: request.headers['user-agent'] || null,
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
        variablesExtracted: Object.keys(variables).length,
        variables: Object.keys(variables),
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
      async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply: FastifyReply) => {
        const { page = '1', limit = '50' } = request.query
        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [events, total] = await Promise.all([
          prisma.webhookEvent.findMany({
            where: { companyId: request.user.companyId },
            include: {
              variables: true,
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: parseInt(limit),
          }),
          prisma.webhookEvent.count({ where: { companyId: request.user.companyId } }),
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
            variables: true,
          },
        })

        if (!event) {
          return reply.status(404).send({ error: 'Event not found' })
        }

        return reply.send(event)
      }
    )

    // Delete event
    protectedRoutes.delete(
      '/events/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.params

        const event = await prisma.webhookEvent.findFirst({
          where: { id, companyId: request.user.companyId },
        })

        if (!event) {
          return reply.status(404).send({ error: 'Event not found' })
        }

        await prisma.webhookEvent.delete({ where: { id } })

        return reply.send({ success: true })
      }
    )

    // Get available variables (from all past webhooks)
    protectedRoutes.get(
      '/variables',
      async (request: FastifyRequest, reply: FastifyReply) => {
        // Get unique variable keys from recent webhooks
        const variables = await prisma.webhookVariable.findMany({
          where: {
            webhookEvent: {
              companyId: request.user.companyId,
            }
          },
          distinct: ['key'],
          select: {
            key: true,
            valueType: true,
          },
          orderBy: { key: 'asc' },
          take: 200,
        })

        // Identify potential phone fields
        const phonePatterns = ['phone', 'telefone', 'celular', 'whatsapp', 'mobile', 'fone']
        const suggestedPhoneFields = variables.filter(v =>
          phonePatterns.some(p => v.key.toLowerCase().includes(p))
        )

        return reply.send({
          variables: variables.map(v => ({
            key: v.key,
            type: v.valueType,
            placeholder: `{{${v.key}}}`,
          })),
          suggestedPhoneFields: suggestedPhoneFields.map(v => v.key),
        })
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
          description: 'Envie qualquer JSON. Variáveis serão extraídas automaticamente.',
        })
      }
    )

    // Generate or regenerate webhook token
    protectedRoutes.post(
      '/generate-token',
      async (request: FastifyRequest, reply: FastifyReply) => {
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
          message: 'Token gerado com sucesso.',
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

    // Get stats
    protectedRoutes.get(
      '/stats',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const companyId = request.user.companyId

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const [total, todayCount] = await Promise.all([
          prisma.webhookEvent.count({ where: { companyId } }),
          prisma.webhookEvent.count({
            where: {
              companyId,
              createdAt: { gte: today },
            },
          }),
        ])

        return reply.send({
          total,
          todayCount,
        })
      }
    )
  })
}
