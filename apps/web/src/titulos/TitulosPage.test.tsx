// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TitulosPage } from './TitulosPage'
import { buscarTitulo, listarCategorias, listarTitulos } from './financeiro-api'
import type { FinanceiroTipo, ListaTitulosFinanceiros, TituloFinanceiro } from './financeiro-api'

vi.mock('../auth/session-context', () => ({ useSession: () => ({ user: { role: 'ADMIN' } }) }))
vi.mock('./financeiro-api', async (original) => ({
  ...(await original<object>()),
  listarTitulos: vi.fn(),
  listarCategorias: vi.fn(),
  buscarTitulo: vi.fn(),
}))

const titulo: TituloFinanceiro = {
  id: 'titulo-anterior',
  descricao: 'Título anterior',
  pessoa: 'Contato anterior',
  contatoId: 'contato',
  valor: 123,
  valorLiquidado: 0,
  dataLancamento: '2032-03-01',
  dataVencimento: '2032-03-10',
  numeroParcelas: 1,
  observacoes: null,
  categoria: null,
  status: 'PENDENTE',
  createdAt: '2032-03-01T12:00:00.000Z',
  updatedAt: '2032-03-01T12:00:00.000Z',
}
const lista = (items: TituloFinanceiro[]): ListaTitulosFinanceiros => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
})
let container: HTMLDivElement
let root: Root

async function render(tipo: FinanceiroTipo) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <TitulosPage tipo={tipo} />
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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.mocked(listarTitulos).mockResolvedValue(lista([titulo]))
  vi.mocked(listarCategorias).mockResolvedValue([])
  vi.mocked(buscarTitulo).mockResolvedValue({ ...titulo, parcelas: [], liquidacoes: [], historico: [] })
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

describe('isolamento entre contas a pagar e receber', () => {
  it.each(['DESPESA', 'RECEBIMENTO'] as const)(
    'descarta edição, detalhes e filtros ao sair de %s',
    async (tipo) => {
      await render(tipo)
      const filtro = container.querySelector<HTMLSelectElement>('#finance-filter-status')!
      await act(async () => {
        filtro.value = 'PARCIAL'
        filtro.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await click('Buscar')
      await click('Detalhes')
      await click('Editar')
      expect(container.querySelector('#finance-form-title')?.textContent).toBe('Editar título')
      expect(container.querySelector('#finance-detail-title')).not.toBeNull()

      vi.mocked(listarTitulos).mockResolvedValue(lista([]))
      const outroTipo = tipo === 'DESPESA' ? 'RECEBIMENTO' : 'DESPESA'
      await render(outroTipo)
      expect(container.querySelector('#finance-form-title')).toBeNull()
      expect(container.querySelector('#finance-detail-title')).toBeNull()
      expect(container.querySelector<HTMLSelectElement>('#finance-filter-status')?.value).toBe('')
      expect(listarTitulos).toHaveBeenLastCalledWith(outroTipo, { page: 1, pageSize: 20 }, expect.anything())
      await click('Novo título')
      expect(container.querySelector('#finance-form-title')?.textContent).toBe('Novo título')
      expect(container.innerHTML).not.toContain('Contato anterior')
    }
  )

  it('ignora uma resposta de lista substituída por uma busca mais recente', async () => {
    let resolver!: (value: ListaTitulosFinanceiros) => void
    vi.mocked(listarTitulos).mockReturnValueOnce(
      new Promise((resolve) => {
        resolver = resolve
      })
    )
    await render('DESPESA')
    const signal = vi.mocked(listarTitulos).mock.calls[0]?.[2]
    vi.mocked(listarTitulos).mockResolvedValue(lista([]))
    await click('Limpar')
    await act(async () => resolver(lista([titulo])))
    expect(signal?.aborted).toBe(true)
    expect(container.innerHTML).not.toContain('Título anterior')
    expect(container.textContent).toContain('Nenhum título corresponde aos filtros.')
  })
})
