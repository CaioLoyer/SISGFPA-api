// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  listarConversas: vi.fn(),
  buscarConversa: vi.fn(),
  criarConversa: vi.fn(),
  excluirConversa: vi.fn(),
  enviarMensagem: vi.fn(),
  confirmarOperacao: vi.fn(),
  descartarOperacao: vi.fn(),
}))

vi.mock('../auth/session-context', () => ({
  useSession: () => ({
    user: { id: 'user-1', name: 'Maria da Silva', role: 'ADMIN' },
    permissions: {
      comercial: true,
      despesas: true,
      recebimentos: true,
      relatorios: true,
      caixa: true,
      administracao: true,
    },
  }),
}))
vi.mock('./chatbot-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listarConversas: state.listarConversas,
  buscarConversa: state.buscarConversa,
  criarConversa: state.criarConversa,
  excluirConversa: state.excluirConversa,
  enviarMensagem: state.enviarMensagem,
  confirmarOperacao: state.confirmarOperacao,
  descartarOperacao: state.descartarOperacao,
}))

import { ChatbotPage } from './ChatbotPage'

const firstChat = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Primeira conversa',
  createdAt: '2026-11-18T12:00:00.000Z',
  updatedAt: '2026-11-18T12:00:00.000Z',
}
const secondChat = {
  id: '00000000-0000-4000-8000-000000000002',
  title: 'Segunda conversa',
  createdAt: '2026-11-17T12:00:00.000Z',
  updatedAt: '2026-11-17T12:00:00.000Z',
}

let container: HTMLDivElement
let root: Root
let scrollIntoViewDescriptor: PropertyDescriptor | undefined

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    )
  })
}

async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label
  )
  expect(button, label).toBeTruthy()
  await act(async () => button!.click())
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  state.listarConversas.mockReset().mockResolvedValue([firstChat, secondChat])
  state.buscarConversa.mockReset().mockImplementation(async (id: string) => ({
    ...(id === firstChat.id ? firstChat : secondChat),
    messages: [],
  }))
  state.criarConversa.mockReset()
  state.excluirConversa.mockReset().mockResolvedValue(undefined)
  state.enviarMensagem.mockReset()
  state.confirmarOperacao.mockReset()
  state.descartarOperacao.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  if (scrollIntoViewDescriptor)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('exclusão de conversa no Chatbot', () => {
  it('pede confirmação, exclui a conversa ativa e abre a próxima do histórico', async () => {
    await render()
    await clickButton('Excluir conversa: Primeira conversa')

    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.textContent).toContain('propostas ainda não confirmadas serão descartadas')
    await clickButton('Excluir conversa')

    expect(state.excluirConversa).toHaveBeenCalledWith(firstChat.id)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).not.toContain('Primeira conversa')
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain('Segunda conversa')
    expect(container.querySelector('.chatbot-conversation-heading')?.textContent).toContain(
      'Segunda conversa'
    )
    expect(state.buscarConversa).toHaveBeenLastCalledWith(secondChat.id)
  })

  it('mantém a conversa se o usuário cancelar a confirmação', async () => {
    await render()
    await clickButton('Excluir conversa: Primeira conversa')
    await clickButton('Manter conversa')

    expect(state.excluirConversa).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain('Primeira conversa')
  })

  it('mostra o estado vazio depois de excluir a última conversa', async () => {
    state.listarConversas.mockResolvedValueOnce([firstChat])
    await render()
    await clickButton('Excluir conversa: Primeira conversa')
    await clickButton('Excluir conversa')

    expect(container.querySelector('[aria-label="Abrir conversa: Primeira conversa"]')).toBeNull()
    expect(container.textContent).toContain('Suas conversas aparecerão aqui.')
    expect(container.querySelector('.chatbot-welcome-message')).toBeTruthy()
  })

  it('indica quando uma operação confirmada ainda está em processamento', async () => {
    state.buscarConversa.mockResolvedValueOnce({
      ...firstChat,
      messages: [
        {
          id: '00000000-0000-4000-8000-000000000003',
          chatId: firstChat.id,
          papel: 'USUARIO',
          content: 'Registrar pagamento de R$ 25',
          intent: 'REGISTRAR_PAGAMENTO',
          status: 'PROCESSANDO',
          parsedData: null,
          resultado: null,
          despesaId: null,
          recebimentoId: null,
          createdAt: '2026-11-18T12:00:00.000Z',
        },
      ],
    })

    await render()

    expect(container.textContent).toContain(
      'Operação em processamento. Aguarde antes de excluir esta conversa.'
    )
    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('Confirmar operação')
      )
    ).toBe(false)
  })
})

describe('sugestões de navegação no Chatbot', () => {
  it('mostra os módulos retornados pelo serviço junto à resposta do assistente', async () => {
    state.buscarConversa.mockResolvedValueOnce({
      ...firstChat,
      messages: [
        {
          id: 'user-message',
          chatId: firstChat.id,
          papel: 'USUARIO',
          content: 'Quero consultar o financeiro',
          intent: 'DESCONHECIDA',
          status: 'INFORMATIVA',
          parsedData: { topicos: ['expenses', 'receipts'] },
          resultado: null,
          despesaId: null,
          recebimentoId: null,
          createdAt: '2026-11-18T12:00:00.000Z',
        },
        {
          id: 'assistant-message',
          chatId: firstChat.id,
          papel: 'ASSISTENTE',
          content: 'Escolha um dos módulos que podem ajudar:',
          intent: null,
          status: 'INFORMATIVA',
          parsedData: null,
          resultado: null,
          despesaId: null,
          recebimentoId: null,
          createdAt: '2026-11-18T12:00:01.000Z',
        },
      ],
    })

    await render()

    const sugestoes = container.querySelector('[aria-label="Módulos sugeridos"]')
    expect(sugestoes?.querySelectorAll('a')).toHaveLength(2)
    expect(sugestoes?.querySelector('a[href="/despesas"]')?.textContent).toContain('Contas a pagar')
    expect(sugestoes?.querySelector('a[href="/recebimentos"]')?.textContent).toContain('Contas a receber')
  })
})
