import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../config/database.js'
import { authMiddleware, adminMiddleware } from '../../middlewares/auth.middleware.js'

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'OPERATOR']).default('OPERATOR'),
})

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'OPERATOR']).optional(),
  isActive: z.boolean().optional(),
})

export async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const users = await prisma.user.findMany({
      where: { companyId: request.user.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })
    return reply.send(users)
  })

  fastify.post('/', { preHandler: [adminMiddleware] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = createUserSchema.parse(request.body)

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      return reply.status(409).send({ error: 'Email already registered' })
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
        companyId: request.user.companyId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })

    return reply.status(201).send(user)
  })

  fastify.put<{ Params: { id: string } }>('/:id', { preHandler: [adminMiddleware] }, async (request, reply) => {
    const { id } = request.params
    const data = updateUserSchema.parse(request.body)

    const user = await prisma.user.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    const updateData: any = { ...data }
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10)
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })

    return reply.send(updatedUser)
  })

  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: [adminMiddleware] }, async (request, reply) => {
    const { id } = request.params

    if (id === request.user.id) {
      return reply.status(400).send({ error: 'Cannot delete yourself' })
    }

    const user = await prisma.user.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    await prisma.user.delete({ where: { id } })

    return reply.status(204).send()
  })
}
