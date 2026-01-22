import axios, { AxiosInstance } from 'axios'
import { env } from '../../config/env.js'

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

  async sendRawMessage(body: any) {
    // Send a raw message body directly to the API
    const response = await this.client.post(`/${this.phoneNumberId}/messages`, body)
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
}
