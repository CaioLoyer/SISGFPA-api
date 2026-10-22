import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buscarConversa,
  confirmarOperacao,
  criarConversa,
  descartarOperacao,
  enviarMensagem,
  listarConversas,
} from './chatbot-api'

const chat = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Conversa de teste',
  createdAt: '2026-10-21T12:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
}

const userMessage = {
  id: '00000000-0000-4000-8000-000000000002',
  chatId: chat.id,
  papel: 'USUARIO',
  content: 'Compramos cadernos por R$ 50',
  intent: 'CRIAR_DESPESA',
  status: 'PENDENTE_CONFIRMACAO',
  parsedData: null,
  resultado: null,
  despesaId: null,
  recebimentoId: null,
  createdAt: '2026-10-21T12:01:00.000Z',
}

const assistantMessage = {
  ...userMessage,
  id: '00000000-0000-4000-8000-000000000003',
  papel: 'ASSISTENTE',
  content: 'Confirma o registro?',
  intent: null,
  status: 'INFORMATIVA',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('cliente HTTP do Chatbot', () => {
  it('lista conversas autenticadas usando o cookie da sessão', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([chat]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(listarConversas()).resolves.toEqual([chat])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3001/chats/')
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).credentials).toBe('include')
  })

  it('cria conversa e carrega seu histórico', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(chat, 201))
      .mockResolvedValueOnce(response({ ...chat, messages: [userMessage] }))
    vi.stubGlobal('fetch', fetchMock)

    await criarConversa('Conversa de teste')
    await expect(buscarConversa(chat.id)).resolves.toMatchObject({ messages: [userMessage] })
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      title: 'Conversa de teste',
    })
  })

  it('envia mensagem e preserva referência à confirmação pendente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        userMessage,
        assistantMessage,
        confirmacao: { messageId: userMessage.id, resumo: 'Confirma?' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(enviarMensagem(chat.id, userMessage.content)).resolves.toMatchObject({
      confirmacao: { messageId: userMessage.id },
      userMessage: { status: 'PENDENTE_CONFIRMACAO' },
    })
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      content: userMessage.content,
    })
  })

  it('confirma ou descarta uma operação pela conversa e mensagem corretas', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ userMessage, assistantMessage, erro: null }))
      .mockResolvedValueOnce(response({ userMessage, assistantMessage }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(confirmarOperacao(chat.id, userMessage.id)).resolves.toMatchObject({ erro: null })
    await expect(descartarOperacao(chat.id, userMessage.id)).resolves.toMatchObject({
      userMessage: { id: userMessage.id },
    })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `http://localhost:3001/chats/${chat.id}/messages/${userMessage.id}/confirm`,
      `http://localhost:3001/chats/${chat.id}/messages/${userMessage.id}/cancel`,
    ])
  })

  it('apresenta falhas de autorização retornadas pelo serviço', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Acesso negado' }, 403)))

    await expect(listarConversas()).rejects.toMatchObject({ status: 403, message: 'Acesso negado' })
  })
})
