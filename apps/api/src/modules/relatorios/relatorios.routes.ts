import { requireAuth, responses } from '@sisgfpa/http'
import {
  RelatorioContasAPagarSchema,
  RelatorioContasAReceberSchema,
  RelatorioQuerySchema,
} from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod'

import * as relatorios from './relatorios.service.js'
import { requireModulePermission } from '../../authorization/module-permissions.js'
import { requireFinancialPermission } from '../../authorization/financial-permissions.js'

export const relatoriosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)
  app.addHook('preHandler', requireModulePermission('relatorios'))

  app.get(
    '/contas-a-pagar',
    {
      preHandler: requireFinancialPermission('despesas'),
      schema: {
        tags: ['Relatórios'],
        summary: 'Relatório de contas a pagar - requer Relatórios e Contas a pagar',
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
      preHandler: requireFinancialPermission('recebimentos'),
      schema: {
        tags: ['Relatórios'],
        summary: 'Relatório de contas a receber - requer Relatórios e Contas a receber',
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
