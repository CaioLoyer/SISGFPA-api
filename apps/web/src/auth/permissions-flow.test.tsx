// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectivePermissions } from '@sisgfpa/types'
import App from '../App'
import { SessionProvider } from './session-context'
import {
  getCurrentPermissions,
  getCurrentUser,
  listFuncionarios,
  updateFuncionarioPermissoes,
} from './auth-api'
import { listarCategorias, listarTitulos } from '../titulos/financeiro-api'
import { consultarRelatorio } from '../relatorios/relatorios-api'

vi.mock('./auth-api', async (original) => ({
  ...(await original<object>()),
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  listFuncionarios: vi.fn(),
  updateFuncionarioPermissoes: vi.fn(),
}))
vi.mock('../titulos/financeiro-api', async (original) => ({
  ...(await original<object>()),
  listarTitulos: vi.fn(),
  listarCategorias: vi.fn(),
}))
vi.mock('../relatorios/relatorios-api', async (original) => ({
  ...(await original<object>()),
  consultarRelatorio: vi.fn(),
}))
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 'func',
    name: 'Funcionário',
    email: 'func@teste.local',
    role: 'FUNCIONARIO',
  })
  vi.mocked(listarTitulos).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
  vi.mocked(listarCategorias).mockResolvedValue([])
  vi.mocked(consultarRelatorio).mockResolvedValue({ total: 100, liquidado: 25, pendente: 75, itens: [] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
async function render(path: string) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </MemoryRouter>
    )
  )
}

describe('permissões da sessão nas telas reais', () => {
  it('ADMIN salva Comercial, Financeiro e Relatórios pelos controles existentes', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'admin',
      name: 'Admin',
      email: 'admin@teste.local',
      role: 'ADMIN',
    })
    vi.mocked(getCurrentPermissions).mockResolvedValue(effectivePermissions('ADMIN'))
    vi.mocked(listFuncionarios).mockResolvedValue([
      {
        id: 'func',
        name: 'Funcionário',
        email: 'func@teste.local',
        createdAt: '2032-03-01T12:00:00Z',
        permissoes: { comercial: true, despesas: true, recebimentos: true, relatorios: false },
      },
    ])
    vi.mocked(updateFuncionarioPermissoes).mockImplementation(async (_id, permissions) => permissions)
    await render('/admin')
    for (const name of ['financeiro', 'comercial', 'contas a pagar', 'relatórios']) {
      const label = Array.from(container.querySelectorAll('label')).find(
        (item) => item.textContent?.trim() === `Permitir ${name} para Funcionário`
      )
      const input = label?.querySelector('input')
      expect(input, name).toBeTruthy()
      await act(async () => input!.click())
    }
    await act(async () => container.querySelector<HTMLButtonElement>('.admin-save-button')!.click())
    expect(updateFuncionarioPermissoes).toHaveBeenCalledExactlyOnceWith('func', {
      comercial: false,
      despesas: true,
      recebimentos: false,
      relatorios: true,
    })
    expect(container.querySelector('.admin-saved')?.textContent).toBe('Salvo')
  })
  it('bloqueia URL direta antes de montar o módulo negado e oculta seus atalhos', async () => {
    vi.mocked(getCurrentPermissions).mockResolvedValue(
      effectivePermissions('FUNCIONARIO', {
        comercial: false,
        despesas: false,
        recebimentos: true,
        relatorios: false,
      })
    )
    await render('/despesas')
    expect(container.textContent).toContain('Acesso não permitido')
    expect(container.querySelector('a[href="/despesas"]')).toBeNull()
    expect(container.querySelector('a[href="/comercial"]')).toBeNull()
    expect(container.querySelector('a[href="/recebimentos"]')).not.toBeNull()
    expect(listarTitulos).not.toHaveBeenCalled()
  })
  it('remove os dados e os atalhos quando o acesso é revogado na sessão aberta', async () => {
    vi.mocked(getCurrentPermissions).mockResolvedValue(effectivePermissions('FUNCIONARIO'))
    await render('/recebimentos')
    expect(container.textContent).toContain('Novo título')
    vi.mocked(getCurrentPermissions).mockResolvedValue(
      effectivePermissions('FUNCIONARIO', { comercial: false, despesas: false, recebimentos: false })
    )
    await act(async () => {
      window.dispatchEvent(new Event('sisgfpa:permissions-denied'))
    })
    expect(container.textContent).toContain('Acesso não permitido')
    expect(container.textContent).not.toContain('Novo título')
    expect(container.querySelector('a[href="/recebimentos"]')).toBeNull()
  })

  it('não restaura acesso com uma resposta de permissões anterior à revogação', async () => {
    const previous = effectivePermissions('FUNCIONARIO')
    vi.mocked(getCurrentPermissions).mockResolvedValue(previous)
    await render('/recebimentos')
    let resolveOld!: (value: typeof previous) => void
    vi.mocked(getCurrentPermissions).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve
      })
    )
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    vi.mocked(getCurrentPermissions).mockResolvedValue(
      effectivePermissions('FUNCIONARIO', { recebimentos: false })
    )
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await act(async () => resolveOld(previous))
    expect(container.textContent).toContain('Acesso não permitido')
    expect(container.querySelector('a[href="/recebimentos"]')).toBeNull()
  })
  it('abre apenas o tipo autorizado no relatório e impede selecionar o outro', async () => {
    vi.mocked(getCurrentPermissions).mockResolvedValue(
      effectivePermissions('FUNCIONARIO', { despesas: false, recebimentos: true, relatorios: true })
    )
    await render('/relatorios')
    expect(consultarRelatorio).toHaveBeenCalledWith('RECEBER', expect.anything())
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('.reports-tab'))
    expect(tabs.find((tab) => tab.textContent?.includes('pagar'))?.disabled).toBe(true)
    expect(tabs.find((tab) => tab.textContent?.includes('receber'))?.disabled).toBe(false)
  })
})
