import { ForbiddenError, requireAuth, responses } from '@sisgfpa/http'
import {
  ContatoParamsSchema,
  ContatoSchema,
  ContatoSugestoesQuerySchema,
  ContatoSugestoesResponseSchema,
  CreateContatoBodySchema,
  ListContatosQuerySchema,
  ListContatosResponseSchema,
  ListVinculosPendentesQuerySchema,
  UpdateContatoBodySchema,
  UpdateContatoStatusBodySchema,
  VincularContatosBodySchema,
  VincularContatosResponseSchema,
  VinculosPendentesResponseSchema,
} from '@sisgfpa/validation'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import {
  exigirPapeisContato,
  papeisContatoPermitidos,
  type ContatoPapelPermitido,
} from '../../authorization/financial-permissions.js'
import * as contatos from './contatos.service.js'

function papelDoTitulo(tipo: 'DESPESA' | 'RECEBIMENTO'): ContatoPapelPermitido {
  return tipo === 'DESPESA' ? 'FORNECEDOR' : 'CLIENTE'
}

export const contatosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.get(
    '/vinculos-pendentes',
    {
      schema: {
        tags: ['Comercial'],
        summary: 'Listar títulos históricos sem vínculo com contato',
        querystring: ListVinculosPendentesQuerySchema,
        response: responses({ 200: VinculosPendentesResponseSchema }, 401, 403),
      },
    },
    async (request) => {
      const papel = papelDoTitulo(request.query.tipo)
      await exigirPapeisContato(request, [papel])
      return contatos.listarVinculosPendentes(
        request.query.tipo,
        request.query.busca,
        request.query.page,
        request.query.pageSize
      )
    }
  )

  app.get(
    '/sugestoes',
    {
      schema: {
        tags: ['Comercial'],
        summary: 'Sugerir contatos para associação de títulos históricos',
        querystring: ContatoSugestoesQuerySchema,
        response: responses({ 200: ContatoSugestoesResponseSchema }, 401, 403),
      },
    },
    async (request) => {
      await exigirPapeisContato(request, [request.query.papel])
      return contatos.sugerirContatos(
        request.query.papel,
        request.query.nome,
        await papeisContatoPermitidos(request)
      )
    }
  )

  app.post(
    '/vinculos',
    {
      schema: {
        tags: ['Comercial'],
        summary: 'Vincular títulos antigos aos contatos selecionados',
        body: VincularContatosBodySchema,
        response: responses({ 200: VincularContatosResponseSchema }, 400, 401, 403, 404, 409),
      },
    },
    async (request) => {
      await exigirPapeisContato(request, [papelDoTitulo(request.body.tipo)])
      return contatos.vincularTitulos(request.body, request.user.id)
    }
  )

  app.get(
    '/',
    {
      schema: {
        tags: ['Comercial'],
        summary: 'Listar clientes e fornecedores',
        querystring: ListContatosQuerySchema,
        response: responses({ 200: ListContatosResponseSchema }, 401, 403),
      },
    },
    async (request) => {
      const papeis = await papeisContatoPermitidos(request)
      if (papeis.length === 0) throw new ForbiddenError('Seu usuário não tem acesso a contatos comerciais')
      if (request.query.papel) await exigirPapeisContato(request, [request.query.papel])
      return contatos.listarContatos(request.query, papeis)
    }
  )

  app.post(
    '/',
    {
      schema: {
        tags: ['Comercial'],
        summary: 'Cadastrar cliente ou fornecedor',
        body: CreateContatoBodySchema,
        response: responses({ 201: ContatoSchema }, 400, 401, 403, 409),
      },
    },
    async (request, reply) => {
      const papeis = await papeisContatoPermitidos(request)
      return reply.status(201).send(await contatos.criarContato(request.body, papeis))
    }
  )

  app.patch(
    '/:id/situacao',
    {
      schema: {
        tags: ['Comercial'],
        summary: 'Ativar ou inativar contato sem apagar seu histórico',
        params: ContatoParamsSchema,
        body: UpdateContatoStatusBodySchema,
        response: responses({ 200: ContatoSchema }, 400, 401, 403, 404),
      },
    },
    async (request) =>
      contatos.alterarSituacaoContato(
        request.params.id,
        request.body.ativo,
        await papeisContatoPermitidos(request)
      )
  )

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['Comercial'],
        summary: 'Editar dados de cliente ou fornecedor',
        params: ContatoParamsSchema,
        body: UpdateContatoBodySchema,
        response: responses({ 200: ContatoSchema }, 400, 401, 403, 404, 409),
      },
    },
    async (request) =>
      contatos.atualizarContato(request.params.id, request.body, await papeisContatoPermitidos(request))
  )
}
