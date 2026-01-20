import { FastifyInstance } from 'fastify'
import { AuthController } from './auth.controller.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'

const controller = new AuthController()

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', controller.register.bind(controller))
  fastify.post('/login', controller.login.bind(controller))
  fastify.get('/profile', { preHandler: [authMiddleware] }, controller.profile.bind(controller))
}
