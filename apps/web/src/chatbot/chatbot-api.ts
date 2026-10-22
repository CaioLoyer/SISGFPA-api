const apiBaseUrl = (import.meta.env.VITE_CHATBOT_API_URL || 'http://localhost:3001').replace(/\/+$/, '')

export interface ChatMessage {
  id: string
  chatId: string
  papel: 'USUARIO' | 'ASSISTENTE'
  content: string
  intent: string | null
  status: string
  parsedData: unknown | null
  resultado: unknown | null
  despesaId: string | null
  recebimentoId: string | null
  createdAt: string
}

export interface ChatSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatWithMessages extends ChatSummary {
  messages: ChatMessage[]
}

export interface ChatConfirmation {
  messageId: string
  resumo: string
}

export interface SendMessageResult {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  confirmacao: ChatConfirmation | null
}

export interface ChatActionResult {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  erro?: { status: number; code: string; message: string } | null
}

export class ChatbotApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'ChatbotApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function invalidResponse(): never {
  throw new ChatbotApiError('O Chatbot retornou uma resposta inválida.')
}

function parseChat(value: unknown): ChatSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return invalidResponse()
  }
  return value as unknown as ChatSummary
}

function parseMessage(value: unknown): ChatMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.chatId !== 'string' ||
    (value.papel !== 'USUARIO' && value.papel !== 'ASSISTENTE') ||
    typeof value.content !== 'string' ||
    !(value.intent === null || typeof value.intent === 'string') ||
    typeof value.status !== 'string' ||
    !(value.despesaId === null || typeof value.despesaId === 'string') ||
    !(value.recebimentoId === null || typeof value.recebimentoId === 'string') ||
    typeof value.createdAt !== 'string'
  ) {
    return invalidResponse()
  }
  return value as unknown as ChatMessage
}

function parseSendResult(value: unknown): SendMessageResult {
  if (!isRecord(value)) return invalidResponse()
  const confirmation = value.confirmacao
  if (
    confirmation !== null &&
    (!isRecord(confirmation) ||
      typeof confirmation.messageId !== 'string' ||
      typeof confirmation.resumo !== 'string')
  ) {
    return invalidResponse()
  }
  return {
    userMessage: parseMessage(value.userMessage),
    assistantMessage: parseMessage(value.assistantMessage),
    confirmacao: confirmation as ChatConfirmation | null,
  }
}

function parseActionResult(value: unknown): ChatActionResult {
  if (!isRecord(value)) return invalidResponse()
  let erro: ChatActionResult['erro'] = null
  if (value.erro !== null && value.erro !== undefined) {
    if (
      !isRecord(value.erro) ||
      typeof value.erro.status !== 'number' ||
      typeof value.erro.code !== 'string' ||
      typeof value.erro.message !== 'string'
    ) {
      return invalidResponse()
    }
    erro = value.erro as NonNullable<ChatActionResult['erro']>
  }
  return {
    userMessage: parseMessage(value.userMessage),
    assistantMessage: parseMessage(value.assistantMessage),
    erro,
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ChatbotApiError('Não foi possível conectar ao Chatbot.')
  }

  const rawBody = await response.text()
  let body: unknown = null
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as unknown
    } catch {
      throw new ChatbotApiError('O Chatbot retornou uma resposta inválida.', response.status)
    }
  }

  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string' ? body.error : undefined
    throw new ChatbotApiError(
      response.status === 401
        ? 'Sua sessão pode ter expirado. Entre novamente.'
        : message || 'Não foi possível concluir a operação no Chatbot.',
      response.status
    )
  }
  return body
}

export async function listarConversas(): Promise<ChatSummary[]> {
  const value = await request('/chats/')
  if (!Array.isArray(value)) return invalidResponse()
  return value.map(parseChat)
}

export async function criarConversa(title?: string): Promise<ChatSummary> {
  const value = await request('/chats/', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  })
  return parseChat(value)
}

export async function buscarConversa(chatId: string): Promise<ChatWithMessages> {
  const value = await request(`/chats/${encodeURIComponent(chatId)}`)
  if (!isRecord(value) || !Array.isArray(value.messages)) return invalidResponse()
  return { ...parseChat(value), messages: value.messages.map(parseMessage) }
}

export async function enviarMensagem(chatId: string, content: string): Promise<SendMessageResult> {
  return parseSendResult(
    await request(`/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  )
}

export async function confirmarOperacao(chatId: string, messageId: string): Promise<ChatActionResult> {
  return parseActionResult(
    await request(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/confirm`, {
      method: 'POST',
    })
  )
}

export async function descartarOperacao(chatId: string, messageId: string): Promise<ChatActionResult> {
  const result = await request(
    `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/cancel`,
    { method: 'POST' }
  )
  if (!isRecord(result)) return invalidResponse()
  return {
    userMessage: parseMessage(result.userMessage),
    assistantMessage: parseMessage(result.assistantMessage),
  }
}
