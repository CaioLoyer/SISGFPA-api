import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifySwagger from '@fastify/swagger'
import ScalarApiReference from '@scalar/fastify-api-reference'
import Fastify, { type FastifyInstance } from 'fastify'
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { registerErrorHandling } from './error-handler.js'

export interface CreateAppOptions {
  title: string
  description: string
  /** URL pública do servidor (aparece no OpenAPI/Scalar). */
  serverUrl: string
  trustedOrigins: string[]
  rateLimitMax: number
  /** `false` desliga o logger (testes). */
  logger?: boolean
}

/**
 * Cria a instância Fastify com tudo o que API e Chatbot têm em comum:
 * validação Zod, tratamento de erros, rate limit, CORS e documentação (Swagger + Scalar em /docs).
 * Cada app só registra as suas rotas depois.
 */
export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] },
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandling(app)
  // `request.user` é preenchido pelo hook requireAuth (nulo até lá).
  app.decorateRequest('user', null as never)

  await app.register(fastifyRateLimit, { max: options.rateLimitMax, timeWindow: '1 minute' })
  await app.register(fastifyCors, { origin: options.trustedOrigins, credentials: true })

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: options.title, description: options.description, version: '1.0.0' },
      servers: [{ description: 'Servidor local', url: options.serverUrl }],
    },
    transform: jsonSchemaTransform,
  })

  await app.register(ScalarApiReference, {
    routePrefix: '/docs',
    configuration: {
      theme: 'elysiajs',
      sources: [{ title: options.title, slug: 'openapi', url: '/swagger.json' }],
    },
  })

  app.get('/swagger.json', { schema: { hide: true } }, async () => app.swagger())

  return app
}

/** Sobe o servidor e encerra o processo com log em caso de falha. */
export async function startServer(app: FastifyInstance, port: number) {
  try {
    await app.listen({ host: '0.0.0.0', port })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}
