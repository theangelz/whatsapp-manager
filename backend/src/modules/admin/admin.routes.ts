import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'
import { isSystemOperational } from '../../core/core.wpp.js'

const execAsync = promisify(exec)

// Current version
const CURRENT_VERSION = '2.1.3'
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

  // Execute update
  fastify.post('/execute-update', async (request, reply) => {
    try {
      // Step 1: Git pull
      const { stdout: gitOutput } = await execAsync('cd /root/whatsapp-manager && git pull origin main', { timeout: 60000 })

      // Step 2: Install backend dependencies
      await execAsync('cd /root/whatsapp-manager/backend && npm install', { timeout: 120000 })

      // Step 3: Install frontend dependencies and build
      await execAsync('cd /root/whatsapp-manager/frontend && npm install && npm run build', { timeout: 180000 })

      // Step 4: Restart PM2 services
      await execAsync('pm2 restart all', { timeout: 30000 })

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
