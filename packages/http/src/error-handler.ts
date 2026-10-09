import type { FastifyError, FastifyInstance } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'

import { AppError } from './errors.js'

/**
 * Tratamento de erros único das aplicações, sempre no formato `{ error, code }`:
 * erros de domínio (AppError), validação Zod, erros 4xx do Fastify (ex.: rate limit) e inesperados (500).
 */
export function registerErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: 'Rota não encontrada', code: 'NOT_FOUND' })
  })

  app.setErrorHandler((error: FastifyError | AppError, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.message, code: error.code })
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const detalhes = error.validation.map((v) => `${v.instancePath || '/'} ${v.message}`).join('; ')
      return reply.status(400).send({ error: `Dados inválidos: ${detalhes}`, code: 'VALIDATION_ERROR' })
    }

    const status = error.statusCode ?? 500
    if (status < 500) {
      return reply.status(status).send({ error: error.message, code: error.code ?? 'REQUEST_ERROR' })
    }

    app.log.error(error)
    return reply.status(500).send({ error: 'Erro interno do servidor', code: 'INTERNAL_SERVER_ERROR' })
  })
}
