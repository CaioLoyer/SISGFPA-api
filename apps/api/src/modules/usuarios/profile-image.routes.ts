import { requireAuth, responses } from '@sisgfpa/http'
import {
  ProfileImageParamsSchema,
  ProfileImageResponseSchema,
  UploadProfileImageBodySchema,
} from '@sisgfpa/validation'
import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod'

import { readOwnProfileImage, removeOwnProfileImage, saveOwnProfileImage } from './profile-image.service.js'

const uploadBodyLimit = 3 * 1024 * 1024

/** Rotas de leitura e atualização da foto do próprio usuário autenticado. */
export const profileImageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.post(
    '/me/foto',
    {
      bodyLimit: uploadBodyLimit,
      schema: {
        tags: ['Usuários'],
        summary: 'Enviar ou substituir a própria foto do perfil',
        description:
          'Aceita JPEG, PNG ou WebP de até 2 MB. A API valida conteúdo e dimensões; o nome do arquivo é gerado pelo servidor.',
        body: UploadProfileImageBodySchema,
        response: {
          ...responses({ 200: ProfileImageResponseSchema }, 400, 401),
          413: z.object({ error: z.string(), code: z.string() }),
        },
      },
    },
    async (request) =>
      saveOwnProfileImage(request.user.id, request.body.imageBase64, request.headers, request.user.image)
  )

  app.delete(
    '/me/foto',
    {
      schema: {
        tags: ['Usuários'],
        summary: 'Remover a própria foto do perfil',
        response: responses({ 200: ProfileImageResponseSchema }, 401),
      },
    },
    async (request) => removeOwnProfileImage(request.user.id, request.headers, request.user.image)
  )

  app.get(
    '/me/foto/:arquivo',
    {
      schema: {
        tags: ['Usuários'],
        summary: 'Consultar a própria foto de perfil',
        params: ProfileImageParamsSchema,
        response: { 404: z.object({ error: z.string(), code: z.string() }) },
      },
    },
    async (request, reply) => {
      const imageUrl = `/usuarios/me/foto/${request.params.arquivo}`
      if (request.user.image !== imageUrl)
        return reply.code(404).send({ error: 'Foto de perfil não encontrada', code: 'NOT_FOUND' })

      const image = await readOwnProfileImage(request.user.id, imageUrl)
      if (!image) return reply.code(404).send({ error: 'Foto de perfil não encontrada', code: 'NOT_FOUND' })

      return (reply as FastifyReply)
        .type(image.contentType)
        .header('Cache-Control', 'private, max-age=3600')
        .header('X-Content-Type-Options', 'nosniff')
        .send(image.bytes)
    }
  )
}
