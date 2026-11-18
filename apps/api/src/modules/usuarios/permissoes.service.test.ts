import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  query: vi.fn(),
  user: vi.fn(),
  find: vi.fn(),
  save: vi.fn(),
  history: vi.fn(),
}))
vi.mock('@sisgfpa/database', () => ({
  prisma: {
    $transaction: async (callback: (tx: any) => unknown) =>
      callback({
        $queryRaw: state.query,
        user: { findFirst: state.user },
        funcionarioPermissao: { findUnique: state.find, upsert: state.save },
        funcionarioPermissaoHistorico: { create: state.history },
      }),
  },
}))
vi.mock('@sisgfpa/auth', () => ({ getAuthenticatedUser: vi.fn() }))
import { atualizarPermissoesFuncionario } from './permissoes.service.js'

describe('alterações auditadas das permissões', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.user.mockResolvedValue({ id: 'func' })
    state.find.mockResolvedValue(null)
  })
  it('completa padrões, preserva campos omitidos e audita as quatro permissões', async () => {
    const previous = { comercial: false, despesas: true, recebimentos: false, relatorios: true }
    state.find.mockResolvedValue(previous)
    const result = await atualizarPermissoesFuncionario('func', 'admin', { despesas: false })
    expect(result.permissoes).toEqual({ ...previous, despesas: false })
    expect(state.history).toHaveBeenCalledExactlyOnceWith({
      data: {
        funcionarioId: 'func',
        alteradoPorId: 'admin',
        permissoesAnteriores: previous,
        permissoesNovas: { ...previous, despesas: false },
      },
    })
    expect(state.query).toHaveBeenCalledOnce()
  })
  it('mantém compatibilidade com a configuração financeira anterior e não concede relatórios', async () => {
    const result = await atualizarPermissoesFuncionario('func', 'admin', {
      despesas: false,
      recebimentos: true,
    })
    expect(result.permissoes).toEqual({
      comercial: true,
      despesas: false,
      recebimentos: true,
      relatorios: false,
    })
  })
  it('não cria nova auditoria quando as permissões não mudam', async () => {
    await atualizarPermissoesFuncionario('func', 'admin', { relatorios: false })
    expect(state.save).not.toHaveBeenCalled()
    expect(state.history).not.toHaveBeenCalled()
  })
  it('recusa alvos que não são funcionários', async () => {
    state.user.mockResolvedValue(null)
    await expect(
      atualizarPermissoesFuncionario('admin', 'outro-admin', { despesas: false })
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(state.save).not.toHaveBeenCalled()
  })
})
