import { requireAdmin, responses } from '@sisgfpa/http'
import {
  AbrirCaixaBodySchema,
  CaixaMovimentacaoParamsSchema,
  CaixaMovimentacaoSchema,
  CaixaResumoSchema,
  EstornarMovimentacaoBodySchema,
  LancamentoAvulsoCaixaBodySchema,
  ListCaixaMovimentacoesQuerySchema,
  ListCaixaMovimentacoesResponseSchema,
} from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import * as caixa from './caixa.service.js'

/** Consulta e configuração do Caixa Principal, disponíveis somente para ADMIN. */
export const caixaRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get(
    '/',
    {
      schema: {
        tags: ['Caixa'],
        summary: 'Consultar saldo atual do Caixa Principal (somente ADMIN)',
        response: responses({ 200: CaixaResumoSchema }, 401, 403),
      },
    },
    async () => caixa.consultarCaixa()
  )

  app.post(
    '/movimentacoes/avulsas',
    {
      schema: {
        tags: ['Caixa'],
        summary: 'Registrar entrada ou saída avulsa no Caixa Principal (somente ADMIN)',
        description:
          'Registra um movimento sem criar título. Repetições com a mesma chave e os mesmos dados retornam o movimento original.',
        body: LancamentoAvulsoCaixaBodySchema,
        response: responses({ 200: CaixaMovimentacaoSchema }, 400, 401, 403, 409),
      },
    },
    async (request) => caixa.registrarLancamentoAvulso(request.body, request.user.id)
  )

  app.post(
    '/abertura',
    {
      schema: {
        tags: ['Caixa'],
        summary: 'Informar o saldo atual do Caixa Principal (somente ADMIN)',
        description:
          'Não importa pagamentos ou recebimentos históricos. O saldo pode ser corrigido até o primeiro movimento automático.',
        body: AbrirCaixaBodySchema,
        response: responses({ 200: CaixaResumoSchema }, 400, 401, 403, 409),
      },
    },
    async (request) => caixa.abrirCaixa(request.body)
  )

  app.get(
    '/movimentacoes',
    {
      schema: {
        tags: ['Caixa'],
        summary: 'Listar entradas, saídas e estornos do Caixa Principal (somente ADMIN)',
        querystring: ListCaixaMovimentacoesQuerySchema,
        response: responses({ 200: ListCaixaMovimentacoesResponseSchema }, 401, 403),
      },
    },
    async (request) => caixa.listarMovimentacoes(request.query)
  )

  app.post(
    '/movimentacoes/:id/estornos',
    {
      schema: {
        tags: ['Caixa'],
        summary: 'Estornar liquidação de título cancelado ou corrigir lançamento avulso (somente ADMIN)',
        params: CaixaMovimentacaoParamsSchema,
        body: EstornarMovimentacaoBodySchema,
        response: responses({ 200: CaixaMovimentacaoSchema }, 400, 401, 403, 404, 409),
      },
    },
    async (request) => caixa.registrarEstorno(request.params.id, request.body, request.user.id)
  )
}
