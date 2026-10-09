import { requireAdmin, requireAuth, responses } from '@sisgfpa/http'
import {
  CreateRecebimentoBodySchema,
  RecebimentoComHistoricoSchema,
  RecebimentoComParcelasSchema,
  RecebimentoParamsSchema,
  RecebimentoSchema,
  ListRecebimentosQuerySchema,
  ListRecebimentosResponseSchema,
  RegistrarBaixaRecebimentoBodySchema,
  UpdateRecebimentoBodySchema,
} from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import * as recebimentos from './recebimentos.service.js'

export const recebimentosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.post(
    '/',
    {
      schema: {
        tags: ['Recebimentos'],
        summary: 'Cadastrar título de recebimento (com parcelamento e baixa no ato opcionais)',
        body: CreateRecebimentoBodySchema,
        response: responses({ 201: RecebimentoComParcelasSchema }, 400, 401),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await recebimentos.criarRecebimento({ ...request.body, criadoPorId: request.user.id }))
  )

  app.get(
    '/',
    {
      schema: {
        tags: ['Recebimentos'],
        summary: 'Listar títulos de recebimento (filtros: status, cliente, categoria, período)',
        querystring: ListRecebimentosQuerySchema,
        response: responses({ 200: ListRecebimentosResponseSchema }, 401),
      },
    },
    async (request) => recebimentos.listarRecebimentos(request.query)
  )

  app.get(
    '/:id',
    {
      schema: {
        tags: ['Recebimentos'],
        summary: 'Buscar recebimento com parcelas, histórico e baixas',
        params: RecebimentoParamsSchema,
        response: responses({ 200: RecebimentoComHistoricoSchema }, 401, 404),
      },
    },
    async (request) => recebimentos.buscarRecebimento(request.params.id)
  )

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['Recebimentos'],
        summary: 'Atualizar título de recebimento',
        params: RecebimentoParamsSchema,
        body: UpdateRecebimentoBodySchema,
        response: responses({ 200: RecebimentoSchema }, 400, 401, 404),
      },
    },
    async (request) => recebimentos.atualizarRecebimento(request.params.id, request.body, request.user.id)
  )

  app.post(
    '/:id/cancelar',
    {
      onRequest: requireAdmin,
      schema: {
        tags: ['Recebimentos'],
        summary: 'Cancelar título de recebimento - somente ADMIN',
        params: RecebimentoParamsSchema,
        response: responses({ 200: RecebimentoSchema }, 400, 401, 403, 404),
      },
    },
    async (request) => recebimentos.cancelarRecebimento(request.params.id, request.user.id)
  )

  app.post(
    '/:id/baixas',
    {
      schema: {
        tags: ['Recebimentos'],
        summary: 'Registrar pagamento total ou parcial de recebimento',
        params: RecebimentoParamsSchema,
        body: RegistrarBaixaRecebimentoBodySchema,
        response: responses({ 200: RecebimentoSchema }, 400, 401, 404),
      },
    },
    async (request) => recebimentos.registrarBaixa(request.params.id, request.body, request.user.id)
  )
}
