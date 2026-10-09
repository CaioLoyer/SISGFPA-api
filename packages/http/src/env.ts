import z from 'zod'

/** Variáveis comuns a todos os apps HTTP. Cada app estende este schema com as suas. */
export const commonEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TRUSTED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
})

/** Valida `process.env` e interrompe com mensagem clara em vez de falhar adiante com valores `undefined`. */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env
): z.output<T> {
  const result = schema.safeParse(source)
  if (!result.success) {
    const detalhes = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Variáveis de ambiente inválidas: ${detalhes}`)
  }
  return result.data
}
