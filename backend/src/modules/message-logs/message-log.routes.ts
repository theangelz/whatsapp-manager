import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../config/database.js'
import { authMiddleware } from '../../middlewares/auth.middleware.js'

export async function messageLogRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware)

  // List message logs
  fastify.get(
    '/',
    async (request: FastifyRequest<{
      Querystring: {
        status?: string
        instanceId?: string
        phoneNumber?: string
        startDate?: string
        endDate?: string
        page?: string
        limit?: string
      }
    }>, reply: FastifyReply) => {
      const {
        status,
        instanceId,
        phoneNumber,
        startDate,
        endDate,
        page = '1',
        limit = '50',
      } = request.query

      const skip = (parseInt(page) - 1) * parseInt(limit)

      const where: any = { companyId: request.user.companyId }

      if (status) {
        where.status = status
      }

      if (instanceId) {
        where.instanceId = instanceId
      }

      if (phoneNumber) {
        where.phoneNumber = { contains: phoneNumber.replace(/\D/g, '') }
      }

      if (startDate || endDate) {
        where.createdAt = {}
        if (startDate) {
          where.createdAt.gte = new Date(startDate)
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate)
        }
      }

      const [logs, total] = await Promise.all([
        prisma.messageLog.findMany({
          where,
          include: {
            instance: { select: { id: true, name: true, channel: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit),
        }),
        prisma.messageLog.count({ where }),
      ])

      return reply.send({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      })
    }
  )

  // Get message log by ID
  fastify.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params

      const log = await prisma.messageLog.findFirst({
        where: { id, companyId: request.user.companyId },
        include: {
          instance: { select: { id: true, name: true, channel: true } },
        },
      })

      if (!log) {
        return reply.status(404).send({ error: 'Log not found' })
      }

      return reply.send(log)
    }
  )

  // Get statistics
  fastify.get(
    '/stats',
    async (request: FastifyRequest<{
      Querystring: { instanceId?: string; startDate?: string; endDate?: string }
    }>, reply: FastifyReply) => {
      const { instanceId, startDate, endDate } = request.query
      const companyId = request.user.companyId

      const where: any = { companyId }

      if (instanceId) {
        where.instanceId = instanceId
      }

      if (startDate || endDate) {
        where.createdAt = {}
        if (startDate) {
          where.createdAt.gte = new Date(startDate)
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate)
        }
      }

      const [
        total,
        queued,
        processing,
        sent,
        delivered,
        read,
        failed,
        cancelled,
      ] = await Promise.all([
        prisma.messageLog.count({ where }),
        prisma.messageLog.count({ where: { ...where, status: 'QUEUED' } }),
        prisma.messageLog.count({ where: { ...where, status: 'PROCESSING' } }),
        prisma.messageLog.count({ where: { ...where, status: 'SENT' } }),
        prisma.messageLog.count({ where: { ...where, status: 'DELIVERED' } }),
        prisma.messageLog.count({ where: { ...where, status: 'READ' } }),
        prisma.messageLog.count({ where: { ...where, status: 'FAILED' } }),
        prisma.messageLog.count({ where: { ...where, status: 'CANCELLED' } }),
      ])

      // Calculate success rate
      const successCount = sent + delivered + read
      const attemptedCount = successCount + failed
      const successRate = attemptedCount > 0 ? (successCount / attemptedCount) * 100 : 0

      // Get average processing time
      const avgProcessingTime = await prisma.messageLog.aggregate({
        where: {
          ...where,
          processingTimeMs: { not: null },
        },
        _avg: { processingTimeMs: true },
      })

      // Get today's stats
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const todayWhere = {
        ...where,
        createdAt: { gte: today },
      }

      const [todayTotal, todaySent, todayFailed] = await Promise.all([
        prisma.messageLog.count({ where: todayWhere }),
        prisma.messageLog.count({ where: { ...todayWhere, status: { in: ['SENT', 'DELIVERED', 'READ'] } } }),
        prisma.messageLog.count({ where: { ...todayWhere, status: 'FAILED' } }),
      ])

      // Get by instance breakdown
      const byInstance = await prisma.messageLog.groupBy({
        by: ['instanceId', 'status'],
        where,
        _count: true,
      })

      // Get instances for names
      const instanceIds = [...new Set(byInstance.map((i) => i.instanceId))]
      const instances = await prisma.instance.findMany({
        where: { id: { in: instanceIds } },
        select: { id: true, name: true },
      })

      const instanceMap = new Map(instances.map((i) => [i.id, i.name]))

      const instanceBreakdown = byInstance.reduce((acc, item) => {
        const instanceName = instanceMap.get(item.instanceId) || 'Unknown'
        if (!acc[instanceName]) {
          acc[instanceName] = { total: 0 }
        }
        acc[instanceName][item.status] = item._count
        acc[instanceName].total += item._count
        return acc
      }, {} as Record<string, Record<string, number>>)

      return reply.send({
        total,
        byStatus: {
          queued,
          processing,
          sent,
          delivered,
          read,
          failed,
          cancelled,
        },
        successRate: Math.round(successRate * 100) / 100,
        avgProcessingTimeMs: Math.round(avgProcessingTime._avg.processingTimeMs || 0),
        today: {
          total: todayTotal,
          sent: todaySent,
          failed: todayFailed,
        },
        byInstance: instanceBreakdown,
      })
    }
  )

  // Get hourly stats for chart
  fastify.get(
    '/stats/hourly',
    async (request: FastifyRequest<{
      Querystring: { instanceId?: string; date?: string }
    }>, reply: FastifyReply) => {
      const { instanceId, date } = request.query
      const companyId = request.user.companyId

      const targetDate = date ? new Date(date) : new Date()
      targetDate.setHours(0, 0, 0, 0)

      const nextDate = new Date(targetDate)
      nextDate.setDate(nextDate.getDate() + 1)

      const where: any = {
        companyId,
        createdAt: {
          gte: targetDate,
          lt: nextDate,
        },
      }

      if (instanceId) {
        where.instanceId = instanceId
      }

      const logs = await prisma.messageLog.findMany({
        where,
        select: { createdAt: true, status: true },
      })

      // Group by hour
      const hourlyData: Record<number, { sent: number; failed: number }> = {}
      for (let i = 0; i < 24; i++) {
        hourlyData[i] = { sent: 0, failed: 0 }
      }

      for (const log of logs) {
        const hour = log.createdAt.getHours()
        if (['SENT', 'DELIVERED', 'READ'].includes(log.status)) {
          hourlyData[hour].sent++
        } else if (log.status === 'FAILED') {
          hourlyData[hour].failed++
        }
      }

      return reply.send({
        date: targetDate.toISOString().split('T')[0],
        hourly: Object.entries(hourlyData).map(([hour, data]) => ({
          hour: parseInt(hour),
          ...data,
        })),
      })
    }
  )

  // Get recent errors
  fastify.get(
    '/errors',
    async (request: FastifyRequest<{
      Querystring: { instanceId?: string; limit?: string }
    }>, reply: FastifyReply) => {
      const { instanceId, limit = '20' } = request.query

      const where: any = {
        companyId: request.user.companyId,
        status: 'FAILED',
        errorMessage: { not: null },
      }

      if (instanceId) {
        where.instanceId = instanceId
      }

      const errors = await prisma.messageLog.findMany({
        where,
        select: {
          id: true,
          phoneNumber: true,
          errorMessage: true,
          failedAt: true,
          instance: { select: { id: true, name: true } },
        },
        orderBy: { failedAt: 'desc' },
        take: parseInt(limit),
      })

      // Group by error type
      const errorTypes: Record<string, number> = {}
      for (const error of errors) {
        const errorKey = error.errorMessage?.substring(0, 50) || 'Unknown'
        errorTypes[errorKey] = (errorTypes[errorKey] || 0) + 1
      }

      return reply.send({
        recentErrors: errors,
        errorTypes: Object.entries(errorTypes)
          .sort((a, b) => b[1] - a[1])
          .map(([error, count]) => ({ error, count })),
      })
    }
  )

  // Export logs
  fastify.get(
    '/export',
    async (request: FastifyRequest<{
      Querystring: {
        instanceId?: string
        status?: string
        startDate?: string
        endDate?: string
        format?: string
      }
    }>, reply: FastifyReply) => {
      const { instanceId, status, startDate, endDate, format = 'json' } = request.query

      const where: any = { companyId: request.user.companyId }

      if (instanceId) {
        where.instanceId = instanceId
      }

      if (status) {
        where.status = status
      }

      if (startDate || endDate) {
        where.createdAt = {}
        if (startDate) {
          where.createdAt.gte = new Date(startDate)
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate)
        }
      }

      const logs = await prisma.messageLog.findMany({
        where,
        include: {
          instance: { select: { name: true, channel: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10000, // Limit export
      })

      if (format === 'csv') {
        const header = [
          'id',
          'phoneNumber',
          'instance',
          'channel',
          'status',
          'messageContent',
          'sentAt',
          'failedAt',
          'errorMessage',
          'processingTimeMs',
          'createdAt',
        ].join(',')

        const rows = logs.map((log) => [
          log.id,
          log.phoneNumber,
          log.instance.name,
          log.instance.channel,
          log.status,
          `"${log.messageContent.replace(/"/g, '""')}"`,
          log.sentAt?.toISOString() || '',
          log.failedAt?.toISOString() || '',
          log.errorMessage || '',
          log.processingTimeMs || '',
          log.createdAt.toISOString(),
        ].join(','))

        const csv = [header, ...rows].join('\n')

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', 'attachment; filename="message-logs.csv"')
          .send(csv)
      }

      return reply.send(logs)
    }
  )
}
