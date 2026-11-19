import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    chat: { updateMany: vi.fn(), update: vi.fn() },
    message: { findFirst: vi.fn(), create: vi.fn() },
  },
  buscarChatDoUsuario: vi.fn(),
  interpretar: vi.fn(),
}))

vi.mock('@sisgfpa/database', () => ({ prisma: mocks.prisma }))
vi.mock('@sisgfpa/http', () => {
  class AppError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string
    ) {
      super(message)
    }
  }
  class ConflictError extends AppError {
    constructor(code: string, message: string) {
      super(409, code, message)
    }
  }
  return { AppError, ConflictError }
})
vi.mock('./chat.service.js', () => ({ buscarChatDoUsuario: mocks.buscarChatDoUsuario }))
vi.mock('../interpreter/planner.js', () => ({ interpretar: mocks.interpretar }))

import { processarMensagem } from './message.service.js'

const initialDate = new Date('2026-11-18T12:00:00.000Z')
const chatId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'

describe('título automático da conversa ao receber mensagem', () => {
  let currentChat: { id: string; userId: string; title: string; createdAt: Date; updatedAt: Date }

  beforeEach(() => {
    vi.clearAllMocks()
    currentChat = {
      id: chatId,
      userId,
      title: 'Nova conversa',
      createdAt: initialDate,
      updatedAt: initialDate,
    }

    mocks.buscarChatDoUsuario.mockImplementation(async () => ({ ...currentChat }))
    mocks.prisma.message.findFirst.mockResolvedValue(null)
    mocks.prisma.message.create.mockImplementation(async ({ data }) => ({
      id: data.papel === 'USUARIO' ? 'user-message' : 'assistant-message',
      ...data,
      intent: data.intent ?? null,
      parsedData: data.parsedData ?? null,
      resultado: null,
      despesaId: null,
      recebimentoId: null,
      createdAt: initialDate,
    }))
    mocks.prisma.chat.updateMany.mockImplementation(async ({ where, data }) => {
      if (
        where.id !== currentChat.id ||
        where.userId !== currentChat.userId ||
        where.title !== currentChat.title
      ) {
        return { count: 0 }
      }
      currentChat = { ...currentChat, ...data }
      return { count: 1 }
    })
    mocks.prisma.chat.update.mockImplementation(async ({ data }) => {
      currentChat = { ...currentChat, ...data }
      return { ...currentChat }
    })
    mocks.interpretar.mockResolvedValue({ kind: 'desconhecida' })
  })

  it('persiste um título útil no servidor e o devolve junto à resposta', async () => {
    const resposta = await processarMensagem({
      chatId,
      userId,
      content: 'Bom dia, compramos cadernos por R$ 250.',
      client: {} as never,
    })

    expect(resposta.chat.title).toBe('Compramos cadernos por R$ 250')
    expect(currentChat.title).toBe('Compramos cadernos por R$ 250')
    expect(mocks.prisma.chat.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: chatId, userId, title: 'Nova conversa' },
        data: expect.objectContaining({ title: 'Compramos cadernos por R$ 250' }),
      })
    )
  })

  it('mantém o placeholder após uma saudação e continua atualizando a atividade', async () => {
    const resposta = await processarMensagem({
      chatId,
      userId,
      content: 'Olá, tudo bem?',
      client: {} as never,
    })

    expect(resposta.chat.title).toBe('Nova conversa')
    expect(mocks.prisma.chat.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.chat.update).toHaveBeenCalledWith({
      where: { id: chatId },
      data: { updatedAt: expect.any(Date) },
    })
  })

  it('usa o contexto completo sem duplicar uma resposta que complementa a mensagem anterior', async () => {
    mocks.prisma.message.findFirst.mockResolvedValueOnce({
      status: 'INFORMACAO_INSUFICIENTE',
      parsedData: { textoBase: 'Comprei cadernos' },
    })
    mocks.interpretar
      .mockResolvedValueOnce({ kind: 'desconhecida' })
      .mockResolvedValueOnce({ kind: 'desconhecida' })

    const resposta = await processarMensagem({
      chatId,
      userId,
      content: 'R$ 250',
      client: {} as never,
    })

    expect(resposta.chat.title).toBe('Comprei cadernos R$ 250')
  })

  it('não renomeia uma conversa que já recebeu um título personalizado', async () => {
    currentChat.title = 'Despesas de novembro'

    const resposta = await processarMensagem({
      chatId,
      userId,
      content: 'Compramos cadernos por R$ 250',
      client: {} as never,
    })

    expect(resposta.chat.title).toBe('Despesas de novembro')
    expect(mocks.prisma.chat.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.chat.update).toHaveBeenCalledOnce()
  })
})
