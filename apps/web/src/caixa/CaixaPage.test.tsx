// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { role: 'ADMIN' as 'ADMIN' | 'FUNCIONARIO' },
  consultarCaixa: vi.fn(),
  estornarMovimentacao: vi.fn(),
  corrigirLancamentoAvulso: vi.fn(),
  criarLancamentoAvulso: vi.fn(),
  informarSaldoInicial: vi.fn(),
  listarMovimentacoes: vi.fn(),
}))

vi.mock('../auth/session-context', () => ({ useSession: () => ({ user: state.user }) }))
vi.mock('./caixa-api', async (original) => ({
  ...(await original<object>()),
  consultarCaixa: state.consultarCaixa,
  estornarMovimentacao: state.estornarMovimentacao,
  corrigirLancamentoAvulso: state.corrigirLancamentoAvulso,
  criarLancamentoAvulso: state.criarLancamentoAvulso,
  informarSaldoInicial: state.informarSaldoInicial,
  listarMovimentacoes: state.listarMovimentacoes,
}))

import { CaixaPage } from './CaixaPage'

let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <CaixaPage />
      </MemoryRouter>
    )
  })
}

async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === label
  )
  expect(button, label).toBeTruthy()
  await act(async () => button!.click())
}

async function preencher(seletor: string, valor: string, evento = 'change') {
  const campo = container.querySelector<HTMLInputElement | HTMLSelectElement>(seletor)
  expect(campo, seletor).toBeTruthy()
  await act(async () => {
    const prototype =
      campo instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(campo, valor)
    campo!.dispatchEvent(new Event(evento, { bubbles: true }))
  })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  state.user = { role: 'ADMIN' }
  state.consultarCaixa.mockResolvedValue({
    id: 'caixa-1',
    codigo: 'PRINCIPAL',
    saldoInicial: 500,
    iniciadoEm: '2032-03-10T04:00:00.000Z',
    totalEntradas: 0,
    totalSaidas: 0,
    quantidadeMovimentacoes: 0,
    saldoAtual: 500,
  })
  state.listarMovimentacoes.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
  state.criarLancamentoAvulso.mockResolvedValue({ id: 'movimento-1' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('lançamentos avulsos na tela do Caixa', () => {
  it('ADMIN confirma e registra uma saída sem criar título', async () => {
    await render()
    await click('Novo lançamento')
    await preencher('#cash-manual-direction', 'SAIDA')
    await preencher('#cash-manual-value', '25', 'input')
    await preencher('#cash-manual-date', '2032-03-10', 'input')
    await preencher('#cash-manual-description', 'Retirada para troco', 'input')
    await click('Confirmar lançamento')

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(window.confirm).mock.calls[0]?.[0])).toContain('registrar a saída de R$')
    expect(state.criarLancamentoAvulso).toHaveBeenCalledWith({
      tipo: 'SAIDA',
      valor: 25,
      data: '2032-03-10',
      descricao: 'Retirada para troco',
      idempotencyKey: expect.any(String),
    })
  })

  it('FUNCIONARIO não recebe a ação de criar lançamentos avulsos', async () => {
    state.user = { role: 'FUNCIONARIO' }
    await render()

    expect(container.textContent).toContain('Acesso não permitido')
    expect(container.textContent).not.toContain('Novo lançamento')
    expect(state.criarLancamentoAvulso).not.toHaveBeenCalled()
  })
})
