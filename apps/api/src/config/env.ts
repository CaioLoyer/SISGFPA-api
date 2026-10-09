import 'dotenv/config'

import { commonEnvSchema, parseEnv } from '@sisgfpa/http'
import z from 'zod'

/** Configuração da API Financeira (validada na inicialização). */
export const env = parseEnv(
  commonEnvSchema.extend({
    PORT: z.coerce.number().int().positive().default(8080),
  })
)
