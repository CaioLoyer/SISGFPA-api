import { requireAdmin, responses } from '@sisgfpa/http'
import { DashboardResumoQuerySchema, DashboardResumoSchema } from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { consultarResumo } from './dashboard.service.js'

/** Resumo financeiro do período, disponível somente para ADMIN. */
export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAdmin)

  app.get(
    '/resumo',
    {
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
