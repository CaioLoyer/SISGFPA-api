import { requireAdmin, requireAuth, responses } from '@sisgfpa/http'
import {
  CreateDespesaBodySchema,
  DespesaComHistoricoSchema,
  DespesaComParcelasSchema,
  DespesaParamsSchema,
  DespesaSchema,
  ListDespesasQuerySchema,
  ListDespesasResponseSchema,
  RegistrarPagamentoDespesaBodySchema,
  UpdateDespesaBodySchema,
} from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import * as despesas from './despesas.service.js'

export const despesasRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.post(
    '/',
    {
      schema: {
        tags: ['Despesas'],
        summary: 'Cadastrar título de despesa (com parcelamento e liquidação no ato opcionais)',
        body: CreateDespesaBodySchema,
        response: responses({ 201: DespesaComParcelasSchema }, 400, 401),
      },
    },
    async (request, reply) =>
      reply.status(201).send(await despesas.criarDespesa({ ...request.body, criadoPorId: request.user.id }))
  )

  app.get(
    '/',
    {
      schema: {
        tags: ['Despesas'],
        summary: 'Listar títulos de despesa (filtros: status, fornecedor, categoria, período)',
        querystring: ListDespesasQuerySchema,
        response: responses({ 200: ListDespesasResponseSchema }, 401),
      },
    },
    async (request) => despesas.listarDespesas(request.query)
  )

  app.get(
    '/:id',
    {
      schema: {
        tags: ['Despesas'],
        summary: 'Buscar despesa com parcelas, histórico e pagamentos',
        params: DespesaParamsSchema,
        response: responses({ 200: DespesaComHistoricoSchema }, 401, 404),
      },
    },
    async (request) => despesas.buscarDespesa(request.params.id)
  )

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['Despesas'],
        summary: 'Atualizar título de despesa',
        params: DespesaParamsSchema,
        body: UpdateDespesaBodySchema,
        response: responses({ 200: DespesaSchema }, 400, 401, 404),
      },
    },
    async (request) => despesas.atualizarDespesa(request.params.id, request.body, request.user.id)
  )

  app.post(
    '/:id/cancelar',
    {
      onRequest: requireAdmin,
      schema: {
        tags: ['Despesas'],
        summary: 'Cancelar título de despesa - somente ADMIN',
        params: DespesaParamsSchema,
        response: responses({ 200: DespesaSchema }, 400, 401, 403, 404),
      },
    },
    async (request) => despesas.cancelarDespesa(request.params.id, request.user.id)
  )

  app.post(
    '/:id/pagamentos',
    {
      schema: {
        tags: ['Despesas'],
        summary: 'Registrar pagamento total ou parcial de despesa',
        params: DespesaParamsSchema,
        body: RegistrarPagamentoDespesaBodySchema,
        response: responses({ 200: DespesaSchema }, 400, 401, 404),
      },
    },
    async (request) => despesas.registrarPagamento(request.params.id, request.body, request.user.id)
  )
}
