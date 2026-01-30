import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
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
    type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE', 'ORDER_DETAILS']),
    text: z.string(),
    url: z.string().optional(),
    phoneNumber: z.string().optional(),
    example: z.string().optional(),
  })).optional(),
})

// Fetch App ID automatically from Meta API using the access token
async function fetchAppIdFromToken(accessToken: string): Promise<string | null> {
  try {
    // Use debug_token endpoint to get app_id from the access token
    const response = await axios.get(
      `https://graph.facebook.com/${env.META_API_VERSION}/debug_token`,
      {
        params: { input_token: accessToken },
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    const appId = response.data?.data?.app_id
    if (appId) {
      console.log('[Template] App ID fetched automatically:', appId)
      return appId
    }
    return null
  } catch (error: any) {
    console.error('[Template] Failed to fetch App ID from token:', error.response?.data || error.message)
    return null
  }
}

// Helper function to get Cloud API credentials from instance
async function getCloudApiCredentials(companyId: string) {
  // Find first Cloud API instance with credentials configured
  const instance = await prisma.instance.findFirst({
    where: {
      companyId,
      channel: 'CLOUD_API',
      wabaId: { not: null },
      accessToken: { not: null },
    },
    select: {
      id: true,
      wabaId: true,
      accessToken: true,
      appId: true,
    },
  })

  if (!instance || !instance.wabaId || !instance.accessToken) {
    return null
  }

  // Try to get App ID: 1) from instance, 2) from env, 3) fetch from Meta API
  let appId = instance.appId || env.META_APP_ID || null

  // If no App ID configured, try to fetch automatically from Meta
  if (!appId) {
    appId = await fetchAppIdFromToken(instance.accessToken)

    // Save to database for future use (avoid repeated API calls)
    if (appId) {
      await prisma.instance.update({
        where: { id: instance.id },
        data: { appId },
      })
      console.log('[Template] App ID saved to instance:', appId)
    }
  }

  return {
    wabaId: instance.wabaId,
    accessToken: instance.accessToken,
    appId,
  }
}

// Sample PDF for template approval (minimal valid PDF)
const SAMPLE_PDF_BASE64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQKL0YxIDI0IFRmCjEwMCA3MDAgVGQKKEJvbGV0bykgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjE0IDAwMDAwIG4gCjAwMDAwMDAzMDggMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgozODUKJSVFT0Y='

/**
 * Upload sample PDF to Meta and get handle for template creation
 * Uses Resumable Upload API (same as SjnetworkAPI)
 */
async function uploadSamplePdfForTemplate(accessToken: string, appId: string): Promise<string> {
  if (!appId) {
    throw new Error('App ID não detectado automaticamente. Verifique as permissões do Access Token.')
  }

  const pdfBuffer = Buffer.from(SAMPLE_PDF_BASE64, 'base64')
  const fileName = 'boleto_exemplo.pdf'
  const fileLength = pdfBuffer.length
  const fileType = 'application/pdf'

  // Step 1: Create upload session
  console.log('[Upload] Creating upload session...')
  const sessionResponse = await axios.post(
    `https://graph.facebook.com/${env.META_API_VERSION}/${appId}/uploads`,
    {
      file_name: fileName,
      file_length: fileLength,
      file_type: fileType,
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const uploadSessionId = sessionResponse.data.id
  console.log('[Upload] Session created:', uploadSessionId)

  // Step 2: Upload file data
  console.log('[Upload] Uploading PDF...')
  const uploadResponse = await axios.post(
    `https://graph.facebook.com/${env.META_API_VERSION}/${uploadSessionId}`,
    pdfBuffer,
    {
      headers: {
        'Authorization': `OAuth ${accessToken}`,
        'file_offset': '0',
        'Content-Type': 'application/pdf',
      },
    }
  )

  const handle = uploadResponse.data.h
  console.log('[Upload] Handle obtained:', handle)

  return handle
}

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

  // Sync templates from Meta (uses instance credentials)
  fastify.post('/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    const credentials = await getCloudApiCredentials(request.user.companyId)

    if (!credentials) {
      return reply.status(400).send({
        error: 'Nenhuma instância Cloud API configurada',
        message: 'Configure uma instância Cloud API com WABA ID e Access Token primeiro'
      })
    }

    try {
      const response = await axios.get(
        `https://graph.facebook.com/${env.META_API_VERSION}/${credentials.wabaId}/message_templates`,
        {
          params: { fields: 'name,status,category,language,components' },
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
        }
      )

      const metaTemplates = response.data.data
      const metaTemplateNames = metaTemplates.map((t: any) => t.name)

      // Upsert templates from Meta
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

      // Delete templates that no longer exist in Meta
      const deleted = await prisma.template.deleteMany({
        where: {
          companyId: request.user.companyId,
          name: { notIn: metaTemplateNames },
        },
      })

      return reply.send({
        message: 'Templates synced successfully',
        synced: metaTemplates.length,
        removed: deleted.count,
      })
    } catch (error: any) {
      return reply.status(500).send({ error: error.response?.data?.error?.message || error.message })
    }
  })

  // Create template (submits to Meta using instance credentials)
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    request.log.info({ body: request.body }, 'Creating template')

    let data
    try {
      data = createTemplateSchema.parse(request.body)
    } catch (parseError: any) {
      request.log.error({ err: parseError }, 'Validation error')
      return reply.status(400).send({ error: 'Dados inválidos', details: parseError.errors })
    }

    request.log.info({ companyId: request.user.companyId }, 'Looking for Cloud API credentials')
    const credentials = await getCloudApiCredentials(request.user.companyId)
    request.log.info({ found: !!credentials }, 'Credentials status')

    if (!credentials) {
      return reply.status(400).send({
        error: 'Nenhuma instância Cloud API configurada',
        message: 'Configure uma instância Cloud API com WABA ID e Access Token primeiro'
      })
    }

    // Build components for Meta API (following exact format from SjnetworkAPI)
    // IMPORTANT: Meta API uses lowercase for component types when creating templates
    const components: any[] = []

    // HEADER component (lowercase!)
    if (data.headerType) {
      const headerComponent: any = {
        type: 'header',
        format: data.headerType.toLowerCase(),
      }

      if (data.headerType === 'TEXT') {
        headerComponent.text = data.headerContent || ''
        if (data.headerContent?.includes('{{')) {
          headerComponent.example = {
            header_text: ['Exemplo']
          }
        }
      } else if (data.headerType === 'DOCUMENT') {
        // Upload sample PDF to get handle (same as SjnetworkAPI)
        if (!credentials.appId) {
          return reply.status(400).send({
            error: 'App ID não detectado',
            message: 'Não foi possível obter o App ID automaticamente. Verifique se o Access Token tem permissões adequadas.'
          })
        }

        try {
          console.log('[Template] Uploading sample PDF for DOCUMENT header...')
          const handle = await uploadSamplePdfForTemplate(credentials.accessToken, credentials.appId)
          console.log('[Template] PDF uploaded, handle:', handle)

          headerComponent.example = {
            header_handle: [handle]
          }
        } catch (uploadError: any) {
          console.error('[Template] PDF upload error:', uploadError.response?.data || uploadError.message)
          return reply.status(500).send({
            error: 'Erro ao fazer upload do documento',
            message: uploadError.response?.data?.error?.message || uploadError.message
          })
        }
      } else if (data.headerType === 'IMAGE') {
        headerComponent.example = {
          header_handle: [data.headerContent || 'REPLACE_WITH_UPLOADED_IMAGE_HANDLE']
        }
      } else if (data.headerType === 'VIDEO') {
        headerComponent.example = {
          header_handle: [data.headerContent || 'REPLACE_WITH_UPLOADED_VIDEO_HANDLE']
        }
      }

      components.push(headerComponent)
    }

    // BODY component - EXACT format from SjnetworkAPI
    const bodyComponent: any = {
      type: 'body',
      text: data.bodyText,
    }

    const bodyVarMatches = data.bodyText.match(/\{\{(\d+)\}\}/g) || []
    if (bodyVarMatches.length > 0) {
      // Use realistic example values like SjnetworkAPI
      const exampleValues = ['76712', 'Cliente', '227,88', '10/01/2025', 'Exemplo5', 'Exemplo6']
      bodyComponent.example = {
        body_text: [bodyVarMatches.map((_, idx) => exampleValues[idx] || `Exemplo${idx + 1}`)]
      }
    }

    components.push(bodyComponent)

    // FOOTER component (lowercase!)
    if (data.footerText) {
      components.push({
        type: 'footer',
        text: data.footerText,
      })
    }

    // BUTTONS component
    // IMPORTANT: COPY_CODE buttons cannot have custom text - Meta sets it automatically to "Copiar código da oferta"
    // IMPORTANT: Example must be SHORT (tested: PIX12345 works, long PIX codes fail)
    if (data.buttons && data.buttons.length > 0) {
      const DEFAULT_EXAMPLE = 'CODE12345'

      const buttonsArray: any[] = []

      for (let i = 0; i < data.buttons.length; i++) {
        const btn = data.buttons[i]

        if (btn.type === 'ORDER_DETAILS') {
          // ORDER_DETAILS: Botão especial para exibir detalhes do pedido (PIX + Boleto)
          // Igual SjnetworkAPI - mostra nome do item, valor, opções de pagamento
          buttonsArray.push({
            type: 'ORDER_DETAILS',
            text: btn.text || 'Copy Pix code'
          })
        } else if (btn.type === 'COPY_CODE') {
          // COPY_CODE: NO text field allowed! Meta sets it automatically
          // Example must be simple/short - long codes are rejected
          buttonsArray.push({
            type: 'copy_code',
            example: [DEFAULT_EXAMPLE]
          })
        } else if (btn.type === 'URL') {
          const urlBtn: any = {
            type: 'url',
            text: btn.text,
            url: btn.url,
          }
          if (btn.url?.includes('{{')) {
            urlBtn.example = ['https://exemplo.com/123']
          }
          buttonsArray.push(urlBtn)
        } else if (btn.type === 'PHONE_NUMBER') {
          buttonsArray.push({
            type: 'phone_number',
            text: btn.text,
            phone_number: btn.phoneNumber,
          })
        } else {
          buttonsArray.push({
            type: 'quick_reply',
            text: btn.text,
          })
        }
      }

      components.push({
        type: 'buttons',
        buttons: buttonsArray
      })
    }

    try {
      const payload = {
        name: data.name,
        language: data.language,
        category: data.category.toLowerCase(), // Meta API requires lowercase
        components,
      }
      // Log the EXACT payload being sent (for debugging)
      console.log('===== PAYLOAD BEING SENT TO META =====')
      console.log(JSON.stringify(payload, null, 2))
      console.log('======================================')
      request.log.info({ payload: JSON.stringify(payload), wabaId: credentials.wabaId }, 'Sending to Meta API')

      const response = await axios.post(
        `https://graph.facebook.com/${env.META_API_VERSION}/${credentials.wabaId}/message_templates`,
        payload,
        {
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
        }
      )
      request.log.info({ response: response.data }, 'Meta API response')

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
      const errorDetails = error.response?.data || { message: error.message }
      request.log.error({ err: errorDetails }, 'Error creating template')
      return reply.status(500).send({
        error: error.response?.data?.error?.message || error.message,
        details: error.response?.data
      })
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

    // Try to delete from Meta using instance credentials
    const credentials = await getCloudApiCredentials(request.user.companyId)

    if (credentials && template.name) {
      try {
        await axios.delete(
          `https://graph.facebook.com/${env.META_API_VERSION}/${credentials.wabaId}/message_templates`,
          {
            params: { name: template.name },
            headers: { Authorization: `Bearer ${credentials.accessToken}` },
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
