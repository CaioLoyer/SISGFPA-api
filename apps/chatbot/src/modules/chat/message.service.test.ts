import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tx: {
    chat: { updateMany: vi.fn(), findFirst: vi.fn() },
    message: { create: vi.fn(), updateMany: vi.fn() },
  },
  prisma: {
    $transaction: vi.fn(),
    message: { findFirst: vi.fn(), updateMany: vi.fn() },
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
  class NotFoundError extends AppError {
    constructor(message: string) {
      super(404, 'NOT_FOUND', message)
    }
  }
  return { AppError, ConflictError, NotFoundError }
})
vi.mock('./chat.service.js', () => ({ buscarChatDoUsuario: mocks.buscarChatDoUsuario }))
vi.mock('../interpreter/planner.js', () => ({ interpretar: mocks.interpretar }))

import { cancelarConfirmacao, confirmarMensagem, processarMensagem } from './message.service.js'

const initialDate = new Date('2026-11-18T12:00:00.000Z')
const chatId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'

describe('título automático da conversa ao receber mensagem', () => {
  let currentChat: {
    id: string
    userId: string
    title: string
    deletedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }

  beforeEach(() => {
    vi.clearAllMocks()
    currentChat = {
      id: chatId,
      userId,
      title: 'Nova conversa',
      deletedAt: null,
      createdAt: initialDate,
      updatedAt: initialDate,
    }

    mocks.buscarChatDoUsuario.mockImplementation(async () => ({ ...currentChat }))
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx))
    mocks.prisma.message.findFirst.mockResolvedValue(null)
    mocks.prisma.message.updateMany.mockResolvedValue({ count: 0 })
    mocks.tx.message.updateMany.mockResolvedValue({ count: 0 })
    mocks.tx.message.create.mockImplementation(async ({ data }) => ({
      id: data.papel === 'USUARIO' ? 'user-message' : 'assistant-message',
      ...data,
      intent: data.intent ?? null,
      parsedData: data.parsedData ?? null,
      resultado: null,
      despesaId: null,
      recebimentoId: null,
      createdAt: initialDate,
    }))
    mocks.tx.chat.updateMany.mockImplementation(async ({ where, data }) => {
      if (
        where.id !== currentChat.id ||
        where.userId !== currentChat.userId ||
        currentChat.deletedAt != null ||
        (where.title !== undefined && where.title !== currentChat.title)
      ) {
        return { count: 0 }
      }
      currentChat = { ...currentChat, ...data }
      return { count: 1 }
    })
    mocks.tx.chat.findFirst.mockImplementation(async () => ({ ...currentChat }))
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
    expect(mocks.tx.chat.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: chatId, userId, deletedAt: null, title: 'Nova conversa' },
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
    expect(mocks.tx.chat.updateMany).toHaveBeenCalledWith({
      where: { id: chatId, userId, deletedAt: null },
      data: { updatedAt: expect.any(Date) },
    })
  })

  it('persiste sugestões estruturadas para renderizar os módulos depois de recarregar', async () => {
    mocks.interpretar.mockResolvedValueOnce({
      kind: 'navegacao',
      parsed: { intent: 'DESCONHECIDA' },
      topicos: ['receipts'],
    })

    const resposta = await processarMensagem({
      chatId,
      userId,
      content: 'Quero ver o que tenho a receber',
      client: {} as never,
    })

    expect(resposta.userMessage.parsedData).toMatchObject({ topicos: ['receipts'] })
    expect(resposta.assistantMessage.content).toBe('Encontrei este módulo para você:')
    expect(resposta.confirmacao).toBeNull()
  })

  it('exige confirmar o contato ativo antes de preparar a despesa no Chatbot', async () => {
    const textoBase = 'Compramos cadernos do fornecedor ABC por R$ 250'
    const contatos = [{ id: 'supplier-1', nome: 'Papelaria ABC', tipo: 'DESPESA' as const }]
    mocks.interpretar.mockResolvedValueOnce({
      kind: 'escolher-contato',
      parsed: { intent: 'CRIAR_DESPESA' },
      tipo: 'DESPESA',
      contatos,
    })

    const resposta = await processarMensagem({
      chatId,
      userId,
      content: textoBase,
      client: {} as never,
    })

    expect(resposta.userMessage.status).toBe('INFORMACAO_INSUFICIENTE')
    expect(resposta.userMessage.parsedData).toMatchObject({ textoBase, contatos })
    expect(resposta.assistantMessage.content).toContain('Papelaria ABC')
    expect(resposta.confirmacao).toBeNull()
  })

  it('continua a confirmação usando o contato escolhido pelo número da lista', async () => {
    const textoBase = 'Compramos cadernos do fornecedor ABC por R$ 250'
    const contato = { id: 'supplier-1', nome: 'Papelaria ABC', tipo: 'DESPESA' as const }
    mocks.prisma.message.findFirst.mockResolvedValueOnce({
      status: 'INFORMACAO_INSUFICIENTE',
      parsedData: { textoBase, contatos: [contato] },
    })
    mocks.interpretar.mockResolvedValueOnce({
      kind: 'plano',
      parsed: { intent: 'CRIAR_DESPESA' },
      plano: {
        tipo: 'CRIAR_DESPESA',
        body: {
          descricao: 'Compra de cadernos',
          fornecedor: contato.nome,
          fornecedorContatoId: contato.id,
          valor: 250,
          dataVencimento: '2026-11-30',
          parcelas: 1,
          liquidarNoAto: false,
        },
      },
    })

    const resposta = await processarMensagem({
      chatId,
      userId,
      content: '1',
      client: {} as never,
    })

    expect(mocks.interpretar).toHaveBeenCalledWith(textoBase, expect.anything(), { contato })
    expect(resposta.userMessage.status).toBe('PENDENTE_CONFIRMACAO')
    expect(resposta.confirmacao).toMatchObject({ resumo: expect.any(String) })
  })

  it('não cria título quando o nome informado não tem contato ativo', async () => {
    mocks.interpretar.mockResolvedValueOnce({
      kind: 'contato-nao-encontrado',
      parsed: { intent: 'CRIAR_DESPESA' },
      tipo: 'DESPESA',
      nome: 'ABC',
    })

    const resposta = await processarMensagem({
      chatId,
      userId,
      content: 'Compramos do fornecedor ABC',
      client: {} as never,
    })

    expect(resposta.userMessage.status).toBe('INFORMACAO_INSUFICIENTE')
    expect(resposta.confirmacao).toBeNull()
    expect(resposta.assistantMessage.content).toContain('Nenhum título foi criado')
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
    expect(mocks.tx.chat.updateMany).toHaveBeenCalledOnce()
  })

  it('condiciona a confirmação à conversa ainda ativa', async () => {
    await expect(
      confirmarMensagem({ chatId, messageId: 'message-1', userId, client: {} as never })
    ).rejects.toMatchObject({ code: 'MESSAGE_NOT_PENDING' })

    expect(mocks.tx.chat.updateMany).toHaveBeenCalledWith({
      where: { id: chatId, userId, deletedAt: null },
      data: { updatedAt: expect.any(Date) },
    })
    expect(mocks.tx.message.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'message-1',
        chatId,
        userId,
        papel: 'USUARIO',
        status: 'PENDENTE_CONFIRMACAO',
        chat: { is: { userId, deletedAt: null } },
      },
      data: { status: 'PROCESSANDO' },
    })
    expect(mocks.tx.chat.updateMany).toHaveBeenCalledBefore(mocks.tx.message.updateMany)
  })

  it('não tenta confirmar nem descartar proposta depois que a conversa foi ocultada', async () => {
    mocks.buscarChatDoUsuario.mockRejectedValue(new Error('Chat não encontrado'))

    await expect(
      confirmarMensagem({ chatId, messageId: 'message-1', userId, client: {} as never })
    ).rejects.toThrow('Chat não encontrado')
    await expect(cancelarConfirmacao({ chatId, messageId: 'message-1', userId })).rejects.toThrow(
      'Chat não encontrado'
    )
    expect(mocks.prisma.message.updateMany).not.toHaveBeenCalled()
  })

  it('não grava uma mensagem se a conversa for ocultada durante a interpretação', async () => {
    mocks.interpretar.mockImplementation(async () => {
      currentChat.deletedAt = new Date()
      return { kind: 'desconhecida' }
    })

    await expect(processarMensagem({ chatId, userId, content: 'oi', client: {} as never })).rejects.toThrow(
      'Chat não encontrado'
    )
    expect(mocks.tx.message.create).not.toHaveBeenCalled()
  })
})
