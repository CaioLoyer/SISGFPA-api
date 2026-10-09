import 'dotenv/config'

import { commonEnvSchema, parseEnv } from '@sisgfpa/http'
import z from 'zod'

/** Configuração do Chatbot (validada na inicialização). */
export const env = parseEnv(
  commonEnvSchema.extend({
    CHATBOT_PORT: z.coerce.number().int().positive().default(3001),
    // Único canal do Chatbot para o domínio financeiro: HTTP/REST.
    FINANCIAL_API_URL: z.url().default('http://localhost:8080'),
  })
)
