import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tx: {
    chat: { updateMany: vi.fn() },
    message: { count: vi.fn(), updateMany: vi.fn() },
  },
  prisma: {
    $transaction: vi.fn(),
    chat: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('@sisgfpa/database', () => ({ prisma: mocks.prisma }))
vi.mock('@sisgfpa/http', () => ({
  ConflictError: class ConflictError extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message)
    }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(message: string) {
      super(message)
    }
  },
}))

import { buscarChatComMensagens, buscarChatDoUsuario, excluirChat, listarChats } from './chat.service.js'

describe('acesso e exclusão lógica de conversas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx))
    mocks.tx.chat.updateMany.mockResolvedValue({ count: 1 })
    mocks.tx.message.count.mockResolvedValue(0)
    mocks.tx.message.updateMany.mockResolvedValue({ count: 2 })
  })

  it('lista somente conversas ativas do usuário', async () => {
    mocks.prisma.chat.findMany.mockResolvedValue([])

    await listarChats('user-1')

    expect(mocks.prisma.chat.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    })
  })

  it('não permite consultar conversa excluída, inclusive com seu histórico', async () => {
    mocks.prisma.chat.findFirst.mockResolvedValue(null)

    await expect(buscarChatDoUsuario('chat-1', 'user-1')).rejects.toThrow('Chat não encontrado')
    await expect(buscarChatComMensagens('chat-1', 'user-1')).rejects.toThrow('Chat não encontrado')
    expect(mocks.prisma.chat.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'chat-1', userId: 'user-1', deletedAt: null },
    })
    expect(mocks.prisma.chat.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'chat-1', userId: 'user-1', deletedAt: null },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
  })

  it('oculta a conversa e cancela propostas pendentes dentro da mesma transação', async () => {
    await excluirChat('chat-1', 'user-1')

    expect(mocks.tx.chat.updateMany).toHaveBeenCalledWith({
      where: { id: 'chat-1', userId: 'user-1', deletedAt: null },
      data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date) },
    })
    expect(mocks.tx.message.updateMany).toHaveBeenCalledWith({
      where: {
        chatId: 'chat-1',
        userId: 'user-1',
        papel: 'USUARIO',
        status: 'PENDENTE_CONFIRMACAO',
      },
      data: { status: 'CANCELADA' },
    })
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce()
  })

  it('responde como não encontrado para conversa inexistente ou de outro usuário', async () => {
    mocks.tx.chat.updateMany.mockResolvedValue({ count: 0 })

    await expect(excluirChat('chat-1', 'user-2')).rejects.toThrow('Chat não encontrado')
    expect(mocks.tx.message.updateMany).not.toHaveBeenCalled()
  })

  it('não exclui uma conversa enquanto uma confirmação financeira está em andamento', async () => {
    mocks.tx.message.count.mockResolvedValue(1)

    await expect(excluirChat('chat-1', 'user-1')).rejects.toMatchObject({
      code: 'CHAT_OPERATION_PROCESSING',
    })

    expect(mocks.tx.message.updateMany).not.toHaveBeenCalled()
  })
})
