import { requireAdmin, responses } from '@sisgfpa/http'
import { CreateFuncionarioBodySchema, CreateFuncionarioResponseSchema } from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { criarFuncionario } from './usuarios.service.js'

/** Operações administrativas de usuários. */
export const usuariosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.post(
    '/funcionarios',
    {
      schema: {
        tags: ['Usuários'],
        summary: 'Cadastrar funcionário (somente ADMIN)',
        description:
          'Cria uma conta FUNCIONARIO usando o Better Auth. O tipo é definido pelo servidor e não pode ser informado pelo cliente.',
        body: CreateFuncionarioBodySchema,
        response: responses({ 201: CreateFuncionarioResponseSchema }, 400, 401, 403, 409),
      },
    },
    async (request, reply) => {
      const funcionario = await criarFuncionario(request.body, request.headers)
      return reply.code(201).send(funcionario)
    }
  )
}
