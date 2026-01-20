import { Redis } from 'ioredis'
import { env } from './env.js'

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
})

redis.on('connect', () => {
  console.log('Redis connected')
})

redis.on('error', (err: Error) => {
  console.error('Redis error:', err)
})
