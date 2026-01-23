import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
  ConnectionState,
  proto,
  WAMessageKey,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { Server } from 'socket.io'
import path from 'path'
import fs from 'fs'
import QRCode from 'qrcode'
import { pino } from 'pino'

import { prisma } from '../../config/database.js'
import { env } from '../../config/env.js'
import { FlowEngine, initFlowEngine, getFlowEngine } from '../../modules/flows/flow.engine.js'
import { formatPhoneToJid, extractPhoneFromJid, isGroupJid, validateMessagePayload, prepareInstanceConnection, processMessageMetadata, generateMessageId, onSystemBlocked, onSystemUnblocked, isSystemOperational, getWppSystemStatus } from '../../core/core.wpp.js'

const logger = pino({ level: 'silent' })

interface BaileysInstance {
  socket: WASocket
  qrCode?: string
  qrRetries: number
  manualDisconnect?: boolean
  lastQrUpdate?: number
  reconnectAttempts?: number
  isReconnecting?: boolean
}

export class BaileysManager {
  private instances: Map<string, BaileysInstance> = new Map()
  private io: Server
  private flowEngine: FlowEngine

  constructor(io: Server) {
    this.io = io
    // Initialize FlowEngine with send message callback
    this.flowEngine = initFlowEngine(this.sendFlowMessage.bind(this))

    // Register callback for when system gets blocked - disconnect all instances
    onSystemBlocked(() => {
      console.log('[BaileysManager] System blocked - disconnecting all instances')
      this.disconnectAllInstances()
    })

    // Register callback for when system gets unblocked - reconnect all instances
    onSystemUnblocked(() => {
      console.log('[BaileysManager] System unblocked - reconnecting all instances')
      this.reconnectAllInstances()
    })
  }

  // Disconnect all instances (called when system is blocked)
  private async disconnectAllInstances(): Promise<void> {
    const status = getWppSystemStatus()
    for (const [instanceId, instance] of this.instances) {
      try {
        console.log(`[BaileysManager] Disconnecting instance ${instanceId} due to system block`)
        instance.manualDisconnect = true
        instance.socket?.end(undefined)
        this.instances.delete(instanceId)

        // Update database - mark as DISCONNECTED but keep session
        await prisma.instance.update({
          where: { id: instanceId },
          data: { status: 'DISCONNECTED', qrCode: null }
        })

        // Notify frontend
        this.io.to(`instance:${instanceId}`).emit('status-update', {
          instanceId,
          status: 'DISCONNECTED',
          message: status.message || 'Sistema bloqueado'
        })
      } catch (e) {
        console.error(`[BaileysManager] Error disconnecting ${instanceId}:`, e)
      }
    }
  }

  // Reconnect all instances (called when system is unblocked)
  private async reconnectAllInstances(): Promise<void> {
    try {
      // Get all active instances that have sessions (were connected before)
      const instances = await prisma.instance.findMany({
        where: {
          isActive: true,
          channel: 'BAILEYS',
          // Only reconnect instances that have phone number (were previously connected)
          phoneNumber: { not: null }
        }
      })

      console.log(`[BaileysManager] Found ${instances.length} instances to reconnect`)

      for (const instance of instances) {
        try {
          console.log(`[BaileysManager] Reconnecting instance ${instance.id} (${instance.name})`)
          await this.initInstance(instance.id)

          // Small delay between reconnections to avoid overwhelming
          await new Promise(resolve => setTimeout(resolve, 2000))
        } catch (e) {
          console.error(`[BaileysManager] Error reconnecting ${instance.id}:`, e)
        }
      }

      // Also reactivate Cloud API instances
      const cloudInstances = await prisma.instance.findMany({
        where: {
          isActive: true,
          channel: 'CLOUD_API',
          phoneNumberId: { not: null },
          accessToken: { not: null }
        }
      })

      for (const instance of cloudInstances) {
        try {
          console.log(`[BaileysManager] Reactivating Cloud API instance ${instance.id}`)
          await prisma.instance.update({
            where: { id: instance.id },
            data: { status: 'CONNECTED' }
          })

          // Notify frontend
          this.io.to(`instance:${instance.id}`).emit('status-update', {
            instanceId: instance.id,
            status: 'CONNECTED'
          })
        } catch (e) {
          console.error(`[BaileysManager] Error reactivating Cloud API ${instance.id}:`, e)
        }
      }
    } catch (e) {
      console.error('[BaileysManager] Error in reconnectAllInstances:', e)
    }
  }

  // Helper to format JID correctly for individuals and groups
  private formatJid(to: string): string {
    return formatPhoneToJid(to, isGroupJid(to))
  }

  // Send message from FlowEngine
  private async sendFlowMessage(to: string, content: any, type: string): Promise<void> {
    // Find the instance from the session (we need to get it from context)
    // For now, we'll use a workaround by storing instanceId in the content
    const instanceId = (content as any)._instanceId
    if (!instanceId) {
      console.error('FlowEngine: No instanceId provided')
      return
    }

    const baileysInstance = this.instances.get(instanceId)
    if (!baileysInstance?.socket) {
      console.error('FlowEngine: Instance not connected')
      return
    }

    const jid = this.formatJid(to)

    try {
      switch (type) {
        case 'text':
          await baileysInstance.socket.sendMessage(jid, { text: content.text })
          break
        case 'image':
          await baileysInstance.socket.sendMessage(jid, content)
          break
        case 'audio':
          await baileysInstance.socket.sendMessage(jid, content)
          break
        case 'video':
          await baileysInstance.socket.sendMessage(jid, content)
          break
        case 'document':
          await baileysInstance.socket.sendMessage(jid, content)
          break
        case 'buttons':
          // Baileys buttons format
          await baileysInstance.socket.sendMessage(jid, content)
          break
        case 'list':
          // Baileys list format
          await baileysInstance.socket.sendMessage(jid, content)
          break
        default:
          await baileysInstance.socket.sendMessage(jid, { text: content.text || String(content) })
      }
    } catch (error) {
      console.error('FlowEngine send error:', error)
    }
  }

  private getSessionPath(instanceId: string): string {
    const sessionsPath = path.resolve(env.BAILEYS_SESSIONS_PATH)
    if (!fs.existsSync(sessionsPath)) {
      fs.mkdirSync(sessionsPath, { recursive: true })
    }
    return path.join(sessionsPath, instanceId)
  }

  async initInstance(instanceId: string): Promise<void> {
    // Prepare connection check
    const connCheck = await prepareInstanceConnection(instanceId)
    if (!connCheck.ready) {
      throw new Error(connCheck.error || 'Connection preparation failed')
    }

    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    })

    if (!instance || instance.channel !== 'BAILEYS') {
      throw new Error('Instance not found or not a Baileys instance')
    }

    if (this.instances.has(instanceId)) {
      const existingInstance = this.instances.get(instanceId)
      if (existingInstance?.socket) {
        existingInstance.socket.end(undefined)
      }
      this.instances.delete(instanceId)
    }

    const sessionPath = this.getSessionPath(instanceId)
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
    const { version } = await fetchLatestBaileysVersion()

    const socket = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: ['WhatsApp Manager', 'Chrome', '120.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      // getMessage is required for proper message sending to groups
      // Without it, group members see "Waiting for message" error
      getMessage: async (key) => {
        // Try to get from database
        if (key.id) {
          const msg = await prisma.message.findFirst({
            where: { messageId: key.id },
            select: { content: true, type: true },
          })
          if (msg) {
            return { conversation: msg.content }
          }
        }
        return { conversation: '' }
      },
    })

    this.instances.set(instanceId, {
      socket,
      qrRetries: 0,
      lastQrUpdate: 0,
      reconnectAttempts: 0,
      isReconnecting: false,
    })

    socket.ev.on('creds.update', saveCreds)

    socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      await this.handleConnectionUpdate(instanceId, update)
    })

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        await this.handleIncomingMessage(instanceId, msg)
      }
    })

    socket.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        await this.handleMessageStatusUpdate(instanceId, update)
      }
    })

    // Handle incoming calls
    socket.ev.on('call', async (calls) => {
      const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        select: { rejectCalls: true },
      })

      if (instance?.rejectCalls) {
        for (const call of calls) {
          if (call.status === 'offer') {
            console.log(`[Call] Rejecting call from ${call.from}`)
            await socket.rejectCall(call.id, call.from)
          }
        }
      }
    })
  }

  private async handleConnectionUpdate(instanceId: string, update: Partial<ConnectionState>) {
    const { connection, lastDisconnect, qr } = update
    const baileysInstance = this.instances.get(instanceId)

    if (qr && baileysInstance) {
      // Debounce QR code updates - minimum 5 seconds between updates
      const now = Date.now()
      const lastUpdate = baileysInstance.lastQrUpdate || 0
      const timeSinceLastUpdate = now - lastUpdate

      if (timeSinceLastUpdate < 5000) {
        console.log(`[QR] Skipping QR update for ${instanceId} - too soon (${timeSinceLastUpdate}ms since last)`)
        return
      }

      baileysInstance.qrRetries++
      baileysInstance.lastQrUpdate = now

      if (baileysInstance.qrRetries > 5) {
        await this.disconnectInstance(instanceId)
        this.io.to(`instance:${instanceId}`).emit('qr-timeout', { instanceId })
        return
      }

      const qrCodeDataUrl = await QRCode.toDataURL(qr)
      baileysInstance.qrCode = qrCodeDataUrl

      await prisma.instance.update({
        where: { id: instanceId },
        data: {
          status: 'CONNECTING',
          qrCode: qrCodeDataUrl,
        },
      })

      console.log(`[QR] Sending QR code for ${instanceId} (attempt ${baileysInstance.qrRetries}/5)`)
      this.io.to(`instance:${instanceId}`).emit('qr-code', {
        instanceId,
        qrCode: qrCodeDataUrl,
      })
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const wasManualDisconnect = baileysInstance?.manualDisconnect
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !wasManualDisconnect

      // Track reconnect attempts to avoid infinite loops
      const reconnectAttempts = (baileysInstance?.reconnectAttempts || 0) + 1
      const maxReconnectAttempts = 5

      console.log(`Instance ${instanceId} disconnected. Status: ${statusCode}. Manual: ${wasManualDisconnect}. Reconnect: ${shouldReconnect}. Attempt: ${reconnectAttempts}/${maxReconnectAttempts}`)

      if (statusCode === DisconnectReason.loggedOut) {
        await this.deleteSession(instanceId)
        await prisma.instance.update({
          where: { id: instanceId },
          data: {
            status: 'DISCONNECTED',
            qrCode: null,
            phoneNumber: null,
            profileName: null,
            profilePicture: null,
          },
        })
        this.instances.delete(instanceId)
      } else if (wasManualDisconnect) {
        // User clicked disconnect - don't auto-reconnect
        await prisma.instance.update({
          where: { id: instanceId },
          data: { status: 'DISCONNECTED', qrCode: null },
        })
        this.instances.delete(instanceId)
      } else if (shouldReconnect && reconnectAttempts <= maxReconnectAttempts) {
        // Connection lost unexpectedly - try to reconnect with exponential backoff
        if (baileysInstance) {
          baileysInstance.reconnectAttempts = reconnectAttempts
        }
        await prisma.instance.update({
          where: { id: instanceId },
          data: { status: 'DISCONNECTED' },
        })
        // Exponential backoff: 5s, 10s, 20s, 40s, 80s
        const delay = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), 80000)
        console.log(`[Reconnect] Scheduling reconnect for ${instanceId} in ${delay}ms`)
        setTimeout(() => this.initInstance(instanceId), delay)
      } else if (reconnectAttempts > maxReconnectAttempts) {
        console.log(`[Reconnect] Max attempts reached for ${instanceId}, stopping reconnection`)
        await prisma.instance.update({
          where: { id: instanceId },
          data: { status: 'DISCONNECTED', qrCode: null },
        })
        this.instances.delete(instanceId)
      }

      this.io.to(`instance:${instanceId}`).emit('status-update', {
        instanceId,
        status: 'DISCONNECTED',
      })
    }

    if (connection === 'open') {
      const socket = baileysInstance?.socket
      if (!socket) return

      const user = socket.user
      let profilePicture: string | undefined

      try {
        profilePicture = await socket.profilePictureUrl(user?.id || '', 'image')
      } catch {
        profilePicture = undefined
      }

      await prisma.instance.update({
        where: { id: instanceId },
        data: {
          status: 'CONNECTED',
          qrCode: null,
          phoneNumber: user?.id?.split(':')[0] || null,
          profileName: user?.name || null,
          profilePicture: profilePicture || null,
        },
      })

      if (baileysInstance) {
        baileysInstance.qrCode = undefined
        baileysInstance.qrRetries = 0
        baileysInstance.reconnectAttempts = 0
        baileysInstance.lastQrUpdate = 0
      }

      this.io.to(`instance:${instanceId}`).emit('status-update', {
        instanceId,
        status: 'CONNECTED',
        phoneNumber: user?.id?.split(':')[0],
        profileName: user?.name,
        profilePicture,
      })

      console.log(`Instance ${instanceId} connected as ${user?.id}`)
    }
  }

  private async handleIncomingMessage(instanceId: string, msg: proto.IWebMessageInfo) {
    // Check if system is operational
    if (!isSystemOperational()) {
      console.log('[handleIncomingMessage] System blocked - ignoring message')
      return
    }

    if (!msg.key.fromMe && msg.message) {
      const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        include: {
          typebotIntegration: true,
          n8nIntegration: true,
        },
      })

      if (!instance) return

      const msgMeta = processMessageMetadata(msg)
      const remoteJid = msg.key.remoteJid || ''

      // Check ignore settings
      const isGroup = msgMeta.isGroup
      const isBroadcast = remoteJid.endsWith('@broadcast')
      const isStatus = remoteJid === 'status@broadcast'

      if (instance.ignoreGroups && isGroup) {
        console.log(`[handleIncomingMessage] Ignoring group message from ${remoteJid}`)
        return
      }

      if (instance.ignoreBroadcasts && isBroadcast) {
        console.log(`[handleIncomingMessage] Ignoring broadcast message from ${remoteJid}`)
        return
      }

      if (instance.ignoreStatus && isStatus) {
        console.log(`[handleIncomingMessage] Ignoring status message`)
        return
      }

      const phoneNumber = msgMeta.from

      let content = ''
      let type: 'text' | 'button_reply' | 'list_reply' | 'image' | 'audio' | 'video' | 'document' = 'text'
      let buttonId: string | undefined
      let listRowId: string | undefined

      if (msg.message.conversation) {
        content = msg.message.conversation
      } else if (msg.message.extendedTextMessage?.text) {
        content = msg.message.extendedTextMessage.text
      } else if (msg.message.buttonsResponseMessage) {
        // Button reply
        content = msg.message.buttonsResponseMessage.selectedDisplayText || ''
        buttonId = msg.message.buttonsResponseMessage.selectedButtonId || undefined
        type = 'button_reply'
      } else if (msg.message.listResponseMessage) {
        // List reply
        content = msg.message.listResponseMessage.title || ''
        listRowId = msg.message.listResponseMessage.singleSelectReply?.selectedRowId || undefined
        type = 'list_reply'
      } else if (msg.message.imageMessage) {
        content = msg.message.imageMessage.caption || '[Image]'
        type = 'image'
      } else if (msg.message.videoMessage) {
        content = msg.message.videoMessage.caption || '[Video]'
        type = 'video'
      } else if (msg.message.audioMessage) {
        content = '[Audio]'
        type = 'audio'
      } else if (msg.message.documentMessage) {
        content = msg.message.documentMessage.fileName || '[Document]'
        type = 'document'
      }

      // Save message
      await prisma.message.create({
        data: {
          instanceId,
          remoteJid,
          messageId: msg.key.id || '',
          direction: 'INBOUND',
          status: 'DELIVERED',
          type,
          content,
          deliveredAt: new Date(),
        },
      })

      // Update metrics
      await prisma.instance.update({
        where: { id: instanceId },
        data: { messagesReceived: { increment: 1 } },
      })

      // Emit to socket
      this.io.to(`instance:${instanceId}`).emit('message-received', {
        instanceId,
        from: phoneNumber,
        content,
        type,
        timestamp: new Date(),
      })

      // Try to process with FlowEngine first
      try {
        // Create a custom sendMessage function that includes instanceId
        const flowEngine = getFlowEngine()
        if (flowEngine) {
          // Temporarily override the send function to include instanceId
          const originalEngine = flowEngine as any
          const originalSendFn = originalEngine.sendMessage

          originalEngine.sendMessage = async (to: string, msgContent: any, msgType: string) => {
            // Add instanceId to content for routing
            msgContent._instanceId = instanceId
            return this.sendFlowMessage(to, msgContent, msgType)
          }

          const handled = await flowEngine.processMessage({
            instanceId,
            remoteJid,
            message: content,
            messageType: type,
            buttonId,
            listRowId,
          })

          // Restore original
          originalEngine.sendMessage = originalSendFn

          if (handled) {
            // Flow handled the message, skip external webhooks
            console.log(`Flow handled message from ${phoneNumber}`)
            return
          }
        }
      } catch (error) {
        console.error('FlowEngine error:', error)
      }

      // Trigger webhooks (Typebot, n8n, custom) if no flow handled it
      await this.triggerWebhooks(instance, {
        event: 'message.received',
        from: phoneNumber,
        content,
        type,
        timestamp: new Date(),
      })
    }
  }

  private async handleMessageStatusUpdate(instanceId: string, update: { key: WAMessageKey; update: Partial<proto.IWebMessageInfo> }) {
    const { key, update: statusUpdate } = update

    if (statusUpdate.status) {
      let status: 'SENT' | 'DELIVERED' | 'READ' = 'SENT'
      const updateData: any = {}

      switch (statusUpdate.status) {
        case 2: // SENT
          status = 'SENT'
          updateData.sentAt = new Date()
          break
        case 3: // DELIVERED
          status = 'DELIVERED'
          updateData.deliveredAt = new Date()
          break
        case 4: // READ
          status = 'READ'
          updateData.readAt = new Date()
          break
      }

      await prisma.message.updateMany({
        where: { messageId: key.id || '' },
        data: { status, ...updateData },
      })
    }
  }

  private async triggerWebhooks(instance: any, data: any) {
    const axios = (await import('axios')).default

    // Typebot integration
    if (instance.typebotIntegration?.isActive && data.event === 'message.received') {
      try {
        console.log(`[Typebot] Processing message from ${data.from}`)
        const typebotInt = instance.typebotIntegration

        // Check trigger conditions
        let shouldTrigger = true
        if (typebotInt.triggerType === 'keyword' && typebotInt.triggerValue) {
          shouldTrigger = data.content.toLowerCase().includes(typebotInt.triggerValue.toLowerCase())
        }

        if (shouldTrigger) {
          // Send message to Typebot
          const response = await axios.post(
            `${typebotInt.typebotUrl}/api/v1/sendMessage`,
            {
              sessionId: `${instance.id}-${data.from}`,
              message: data.content,
              ...(typebotInt.variables && typeof typebotInt.variables === 'object' ? typebotInt.variables : {}),
            },
            {
              headers: env.TYPEBOT_API_KEY ? { Authorization: `Bearer ${env.TYPEBOT_API_KEY}` } : {},
              timeout: 10000,
            }
          )

          console.log(`[Typebot] Response:`, response.data)

          // Send Typebot responses back to user
          if (response.data?.messages) {
            for (const msg of response.data.messages) {
              if (msg.type === 'text' && msg.content?.richText) {
                // Extract text from rich text
                const text = msg.content.richText
                  .map((block: any) => block.children?.map((c: any) => c.text).join('') || '')
                  .join('\n')
                if (text) {
                  const jid = data.from.includes('@') ? data.from : `${data.from}@s.whatsapp.net`
                  await this.sendTextMessage(instance.id, jid, text)
                }
              }
            }
          }
        }
      } catch (error: any) {
        console.error('[Typebot] Error:', error.response?.data || error.message)
      }
    }

    // Custom webhook
    if (instance.webhookUrl && instance.webhookEvents.includes(data.event)) {
      try {
        await axios.post(instance.webhookUrl, {
          instanceId: instance.id,
          instanceName: instance.name,
          ...data,
        })
      } catch (error) {
        console.error('Webhook error:', error)
      }
    }

    // n8n integration
    if (instance.n8nIntegration?.isActive && instance.n8nIntegration.events.includes(data.event)) {
      try {
        await axios.post(instance.n8nIntegration.webhookUrl, {
          instanceId: instance.id,
          instanceName: instance.name,
          ...data,
        })
      } catch (error) {
        console.error('n8n webhook error:', error)
      }
    }
  }

  async sendTextMessage(instanceId: string, to: string, text: string): Promise<proto.WebMessageInfo | null> {
    // Validate message payload
    const validation = await validateMessagePayload(to, { text })
    if (!validation.valid) {
      throw new Error(validation.error || 'Message validation failed')
    }

    const baileysInstance = this.instances.get(instanceId)
    if (!baileysInstance?.socket) {
      console.error(`[sendTextMessage] Instance ${instanceId} not found or not connected`)
      throw new Error('Instance not connected')
    }

    // Check if socket is actually connected
    const socketUser = baileysInstance.socket.user
    if (!socketUser) {
      console.error(`[sendTextMessage] Socket user is null - session may be invalid`)
      throw new Error('Session invalid - please reconnect')
    }

    const jid = validation.jid
    console.log(`[sendTextMessage] Sending to: ${jid}, text length: ${text.length}`)

    const result = await baileysInstance.socket.sendMessage(jid, { text })
    console.log(`[sendTextMessage] Result:`, JSON.stringify(result?.key || 'no result'))

    if (!result?.key?.id) {
      console.error(`[sendTextMessage] No message ID returned - message may not have been sent`)
    }

    // Save message
    await prisma.message.create({
      data: {
        instanceId,
        remoteJid: jid,
        messageId: result?.key.id || '',
        direction: 'OUTBOUND',
        status: 'PENDING',
        type: 'text',
        content: text,
      },
    })

    // Update metrics
    await prisma.instance.update({
      where: { id: instanceId },
      data: { messagesSent: { increment: 1 } },
    })

    return result || null
  }

  async sendMediaMessage(
    instanceId: string,
    to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    media: Buffer | string,
    caption?: string,
    fileName?: string
  ): Promise<proto.WebMessageInfo | null> {
    // Validate message payload
    const validation = await validateMessagePayload(to, { mediaType, caption })
    if (!validation.valid) {
      throw new Error(validation.error || 'Message validation failed')
    }

    const baileysInstance = this.instances.get(instanceId)
    if (!baileysInstance?.socket) {
      throw new Error('Instance not connected')
    }

    const jid = validation.jid

    let messageContent: any = {}

    switch (mediaType) {
      case 'image':
        messageContent = { image: media, caption }
        break
      case 'video':
        messageContent = { video: media, caption }
        break
      case 'audio':
        messageContent = { audio: media, mimetype: 'audio/mp4', ptt: true }
        break
      case 'document':
        messageContent = { document: media, fileName: fileName || 'document', mimetype: 'application/octet-stream' }
        break
    }

    const result = await baileysInstance.socket.sendMessage(jid, messageContent)

    await prisma.message.create({
      data: {
        instanceId,
        remoteJid: jid,
        messageId: result?.key.id || '',
        direction: 'OUTBOUND',
        status: 'PENDING',
        type: mediaType,
        content: caption || `[${mediaType}]`,
      },
    })

    await prisma.instance.update({
      where: { id: instanceId },
      data: { messagesSent: { increment: 1 } },
    })

    return result || null
  }

  async disconnectInstance(instanceId: string): Promise<void> {
    const baileysInstance = this.instances.get(instanceId)
    if (baileysInstance?.socket) {
      // Mark as manual disconnect to prevent auto-reconnect
      baileysInstance.manualDisconnect = true
      baileysInstance.socket.end(undefined)
    }
    // Don't delete instance here - let the connection handler do it
    // to ensure proper cleanup

    await prisma.instance.update({
      where: { id: instanceId },
      data: { status: 'DISCONNECTED', qrCode: null },
    })

    this.io.to(`instance:${instanceId}`).emit('status-update', {
      instanceId,
      status: 'DISCONNECTED',
    })
  }

  async logoutInstance(instanceId: string): Promise<void> {
    const baileysInstance = this.instances.get(instanceId)
    if (baileysInstance?.socket) {
      await baileysInstance.socket.logout()
    }
    await this.deleteSession(instanceId)
    this.instances.delete(instanceId)

    await prisma.instance.update({
      where: { id: instanceId },
      data: {
        status: 'DISCONNECTED',
        qrCode: null,
        phoneNumber: null,
        profileName: null,
        profilePicture: null,
      },
    })
  }

  private async deleteSession(instanceId: string): Promise<void> {
    const sessionPath = this.getSessionPath(instanceId)
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true })
    }
  }

  getQRCode(instanceId: string): string | undefined {
    return this.instances.get(instanceId)?.qrCode
  }

  isConnected(instanceId: string): boolean {
    const instance = this.instances.get(instanceId)
    return instance?.socket?.user !== undefined
  }

  async getGroups(instanceId: string): Promise<Array<{ id: string; name: string; participants: number }>> {
    const baileysInstance = this.instances.get(instanceId)
    if (!baileysInstance?.socket) {
      throw new Error('Instance not connected')
    }

    const groups = await baileysInstance.socket.groupFetchAllParticipating()

    return Object.values(groups).map((group) => ({
      id: group.id,
      name: group.subject,
      participants: group.participants?.length || 0,
    }))
  }

  async getGroupInfo(instanceId: string, groupId: string): Promise<any> {
    const baileysInstance = this.instances.get(instanceId)
    if (!baileysInstance?.socket) {
      throw new Error('Instance not connected')
    }

    const metadata = await baileysInstance.socket.groupMetadata(groupId)
    return {
      id: metadata.id,
      name: metadata.subject,
      description: metadata.desc,
      owner: metadata.owner,
      participants: metadata.participants.map((p) => ({
        id: p.id,
        admin: p.admin,
      })),
      createdAt: metadata.creation,
    }
  }
}
