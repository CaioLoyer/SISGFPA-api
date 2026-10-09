import { prisma } from '@sisgfpa/database'
import { NotFoundError } from '@sisgfpa/http'

/** Conversas do usuário. Toda consulta filtra por `userId`: ninguém acessa o chat de outro usuário. */

export async function buscarChatDoUsuario(chatId: string, userId: string) {
  const chat = await prisma.chat.findFirst({ where: { id: chatId, userId } })
  if (!chat) throw new NotFoundError('Chat não encontrado')
  return chat
}

export async function criarChat(userId: string, title?: string) {
  return prisma.chat.create({ data: { userId, title: title?.trim() || 'Chat financeiro' } })
}

export async function listarChats(userId: string) {
  return prisma.chat.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } })
}

export async function buscarChatComMensagens(chatId: string, userId: string) {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!chat) throw new NotFoundError('Chat não encontrado')
  return chat
}
