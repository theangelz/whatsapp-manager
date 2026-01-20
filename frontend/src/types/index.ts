export interface User {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'OPERATOR'
  companyId: string
}

export interface Company {
  id: string
  name: string
  plan: string
}

export interface Instance {
  id: string
  name: string
  description?: string
  channel: 'BAILEYS' | 'CLOUD_API'
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'BANNED'
  phoneNumber?: string
  profileName?: string
  profilePicture?: string
  messagesSent: number
  messagesReceived: number
  apiToken: string
  // Cloud API specific fields
  wabaId?: string
  phoneNumberId?: string
  accessToken?: string
  webhookSecret?: string
  createdAt: string
}

export interface Contact {
  id: string
  name: string
  phoneNumber: string
  email?: string
  tags: string[]
  metadata?: Record<string, unknown>
  isActive: boolean
  createdAt: string
}

export interface Message {
  id: string
  instanceId: string
  remoteJid: string
  messageId: string
  direction: 'INBOUND' | 'OUTBOUND'
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  type: string
  content: string
  mediaUrl?: string
  sentAt?: string
  deliveredAt?: string
  readAt?: string
  failedAt?: string
  failReason?: string
  createdAt: string
}

export interface Template {
  id: string
  name: string
  language: string
  category: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  headerType?: string
  headerContent?: string
  bodyText: string
  footerText?: string
  buttons?: TemplateButton[]
  createdAt: string
}

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
  text: string
  url?: string
  phoneNumber?: string
}

export interface Campaign {
  id: string
  name: string
  description?: string
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
  messageType: string
  messageContent: string
  delay: number
  totalContacts: number
  sentCount: number
  deliveredCount: number
  failedCount: number
  scheduledAt?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
}

export interface TypebotIntegration {
  id: string
  instanceId: string
  typebotId: string
  typebotUrl: string
  triggerType: 'all' | 'keyword' | 'new_conversation'
  triggerValue?: string
  variables?: Record<string, string>
  isActive: boolean
}

export interface N8nIntegration {
  id: string
  instanceId: string
  webhookUrl: string
  events: string[]
  isActive: boolean
}

export interface DashboardStats {
  instances: {
    total: number
    online: number
    offline: number
  }
  messages: {
    total: number
    today: number
  }
  contacts: number
  campaigns: number
}

export interface AuthResponse {
  user: User
  company: Company
  token: string
}

// FlowBuilder Types
export type FlowStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE'
export type FlowTriggerType = 'KEYWORD' | 'ALL' | 'BUTTON_REPLY' | 'LIST_REPLY' | 'WEBHOOK'
export type FlowNodeType =
  | 'START'
  | 'MESSAGE'
  | 'IMAGE'
  | 'AUDIO'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'BUTTONS'
  | 'LIST'
  | 'CONDITION'
  | 'DELAY'
  | 'SET_VARIABLE'
  | 'HTTP_REQUEST'
  | 'TRANSFER'
  | 'GO_TO_FLOW'
  | 'END'

export interface Flow {
  id: string
  name: string
  description?: string
  status: FlowStatus
  triggerType: FlowTriggerType
  triggerValue?: string
  instanceId?: string
  version: number
  variables?: Record<string, any>
  settings?: Record<string, any>
  nodesCount?: number
  activeSessions?: number
  createdAt: string
  updatedAt: string
}

export interface FlowNode {
  id: string
  flowId: string
  type: FlowNodeType
  positionX: number
  positionY: number
  data: FlowNodeData
  label?: string
}

export interface FlowNodeData {
  label?: string
  content?: string
  mediaUrl?: string
  mediaType?: string
  fileName?: string
  buttons?: Array<{ id: string; text: string }>
  listSections?: Array<{
    title: string
    rows: Array<{ id: string; title: string; description?: string }>
  }>
  buttonText?: string
  delay?: number
  variable?: string
  value?: string
  condition?: {
    variable: string
    operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'exists'
    value?: string
  }
  httpConfig?: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    url: string
    headers?: Record<string, string>
    body?: string
    responseVariable?: string
  }
  targetFlowId?: string
}

export interface FlowEdge {
  id: string
  flowId: string
  sourceNodeId: string
  targetNodeId: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
  condition?: any
}

export interface FlowWithDetails extends Flow {
  nodes: FlowNode[]
  edges: FlowEdge[]
}
