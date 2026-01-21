import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { Server } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'

import { env } from './config/env.js'
import { prisma } from './config/database.js'
import { redis } from './config/redis.js'

import { authRoutes } from './modules/auth/auth.routes.js'
import { userRoutes } from './modules/users/user.routes.js'
import { companyRoutes } from './modules/companies/company.routes.js'
import { instanceRoutes } from './modules/instances/instance.routes.js'
import { messageRoutes } from './modules/messages/message.routes.js'
import { contactRoutes } from './modules/contacts/contact.routes.js'
import { templateRoutes } from './modules/templates/template.routes.js'
import { campaignRoutes } from './modules/campaigns/campaign.routes.js'
import { webhookRoutes } from './modules/webhooks/webhook.routes.js'
import { typebotRoutes } from './modules/typebot/typebot.routes.js'
import { n8nRoutes } from './modules/n8n/n8n.routes.js'
import { flowRoutes } from './modules/flows/flow.routes.js'
import { adminRoutes } from './modules/admin/admin.routes.js'
import { webhookEntradaRoutes } from './modules/webhook-entrada/webhook-entrada.routes.js'
import { messageTemplateRoutes } from './modules/message-templates/message-template.routes.js'
import { sendQueueRoutes } from './modules/send-queue/send-queue.routes.js'
import { messageLogRoutes } from './modules/message-logs/message-log.routes.js'
import { BaileysManager } from './providers/baileys/baileys.manager.js'
import { startSendQueueProcessor } from './queues/send-queue.worker.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
})

export let io: Server
export let baileysManager: BaileysManager

async function bootstrap() {
  await fastify.register(cors, {
    origin: [
      env.FRONTEND_URL,
      'http://localhost:5454',
      'http://localhost:5455',
      'https://evo.sjnetwork.com.br',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-token'],
  })

  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
  })

  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  })

  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  })

  // Serve frontend static files
  const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist')
  await fastify.register(fastifyStatic, {
    root: frontendPath,
    prefix: '/',
    decorateReply: false,
  })

  // SPA fallback - serve index.html for non-API routes
  fastify.setNotFoundHandler(async (request, reply) => {
    // If it's an API request, return 404
    if (request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) {
      return reply.code(404).send({ error: 'Not found' })
    }
    // Otherwise serve the SPA
    const fs = await import('fs/promises')
    const indexPath = path.join(frontendPath, 'index.html')
    const html = await fs.readFile(indexPath, 'utf-8')
    return reply.type('text/html').send(html)
  })

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // API Routes
  await fastify.register(authRoutes, { prefix: '/api/auth' })
  await fastify.register(userRoutes, { prefix: '/api/users' })
  await fastify.register(companyRoutes, { prefix: '/api/companies' })
  await fastify.register(instanceRoutes, { prefix: '/api/instances' })
  await fastify.register(messageRoutes, { prefix: '/api/messages' })
  await fastify.register(contactRoutes, { prefix: '/api/contacts' })
  await fastify.register(templateRoutes, { prefix: '/api/templates' })
  await fastify.register(campaignRoutes, { prefix: '/api/campaigns' })
  await fastify.register(webhookRoutes, { prefix: '/api/webhook' })
  await fastify.register(typebotRoutes, { prefix: '/api/typebot' })
  await fastify.register(n8nRoutes, { prefix: '/api/n8n' })
  await fastify.register(flowRoutes, { prefix: '/api/flows' })
  await fastify.register(adminRoutes, { prefix: '/api/admin' })
  await fastify.register(webhookEntradaRoutes, { prefix: '/api/webhook-entrada' })
  await fastify.register(messageTemplateRoutes, { prefix: '/api/message-templates' })
  await fastify.register(sendQueueRoutes, { prefix: '/api/send-queue' })
  await fastify.register(messageLogRoutes, { prefix: '/api/message-logs' })

  // Start Fastify server
  await fastify.listen({ port: env.PORT, host: '0.0.0.0' })

  // Initialize Socket.IO after server is ready
  io = new Server(fastify.server, {
    cors: {
      origin: [
        env.FRONTEND_URL,
        'http://localhost:5454',
        'http://localhost:5455',
        'https://evo.sjnetwork.com.br',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  // Socket.IO events
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    socket.on('join-instance', (instanceId: string) => {
      socket.join(`instance:${instanceId}`)
      console.log(`Socket ${socket.id} joined instance:${instanceId}`)
    })

    socket.on('leave-instance', (instanceId: string) => {
      socket.leave(`instance:${instanceId}`)
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  // Initialize BaileysManager
  baileysManager = new BaileysManager(io)

  // Initialize connected instances
  const connectedInstances = await prisma.instance.findMany({
    where: {
      status: 'CONNECTED',
      channel: 'BAILEYS',
      isActive: true,
    },
  })

  for (const instance of connectedInstances) {
    try {
      await baileysManager.initInstance(instance.id)
    } catch (error) {
      console.error(`Failed to restore instance ${instance.id}:`, error)
    }
  }

  // Start send queue processor
  startSendQueueProcessor()

  console.log(`Server running on http://0.0.0.0:${env.PORT}`)
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
