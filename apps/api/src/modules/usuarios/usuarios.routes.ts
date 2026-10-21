import { requireAdmin, responses } from '@sisgfpa/http'
import {
  CreateFuncionarioBodySchema,
  CreateFuncionarioResponseSchema,
  FuncionarioParamsSchema,
  FuncionarioPermissoesResponseSchema,
  ListFuncionariosResponseSchema,
  UpdateFuncionarioPermissoesBodySchema,
} from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { atualizarPermissoesFuncionario, listarFuncionarios } from './permissoes.service.js'
import { criarFuncionario } from './usuarios.service.js'

/** Operações administrativas de usuários. */
export const usuariosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get(
    '/funcionarios',
    {
      schema: {
        tags: ['Usuários'],
        summary: 'Listar funcionários e permissões (somente ADMIN)',
        response: responses({ 200: ListFuncionariosResponseSchema }, 401, 403),
      },
    },
    async () => listarFuncionarios()
  )

  app.patch(
    '/funcionarios/:id/permissoes',
    {
      schema: {
        tags: ['Usuários'],
        summary: 'Alterar permissões de um funcionário (somente ADMIN)',
        params: FuncionarioParamsSchema,
        body: UpdateFuncionarioPermissoesBodySchema,
        response: responses({ 200: FuncionarioPermissoesResponseSchema }, 400, 401, 403, 404),
      },
    },
    async (request) => atualizarPermissoesFuncionario(request.params.id, request.user.id, request.body)
  )

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
