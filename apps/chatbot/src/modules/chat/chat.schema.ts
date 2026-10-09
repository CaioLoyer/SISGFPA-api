import { EXEMPLOS } from '@sisgfpa/types'
import z from 'zod'

const MessageSchema = z.object({
  id: z.uuid(),
  chatId: z.uuid(),
  papel: z.enum(['USUARIO', 'ASSISTENTE']),
  content: z.string(),
  intent: z.string().nullable(),
  status: z.string(),
  parsedData: z.unknown().nullable(),
  resultado: z.unknown().nullable(),
  despesaId: z.string().nullable(),
  recebimentoId: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export const ChatSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const ChatComMensagensSchema = ChatSchema.extend({ messages: z.array(MessageSchema) })

export const CreateChatBodySchema = z
  .object({ title: z.string().min(1).max(120).optional().meta({ example: 'Lançamentos de setembro' }) })
  .meta({ example: { title: 'Lançamentos de setembro' } })

export const SendMessageBodySchema = z
  .object({
    content: z
      .string()
      .min(1)
      .max(1000)
      .meta({ example: 'Compramos 500 cadernos do fornecedor Distribuidora Escolar ABC por R$ 2500' }),
  })
  .meta({
    example: { content: 'Compramos 500 cadernos do fornecedor Distribuidora Escolar ABC por R$ 2500' },
  })

const chatId = z
  .uuid()
  .meta({ example: EXEMPLOS.chatId, description: 'Conversa de demonstração (pnpm db:seed:demo)' })
export const ChatParamsSchema = z.object({ chatId })

// Id da mensagem devolvido em `confirmacao.messageId` ao enviar uma mensagem.
export const MessageConfirmParamsSchema = z.object({
  chatId,
  messageId: z
    .uuid()
    .meta({ example: EXEMPLOS.mensagemConfirmarId, description: 'Mensagem pendente de demonstração' }),
})
export const MessageCancelParamsSchema = z.object({
  chatId,
  messageId: z
    .uuid()
    .meta({ example: EXEMPLOS.mensagemDescartarId, description: 'Mensagem pendente de demonstração' }),
})

export const SendMessageResponseSchema = z.object({
  userMessage: MessageSchema,
  assistantMessage: MessageSchema,
  // Preenchido quando há uma operação aguardando confirmação do usuário.
  confirmacao: z.object({ messageId: z.uuid(), resumo: z.string() }).nullable(),
})

export const ConfirmResponseSchema = z.object({
  userMessage: MessageSchema,
  assistantMessage: MessageSchema,
  erro: z.object({ status: z.number(), code: z.string(), message: z.string() }).nullable(),
})

export const CancelResponseSchema = z.object({ userMessage: MessageSchema, assistantMessage: MessageSchema })
