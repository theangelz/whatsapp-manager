import { prisma } from '../../config/database.js'
import { Flow, FlowNode, FlowSession, FlowNodeType } from '@prisma/client'

interface MessageContext {
  instanceId: string
  remoteJid: string
  message: string
  messageType: 'text' | 'button_reply' | 'list_reply' | 'image' | 'audio' | 'video' | 'document'
  buttonId?: string
  listRowId?: string
  quotedMessageId?: string
  pushName?: string // Nome do contato no WhatsApp
}

interface SendMessageFn {
  (to: string, content: any, type: string): Promise<void>
}

type FlowWithRelations = Flow & {
  nodes: FlowNode[]
  edges: Array<{
    id: string
    sourceNodeId: string
    targetNodeId: string
    sourceHandle: string | null
    targetHandle: string | null
    condition: any
  }>
}

type SessionWithFlow = FlowSession & {
  flow: FlowWithRelations
}

export class FlowEngine {
  private sendMessage: SendMessageFn

  constructor(sendMessage: SendMessageFn) {
    this.sendMessage = sendMessage
  }

  async processMessage(context: MessageContext): Promise<boolean> {
    const { instanceId, remoteJid, message, messageType, buttonId, listRowId, pushName } = context

    // Check for active session first
    let session = await this.getActiveSession(instanceId, remoteJid)

    if (session && session.waitingInput) {
      // Continue existing flow
      await this.continueFlow(session, context)
      return true
    }

    // Look for matching flow trigger
    const flow = await this.findMatchingFlow(instanceId, message, messageType, buttonId, listRowId)

    if (!flow) {
      return false // No flow matched
    }

    // Start new flow session with initial variables
    const initialVars = {
      _contactName: pushName || '',
      _contactPhone: remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', ''),
      _triggerMessage: message,
    }
    session = await this.startSession(flow, instanceId, remoteJid, initialVars)
    await this.executeFlow(session)

    return true
  }

  private async getActiveSession(instanceId: string, remoteJid: string): Promise<SessionWithFlow | null> {
    const session = await prisma.flowSession.findFirst({
      where: {
        instanceId,
        remoteJid,
        isActive: true,
      },
      include: {
        flow: {
          include: {
            nodes: true,
            edges: true,
          },
        },
      },
      orderBy: { lastActivity: 'desc' },
    })

    return session as SessionWithFlow | null
  }

  private async findMatchingFlow(
    instanceId: string,
    message: string,
    messageType: string,
    buttonId?: string,
    listRowId?: string
  ): Promise<FlowWithRelations | null> {
    // Get instance to find company
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    })

    if (!instance) return null

    // Find active flows for this company
    const flows = await prisma.flow.findMany({
      where: {
        companyId: instance.companyId,
        status: 'ACTIVE',
        OR: [
          { instanceId: null }, // Global flows
          { instanceId },       // Instance-specific flows
        ],
      },
      include: {
        nodes: true,
        edges: true,
      },
      orderBy: [
        { instanceId: 'desc' }, // Instance-specific first
        { createdAt: 'asc' },
      ],
    })

    for (const flow of flows) {
      // Check trigger type
      switch (flow.triggerType) {
        case 'KEYWORD':
          if (flow.triggerValue) {
            const keywords = flow.triggerValue.split(',').map((k: string) => k.trim().toLowerCase())
            const msgLower = message.toLowerCase().trim()
            if (keywords.some((k: string) => msgLower === k || msgLower.startsWith(k + ' '))) {
              return flow as FlowWithRelations
            }
          }
          break

        case 'ALL':
          if (messageType === 'text') {
            return flow as FlowWithRelations
          }
          break

        case 'BUTTON_REPLY':
          if (messageType === 'button_reply' && buttonId) {
            if (!flow.triggerValue || flow.triggerValue === buttonId) {
              return flow as FlowWithRelations
            }
          }
          break

        case 'LIST_REPLY':
          if (messageType === 'list_reply' && listRowId) {
            if (!flow.triggerValue || flow.triggerValue === listRowId) {
              return flow as FlowWithRelations
            }
          }
          break
      }
    }

    return null
  }

  private async startSession(
    flow: FlowWithRelations,
    instanceId: string,
    remoteJid: string,
    initialVars: Record<string, any> = {}
  ): Promise<SessionWithFlow> {
    // End any existing active sessions for this user
    await prisma.flowSession.updateMany({
      where: {
        instanceId,
        remoteJid,
        isActive: true,
      },
      data: {
        isActive: false,
        completedAt: new Date(),
      },
    })

    // Find start node
    const startNode = flow.nodes.find(n => n.type === 'START')

    // Use upsert to handle existing sessions for same flow/instance/remoteJid
    const session = await prisma.flowSession.upsert({
      where: {
        flowId_instanceId_remoteJid: {
          flowId: flow.id,
          instanceId,
          remoteJid,
        },
      },
      update: {
        currentNodeId: startNode?.id,
        variables: initialVars,
        context: {},
        isActive: true,
        waitingInput: false,
        completedAt: null,
        startedAt: new Date(),
        lastActivity: new Date(),
      },
      create: {
        flowId: flow.id,
        instanceId,
        remoteJid,
        currentNodeId: startNode?.id,
        variables: initialVars,
        context: {},
      },
      include: {
        flow: {
          include: {
            nodes: true,
            edges: true,
          },
        },
      },
    })

    return session as SessionWithFlow
  }

  private async executeFlow(session: SessionWithFlow): Promise<void> {
    let currentNodeId = session.currentNodeId

    while (currentNodeId) {
      const currentNode = session.flow.nodes.find(n => n.id === currentNodeId)
      if (!currentNode) break

      const result = await this.executeNode(session, currentNode)

      if (result.waitForInput) {
        // Update session to wait for input
        await prisma.flowSession.update({
          where: { id: session.id },
          data: {
            currentNodeId,
            waitingInput: true,
            lastActivity: new Date(),
            variables: session.variables as any,
          },
        })
        return
      }

      if (result.endFlow) {
        // End the session
        await prisma.flowSession.update({
          where: { id: session.id },
          data: {
            isActive: false,
            completedAt: new Date(),
            lastActivity: new Date(),
          },
        })
        return
      }

      // Find next node
      currentNodeId = await this.findNextNode(session, currentNode, result.outputHandle)

      // Update session
      await prisma.flowSession.update({
        where: { id: session.id },
        data: {
          currentNodeId,
          lastActivity: new Date(),
          variables: session.variables as any,
        },
      })
    }

    // No more nodes, end session
    await prisma.flowSession.update({
      where: { id: session.id },
      data: {
        isActive: false,
        completedAt: new Date(),
      },
    })
  }

  private async continueFlow(session: SessionWithFlow, context: MessageContext): Promise<void> {
    // Mark session as not waiting
    await prisma.flowSession.update({
      where: { id: session.id },
      data: { waitingInput: false },
    })

    const currentNode = session.flow.nodes.find(n => n.id === session.currentNodeId)
    if (!currentNode) return

    // Process input and determine next node
    const outputHandle = await this.processInput(session, currentNode, context)

    // Find and execute next node
    const nextNodeId = await this.findNextNode(session, currentNode, outputHandle)

    if (nextNodeId) {
      session.currentNodeId = nextNodeId
      await this.executeFlow(session)
    } else {
      // End session
      await prisma.flowSession.update({
        where: { id: session.id },
        data: {
          isActive: false,
          completedAt: new Date(),
        },
      })
    }
  }

  private async executeNode(
    session: SessionWithFlow,
    node: FlowNode
  ): Promise<{ waitForInput?: boolean; endFlow?: boolean; outputHandle?: string }> {
    const data = node.data as Record<string, any>
    const variables = (session.variables || {}) as Record<string, any>

    switch (node.type) {
      case 'START':
        return {}

      case 'MESSAGE':
        const text = this.replaceVariables(data.content || '', variables)
        await this.sendMessage(session.remoteJid, { text }, 'text')
        if (data.waitForInput) {
          return { waitForInput: true }
        }
        return {}

      case 'IMAGE':
        await this.sendMessage(session.remoteJid, {
          image: { url: data.mediaUrl },
          caption: this.replaceVariables(data.content || '', variables),
        }, 'image')
        return {}

      case 'AUDIO':
        await this.sendMessage(session.remoteJid, {
          audio: { url: data.mediaUrl },
          mimetype: 'audio/mp4',
        }, 'audio')
        return {}

      case 'VIDEO':
        await this.sendMessage(session.remoteJid, {
          video: { url: data.mediaUrl },
          caption: this.replaceVariables(data.content || '', variables),
        }, 'video')
        return {}

      case 'DOCUMENT':
        await this.sendMessage(session.remoteJid, {
          document: { url: data.mediaUrl },
          fileName: data.fileName || 'document',
          caption: this.replaceVariables(data.content || '', variables),
        }, 'document')
        return {}

      case 'MENU':
        // Build text menu with numbered options
        const menuOptions = data.menuOptions || []
        let menuText = this.replaceVariables(data.content || '', variables)
        if (menuOptions.length > 0) {
          menuText += '\n\n'
          menuOptions.forEach((opt: any) => {
            menuText += `*${opt.trigger}* - ${this.replaceVariables(opt.label, variables)}\n`
          })
        }
        await this.sendMessage(session.remoteJid, { text: menuText.trim() }, 'text')
        // Save menu options in session context for later matching
        session.context = { ...(session.context as any || {}), menuOptions }
        return { waitForInput: true }

      case 'BUTTONS':
        const buttons = (data.buttons || []).map((btn: any) => ({
          buttonId: btn.id,
          buttonText: { displayText: this.replaceVariables(btn.text, variables) },
        }))
        await this.sendMessage(session.remoteJid, {
          text: this.replaceVariables(data.content || '', variables),
          buttons,
          footer: data.footer ? this.replaceVariables(data.footer, variables) : undefined,
          header: data.header ? this.replaceVariables(data.header, variables) : undefined,
        }, 'buttons')
        return { waitForInput: true }

      case 'LIST':
        const sections = (data.listSections || []).map((section: any) => ({
          title: this.replaceVariables(section.title, variables),
          rows: section.rows.map((row: any) => ({
            rowId: row.id,
            title: this.replaceVariables(row.title, variables),
            description: row.description ? this.replaceVariables(row.description, variables) : undefined,
          })),
        }))
        await this.sendMessage(session.remoteJid, {
          text: this.replaceVariables(data.content || '', variables),
          buttonText: data.buttonText || 'Menu',
          sections,
        }, 'list')
        return { waitForInput: true }

      case 'CONDITION':
        // New switch/case format with multiple cases
        if (data.condition?.cases && data.condition.cases.length > 0) {
          const matchedCase = this.evaluateConditionCases(data.condition, variables)
          return { outputHandle: matchedCase }
        }
        // Old yes/no format (backwards compatible)
        const condResult = this.evaluateCondition(data.condition, variables)
        return { outputHandle: condResult ? 'yes' : 'no' }

      case 'DELAY':
        const delayMs = (data.delay || 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delayMs))
        return {}

      case 'SET_VARIABLE':
        if (data.variable) {
          variables[data.variable] = this.replaceVariables(data.value || '', variables)
          session.variables = variables
        }
        return {}

      case 'HTTP_REQUEST':
        try {
          console.log('[FlowEngine] HTTP_REQUEST url:', this.replaceVariables(data.httpConfig?.url || '', variables))
          console.log('[FlowEngine] HTTP_REQUEST variables before:', Object.keys(variables).join(', '))
          const response = await this.executeHttpRequest(data.httpConfig, variables)
          console.log('[FlowEngine] HTTP_REQUEST response:', JSON.stringify(response)?.substring(0, 500))

          // Save full response if responseVariable is set (legacy)
          if (data.httpConfig?.responseVariable) {
            variables[data.httpConfig.responseVariable] = response
          }

          // Process response mappings - extract specific fields
          if (data.httpConfig?.responseMappings && Array.isArray(data.httpConfig.responseMappings)) {
            for (const mapping of data.httpConfig.responseMappings) {
              if (mapping.path && mapping.variable) {
                const value = this.getNestedValue(response, mapping.path)
                variables[mapping.variable] = value !== undefined ? value : null
                console.log(`[FlowEngine] Mapped ${mapping.path} → ${mapping.variable} = ${JSON.stringify(value)?.substring(0, 200)}`)
              }
            }
          }

          session.variables = variables
        } catch (error) {
          console.error('HTTP request failed:', error)
        }
        return {}

      case 'GO_TO_FLOW':
        if (data.targetFlowId) {
          // End current session and start new flow
          const targetFlow = await prisma.flow.findUnique({
            where: { id: data.targetFlowId },
            include: { nodes: true, edges: true },
          })
          if (targetFlow) {
            await prisma.flowSession.update({
              where: { id: session.id },
              data: { isActive: false, completedAt: new Date() },
            })
            const newSession = await this.startSession(
              targetFlow as FlowWithRelations,
              session.instanceId,
              session.remoteJid
            )
            await this.executeFlow(newSession)
          }
        }
        return { endFlow: true }

      case 'TRANSFER':
        // For now, just end the flow. Transfer logic can be added later.
        await this.sendMessage(session.remoteJid, {
          text: data.content || 'Transferindo para um atendente...',
        }, 'text')
        return { endFlow: true }

      case 'END':
        if (data.content) {
          await this.sendMessage(session.remoteJid, {
            text: this.replaceVariables(data.content, variables),
          }, 'text')
        }
        return { endFlow: true }

      default:
        return {}
    }
  }

  private async processInput(
    session: SessionWithFlow,
    node: FlowNode,
    context: MessageContext
  ): Promise<string | undefined> {
    const data = node.data as Record<string, any>
    const variables = (session.variables || {}) as Record<string, any>
    const sessionContext = (session.context || {}) as Record<string, any>

    // Save the user's response
    variables['_lastInput'] = context.message
    variables['_lastInputType'] = context.messageType

    if (context.buttonId) {
      variables['_buttonId'] = context.buttonId
      session.variables = variables
      return context.buttonId // Return button ID as output handle
    }

    if (context.listRowId) {
      variables['_listRowId'] = context.listRowId
      session.variables = variables
      return context.listRowId // Return list row ID as output handle
    }

    // Handle MESSAGE node with waitForInput - save response to variable
    if (node.type === 'MESSAGE' && data.waitForInput && data.inputVariable) {
      variables[data.inputVariable] = context.message.trim()
      session.variables = variables
      return undefined
    }

    // Handle MENU node - match user input against menu options
    if (node.type === 'MENU') {
      const menuOptions = sessionContext.menuOptions || data.menuOptions || []
      const userInput = context.message.trim().toLowerCase()

      // Find matching option
      const matchedOption = menuOptions.find((opt: any) =>
        opt.trigger.toLowerCase() === userInput
      )

      if (matchedOption) {
        variables['_menuSelection'] = matchedOption.trigger
        variables['_menuLabel'] = matchedOption.label
        session.variables = variables
        return matchedOption.id // Return option ID as output handle
      }

      // No match - return fallback
      session.variables = variables
      return 'fallback'
    }

    session.variables = variables
    return undefined
  }

  private async findNextNode(
    session: SessionWithFlow,
    currentNode: FlowNode,
    outputHandle?: string
  ): Promise<string | null> {
    // Find edges from current node
    const edges = session.flow.edges.filter(e => e.sourceNodeId === currentNode.id)

    if (edges.length === 0) return null

    // If there's an output handle, try to find matching edge
    if (outputHandle) {
      const matchingEdge = edges.find(e => e.sourceHandle === outputHandle)
      if (matchingEdge) return matchingEdge.targetNodeId
      // Also check right-side handles (right-<id> maps to same option as <id>)
      const rightMatch = edges.find(e => e.sourceHandle === `right-${outputHandle}`)
      if (rightMatch) return rightMatch.targetNodeId
      // Or if outputHandle itself is a right-side handle, match the base id
      if (outputHandle.startsWith('right-')) {
        const baseId = outputHandle.slice(6)
        const baseMatch = edges.find(e => e.sourceHandle === baseId)
        if (baseMatch) return baseMatch.targetNodeId
      }
    }

    // Return first edge (default path)
    return edges[0].targetNodeId
  }

  private replaceVariables(text: string, variables: Record<string, any>): string {
    // Support both simple variables {{var}} and nested {{var.field.subfield}}
    return text.replace(/\{\{([\w.]+)\}\}/g, (match, varPath) => {
      const value = this.getNestedValue(variables, varPath)
      return value !== undefined ? String(value) : match
    })
  }

  // Get nested value from object using dot notation (e.g., "data.user.name")
  private getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return undefined

    const parts = path.split('.')
    let current = obj

    for (const part of parts) {
      if (current === null || current === undefined) return undefined
      current = current[part]
    }

    return current
  }

  private evaluateCondition(
    condition: { variable: string; operator: string; value?: string },
    variables: Record<string, any>
  ): boolean {
    if (!condition) return false

    const varValue = String(variables[condition.variable] || '')
    const compareValue = condition.value || ''

    switch (condition.operator) {
      case 'equals':
        return varValue.toLowerCase() === compareValue.toLowerCase()
      case 'contains':
        return varValue.toLowerCase().includes(compareValue.toLowerCase())
      case 'startsWith':
        return varValue.toLowerCase().startsWith(compareValue.toLowerCase())
      case 'endsWith':
        return varValue.toLowerCase().endsWith(compareValue.toLowerCase())
      case 'regex':
        try {
          return new RegExp(compareValue, 'i').test(varValue)
        } catch {
          return false
        }
      case 'exists':
        return varValue !== '' && varValue !== 'undefined'
      default:
        return false
    }
  }

  private evaluateConditionCases(
    condition: { variable: string; operator: string; cases: Array<{ id: string; value: string }> },
    variables: Record<string, any>
  ): string {
    if (!condition) return 'fallback'

    const varValue = String(variables[condition.variable] ?? '')

    for (const c of condition.cases) {
      // Replace variables in case value too (e.g. {{someVar}})
      const caseValue = this.replaceVariables(c.value || '', variables)

      let matches = false
      switch (condition.operator || 'equals') {
        case 'equals':
          matches = varValue.toLowerCase() === caseValue.toLowerCase()
          break
        case 'contains':
          matches = varValue.toLowerCase().includes(caseValue.toLowerCase())
          break
        case 'startsWith':
          matches = varValue.toLowerCase().startsWith(caseValue.toLowerCase())
          break
        case 'endsWith':
          matches = varValue.toLowerCase().endsWith(caseValue.toLowerCase())
          break
        case 'regex':
          try { matches = new RegExp(caseValue, 'i').test(varValue) } catch { matches = false }
          break
        case 'exists':
          matches = varValue !== '' && varValue !== 'undefined'
          break
      }

      if (matches) return c.id
    }

    return 'fallback'
  }

  private async executeHttpRequest(
    config: { method: string; url: string; headers?: Array<{ key: string; value: string }> | Record<string, string>; body?: string },
    variables: Record<string, any>
  ): Promise<any> {
    const url = this.replaceVariables(config.url, variables)
    const headersObj: Record<string, string> = {}

    // Handle headers as array or object (backwards compatible)
    if (Array.isArray(config.headers)) {
      // New format: array of {key, value}
      for (const header of config.headers) {
        if (header.key) {
          const val = this.replaceVariables(header.value || '', variables).trim()
          const authMatch = val.match(/^(Bearer|Basic)\s+(.+)$/i)
          headersObj[header.key.trim()] = authMatch
            ? `${authMatch[1]} ${authMatch[2].replace(/\s+/g, '')}`
            : val
        }
      }
    } else if (config.headers) {
      // Old format: Record<string, string>
      for (const key in config.headers) {
        const val = this.replaceVariables(config.headers[key], variables).trim()
        const authMatch = val.match(/^(Bearer|Basic)\s+(.+)$/i)
        headersObj[key.trim()] = authMatch
          ? `${authMatch[1]} ${authMatch[2].replace(/\s+/g, '')}`
          : val
      }
    }

    const options: RequestInit = {
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        ...headersObj,
      },
    }

    if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      options.body = this.replaceVariables(config.body, variables)
    }

    const response = await fetch(url, options)

    // Try to parse as JSON, fallback to text
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json()
    }
    return response.text()
  }
}

// Singleton instance
let flowEngineInstance: FlowEngine | null = null

export function initFlowEngine(sendMessage: SendMessageFn): FlowEngine {
  flowEngineInstance = new FlowEngine(sendMessage)
  return flowEngineInstance
}

export function getFlowEngine(): FlowEngine | null {
  return flowEngineInstance
}
