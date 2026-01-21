import { InstanceChannel, TemplateChannelType } from '@prisma/client'
import { prisma } from '../config/database.js'

export interface ValidationResult {
  valid: boolean
  error?: string
  warnings?: string[]
}

export interface SendMessageRequest {
  instanceId: string
  phoneNumber: string
  messageContent?: string
  templateId?: string
  variables?: Record<string, string>
}

export class ChannelValidationService {
  /**
   * Validate a message send request based on channel rules
   */
  async validateSendRequest(request: SendMessageRequest): Promise<ValidationResult> {
    const instance = await prisma.instance.findUnique({
      where: { id: request.instanceId },
    })

    if (!instance) {
      return { valid: false, error: 'Instância não encontrada' }
    }

    if (instance.status !== 'CONNECTED') {
      return { valid: false, error: 'Instância não está conectada' }
    }

    const channel = instance.channel

    // Validate phone number format
    const phoneValidation = this.validatePhoneNumber(request.phoneNumber)
    if (!phoneValidation.valid) {
      return phoneValidation
    }

    // Channel-specific validation
    if (channel === 'CLOUD_API') {
      return this.validateCloudApiRequest(request)
    } else {
      return this.validateBaileysRequest(request)
    }
  }

  /**
   * Validate Cloud API send request
   * CRITICAL: Cloud API REQUIRES homologated templates
   */
  private async validateCloudApiRequest(request: SendMessageRequest): Promise<ValidationResult> {
    // Cloud API MUST use a homologated template
    if (!request.templateId) {
      return {
        valid: false,
        error: 'Cloud API requer um template homologado. Texto livre não é permitido.',
      }
    }

    const template = await prisma.messageTemplate.findUnique({
      where: { id: request.templateId },
    })

    if (!template) {
      return { valid: false, error: 'Template não encontrado' }
    }

    if (!template.isHomologated) {
      return {
        valid: false,
        error: 'Template não homologado. Cloud API só permite templates aprovados pela Meta.',
      }
    }

    if (!template.metaTemplateName) {
      return {
        valid: false,
        error: 'Template não possui nome Meta configurado.',
      }
    }

    if (template.channelType === 'BAILEYS') {
      return {
        valid: false,
        error: 'Este template é exclusivo para Baileys.',
      }
    }

    // Validate variables if template has variable schema
    if (template.variableSchema) {
      const variableValidation = this.validateVariables(
        request.variables || {},
        template.variableSchema as Record<string, any>
      )
      if (!variableValidation.valid) {
        return variableValidation
      }
    }

    return { valid: true }
  }

  /**
   * Validate Baileys send request
   * Baileys allows free text OR templates
   */
  private async validateBaileysRequest(request: SendMessageRequest): Promise<ValidationResult> {
    const warnings: string[] = []

    // Baileys can send free text OR use templates
    if (!request.messageContent && !request.templateId) {
      return {
        valid: false,
        error: 'Informe o conteúdo da mensagem ou selecione um template.',
      }
    }

    // If using template, validate it
    if (request.templateId) {
      const template = await prisma.messageTemplate.findUnique({
        where: { id: request.templateId },
      })

      if (!template) {
        return { valid: false, error: 'Template não encontrado' }
      }

      if (template.channelType === 'CLOUD_API') {
        return {
          valid: false,
          error: 'Este template é exclusivo para Cloud API.',
        }
      }

      // Validate variables
      if (template.variableSchema) {
        const variableValidation = this.validateVariables(
          request.variables || {},
          template.variableSchema as Record<string, any>
        )
        if (!variableValidation.valid) {
          return variableValidation
        }
      }
    }

    // Add warnings for Baileys
    if (request.messageContent && request.messageContent.length > 4096) {
      warnings.push('Mensagem muito longa. Pode ser truncada pelo WhatsApp.')
    }

    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined }
  }

  /**
   * Validate phone number format
   */
  private validatePhoneNumber(phone: string): ValidationResult {
    // Remove non-digits
    const cleanPhone = phone.replace(/\D/g, '')

    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return {
        valid: false,
        error: 'Número de telefone inválido. Use formato internacional (ex: 5511999999999)',
      }
    }

    return { valid: true }
  }

  /**
   * Validate variables against schema
   */
  private validateVariables(
    variables: Record<string, string>,
    schema: Record<string, any>
  ): ValidationResult {
    const requiredVars = Object.entries(schema)
      .filter(([_, config]) => config.required)
      .map(([key]) => key)

    for (const required of requiredVars) {
      if (!variables[required]) {
        return {
          valid: false,
          error: `Variável obrigatória não informada: {{${required}}}`,
        }
      }
    }

    return { valid: true }
  }

  /**
   * Check if a template is compatible with an instance's channel
   */
  async isTemplateCompatible(templateId: string, instanceId: string): Promise<ValidationResult> {
    const [template, instance] = await Promise.all([
      prisma.messageTemplate.findUnique({ where: { id: templateId } }),
      prisma.instance.findUnique({ where: { id: instanceId } }),
    ])

    if (!template) {
      return { valid: false, error: 'Template não encontrado' }
    }

    if (!instance) {
      return { valid: false, error: 'Instância não encontrada' }
    }

    // Check channel compatibility
    if (template.channelType === 'BAILEYS' && instance.channel !== 'BAILEYS') {
      return { valid: false, error: 'Template exclusivo para Baileys' }
    }

    if (template.channelType === 'CLOUD_API' && instance.channel !== 'CLOUD_API') {
      return { valid: false, error: 'Template exclusivo para Cloud API' }
    }

    // Cloud API requires homologated templates
    if (instance.channel === 'CLOUD_API' && !template.isHomologated) {
      return { valid: false, error: 'Cloud API requer template homologado' }
    }

    return { valid: true }
  }

  /**
   * Get compatible templates for an instance
   */
  async getCompatibleTemplates(instanceId: string, companyId: string) {
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    })

    if (!instance) {
      throw new Error('Instância não encontrada')
    }

    const whereClause: any = {
      companyId,
      isActive: true,
    }

    if (instance.channel === 'CLOUD_API') {
      // Cloud API only shows homologated templates
      whereClause.isHomologated = true
      whereClause.channelType = { in: ['BOTH', 'CLOUD_API'] }
    } else {
      // Baileys shows all templates except Cloud API exclusive
      whereClause.channelType = { in: ['BOTH', 'BAILEYS'] }
    }

    return prisma.messageTemplate.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
    })
  }

  /**
   * Apply variables to template text
   */
  applyVariables(text: string, variables: Record<string, string>): string {
    let result = text
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
    }
    return result
  }

  /**
   * Extract variable names from template text
   */
  extractVariables(text: string): string[] {
    const regex = /{{(\w+)}}/g
    const matches: string[] = []
    let match
    while ((match = regex.exec(text)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1])
      }
    }
    return matches
  }
}

export const channelValidationService = new ChannelValidationService()
