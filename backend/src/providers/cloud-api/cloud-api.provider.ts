import axios, { AxiosInstance } from 'axios'
import { env } from '../../config/env.js'

// Meta Cloud API Provider v2.1.4 - Improved error handling

interface CloudAPIInstance {
  phoneNumberId?: string | null
  accessToken?: string | null
}

export class CloudAPIProvider {
  private client: AxiosInstance
  private phoneNumberId: string

  constructor(instance: CloudAPIInstance) {
    if (!instance.phoneNumberId || !instance.accessToken) {
      throw new Error('Cloud API credentials not configured')
    }

    this.phoneNumberId = instance.phoneNumberId
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${env.META_API_VERSION}`,
      headers: {
        'Authorization': `Bearer ${instance.accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    // Add response interceptor for better error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          throw new Error('Access Token expirado ou invalido. Por favor, atualize o token nas configuracoes da instancia.')
        }
        if (error.response?.data?.error?.message) {
          throw new Error(error.response.data.error.message)
        }
        throw error
      }
    )
  }

  async sendTextMessage(to: string, text: string) {
    const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    })

    return response.data
  }

  async sendMediaMessage(to: string, mediaType: string, mediaUrl: string, caption?: string) {
    const mediaPayload: any = {
      link: mediaUrl,
    }

    if (caption && ['image', 'video', 'document'].includes(mediaType)) {
      mediaPayload.caption = caption
    }

    const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: mediaPayload,
    })

    return response.data
  }

  async sendTemplateMessage(to: string, templateName: string, language: string, components?: any[]) {
    const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components: components || [],
      },
    })

    return response.data
  }

  // Envio de fatura com PDF + PIX + Boleto (formato SjnetworkAPI)
  async sendInvoiceTemplate(
    to: string,
    templateName: string,
    language: string,
    params: {
      documentUrl?: string,
      documentFilename?: string,
      bodyParams: string[],
      pixCode: string,
      boletoCode?: string,
    }
  ) {
    const components: any[] = []

    // HEADER - Documento PDF (se fornecido)
    if (params.documentUrl) {
      components.push({
        type: 'header',
        parameters: [{
          type: 'document',
          document: {
            link: params.documentUrl,
            filename: params.documentFilename || 'Boleto.pdf'
          }
        }]
      })
    }

    // BODY - Parâmetros de texto
    if (params.bodyParams && params.bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: params.bodyParams.map(text => ({ type: 'text', text }))
      })
    }

    // BUTTON 0 - Código PIX
    components.push({
      type: 'button',
      sub_type: 'copy_code',
      index: '0',
      parameters: [{
        type: 'coupon_code',
        coupon_code: params.pixCode
      }]
    })

    // BUTTON 1 - Código Boleto (se fornecido)
    if (params.boletoCode) {
      components.push({
        type: 'button',
        sub_type: 'copy_code',
        index: '1',
        parameters: [{
          type: 'coupon_code',
          coupon_code: params.boletoCode
        }]
      })
    }

    const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    })

    return response.data
  }

  async sendRawMessage(body: any) {
    // Send a raw message body directly to the API
    const response = await this.client.post(`/${this.phoneNumberId}/messages`, body)
    return response.data
  }

  /**
   * Send interactive message with reply buttons
   * Used for quick replies like Sim/Não
   */
  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string
  ) {
    const interactive: any = {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(btn => ({
          type: 'reply',
          reply: {
            id: btn.id,
            title: btn.title.substring(0, 20), // Max 20 chars for button title
          },
        })),
      },
    }

    if (headerText) {
      interactive.header = { type: 'text', text: headerText }
    }

    if (footerText) {
      interactive.footer = { text: footerText }
    }

    const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    })

    return response.data
  }

  async getPhoneNumberInfo() {
    const response = await this.client.get(`/${this.phoneNumberId}`, {
      params: {
        fields: 'display_phone_number,verified_name,quality_rating',
      },
    })

    return response.data
  }

  async getTemplates(wabaId: string) {
    const response = await this.client.get(`/${wabaId}/message_templates`, {
      params: {
        fields: 'name,status,category,language,components',
      },
    })

    return response.data.data
  }

  async createTemplate(wabaId: string, template: any) {
    const response = await this.client.post(`/${wabaId}/message_templates`, template)
    return response.data
  }

  async deleteTemplate(wabaId: string, templateName: string) {
    const response = await this.client.delete(`/${wabaId}/message_templates`, {
      params: { name: templateName },
    })
    return response.data
  }

  // Upload de mídia para templates (usando App ID)
  async uploadMediaForTemplate(appId: string, fileBuffer: Buffer, fileName: string, mimeType: string = 'application/pdf') {
    // Step 1: Create upload session
    const sessionResponse = await this.client.post(`/${appId}/uploads`, {
      file_name: fileName,
      file_length: fileBuffer.length,
      file_type: mimeType
    })

    const uploadId = sessionResponse.data.id

    // Step 2: Upload file data
    const uploadResponse = await this.client.post(`/${uploadId}`, fileBuffer, {
      headers: {
        'file_offset': '0',
        'Content-Type': mimeType
      }
    })

    return uploadResponse.data.h // Return the handle
  }

  // Criar template com PDF (igual SjnetworkAPI)
  async createInvoiceTemplate(
    wabaId: string,
    appId: string,
    templateName: string,
    pdfBuffer: Buffer,
    options?: {
      bodyText?: string,
      footerText?: string,
      bodyExamples?: string[]
    }
  ) {
    // Upload PDF first
    const handle = await this.uploadMediaForTemplate(appId, pdfBuffer, 'boleto.pdf', 'application/pdf')

    // Create template with handle
    const templatePayload = {
      name: templateName,
      language: 'pt_BR',
      category: 'utility',
      components: [
        {
          type: 'header',
          format: 'document',
          example: { header_handle: [handle] }
        },
        {
          type: 'body',
          text: options?.bodyText || '*Nº da cobrança:* {{1}}\n\nOlá, *{{2}}*!\n\n💰 *Valor:* R$ {{3}}\n📅 *Vencimento:* {{4}}\n\nUse o botão para copiar o código:',
          example: {
            body_text: [options?.bodyExamples || ['76712', 'Cliente', '227,88', '15/01/2025']]
          }
        },
        {
          type: 'footer',
          text: options?.footerText || 'Empresa - Facilitando seu dia a dia'
        },
        {
          type: 'buttons',
          buttons: [{ type: 'copy_code', example: ['CODE123'] }]
        }
      ]
    }

    const response = await this.client.post(`/${wabaId}/message_templates`, templatePayload)
    return response.data
  }

  /**
   * Envia template ORDER_DETAILS (igual SjnetworkAPI)
   * Template deve ter botão ORDER_DETAILS criado no Meta
   * Mostra: nome do item, valor, PIX e Boleto
   */
  async sendOrderDetailsTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    params: {
      nomeCliente: string,
      valor: string,
      vencimento: string,
      numeroCobranca: string,
      codigoPix: string,
      linhaDigitavel?: string,
      merchantName?: string,
      pixKey?: string,
      pixKeyType?: string,
    }
  ) {
    // Converter valor para centavos (offset 100)
    const valorNumerico = parseFloat(params.valor.toString().replace(',', '.'))
    const valorCentavos = Math.round(valorNumerico * 100)

    const paymentSettings: any[] = [
      {
        type: 'pix_dynamic_code',
        pix_dynamic_code: {
          code: params.codigoPix,
          merchant_name: params.merchantName || 'Empresa',
          key: params.pixKey || params.codigoPix,
          key_type: params.pixKeyType || 'EMV'
        }
      }
    ]

    // Adiciona boleto se tiver linha digitável
    if (params.linhaDigitavel) {
      paymentSettings.push({
        type: 'boleto',
        boleto: {
          digitable_line: params.linhaDigitavel
        }
      })
    }

    const components: any[] = [
      // Body parameters
      {
        type: 'body',
        parameters: [
          { type: 'text', text: params.nomeCliente },
          { type: 'text', text: params.valor },
          { type: 'text', text: params.vencimento }
        ]
      },
      // Botão ORDER_DETAILS com dados de pagamento
      {
        type: 'button',
        sub_type: 'order_details',
        index: 0,
        parameters: [
          {
            type: 'action',
            action: {
              order_details: {
                reference_id: params.numeroCobranca.toString(),
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
                      retailer_id: params.numeroCobranca.toString(),
                      name: `Fatura #${params.numeroCobranca} - R$ ${params.valor}`,
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
      }
    ]

    const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        },
        components
      }
    })

    return response.data
  }
}
