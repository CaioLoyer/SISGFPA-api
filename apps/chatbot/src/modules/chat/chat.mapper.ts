/** Conversores Prisma → DTO (datas em ISO). */

export const toMessageDto = (m: {
  id: string
  chatId: string
  papel: 'USUARIO' | 'ASSISTENTE'
  content: string
  intent: string | null
  status: string
  parsedData: unknown
  resultado: unknown
  despesaId: string | null
  recebimentoId: string | null
  createdAt: Date
}) => ({
  id: m.id,
  chatId: m.chatId,
  papel: m.papel,
  content: m.content,
  intent: m.intent,
  status: m.status,
  parsedData: m.parsedData ?? null,
  resultado: m.resultado ?? null,
  despesaId: m.despesaId,
  recebimentoId: m.recebimentoId,
  createdAt: m.createdAt.toISOString(),
})

export const toChatDto = (c: { id: string; title: string; createdAt: Date; updatedAt: Date }) => ({
  id: c.id,
  title: c.title,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
})
