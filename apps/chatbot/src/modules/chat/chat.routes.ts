import { requireAuth, responses } from '@sisgfpa/http'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod'

import { env } from '../../config/env.js'
import { FinancialApiClient } from '../financial-api/financial-api-client.js'
import {
  CancelResponseSchema,
  ChatComMensagensSchema,
  ChatParamsSchema,
  ChatSchema,
  ConfirmResponseSchema,
  CreateChatBodySchema,
  MessageCancelParamsSchema,
  MessageConfirmParamsSchema,
  SendMessageBodySchema,
  SendMessageResponseSchema,
} from './chat.schema.js'
import { toChatDto, toMessageDto } from './chat.mapper.js'
import * as chats from './chat.service.js'
import * as messages from './message.service.js'

/** Credenciais do próprio usuário seguem para a API Financeira: ela é quem autoriza cada operação. */
const financialApiFor = (headers: { cookie?: string; authorization?: string }) =>
  new FinancialApiClient(
    { cookie: headers.cookie, authorization: headers.authorization },
    env.FINANCIAL_API_URL
  )

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth)

  app.post(
    '/',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Iniciar uma conversa',
        body: CreateChatBodySchema,
        response: responses({ 201: ChatSchema }, 401),
      },
    },
    async (request, reply) =>
      reply.status(201).send(toChatDto(await chats.criarChat(request.user.id, request.body.title)))
  )

  app.get(
    '/',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Listar minhas conversas',
        response: responses({ 200: z.array(ChatSchema) }, 401),
      },
    },
    async (request) => (await chats.listarChats(request.user.id)).map(toChatDto)
  )

  app.get(
    '/:chatId',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Buscar conversa com mensagens',
        params: ChatParamsSchema,
        response: responses({ 200: ChatComMensagensSchema }, 401, 404),
      },
    },
    async (request) => {
      const chat = await chats.buscarChatComMensagens(request.params.chatId, request.user.id)
      return { ...toChatDto(chat), messages: chat.messages.map(toMessageDto) }
    }
  )

  app.post(
    '/:chatId/messages',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Enviar mensagem em linguagem natural (interpreta e pede confirmação antes de gravar)',
        params: ChatParamsSchema,
        body: SendMessageBodySchema,
        response: responses({ 200: SendMessageResponseSchema }, 401, 404, 502),
      },
    },
    async (request) => {
      const result = await messages.processarMensagem({
        chatId: request.params.chatId,
        userId: request.user.id,
        content: request.body.content,
        client: financialApiFor(request.headers),
      })
      return {
        userMessage: toMessageDto(result.userMessage),
        assistantMessage: toMessageDto(result.assistantMessage),
        confirmacao: result.confirmacao,
      }
    }
  )

  app.post(
    '/:chatId/messages/:messageId/confirm',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Confirmar a operação: só agora o Chatbot chama a API Financeira',
        params: MessageConfirmParamsSchema,
        response: responses({ 200: ConfirmResponseSchema }, 401, 404, 409),
      },
    },
    async (request) => {
      const result = await messages.confirmarMensagem({
        ...request.params,
        userId: request.user.id,
        client: financialApiFor(request.headers),
      })
      return {
        userMessage: toMessageDto(result.userMessage),
        assistantMessage: toMessageDto(result.assistantMessage),
        erro: result.erro,
      }
    }
  )

  app.post(
    '/:chatId/messages/:messageId/cancel',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Descartar a operação pendente de confirmação',
        params: MessageCancelParamsSchema,
        response: responses({ 200: CancelResponseSchema }, 401, 404, 409),
      },
    },
    async (request) => {
      const result = await messages.cancelarConfirmacao({ ...request.params, userId: request.user.id })
      return {
        userMessage: toMessageDto(result.userMessage),
        assistantMessage: toMessageDto(result.assistantMessage),
      }
    }
  )
}
