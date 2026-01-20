import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'

const createContactSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().min(10),
  email: z.string().email().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
})

const updateContactSchema = createContactSchema.partial()

const importContactsSchema = z.object({
  contacts: z.array(z.object({
    name: z.string().min(1),
    phoneNumber: z.string().min(10),
    email: z.string().email().optional(),
    tags: z.array(z.string()).optional(),
  })),
})

export async function contactRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // List contacts
  fastify.get('/', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string; tag?: string } }>, reply: FastifyReply) => {
    const page = parseInt(request.query.page || '1')
    const limit = parseInt(request.query.limit || '50')
    const search = request.query.search
    const tag = request.query.tag

    const where: any = {
      companyId: request.user.companyId,
      isActive: true,
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (tag) {
      where.tags = { has: tag }
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ])

    return reply.send({
      contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  })

  // Get contact by ID
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const contact = await prisma.contact.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' })
    }

    return reply.send(contact)
  })

  // Create contact
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = createContactSchema.parse(request.body)

    const existingContact = await prisma.contact.findFirst({
      where: {
        companyId: request.user.companyId,
        phoneNumber: data.phoneNumber,
      },
    })

    if (existingContact) {
      return reply.status(409).send({ error: 'Contact with this phone number already exists' })
    }

    const contact = await prisma.contact.create({
      data: {
        ...data,
        companyId: request.user.companyId,
        tags: data.tags || [],
      },
    })

    return reply.status(201).send(contact)
  })

  // Update contact
  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const data = updateContactSchema.parse(request.body)

    const contact = await prisma.contact.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' })
    }

    const updated = await prisma.contact.update({
      where: { id },
      data,
    })

    return reply.send(updated)
  })

  // Delete contact
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const contact = await prisma.contact.findFirst({
      where: { id, companyId: request.user.companyId },
    })

    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' })
    }

    await prisma.contact.update({
      where: { id },
      data: { isActive: false },
    })

    return reply.status(204).send()
  })

  // Import contacts (CSV format)
  fastify.post('/import', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = importContactsSchema.parse(request.body)

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    }

    for (const contactData of data.contacts) {
      try {
        const existingContact = await prisma.contact.findFirst({
          where: {
            companyId: request.user.companyId,
            phoneNumber: contactData.phoneNumber,
          },
        })

        if (existingContact) {
          results.skipped++
          continue
        }

        await prisma.contact.create({
          data: {
            ...contactData,
            companyId: request.user.companyId,
            tags: contactData.tags || [],
          },
        })

        results.imported++
      } catch (error: any) {
        results.errors.push(`${contactData.phoneNumber}: ${error.message}`)
      }
    }

    return reply.send(results)
  })

  // Get all tags
  fastify.get('/tags/all', async (request: FastifyRequest, reply: FastifyReply) => {
    const contacts = await prisma.contact.findMany({
      where: { companyId: request.user.companyId, isActive: true },
      select: { tags: true },
    })

    const allTags = new Set<string>()
    contacts.forEach((c) => c.tags.forEach((t) => allTags.add(t)))

    return reply.send(Array.from(allTags).sort())
  })
}
