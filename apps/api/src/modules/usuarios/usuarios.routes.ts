import { requireAdmin, requireAuth, responses } from '@sisgfpa/http'
import {
  CreateFuncionarioBodySchema,
  CreateFuncionarioResponseSchema,
  ConcluirRedefinicaoSenhaBodySchema,
  DecidirSolicitacaoRedefinicaoSenhaBodySchema,
  FuncionarioParamsSchema,
  FuncionarioPermissoesResponseSchema,
  ListSolicitacoesRedefinicaoSenhaResponseSchema,
  ListFuncionariosResponseSchema,
  ListUsuariosAdministracaoResponseSchema,
  PromoverFuncionarioResponseSchema,
  ResultadoRedefinicaoSenhaSchema,
  SolicitacaoRedefinicaoSenhaParamsSchema,
  SolicitacaoRedefinicaoSenhaSchema,
  UpdateFuncionarioPermissoesBodySchema,
  PermissoesEfetivasSchema,
} from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { atualizarPermissoesFuncionario, listarFuncionarios } from './permissoes.service.js'
import {
  consultarMinhaRedefinicaoSenha,
  concluirRedefinicaoSenha,
  decidirSolicitacaoRedefinicaoSenha,
  listarSolicitacoesRedefinicaoSenha,
  solicitarRedefinicaoSenha,
} from './redefinicao-senha.service.js'
import { criarFuncionario, listarContasAdministrativas, promoverFuncionario } from './usuarios.service.js'
import { permissoesDaRequisicao } from '../../authorization/module-permissions.js'

/** Operações administrativas de usuários. */
export const usuariosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.get(
    '/me/permissoes',
    {
      schema: {
        tags: ['Usuários'],
        summary: 'Consultar as próprias permissões efetivas',
        response: responses({ 200: PermissoesEfetivasSchema }, 401),
      },
    },
    async (request) => permissoesDaRequisicao(request)
  )

  app.post(
    '/me/redefinicao-senha',
    {
      schema: {
        tags: ['Usuários'],
        summary: 'Solicitar redefinição de senha ao ADMIN',
        description:
          'Cria um pedido limitado no tempo, vinculado à sessão atual. Cadastro público permanece fechado.',
        response: responses({ 201: SolicitacaoRedefinicaoSenhaSchema }, 401, 409),
      },
    },
    async (request, reply) => reply.code(201).send(await solicitarRedefinicaoSenha(request.headers))
  )

  app.get(
    '/me/redefinicao-senha',
    {
      schema: {
        tags: ['Usuários'],
        summary: 'Consultar o próprio pedido de redefinição de senha',
        response: responses({ 200: SolicitacaoRedefinicaoSenhaSchema.nullable() }, 401),
      },
    },
    async (request) => consultarMinhaRedefinicaoSenha(request.headers)
  )

  app.post(
    '/me/redefinicao-senha/concluir',
    {
      schema: {
        tags: ['Usuários'],
        summary: 'Concluir redefinição de senha aprovada pelo ADMIN',
        description:
          'Consome a aprovação vinculada à sessão e delega a troca e revogação de sessões ao Better Auth.',
        body: ConcluirRedefinicaoSenhaBodySchema,
        response: responses({ 200: ResultadoRedefinicaoSenhaSchema }, 400, 401, 409),
      },
    },
    async (request) => concluirRedefinicaoSenha(request.headers, request.body)
  )

  app.get(
    '/redefinicoes-senha',
    {
      onRequest: requireAdmin,
      schema: {
        tags: ['Usuários'],
        summary: 'Listar solicitações de redefinição pendentes (somente ADMIN)',
        response: responses({ 200: ListSolicitacoesRedefinicaoSenhaResponseSchema }, 401, 403),
      },
    },
    async () => listarSolicitacoesRedefinicaoSenha()
  )

  app.patch(
    '/redefinicoes-senha/:id',
    {
      onRequest: requireAdmin,
      schema: {
        tags: ['Usuários'],
        summary: 'Aprovar ou recusar uma solicitação de redefinição (somente ADMIN)',
        params: SolicitacaoRedefinicaoSenhaParamsSchema,
        body: DecidirSolicitacaoRedefinicaoSenhaBodySchema,
        response: responses(
          { 200: SolicitacaoRedefinicaoSenhaSchema.omit({ grantToken: true }) },
          400,
          401,
          403,
          404,
          409
        ),
      },
    },
    async (request) =>
      decidirSolicitacaoRedefinicaoSenha(request.params.id, request.user.id, request.body.decisao)
  )

  app.get(
    '/funcionarios',
    {
      onRequest: requireAdmin,
      schema: {
        tags: ['Usuários'],
        summary: 'Listar funcionários e permissões (somente ADMIN)',
        response: responses({ 200: ListFuncionariosResponseSchema }, 401, 403),
      },
    },
    async () => listarFuncionarios()
  )

  app.get(
    '/contas',
    {
      onRequest: requireAdmin,
      schema: {
        tags: ['Usuários'],
        summary: 'Listar contas da equipe (somente ADMIN)',
        response: responses({ 200: ListUsuariosAdministracaoResponseSchema }, 401, 403),
      },
    },
    async (request) => listarContasAdministrativas(request.headers)
  )

  app.patch(
    '/funcionarios/:id/permissoes',
    {
      onRequest: requireAdmin,
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
      onRequest: requireAdmin,
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

  app.post(
    '/funcionarios/:id/promover',
    {
      onRequest: requireAdmin,
      schema: {
        tags: ['Usuários'],
        summary: 'Promover funcionário a ADMIN (somente ADMIN)',
        description:
          'Altera o papel de um funcionário existente para ADMIN. A operação não cria usuários, não permite autopromoção e registra o papel anterior e o novo em auditoria.',
        params: FuncionarioParamsSchema,
        response: responses({ 200: PromoverFuncionarioResponseSchema }, 400, 401, 403, 404),
      },
    },
    async (request) => promoverFuncionario(request.params.id, request.user.id, request.headers)
  )
}
