import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyRequest } from 'fastify'
import { effectivePermissions } from '@sisgfpa/types'
const state = vi.hoisted(() => ({ find: vi.fn() }))
vi.mock('@sisgfpa/database', () => ({ prisma: { funcionarioPermissao: { findUnique: state.find } } }))
vi.mock('@sisgfpa/auth', () => ({ getAuthenticatedUser: vi.fn() }))
import { consultarPermissoes, permissoesDaRequisicao, requireModulePermission } from './module-permissions.js'

const user = {
  id: 'funcionario',
  name: 'Funcionário',
  email: 'func@teste.local',
  role: 'FUNCIONARIO' as const,
}
describe('catálogo e permissões efetivas', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.find.mockResolvedValue(null)
  })
  it.each(
    Array.from({ length: 16 }, (_, n) => ({
      comercial: !!(n & 1),
      despesas: !!(n & 2),
      recebimentos: !!(n & 4),
      relatorios: !!(n & 8),
    }))
  )('aplica a combinação %j', async (config) => {
    state.find.mockResolvedValue(config)
    expect(await consultarPermissoes(user)).toEqual({
      ...config,
      relatorios: config.relatorios && (config.despesas || config.recebimentos),
      caixa: false,
      administracao: false,
    })
    expect(effectivePermissions('ADMIN', config)).toEqual({
      comercial: true,
      despesas: true,
      recebimentos: true,
      relatorios: true,
      caixa: true,
      administracao: true,
    })
  })
  it('preserva acessos padrão sem liberar relatórios automaticamente', async () => {
    expect(await consultarPermissoes(user)).toEqual({
      comercial: true,
      despesas: true,
      recebimentos: true,
      relatorios: false,
      caixa: false,
      administracao: false,
    })
  })
  it('reutiliza a leitura apenas na mesma requisição e reavalia a sessão na seguinte', async () => {
    const first = { user } as FastifyRequest
    await permissoesDaRequisicao(first)
    await requireModulePermission('despesas')(first)
    expect(state.find).toHaveBeenCalledTimes(1)
    state.find.mockResolvedValue({ despesas: false })
    await expect(requireModulePermission('despesas')({ user } as FastifyRequest)).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(state.find).toHaveBeenCalledTimes(2)
    expect(() => permissoesDaRequisicao({} as FastifyRequest)).toThrow()
  })
})
