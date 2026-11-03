import { requireAdmin, requireAuth, responses } from '@sisgfpa/http'
import {
  DashboardOverviewQuerySchema,
  DashboardOverviewSchema,
  DashboardResumoQuerySchema,
  DashboardResumoSchema,
} from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { consultarResumo } from './dashboard.service.js'
import { consultarVisaoGeral } from './dashboard-overview.service.js'

/** Visão mensal autorizada e resumo administrativo legado. */
export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.get(
    '/visao-geral',
    {
      schema: {
        tags: ['Dashboard'],
        summary: 'Consultar dashboard mensal conforme as permissões da conta',
        description:
          'Entradas e saídas efetivas por data da movimentação, incluindo estornos. Funcionários veem apenas os módulos liberados; saldo consolidado e relatórios continuam exclusivos de ADMIN. Ticket médio = soma das baixas recebidas / quantidade de baixas do mês, incluindo pagamentos parciais e excluindo estornos. Meses são delimitados em UTC. Pendências consideram o vencimento do título no mês e excluem cancelados.',
        querystring: DashboardOverviewQuerySchema,
        response: responses({ 200: DashboardOverviewSchema }, 400, 401, 403),
      },
    },
    async (request) => consultarVisaoGeral(request.query, request.user)
  )

  app.get(
    '/resumo',
    {
      onRequest: requireAdmin,
      schema: {
        tags: ['Dashboard'],
        summary: 'Consultar resumo financeiro do período (somente ADMIN)',
        description:
          'Contas usam o vencimento do título e excluem cancelados. O caixa usa a data efetiva das movimentações, incluindo estornos.',
        querystring: DashboardResumoQuerySchema,
        response: responses({ 200: DashboardResumoSchema }, 400, 401, 403),
      },
    },
    async (request) => consultarResumo(request.query)
  )
}
