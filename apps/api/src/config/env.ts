import 'dotenv/config'

import { join, resolve } from 'node:path'

import { commonEnvSchema, parseEnv } from '@sisgfpa/http'
import z from 'zod'

/** Configuração da API Financeira (validada na inicialização). */
export const env = parseEnv(
  commonEnvSchema.extend({
    PORT: z.coerce.number().int().positive().default(8080),
  })
)

export function getBetterAuthSecret(): string {
  return parseEnv(z.object({ BETTER_AUTH_SECRET: z.string().trim().min(1) })).BETTER_AUTH_SECRET
}

export function getProfileImageStorageDirectory(): string {
  const storage = parseEnv(
    z.object({ PROFILE_IMAGE_STORAGE_DIR: z.string().trim().min(1).optional() })
  ).PROFILE_IMAGE_STORAGE_DIR
  return resolve(storage ?? join(process.cwd(), '.data', 'profile-images'))
}
