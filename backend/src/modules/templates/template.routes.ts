import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { CloudAPIProvider } from '../../providers/cloud-api/cloud-api.provider.js'
import { env } from '../../config/env.js'
import axios from 'axios'

const createTemplateSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9_]+$/),
  language: z.string().default('pt_BR'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).default('MARKETING'),
  headerType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
  headerContent: z.string().optional(),
  bodyText: z.string().min(1),
  footerText: z.string().optional(),
  buttons: z.array(z.object({
    type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
    text: z.string(),
    url: z.string().optional(),
    phoneNumber: z.string().optional(),
  })).optional(),
})

export async function templateRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // List templates
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const templates = await prisma.template.findMany({
      where: { companyId: request.user.companyId },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send(templates)
  })

  // Sync templates from Meta
  fastify.post('/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!env.META_ACCESS_TOKEN || !env.META_BUSINESS_ID) {
      return reply.status(400).send({ error: 'Meta Cloud API not configured' })
    }

    try {
      const response = await axios.get(
        `https://graph.facebook.com/${env.META_API_VERSION}/${env.META_BUSINESS_ID}/message_templates`,
        {
          params: { fields: 'name,status,category,language,components' },
          headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` },
        }
      )

      const metaTemplates = response.data.data

      for (const template of metaTemplates) {
        const bodyComponent = template.components?.find((c: any) => c.type === 'BODY')
        const headerComponent = template.components?.find((c: any) => c.type === 'HEADER')
        const footerComponent = template.components?.find((c: any) => c.type === 'FOOTER')
        const buttonsComponent = template.components?.find((c: any) => c.type === 'BUTTONS')

        await prisma.template.upsert({
          where: {
            companyId_name: {
              companyId: request.user.companyId,
              name: template.name,
            },
          },
          create: {
            companyId: request.user.companyId,
            name: template.name,
            language: template.language,
            category: template.category,
            status: template.status,
            bodyText: bodyComponent?.text || '',
            headerType: headerComponent?.format,
            headerContent: headerComponent?.text,
            footerText: footerComponent?.text,
            buttons: buttonsComponent?.buttons,
            metaId: template.id,
          },
          update: {
            status: template.status,
            bodyText: bodyComponent?.text || '',
            headerType: headerComponent?.format,
            headerContent: headerComponent?.text,
            footerText: footerComponent?.text,
            buttons: buttonsComponent?.buttons,
          },
        })
      }

      return reply.send({ message: 'Templates synced successfully', count: metaTemplates.length })
    } catch (error: any) {
      return reply.status(500).send({ error: error.response?.data?.error?.message || error.message })
    }
  })

  // Create template (submits to Meta)
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = createTemplateSchema.parse(request.body)

    if (!env.META_ACCESS_TOKEN || !env.META_BUSINESS_ID) {
      return reply.status(400).send({ error: 'Meta Cloud API not configured' })
    }

    // Build components for Meta API
    const components: any[] = []

    if (data.headerType && data.headerContent) {
      components.push({
        type: 'HEADER',
        format: data.headerType,
        text: data.headerType === 'TEXT' ? data.headerContent : undefined,
        example: data.headerType !== 'TEXT' ? { header_handle: [data.headerContent] } : undefined,
      })
    }

    components.push({
      type: 'BODY',
      text: data.bodyText,
    })

    if (data.footerText) {
      components.push({
        type: 'FOOTER',
        text: data.footerText,
      })
    }

    if (data.buttons && data.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: data.buttons.map((btn) => ({
          type: btn.type,
          text: btn.text,
          url: btn.url,
          phone_number: btn.phoneNumber,
        })),
      })
    }

    try {
      const response = await axios.post(
        `https://graph.facebook.com/${env.META_API_VERSION}/${env.META_BUSINESS_ID}/message_templates`,
        {
          name: data.name,
          language: data.language,
          category: data.category,
          components,
        },
        {
          headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` },
        }
      )

      const template = await prisma.template.create({
        data: {
          companyId: request.user.companyId,
          name: data.name,
          language: data.language,
          category: data.category,
          status: 'PENDING',
          headerType: data.headerType,
          headerContent: data.headerContent,
          bodyText: data.bodyText,
          footerText: data.footerText,
          buttons: data.buttons,
          metaId: response.data.id,
        },
      })

      return reply.status(201).send(template)
    } catch (error: any) {
      return reply.status(500).send({ error: error.response?.data?.error?.message || error.message })
    }
  })

  // Delete template
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const template = await prisma.template.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!template) {
      return reply.status(404).send({ error: 'Template not found' })
    }

    if (env.META_ACCESS_TOKEN && env.META_BUSINESS_ID && template.name) {
      try {
        await axios.delete(
          `https://graph.facebook.com/${env.META_API_VERSION}/${env.META_BUSINESS_ID}/message_templates`,
          {
            params: { name: template.name },
            headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` },
          }
        )
      } catch (error) {
        console.error('Error deleting template from Meta:', error)
      }
    }

    await prisma.template.delete({ where: { id } })

    return reply.status(204).send()
  })
}
