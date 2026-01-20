import bcrypt from 'bcryptjs'
import { prisma } from '../../config/database.js'
import { RegisterInput, LoginInput } from './auth.schemas.js'

export class AuthService {
  async register(data: RegisterInput) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new Error('Email already registered')
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    const company = await prisma.company.create({
      data: {
        name: data.companyName,
        email: data.email,
        users: {
          create: {
            name: data.name,
            email: data.email,
            password: hashedPassword,
            role: 'ADMIN',
          },
        },
      },
      include: {
        users: true,
      },
    })

    const user = company.users[0]

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      company: {
        id: company.id,
        name: company.name,
      },
    }
  }

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { company: true },
    })

    if (!user || !user.isActive) {
      throw new Error('Invalid credentials')
    }

    const isValidPassword = await bcrypt.compare(data.password, user.password)

    if (!isValidPassword) {
      throw new Error('Invalid credentials')
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
      company: {
        id: user.company.id,
        name: user.company.name,
      },
    }
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    })

    if (!user) {
      throw new Error('User not found')
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      company: {
        id: user.company.id,
        name: user.company.name,
        plan: user.company.plan,
      },
    }
  }
}
