import { redis } from '../config/redis.js'
import { prisma } from '../config/database.js'

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

// Limites por tipo de canal (mensagens por segundo)
const CHANNEL_LIMITS: Record<string, RateLimitConfig> = {
  CLOUD_API: { windowMs: 1000, maxRequests: 80 },
  COEXISTENCE: { windowMs: 1000, maxRequests: 20 },
  BAILEYS: { windowMs: 1000, maxRequests: 100 }, // Sem limite oficial, mas evita abuse
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  retryAfterMs?: number
}

/**
 * Verifica rate limit para uma instância usando sliding window com Redis
 * @param instanceId ID da instância
 * @returns Objeto com allowed, remaining e limit
 */
export async function checkRateLimit(instanceId: string): Promise<RateLimitResult> {
  try {
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
      select: { channel: true }
    })

    if (!instance) {
      return { allowed: true, remaining: 0, limit: 0 }
    }

    const config = CHANNEL_LIMITS[instance.channel] || CHANNEL_LIMITS.CLOUD_API
    const maxRequests = config.maxRequests

    const key = `rate_limit:msg:${instanceId}`
    const now = Date.now()
    const windowStart = now - config.windowMs

    // Pipeline Redis para operações atômicas
    const pipeline = redis.pipeline()

    // Remove entradas fora da janela
    pipeline.zremrangebyscore(key, 0, windowStart)

    // Conta entradas na janela
    pipeline.zcard(key)

    const results = await pipeline.exec()

    if (!results) {
      return { allowed: true, remaining: maxRequests, limit: maxRequests }
    }

    const currentCount = (results[1]?.[1] as number) || 0

    if (currentCount >= maxRequests) {
      // Calcula tempo até próxima janela
      const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES')
      const oldestTimestamp = oldestEntry.length >= 2 ? parseInt(oldestEntry[1]) : now
      const retryAfterMs = Math.max(0, (oldestTimestamp + config.windowMs) - now)

      return {
        allowed: false,
        remaining: 0,
        limit: maxRequests,
        retryAfterMs
      }
    }

    // Adiciona nova entrada
    await redis.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`)
    await redis.expire(key, Math.ceil(config.windowMs / 1000) + 1)

    return {
      allowed: true,
      remaining: maxRequests - currentCount - 1,
      limit: maxRequests
    }
  } catch (error) {
    console.error('[RateLimit] Error checking rate limit:', error)
    // Em caso de erro, permite a requisição para não bloquear
    return { allowed: true, remaining: 0, limit: 0 }
  }
}

/**
 * Obtém informações de rate limit para uma instância (para exibição na UI)
 * @param instanceId ID da instância
 */
export async function getRateLimitInfo(instanceId: string): Promise<{
  channel: string
  maxMps: number
  currentUsage: number
  remaining: number
  windowMs: number
  isThrottled: boolean
  limitations: Record<string, string> | null
}> {
  try {
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
      select: { channel: true }
    })

    if (!instance) {
      throw new Error('Instance not found')
    }

    const config = CHANNEL_LIMITS[instance.channel] || CHANNEL_LIMITS.CLOUD_API
    const key = `rate_limit:msg:${instanceId}`
    const now = Date.now()
    const windowStart = now - config.windowMs

    // Remove entradas antigas e conta
    await redis.zremrangebyscore(key, 0, windowStart)
    const currentUsage = await redis.zcard(key)

    const limitations = instance.channel === 'COEXISTENCE' ? {
      throughput: '20 MPS (vs 80 MPS Cloud API normal)',
      webhooks: 'Mensagens do App NAO chegam nos webhooks',
      verification: 'Sem selo azul (OBA nao suportado)',
      devices: 'App, WhatsApp Web (browser), Mac. NAO suporta Windows',
      billing: 'Mensagens via App/Web = gratis, via API = cobra'
    } : null

    return {
      channel: instance.channel,
      maxMps: config.maxRequests,
      currentUsage,
      remaining: Math.max(0, config.maxRequests - currentUsage),
      windowMs: config.windowMs,
      isThrottled: currentUsage >= config.maxRequests,
      limitations
    }
  } catch (error) {
    console.error('[RateLimit] Error getting rate limit info:', error)
    throw error
  }
}

/**
 * Reseta o rate limit de uma instância (para testes ou admin)
 * @param instanceId ID da instância
 */
export async function resetRateLimit(instanceId: string): Promise<void> {
  const key = `rate_limit:msg:${instanceId}`
  await redis.del(key)
}
