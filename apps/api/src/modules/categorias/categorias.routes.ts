import { requireAuth, responses } from '@sisgfpa/http'
import { ListCategoriasQuerySchema, ListCategoriasResponseSchema } from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { listarCategorias } from './categorias.service.js'

export const categoriasRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.get(
    '/',
    {
      schema: {
        tags: ['Categorias'],
        summary: 'Listar categorias (despesa e recebimento)',
        querystring: ListCategoriasQuerySchema,
        response: responses({ 200: ListCategoriasResponseSchema }, 401),
      },
    },
    async (request) => listarCategorias(request.query.tipo)
  )
}
