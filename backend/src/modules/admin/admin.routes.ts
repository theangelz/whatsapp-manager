import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'

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
}
