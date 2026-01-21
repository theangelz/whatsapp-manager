import { redis } from '../config/redis.js'
import { InstanceChannel } from '@prisma/client'

export const RATE_LIMIT = {
  BAILEYS: {
    MIN_DELAY_MS: 30000,      // 30 seconds
    MAX_DELAY_MS: 60000,      // 60 seconds
    MESSAGES_PER_MINUTE: 2,
    MESSAGES_PER_HOUR: 60,
  },
  CLOUD_API: {
    MIN_DELAY_MS: 1000,       // 1 second
    MAX_DELAY_MS: 5000,       // 5 seconds
    MESSAGES_PER_MINUTE: 30,
    MESSAGES_PER_HOUR: 1000,  // Cloud API is more permissive
  },
} as const

export interface RateLimitResult {
  allowed: boolean
  waitTimeMs: number
  reason?: string
  currentMinuteCount: number
  currentHourCount: number
}

export class RateLimiterService {
  private getMinuteKey(instanceId: string): string {
    const minute = Math.floor(Date.now() / 60000)
    return `rate:minute:${instanceId}:${minute}`
  }

  private getHourKey(instanceId: string): string {
    const hour = Math.floor(Date.now() / 3600000)
    return `rate:hour:${instanceId}:${hour}`
  }

  private getLastSendKey(instanceId: string): string {
    return `rate:lastsend:${instanceId}`
  }

  /**
   * Check if sending is allowed based on rate limits
   */
  async checkRateLimit(instanceId: string, channel: InstanceChannel): Promise<RateLimitResult> {
    const limits = RATE_LIMIT[channel]

    const minuteKey = this.getMinuteKey(instanceId)
    const hourKey = this.getHourKey(instanceId)
    const lastSendKey = this.getLastSendKey(instanceId)

    // Get current counts and last send time
    const [minuteCount, hourCount, lastSendStr] = await Promise.all([
      redis.get(minuteKey),
      redis.get(hourKey),
      redis.get(lastSendKey),
    ])

    const currentMinuteCount = parseInt(minuteCount || '0', 10)
    const currentHourCount = parseInt(hourCount || '0', 10)
    const lastSendTime = parseInt(lastSendStr || '0', 10)

    // Check minute limit
    if (currentMinuteCount >= limits.MESSAGES_PER_MINUTE) {
      const nextMinuteMs = (Math.floor(Date.now() / 60000) + 1) * 60000 - Date.now()
      return {
        allowed: false,
        waitTimeMs: nextMinuteMs,
        reason: `Limite por minuto atingido (${limits.MESSAGES_PER_MINUTE}/min)`,
        currentMinuteCount,
        currentHourCount,
      }
    }

    // Check hour limit
    if (currentHourCount >= limits.MESSAGES_PER_HOUR) {
      const nextHourMs = (Math.floor(Date.now() / 3600000) + 1) * 3600000 - Date.now()
      return {
        allowed: false,
        waitTimeMs: nextHourMs,
        reason: `Limite por hora atingido (${limits.MESSAGES_PER_HOUR}/hora)`,
        currentMinuteCount,
        currentHourCount,
      }
    }

    // Check minimum delay between messages
    const timeSinceLastSend = Date.now() - lastSendTime
    if (lastSendTime > 0 && timeSinceLastSend < limits.MIN_DELAY_MS) {
      const waitTimeMs = limits.MIN_DELAY_MS - timeSinceLastSend
      return {
        allowed: false,
        waitTimeMs,
        reason: `Aguarde ${Math.ceil(waitTimeMs / 1000)}s entre envios`,
        currentMinuteCount,
        currentHourCount,
      }
    }

    return {
      allowed: true,
      waitTimeMs: 0,
      currentMinuteCount,
      currentHourCount,
    }
  }

  /**
   * Record a message send (call after successful send)
   */
  async recordSend(instanceId: string, channel: InstanceChannel): Promise<void> {
    const minuteKey = this.getMinuteKey(instanceId)
    const hourKey = this.getHourKey(instanceId)
    const lastSendKey = this.getLastSendKey(instanceId)

    await Promise.all([
      // Increment minute counter (expires in 60 seconds)
      redis.incr(minuteKey),
      redis.expire(minuteKey, 60),

      // Increment hour counter (expires in 1 hour)
      redis.incr(hourKey),
      redis.expire(hourKey, 3600),

      // Update last send time
      redis.set(lastSendKey, Date.now().toString()),
      redis.expire(lastSendKey, 3600),
    ])
  }

  /**
   * Get current rate limit status for an instance
   */
  async getStatus(instanceId: string, channel: InstanceChannel) {
    const limits = RATE_LIMIT[channel]
    const minuteKey = this.getMinuteKey(instanceId)
    const hourKey = this.getHourKey(instanceId)
    const lastSendKey = this.getLastSendKey(instanceId)

    const [minuteCount, hourCount, lastSendStr] = await Promise.all([
      redis.get(minuteKey),
      redis.get(hourKey),
      redis.get(lastSendKey),
    ])

    const currentMinuteCount = parseInt(minuteCount || '0', 10)
    const currentHourCount = parseInt(hourCount || '0', 10)
    const lastSendTime = parseInt(lastSendStr || '0', 10)

    return {
      channel,
      limits,
      currentMinuteCount,
      currentHourCount,
      lastSendTime: lastSendTime ? new Date(lastSendTime) : null,
      minuteRemaining: limits.MESSAGES_PER_MINUTE - currentMinuteCount,
      hourRemaining: limits.MESSAGES_PER_HOUR - currentHourCount,
    }
  }

  /**
   * Calculate optimal delay for next send
   */
  getOptimalDelay(channel: InstanceChannel): number {
    const limits = RATE_LIMIT[channel]
    // Use a random delay between min and max to appear more natural
    return limits.MIN_DELAY_MS + Math.random() * (limits.MAX_DELAY_MS - limits.MIN_DELAY_MS)
  }

  /**
   * Reset rate limits for an instance (for testing/admin)
   */
  async reset(instanceId: string): Promise<void> {
    const minuteKey = this.getMinuteKey(instanceId)
    const hourKey = this.getHourKey(instanceId)
    const lastSendKey = this.getLastSendKey(instanceId)

    await Promise.all([
      redis.del(minuteKey),
      redis.del(hourKey),
      redis.del(lastSendKey),
    ])
  }
}

export const rateLimiterService = new RateLimiterService()
