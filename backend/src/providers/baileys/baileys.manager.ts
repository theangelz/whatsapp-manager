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

const logger = pino({ level: 'silent' })

interface BaileysInstance {
  socket: WASocket
  qrCode?: string
  qrRetries: number
  manualDisconnect?: boolean
}

export class BaileysManager {
  private instances: Map<string, BaileysInstance> = new Map()
  private io: Server
  private flowEngine: FlowEngine

  constructor(io: Server) {
    this.io = io
    // Initialize FlowEngine with send message callback
    this.flowEngine = initFlowEngine(this.sendFlowMessage.bind(this))
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

    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`

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
    })

    this.instances.set(instanceId, {
      socket,
      qrRetries: 0,
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
  }

  private async handleConnectionUpdate(instanceId: string, update: Partial<ConnectionState>) {
    const { connection, lastDisconnect, qr } = update
    const baileysInstance = this.instances.get(instanceId)

    if (qr && baileysInstance) {
      baileysInstance.qrRetries++

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

      this.io.to(`instance:${instanceId}`).emit('qr-code', {
        instanceId,
        qrCode: qrCodeDataUrl,
      })
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const wasManualDisconnect = baileysInstance?.manualDisconnect
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !wasManualDisconnect

      console.log(`Instance ${instanceId} disconnected. Status: ${statusCode}. Manual: ${wasManualDisconnect}. Reconnect: ${shouldReconnect}`)

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
      } else if (shouldReconnect) {
        // Connection lost unexpectedly - try to reconnect
        await prisma.instance.update({
          where: { id: instanceId },
          data: { status: 'DISCONNECTED' },
        })
        setTimeout(() => this.initInstance(instanceId), 5000)
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
    if (!msg.key.fromMe && msg.message) {
      const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        include: {
          typebotIntegration: true,
          n8nIntegration: true,
        },
      })

      if (!instance) return

      const remoteJid = msg.key.remoteJid || ''
      const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '')

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
    const baileysInstance = this.instances.get(instanceId)
    if (!baileysInstance?.socket) {
      throw new Error('Instance not connected')
    }

    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`

    const result = await baileysInstance.socket.sendMessage(jid, { text })

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
    const baileysInstance = this.instances.get(instanceId)
    if (!baileysInstance?.socket) {
      throw new Error('Instance not connected')
    }

    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`

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
