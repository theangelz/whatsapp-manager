import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { isSystemOperational } from '../../core/core.wpp.js'

const execAsync = promisify(exec)

// Environment for exec commands - ensure PATH includes common locations and dev deps install
const execEnv = {
  ...process.env,
  PATH: `/root/.nvm/versions/node/v20.20.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${process.env.PATH || ''}`,
  NODE_ENV: 'development'  // Force dev to ensure devDependencies are installed
}

// Current version
const CURRENT_VERSION = '2.1.11'
const GITHUB_REPO = 'theangelz/whatsapp-manager'

// Lista de emails de super admin
const ADMIN_EMAILS = ['admin@whatsapp', 'admin@whatsapp.local']

// Middleware para verificar se é admin
async function adminMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Get user from database to check email
  // JWT uses 'sub' for user id
  const userId = (request.user as any).sub || (request.user as any).id

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return reply.status(403).send({ error: 'Acesso negado. Apenas administradores.' })
  }
}

export async function adminRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('onRequest', authMiddleware)
  fastify.addHook('onRequest', adminMiddleware)

  // List all companies
  fastify.get('/companies', async (request, reply) => {
    const companies = await prisma.company.findMany({
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            instances: true,
            contacts: true,
            campaigns: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send(companies)
  })

  // Get company by ID
  fastify.get('/companies/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            createdAt: true,
          },
        },
        instances: {
          select: {
            id: true,
            name: true,
            status: true,
            channel: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            instances: true,
            contacts: true,
            campaigns: true,
            templates: true,
          },
        },
      },
    })

    if (!company) {
      return reply.status(404).send({ error: 'Empresa nao encontrada' })
    }

    return reply.send(company)
  })

  // Create company with user
  fastify.post('/companies', async (request, reply) => {
    const schema = z.object({
      companyName: z.string().min(1),
      userName: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      plan: z.enum(['free', 'basic', 'pro', 'enterprise']).default('free'),
    })

    const data = schema.parse(request.body)

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      return reply.status(400).send({ error: 'Email ja cadastrado' })
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    const company = await prisma.company.create({
      data: {
        name: data.companyName,
        email: data.email,
        plan: data.plan,
        isActive: true,
        users: {
          create: {
            name: data.userName,
            email: data.email,
            password: hashedPassword,
            role: 'ADMIN',
          },
        },
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return reply.status(201).send(company)
  })

  // Update company
  fastify.put('/companies/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const schema = z.object({
      name: z.string().min(1).optional(),
      plan: z.enum(['free', 'basic', 'pro', 'enterprise']).optional(),
      isActive: z.boolean().optional(),
    })

    const data = schema.parse(request.body)

    const company = await prisma.company.update({
      where: { id },
      data,
    })

    return reply.send(company)
  })

  // Delete company
  fastify.delete('/companies/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    // Delete all related data - need to delete in correct order
    // First get all instances to delete their messages
    const instances = await prisma.instance.findMany({
      where: { companyId: id },
      select: { id: true },
    })

    const instanceIds = instances.map((i) => i.id)

    await prisma.$transaction([
      // Delete messages for all instances
      prisma.message.deleteMany({ where: { instanceId: { in: instanceIds } } }),
      // Delete templates
      prisma.template.deleteMany({ where: { companyId: id } }),
      // Delete campaign contacts
      prisma.campaignContact.deleteMany({ where: { campaign: { companyId: id } } }),
      // Delete campaign instances
      prisma.campaignInstance.deleteMany({ where: { campaign: { companyId: id } } }),
      // Delete campaigns
      prisma.campaign.deleteMany({ where: { companyId: id } }),
      // Delete contacts
      prisma.contact.deleteMany({ where: { companyId: id } }),
      // Delete flow sessions
      prisma.flowSession.deleteMany({ where: { flow: { companyId: id } } }),
      // Delete flow edges
      prisma.flowEdge.deleteMany({ where: { flow: { companyId: id } } }),
      // Delete flow nodes
      prisma.flowNode.deleteMany({ where: { flow: { companyId: id } } }),
      // Delete flows
      prisma.flow.deleteMany({ where: { companyId: id } }),
      // Delete typebot integrations
      prisma.typebotIntegration.deleteMany({ where: { instance: { companyId: id } } }),
      // Delete n8n integrations
      prisma.n8nIntegration.deleteMany({ where: { instance: { companyId: id } } }),
      // Delete instances
      prisma.instance.deleteMany({ where: { companyId: id } }),
      // Delete users
      prisma.user.deleteMany({ where: { companyId: id } }),
      // Delete company
      prisma.company.delete({ where: { id } }),
    ])

    return reply.send({ success: true })
  })

  // List all users
  fastify.get('/users', async (request, reply) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
            plan: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send(users)
  })

  // Update user
  fastify.put('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const schema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
      isActive: z.boolean().optional(),
    })

    const data = schema.parse(request.body)

    const updateData: any = { ...data }
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
    })

    return reply.send(user)
  })

  // Delete user
  fastify.delete('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    await prisma.user.delete({ where: { id } })

    return reply.send({ success: true })
  })

  // Get admin stats
  fastify.get('/stats', async (request, reply) => {
    // Verificacao de sistema
    if (!isSystemOperational()) {
      return reply.status(503).send({ error: 'Sistema indisponivel' })
    }

    const [
      totalCompanies,
      activeCompanies,
      totalUsers,
      totalInstances,
      connectedInstances,
      totalMessages,
      todayMessages,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.company.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.instance.count(),
      prisma.instance.count({ where: { status: 'CONNECTED' } }),
      prisma.message.count(),
      prisma.message.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ])

    return reply.send({
      companies: {
        total: totalCompanies,
        active: activeCompanies,
      },
      users: totalUsers,
      instances: {
        total: totalInstances,
        connected: connectedInstances,
      },
      messages: {
        total: totalMessages,
        today: todayMessages,
      },
    })
  })

  // Check for updates
  fastify.get('/check-update', async (request, reply) => {
    try {
      const axios = (await import('axios')).default
      const response = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        timeout: 10000,
      })

      const latestVersion = response.data.tag_name.replace('v', '')
      const hasUpdate = latestVersion !== CURRENT_VERSION

      return reply.send({
        currentVersion: CURRENT_VERSION,
        latestVersion,
        hasUpdate,
        releaseUrl: response.data.html_url,
        releaseNotes: response.data.body,
        publishedAt: response.data.published_at,
      })
    } catch (error: any) {
      return reply.status(500).send({ error: 'Erro ao verificar atualizacoes', details: error.message })
    }
  })

  // Execute update with SSE (Server-Sent Events) for real-time progress
  // Auth is handled by authMiddleware which accepts token via query parameter for SSE connections
  fastify.get('/execute-update-stream', async (request, reply) => {
    // Set headers for SSE - include headers to prevent nginx buffering
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',  // Disable nginx buffering
    })

    const sendEvent = (step: string, status: 'running' | 'done' | 'error', message: string, details?: string) => {
      const data = JSON.stringify({ step, status, message, details })
      reply.raw.write(`data: ${data}\n\n`)
      // Force flush to ensure data is sent immediately
      if (typeof (reply.raw as any).flush === 'function') {
        (reply.raw as any).flush()
      }
    }

    // Send initial ping to establish connection
    reply.raw.write(':ping\n\n')

    try {
      // Step 1: Git fetch and reset to get latest code (force overwrite local changes)
      sendEvent('git', 'running', 'Baixando atualizacoes do repositorio...')
      try {
        await execAsync('cd /root/whatsapp-manager && git fetch origin main', { timeout: 60000, env: execEnv })
        const { stdout: gitOutput } = await execAsync('cd /root/whatsapp-manager && git reset --hard origin/main', { timeout: 60000, env: execEnv })
        sendEvent('git', 'done', 'Codigo atualizado com sucesso', gitOutput)
      } catch (error: any) {
        sendEvent('git', 'error', 'Erro ao baixar atualizacoes', error.message)
        reply.raw.end()
        return
      }

      // Step 2: Install backend dependencies (include dev for typescript)
      sendEvent('backend', 'running', 'Instalando dependencias do backend...')
      try {
        await execAsync('cd /root/whatsapp-manager/backend && npm install --include=dev', { timeout: 120000, env: execEnv })
        sendEvent('backend', 'done', 'Dependencias do backend instaladas')
      } catch (error: any) {
        sendEvent('backend', 'error', 'Erro ao instalar dependencias do backend', error.message)
        reply.raw.end()
        return
      }

      // Step 3: Build backend
      sendEvent('build-backend', 'running', 'Compilando backend...')
      try {
        await execAsync('cd /root/whatsapp-manager/backend && npm run build', { timeout: 120000, env: execEnv })
        sendEvent('build-backend', 'done', 'Backend compilado com sucesso')
      } catch (error: any) {
        sendEvent('build-backend', 'error', 'Erro ao compilar backend', error.message)
        reply.raw.end()
        return
      }

      // Step 4: Install frontend dependencies
      sendEvent('frontend', 'running', 'Instalando dependencias do frontend...')
      try {
        await execAsync('cd /root/whatsapp-manager/frontend && npm install --include=dev', { timeout: 180000, env: execEnv })
        // Send keepalive ping
        reply.raw.write(':ping\n\n')
      } catch (error: any) {
        sendEvent('frontend', 'error', 'Erro ao instalar dependencias do frontend', error.message)
        reply.raw.end()
        return
      }

      // Step 4b: Build frontend (separate to avoid timeout)
      sendEvent('frontend', 'running', 'Compilando frontend (pode demorar)...')
      try {
        await execAsync('cd /root/whatsapp-manager/frontend && npm run build', { timeout: 600000, env: execEnv })
        sendEvent('frontend', 'done', 'Frontend compilado com sucesso')
      } catch (error: any) {
        sendEvent('frontend', 'error', 'Erro ao compilar frontend', error.message)
        reply.raw.end()
        return
      }

      // Step 5: Restart PM2 services
      // Send complete BEFORE restart because the connection will drop when backend restarts
      sendEvent('restart', 'running', 'Reiniciando servicos...')
      sendEvent('complete', 'done', 'Atualizacao concluida! Reiniciando...')
      reply.raw.end()

      // Restart after a small delay to ensure the response is sent
      setTimeout(async () => {
        try {
          await execAsync('pm2 restart all', { timeout: 30000, env: execEnv })
        } catch (error) {
          console.error('Erro ao reiniciar PM2:', error)
        }
      }, 500)
    } catch (error: any) {
      sendEvent('error', 'error', 'Erro inesperado na atualizacao', error.message)
      reply.raw.end()
    }
  })

  // Keep the old endpoint for backwards compatibility
  fastify.post('/execute-update', async (request, reply) => {
    try {
      // Step 1: Git pull
      const { stdout: gitOutput } = await execAsync('cd /root/whatsapp-manager && git pull origin main', { timeout: 60000, env: execEnv })

      // Step 2: Install backend dependencies
      await execAsync('cd /root/whatsapp-manager/backend && npm install', { timeout: 120000, env: execEnv })

      // Step 3: Build backend
      await execAsync('cd /root/whatsapp-manager/backend && npm run build', { timeout: 120000, env: execEnv })

      // Step 4: Install frontend dependencies and build
      await execAsync('cd /root/whatsapp-manager/frontend && npm install && npm run build', { timeout: 300000, env: execEnv })

      // Step 5: Restart PM2 services
      await execAsync('pm2 restart all', { timeout: 30000, env: execEnv })

      return reply.send({
        success: true,
        message: 'Sistema atualizado com sucesso! Os servicos foram reiniciados.',
        gitOutput,
      })
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: 'Erro ao atualizar sistema',
        details: error.message,
      })
    }
  })

  // Get current version
  fastify.get('/version', async (request, reply) => {
    return reply.send({
      version: CURRENT_VERSION,
      systemOperational: isSystemOperational(),
    })
  })
}
