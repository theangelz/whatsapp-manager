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
  templateCode: z.string().optional().nullable(), // Ex: "$Template1", "$Template2"
  templateType: z.enum(['FATURA_DIA', 'DISPARO_LIVRE']).optional().nullable(), // Tipo para roteamento automático
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

/**
 * Detect template code in message (e.g., $Template1, $Template2, $Template3)
 */
function detectTemplateCode(message: string): string | null {
  const match = message.match(/\$Template(\d+)/i)
  if (match) {
    return `$Template${match[1]}`
  }
  return null
}

/**
 * Extract $Venc: value from message (data de vencimento)
 * Example: "$Venc: 20/02/2026" → "20/02/2026"
 */
function extractVencimento(message: string): string | null {
  // Pattern: $Venc: VALUE (ends at " -" or end of string)
  const match = message.match(/\$Venc:\s*([^-]+?)(?:\s*-|$)/i)
  if (match) {
    return match[1].trim()
  }
  return null
}

/**
 * Extract $Valor: or $DataVec: value from message (valor)
 * Example: "$DataVec: R$ 5,00" → "5,00"
 * Example: "$Valor: R$ 150,00" → "150,00"
 */
function extractValor(message: string): string | null {
  // Pattern: $DataVec: or $Valor: VALUE (ends at " -" or end of string)
  const match = message.match(/\$(?:DataVec|Valor):\s*([^-]+?)(?:\s*-|$)/i)
  if (match) {
    // Remove "R$ " prefix if present
    let valor = match[1].trim()
    valor = valor.replace(/^R\$\s*/, '').trim()
    return valor
  }
  return null
}

/**
 * Extract $NumberCobr: value from message (número da cobrança)
 * Example: "$NumberCobr: 5645" → "5645"
 */
function extractNumeroCobr(message: string): string | null {
  const match = message.match(/\$NumberCobr:\s*(\d+)/i)
  if (match) {
    return match[1].trim()
  }
  return null
}

/**
 * Remove all system codes from message ($Template, $Venc:, $Valor:, $DataVec:)
 */
function removeSystemCodes(message: string): string {
  return message
    .replace(/\$Template\d+\s*/gi, '')
    .replace(/\$NumberCobr:\s*\d+\s*/gi, '')
    .replace(/\$Venc:\s*[^-]+?(?:\s*-|$)/gi, '')
    .replace(/\$(?:DataVec|Valor):\s*[^-]+?(?:\s*-|$)/gi, '')
    .replace(/\s*-\s*-\s*/g, ' - ')  // Clean up double dashes
    .replace(/\s+-\s*$/g, '')        // Remove trailing dash
    .replace(/^\s*-\s+/g, '')        // Remove leading dash
    .trim()
}

/**
 * Remove template code from message (legacy - use removeSystemCodes instead)
 */
function removeTemplateCode(message: string): string {
  return message.replace(/\$Template\d+\s*/gi, '').trim()
}

/**
 * Parse Atlaz message to extract structured data
 * Example: "Olá Ada siqueira silva, esse é o PDF do seu boleto com vencimento em 05/02/2026. Linha digitável: 40192..."
 */
function parseAtlazMessage(message: string): Record<string, string> {
  const result: Record<string, string> = {}

  // Extract name: "Olá [Nome]," or "Olá [Nome] esse"
  const nameMatch = message.match(/Olá\s+([^,]+?)(?:,|\s+esse)/i)
  if (nameMatch) {
    result.nome_cliente = nameMatch[1].trim()
  }

  // Extract date: various formats like "05/02/2026", "vencimento em DD/MM/YYYY"
  const dateMatch = message.match(/vencimento[^0-9]*(\d{1,2}\/\d{1,2}\/\d{4})/i)
    || message.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
  if (dateMatch) {
    result.data_vencimento = dateMatch[1]
  }

  // Extract linha digitavel: after "Linha digitável:" or "código:" or just a long number
  const linhaMatch = message.match(/[Ll]inha\s+digit[áa]vel[:\s]+([0-9.\s-]+)/i)
    || message.match(/c[óo]digo[:\s]+([0-9.\s-]+)/i)
  if (linhaMatch) {
    result.linha_digitavel = linhaMatch[1].replace(/\s/g, '').trim()
  }

  // Extract value: R$ XX,XX or R$ XX.XX or valor: XX
  const valorMatch = message.match(/R\$\s*([\d.,]+)/i)
    || message.match(/valor[:\s]*([\d.,]+)/i)
  if (valorMatch) {
    result.valor = valorMatch[1]
  }

  // Extract numero cobranca if present
  const cobrancaMatch = message.match(/cobran[çc]a[:\s#]*(\d+)/i)
    || message.match(/n[úu]mero[:\s#]*(\d+)/i)
    || message.match(/fatura[:\s#]*(\d+)/i)
  if (cobrancaMatch) {
    result.numero_cobranca = cobrancaMatch[1]
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

        // Extract system codes from mensagem field if present ($Venc:, $Valor:/$DataVec:)
        const mensagem = payload.mensagem || payload.message || ''
        if (mensagem) {
          const extractedVencimento = extractVencimento(mensagem)
          const extractedValor = extractValor(mensagem)

          if (extractedVencimento) {
            variables.vencimento = extractedVencimento
            variables.data_vencimento = extractedVencimento
          }
          if (extractedValor) {
            variables.valor = extractedValor
          }

          // Store clean message (without system codes)
          variables.mensagem_limpa = removeSystemCodes(mensagem)
        }

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
              const buttonVars: { index: number; value: string }[] = []
              let headerDocumentUrl: string | null = null
              let headerFilename: string | null = null

              // ORDER_DETAILS variables (formato SjnetworkAPI)
              let orderPix: string | null = null
              let orderBoleto: string | null = null
              let orderValor: string | null = null
              let orderNumero: string | null = null
              let orderMerchantName: string | null = null
              let orderItemName: string | null = null

              for (const [key, payloadField] of Object.entries(variableMapping)) {
                let textValue = ''

                // Check if it's a fixed value (starts with __fixed__:)
                if (payloadField.startsWith('__fixed__:')) {
                  textValue = payloadField.replace('__fixed__:', '')
                } else {
                  // First try to get from payload (webhook data has priority)
                  const parts = payloadField.split('.')
                  let value = payload
                  for (const part of parts) {
                    value = value?.[part]
                  }

                  if (value !== undefined && value !== null) {
                    textValue = String(value)
                  } else {
                    // Fallback to auto variables (dataehora, data, hora, timestamp, etc)
                    textValue = variables[payloadField] || ''
                  }
                }

                // Handle header_document (for PDF/document header)
                if (key === 'header_document') {
                  headerDocumentUrl = textValue
                  continue
                }

                // Handle header_filename (custom filename for PDF)
                if (key === 'header_filename') {
                  headerFilename = textValue
                  continue
                }

                // Handle ORDER_DETAILS variables (formato SjnetworkAPI)
                if (key === 'order_pix') { orderPix = textValue; continue }
                if (key === 'order_boleto') { orderBoleto = textValue; continue }
                if (key === 'order_valor') { orderValor = textValue; continue }
                if (key === 'order_numero') { orderNumero = textValue; continue }
                if (key === 'order_merchant_name') { orderMerchantName = textValue; continue }
                if (key === 'order_item_name') { orderItemName = textValue; continue }

                // Handle header_X and body_X (text variables)
                const match = key.match(/^(header|body)_(\d+)$/)
                if (match) {
                  const type = match[1]
                  const index = parseInt(match[2])

                  if (type === 'header') {
                    headerVars.push({ index, value: textValue })
                  } else {
                    bodyVars.push({ index, value: textValue })
                  }
                  continue
                }

                // Handle button_X (for copy code buttons)
                const buttonMatch = key.match(/^button_(\d+)$/)
                if (buttonMatch) {
                  const btnIndex = parseInt(buttonMatch[1])
                  buttonVars.push({ index: btnIndex, value: textValue })
                }
              }

              headerVars.sort((a, b) => a.index - b.index)
              bodyVars.sort((a, b) => a.index - b.index)
              buttonVars.sort((a, b) => a.index - b.index)

              // Add HEADER component
              // Format from SjnetworkAPI for document headers
              if (headerDocumentUrl) {
                // Document header (PDF) - filename pode ser customizado via header_filename
                components.push({
                  type: 'header',
                  parameters: [{
                    type: 'document',
                    document: {
                      link: headerDocumentUrl,
                      filename: headerFilename || 'Boleto.pdf'
                    }
                  }],
                })
              } else if (headerVars.length > 0) {
                // Text header
                components.push({
                  type: 'header',
                  parameters: headerVars.map(v => ({ type: 'text', text: v.value })),
                })
              }

              // Add BODY component
              if (bodyVars.length > 0) {
                components.push({
                  type: 'body',
                  parameters: bodyVars.map(v => ({ type: 'text', text: v.value })),
                })
              }

              // Check if using ORDER_DETAILS button (formato SjnetworkAPI)
              if (orderPix && orderValor && orderNumero) {
                // ORDER_DETAILS button - exibe nome do item, valor, PIX e Boleto
                const valorNumerico = parseFloat(orderValor.replace(',', '.'))
                const valorCentavos = Math.round(valorNumerico * 100)

                // Formato igual SjnetworkAPI
                const paymentSettings: any[] = [
                  {
                    type: 'pix_dynamic_code',
                    pix_dynamic_code: {
                      code: orderPix,
                      merchant_name: orderMerchantName || 'FLEX FIBRA',
                      key: '12345678000190',
                      key_type: 'CNPJ'
                    }
                  }
                ]

                console.log('[ORDER_DETAILS] Valor:', orderValor, '-> Centavos:', valorCentavos)
                console.log('[ORDER_DETAILS] Numero:', orderNumero)
                console.log('[ORDER_DETAILS] PIX code length:', orderPix?.length)

                // Adiciona boleto se tiver linha digitável
                if (orderBoleto) {
                  paymentSettings.push({
                    type: 'boleto',
                    boleto: {
                      digitable_line: orderBoleto
                    }
                  })
                }

                components.push({
                  type: 'button',
                  sub_type: 'order_details',
                  index: 0,
                  parameters: [
                    {
                      type: 'action',
                      action: {
                        order_details: {
                          reference_id: orderNumero.toString(),
                          type: 'digital-goods',
                          payment_type: 'br',
                          payment_settings: paymentSettings,
                          currency: 'BRL',
                          total_amount: {
                            value: valorCentavos,
                            offset: 100
                          },
                          order: {
                            status: 'pending',
                            tax: {
                              value: 0,
                              offset: 100,
                              description: 'Impostos inclusos'
                            },
                            items: [
                              {
                                retailer_id: orderNumero.toString(),
                                name: orderItemName || `Fatura #${orderNumero} - R$ ${orderValor}`,
                                amount: {
                                  value: valorCentavos,
                                  offset: 100
                                },
                                quantity: 1
                              }
                            ],
                            subtotal: {
                              value: valorCentavos,
                              offset: 100
                            }
                          }
                        }
                      }
                    }
                  ]
                })
              } else {
                // Add BUTTON components (for copy code buttons like Pix and boleto)
                // Format from SjnetworkAPI: index must be string '0', '1', etc.
                for (const btn of buttonVars) {
                  components.push({
                    type: 'button',
                    sub_type: 'copy_code',
                    index: String(btn.index), // Must be string!
                    parameters: [{ type: 'coupon_code', coupon_code: btn.value }],
                  })
                }
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
  // ATLAZ INTEGRATION - Smart routing by template code
  // =============================================
  fastify.post(
    '/atlaz/:companyId',
    async (request: FastifyRequest<{ Params: { companyId: string } }>, reply: FastifyReply) => {
      const { companyId } = request.params
      const payload = request.body as any

      /*
       * Atlaz payload example:
       * {
       *   "token": "6488a916086574577dacd3b6",
       *   "mensagem": "$Template1 Olá Ada siqueira silva, esse é o PDF do seu boleto com vencimento em 05/02/2026...",
       *   "telefone": "5521993875920",
       *   "pix_brcode": "00020126...",
       *   "pix_qrcode": "",
       *   "arquivo_url": "https://flexfibra.atlaz.com.br/boleto/xxx",
       *   "arquivo_tipo": "pdf",
       *   "linha_digitavel": "40192025244400000000800003673977913480000010499"
       * }
       */

      // Extract message and check for template code
      const mensagem = payload.mensagem || payload.message || ''
      const templateCode = detectTemplateCode(mensagem)
      const hasArquivoUrl = !!(payload.arquivo_url && payload.arquivo_url.trim() !== '')

      console.log(`[Atlaz] Received payload for company ${companyId}`)
      console.log(`[Atlaz] Template code detected: ${templateCode || 'none'}`)
      console.log(`[Atlaz] Has arquivo_url: ${hasArquivoUrl}`)

      let automation: any = null
      let routingReason: string = ''

      if (templateCode) {
        // CENÁRIO 1: Tem $Template1/2/3 → Direciona para automação com esse código
        automation = await prisma.automation.findFirst({
          where: {
            companyId,
            templateCode,
            status: 'ACTIVE',
          },
          include: {
            instance: true,
          },
        })

        if (!automation) {
          console.log(`[Atlaz] No automation found for templateCode: ${templateCode}`)
          return reply.status(404).send({
            error: 'Automation not found',
            message: `Nenhuma automação configurada para o código ${templateCode}`,
          })
        }
        routingReason = `Template code: ${templateCode}`
      } else if (hasArquivoUrl) {
        // CENÁRIO 2: Sem código + tem arquivo_url → Usa template FATURA_DIA
        automation = await prisma.automation.findFirst({
          where: {
            companyId,
            templateType: 'FATURA_DIA',
            status: 'ACTIVE',
          },
          include: {
            instance: true,
          },
        })

        if (!automation) {
          console.log(`[Atlaz] No FATURA_DIA automation found`)
          return reply.status(404).send({
            error: 'Automation not found',
            message: 'Nenhuma automação configurada para fatura do dia (com arquivo)',
          })
        }
        routingReason = 'FATURA_DIA (arquivo_url presente)'
      } else {
        // CENÁRIO 3: Sem código + sem arquivo_url → Usa template DISPARO_LIVRE
        automation = await prisma.automation.findFirst({
          where: {
            companyId,
            templateType: 'DISPARO_LIVRE',
            status: 'ACTIVE',
          },
          include: {
            instance: true,
          },
        })

        if (!automation) {
          console.log(`[Atlaz] No DISPARO_LIVRE automation found`)
          return reply.status(404).send({
            error: 'Automation not found',
            message: 'Nenhuma automação configurada para disparo livre (sem arquivo)',
          })
        }
        routingReason = 'DISPARO_LIVRE (sem arquivo_url)'
      }

      console.log(`[Atlaz] Using automation: ${automation.name} (${automation.id}) - Reason: ${routingReason}`)

      if (automation.instance.status !== 'CONNECTED') {
        return reply.status(400).send({ error: 'Instance is not connected' })
      }

      // Extract phone number
      const phoneNumber = extractPhone(payload, automation.phoneField)
      if (!phoneNumber) {
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

        // Extract system codes from message ($Venc:, $Valor:/$DataVec:, $NumberCobr:)
        const extractedVencimento = extractVencimento(mensagem)
        const extractedValor = extractValor(mensagem)
        const extractedNumeroCobr = extractNumeroCobr(mensagem)

        console.log(`[Atlaz] Extracted $Venc: ${extractedVencimento || 'none'}`)
        console.log(`[Atlaz] Extracted $Valor/$DataVec: ${extractedValor || 'none'}`)
        console.log(`[Atlaz] Extracted $NumberCobr: ${extractedNumeroCobr || 'none'}`)

        // Parse Atlaz message to extract structured data
        const cleanMessage = removeSystemCodes(mensagem)
        const parsedData = parseAtlazMessage(cleanMessage)

        // Generate a unique number based on token or timestamp
        const generatedNumero = payload.token
          ? payload.token.slice(-8)
          : Date.now().toString().slice(-8)

        // Build variables from payload + parsed message data + extracted codes
        const variables: Record<string, string> = {
          // Direct payload fields
          telefone: phoneNumber,
          mensagem: cleanMessage,
          mensagem_original: mensagem,
          pix_brcode: payload.pix_brcode || '',
          pix_qrcode: payload.pix_qrcode || '',
          arquivo_url: payload.arquivo_url || '',
          arquivo_tipo: payload.arquivo_tipo || '',
          linha_digitavel: payload.linha_digitavel || parsedData.linha_digitavel || '',
          token: payload.token || '',

          // Parsed from message
          nome_cliente: parsedData.nome_cliente || '',
          nome: parsedData.nome_cliente || '',
          numero_cobranca: extractedNumeroCobr || parsedData.numero_cobranca || payload.numero_cobranca || generatedNumero,

          // $Venc: and $Valor:/$DataVec: extracted values (priority over parsed)
          data_vencimento: extractedVencimento || parsedData.data_vencimento || '',
          vencimento: extractedVencimento || parsedData.data_vencimento || '',
          valor: extractedValor || parsedData.valor || '',

          // Date/time auto variables
          dataehora: new Date().toLocaleString('pt-BR'),
          data: new Date().toLocaleDateString('pt-BR'),
          hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          timestamp: new Date().toISOString(),
        }

        // Add any additional fields from variableMapping
        if (automation.variableMapping) {
          const mapping = automation.variableMapping as Record<string, string>
          for (const [varName, payloadField] of Object.entries(mapping)) {
            const parts = payloadField.split('.')
            let value: any = payload
            for (const part of parts) {
              value = value?.[part]
            }
            // Also check in variables (for parsed data)
            if (value === undefined || value === null) {
              value = variables[payloadField]
            }
            if (value !== undefined && value !== null) {
              variables[varName] = String(value)
            }
          }
        }

        if (automation.instance.channel === 'CLOUD_API') {
          const cloudApi = new CloudAPIProvider(automation.instance)

          if (automation.metaTemplateName) {
            // Cloud API - send template message with buttons
            // Following exact format from SjnetworkAPI (whatsapp-template-creator.php)
            const components: any[] = []
            const variableMapping = automation.variableMapping as Record<string, string> | null

            // Build header parameters (if any)
            const headerVars: { index: number; value: string }[] = []
            // Build body parameters
            const bodyVars: { index: number; value: string }[] = []
            // Build button parameters (for copy code buttons)
            const buttonVars: { index: number; value: string }[] = []
            // Document header URL and filename
            let headerDocumentUrl: string | null = null
            let headerFilename: string | null = null

            // ORDER_DETAILS variables (formato SjnetworkAPI)
            let orderPix: string | null = null
            let orderBoleto: string | null = null
            let orderValor: string | null = null
            let orderNumero: string | null = null
            let orderMerchantName: string | null = null
            let orderItemName: string | null = null

            if (variableMapping && Object.keys(variableMapping).length > 0) {
              console.log('[DEBUG] variableMapping:', JSON.stringify(variableMapping))
              console.log('[DEBUG] variables disponíveis:', Object.keys(variables))
              for (const [key, sourceField] of Object.entries(variableMapping)) {
                // Get value - check if it's a fixed value or from variables
                let textValue = ''
                if (sourceField.startsWith('__fixed__:')) {
                  textValue = sourceField.replace('__fixed__:', '')
                } else {
                  textValue = variables[sourceField] || ''
                  console.log(`[DEBUG] ${key} -> ${sourceField} = "${textValue}"`)
                }

                // Handle header_document (for PDF/document header)
                if (key === 'header_document') {
                  headerDocumentUrl = textValue
                  continue
                }

                // Handle header_filename (custom filename for PDF)
                if (key === 'header_filename') {
                  headerFilename = textValue
                  continue
                }

                // Handle ORDER_DETAILS variables (formato SjnetworkAPI)
                if (key === 'order_pix') { orderPix = textValue; continue }
                if (key === 'order_boleto') { orderBoleto = textValue; continue }
                if (key === 'order_valor') { orderValor = textValue; continue }
                if (key === 'order_numero') { orderNumero = textValue; continue }
                if (key === 'order_merchant_name') { orderMerchantName = textValue; continue }
                if (key === 'order_item_name') { orderItemName = textValue; continue }

                // Handle header_X (text variables)
                const headerMatch = key.match(/^header_(\d+)$/)
                if (headerMatch) {
                  headerVars.push({ index: parseInt(headerMatch[1]), value: textValue })
                  continue
                }

                // Handle body_X (maps to {{1}}, {{2}}, etc in template)
                const bodyMatch = key.match(/^body_(\d+)$/)
                if (bodyMatch) {
                  bodyVars.push({ index: parseInt(bodyMatch[1]), value: textValue })
                  continue
                }

                // Handle button_X (for copy code buttons)
                const buttonMatch = key.match(/^button_(\d+)$/)
                if (buttonMatch) {
                  const btnIndex = parseInt(buttonMatch[1])
                  buttonVars.push({ index: btnIndex, value: textValue })
                  continue
                }
              }
            }

            // Sort by index
            headerVars.sort((a, b) => a.index - b.index)
            bodyVars.sort((a, b) => a.index - b.index)
            buttonVars.sort((a, b) => a.index - b.index)

            console.log('[DEBUG] bodyVars final:', JSON.stringify(bodyVars))
            console.log('[DEBUG] template:', automation.metaTemplateName)

            // Add HEADER component
            // Format from SjnetworkAPI for document/text headers
            if (headerDocumentUrl) {
              // Document header (PDF) - filename pode ser customizado via header_filename
              components.push({
                type: 'header',
                parameters: [{
                  type: 'document',
                  document: {
                    link: headerDocumentUrl,
                    filename: headerFilename || 'Boleto.pdf'
                  }
                }],
              })
            } else if (headerVars.length > 0) {
              // Text header
              components.push({
                type: 'header',
                parameters: headerVars.map(v => ({ type: 'text', text: v.value })),
              })
            }

            // Add BODY component
            if (bodyVars.length > 0) {
              components.push({
                type: 'body',
                parameters: bodyVars.map(v => ({ type: 'text', text: v.value })),
              })
            }

            // Check if using ORDER_DETAILS button (formato SjnetworkAPI)
            if (orderPix && orderValor && orderNumero) {
              // ORDER_DETAILS button - exibe nome do item, valor, PIX e Boleto
              const valorNumerico = parseFloat(orderValor.replace(',', '.'))
              const valorCentavos = Math.round(valorNumerico * 100)

              const paymentSettings: any[] = [
                {
                  type: 'pix_dynamic_code',
                  pix_dynamic_code: {
                    code: orderPix,
                    merchant_name: orderMerchantName || 'FLEX FIBRA',
                    key: '12345678000190',
                    key_type: 'CNPJ'
                  }
                }
              ]

              // Adiciona boleto se tiver linha digitável
              if (orderBoleto) {
                paymentSettings.push({
                  type: 'boleto',
                  boleto: {
                    digitable_line: orderBoleto
                  }
                })
              }

              components.push({
                type: 'button',
                sub_type: 'order_details',
                index: 0,
                parameters: [
                  {
                    type: 'action',
                    action: {
                      order_details: {
                        reference_id: orderNumero.toString(),
                        type: 'digital-goods',
                        payment_type: 'br',
                        payment_settings: paymentSettings,
                        currency: 'BRL',
                        total_amount: {
                          value: valorCentavos,
                          offset: 100
                        },
                        order: {
                          status: 'pending',
                          tax: {
                            value: 0,
                            offset: 100,
                            description: 'Impostos inclusos'
                          },
                          items: [
                            {
                              retailer_id: orderNumero.toString(),
                              name: orderItemName || `Fatura #${orderNumero} - R$ ${orderValor}`,
                              amount: {
                                value: valorCentavos,
                                offset: 100
                              },
                              quantity: 1
                            }
                          ],
                          subtotal: {
                            value: valorCentavos,
                            offset: 100
                          }
                        }
                      }
                    }
                  }
                ]
              })
            } else {
              // Add BUTTON components (for copy code buttons like Pix and boleto)
              // Format from SjnetworkAPI: index must be string '0', '1', etc.
              for (const btn of buttonVars) {
                components.push({
                  type: 'button',
                  sub_type: 'copy_code',
                  index: String(btn.index), // Must be string!
                  parameters: [{ type: 'coupon_code', coupon_code: btn.value }],
                })
              }
            }

            console.log(`[Atlaz] Sending template ${automation.metaTemplateName} with components:`, JSON.stringify(components, null, 2))

            const result = await cloudApi.sendTemplateMessage(
              phoneNumber,
              automation.metaTemplateName,
              automation.metaTemplateLanguage || 'pt_BR',
              components.length > 0 ? components : undefined
            )

            messageId = result?.messages?.[0]?.id
            messageContent = `Template: ${automation.metaTemplateName} | ${templateCode || 'default'}`
          } else {
            // Cloud API - send text message
            const messageBody = automation.messageBody as any
            if (messageBody?.text) {
              messageContent = applyVariables(messageBody.text, variables)
              const result = await cloudApi.sendTextMessage(phoneNumber, messageContent)
              messageId = result?.messages?.[0]?.id
            } else {
              // Use parsed message
              messageContent = cleanMessage
              const result = await cloudApi.sendTextMessage(phoneNumber, messageContent)
              messageId = result?.messages?.[0]?.id
            }
          }
        } else {
          // Baileys - send text message
          const messageBody = automation.messageBody as any
          if (messageBody?.text) {
            messageContent = applyVariables(messageBody.text, variables)
          } else {
            messageContent = cleanMessage
          }

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
          automationUsed: automation.name,
          templateCode: templateCode || null,
          routingReason,
          parsedData,
          extractedCodes: {
            vencimento: extractedVencimento,
            valor: extractedValor,
          },
        })
      } catch (error: any) {
        console.error(`[Atlaz] Error sending message:`, error)

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
            templateCode: data.templateCode || null,
            templateType: data.templateType || null,
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
        if (data.templateCode !== undefined) updateData.templateCode = data.templateCode || null
        if (data.templateType !== undefined) updateData.templateType = data.templateType || null

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
