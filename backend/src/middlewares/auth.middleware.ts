import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../config/database.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      companyId: string
      role: string
    }
    user: {
      id: string
      companyId: string
      role: string
    }
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    // First try standard JWT verification from Authorization header
    await request.jwtVerify()
  } catch (err) {
    // Fallback: try token from query parameter (for SSE connections)
    const queryToken = (request.query as any)?.token
    if (queryToken) {
      try {
        const decoded = request.server.jwt.verify(queryToken) as any
        // Manually set the user on the request
        request.user = {
          id: decoded.sub,
          companyId: decoded.companyId,
          role: decoded.role,
          sub: decoded.sub,
        } as any
        return // Authentication successful via query token
      } catch {
        // Token verification failed
      }
    }
    reply.status(401).send({ error: 'Unauthorized' })
  }
}

export async function adminMiddleware(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== 'ADMIN') {
    reply.status(403).send({ error: 'Forbidden - Admin access required' })
  }
}

export async function apiTokenMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiToken = request.headers['x-api-token'] as string

  if (!apiToken) {
    reply.status(401).send({ error: 'API token required' })
    return
  }

  const instance = await prisma.instance.findUnique({
    where: { apiToken },
    include: { company: true }
  })

  if (!instance || !instance.isActive) {
    reply.status(401).send({ error: 'Invalid API token' })
    return
  }

  request.instance = instance
}

declare module 'fastify' {
  interface FastifyRequest {
    instance?: {
      id: string
      companyId: string
      name: string
      channel: string
      status: string
      company: {
        id: string
        name: string
      }
    }
  }
}
