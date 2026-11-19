import { prisma } from '@sisgfpa/database'
import { ConflictError, NotFoundError } from '@sisgfpa/http'

/** Conversas do usuário. Toda consulta filtra por `userId`: ninguém acessa o chat de outro usuário. */

export async function buscarChatDoUsuario(chatId: string, userId: string) {
  const chat = await prisma.chat.findFirst({ where: { id: chatId, userId, deletedAt: null } })
  if (!chat) throw new NotFoundError('Chat não encontrado')
  return chat
}

export async function criarChat(userId: string, title?: string) {
  return prisma.chat.create({ data: { userId, title: title?.trim() || 'Nova conversa' } })
}

export async function listarChats(userId: string) {
  return prisma.chat.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function buscarChatComMensagens(chatId: string, userId: string) {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId, deletedAt: null },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!chat) throw new NotFoundError('Chat não encontrado')
  return chat
}

/** Oculta a conversa e descarta propostas que ainda aguardavam confirmação. */
export async function excluirChat(chatId: string, userId: string) {
  const deletedAt = new Date()

  await prisma.$transaction(async (tx) => {
    const chat = await tx.chat.updateMany({
      where: { id: chatId, userId, deletedAt: null },
      data: { deletedAt, updatedAt: deletedAt },
    })
    if (chat.count === 0) throw new NotFoundError('Chat não encontrado')

    const emProcessamento = await tx.message.count({
      where: { chatId, userId, papel: 'USUARIO', status: 'PROCESSANDO' },
    })
    if (emProcessamento > 0) {
      throw new ConflictError(
        'CHAT_OPERATION_PROCESSING',
        'Aguarde a operação em andamento terminar antes de excluir a conversa'
      )
    }

    await tx.message.updateMany({
      where: { chatId, userId, papel: 'USUARIO', status: 'PENDENTE_CONFIRMACAO' },
      data: { status: 'CANCELADA' },
    })
  })
}
