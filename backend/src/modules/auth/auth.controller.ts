import { FastifyRequest, FastifyReply } from 'fastify'
import { AuthService } from './auth.service.js'
import { registerSchema, loginSchema } from './auth.schemas.js'

const authService = new AuthService()

export class AuthController {
  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = registerSchema.parse(request.body)
      const result = await authService.register(data)

      const token = await reply.jwtSign(
        {
          sub: result.user.id,
          companyId: result.company.id,
          role: result.user.role,
        },
        { expiresIn: '7d' }
      )

      return reply.status(201).send({
        user: result.user,
        company: result.company,
        token,
      })
    } catch (error: any) {
      if (error.message === 'Email already registered') {
        return reply.status(409).send({ error: error.message })
      }
      return reply.status(400).send({ error: error.message })
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = loginSchema.parse(request.body)
      const result = await authService.login(data)

      const token = await reply.jwtSign(
        {
          sub: result.user.id,
          companyId: result.company.id,
          role: result.user.role,
        },
        { expiresIn: '7d' }
      )

      return reply.send({
        user: result.user,
        company: result.company,
        token,
      })
    } catch (error: any) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }
  }

  async profile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const profile = await authService.getProfile(request.user.id)
      return reply.send(profile)
    } catch (error: any) {
      return reply.status(404).send({ error: error.message })
    }
  }
}
