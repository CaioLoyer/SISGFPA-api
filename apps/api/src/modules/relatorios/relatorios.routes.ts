import { requireAdmin, responses } from '@sisgfpa/http'
import {
  RelatorioContasAPagarSchema,
  RelatorioContasAReceberSchema,
  RelatorioQuerySchema,
} from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod'

import * as relatorios from './relatorios.service.js'

export const relatoriosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get(
    '/contas-a-pagar',
    {
      schema: {
        tags: ['Relatórios'],
        summary: 'Relatório de contas a pagar - somente ADMIN',
        querystring: RelatorioQuerySchema,
        // formato=json -> relatório estruturado; formato=csv -> arquivo CSV (text/csv)
        response: responses({ 200: z.union([RelatorioContasAPagarSchema, z.string()]) }, 401, 403),
      },
    },
    async (request, reply) => {
      if (request.query.formato === 'csv') {
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', 'attachment; filename="contas-a-pagar.csv"')
          .send(await relatorios.contasAPagarCsv(request.query))
      }
      return relatorios.contasAPagar(request.query)
    }
  )

  app.get(
    '/contas-a-receber',
    {
      schema: {
        tags: ['Relatórios'],
        summary: 'Relatório de contas a receber - somente ADMIN',
        querystring: RelatorioQuerySchema,
        response: responses({ 200: z.union([RelatorioContasAReceberSchema, z.string()]) }, 401, 403),
      },
    },
    async (request, reply) => {
      if (request.query.formato === 'csv') {
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', 'attachment; filename="contas-a-receber.csv"')
          .send(await relatorios.contasAReceberCsv(request.query))
      }
      return relatorios.contasAReceber(request.query)
    }
  )
}
