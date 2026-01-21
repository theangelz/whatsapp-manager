import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3333),
  FRONTEND_URL: z.string().default('http://localhost:5454'),
  BACKEND_URL: z.string().default('http://localhost:3333'),

  DATABASE_URL: z.string(),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),

  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('7d'),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_BUSINESS_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_API_VERSION: z.string().default('v18.0'),

  TYPEBOT_API_URL: z.string().optional(),
  TYPEBOT_API_KEY: z.string().optional(),

  N8N_WEBHOOK_URL: z.string().optional(),

  BAILEYS_SESSIONS_PATH: z.string().default('./sessions'),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('Invalid environment variables:', _env.error.format())
  throw new Error('Invalid environment variables')
}

export const env = _env.data
