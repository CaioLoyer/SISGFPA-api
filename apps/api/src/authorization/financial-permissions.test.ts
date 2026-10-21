import type { AuthenticatedUser } from '@sisgfpa/auth'
import type { FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))

vi.mock('@sisgfpa/database', () => ({
  prisma: { funcionarioPermissao: { findUnique: database.findUnique } },
}))

import { requireAnyFinancialPermission, requireFinancialPermission } from './financial-permissions.js'

const funcionario: AuthenticatedUser = {
  id: 'f1',
  name: 'Funcionária',
  email: 'f@example.com',
  role: 'FUNCIONARIO',
}
const admin: AuthenticatedUser = { ...funcionario, id: 'a1', role: 'ADMIN' }

function request(user: AuthenticatedUser, query: Record<string, string> = {}) {
  return { user, query } as unknown as FastifyRequest
}

beforeEach(() => database.findUnique.mockReset())

describe('permissões individuais nos módulos financeiros', () => {
  it('preserva os acessos atuais quando o funcionário ainda não tem configuração', async () => {
    database.findUnique.mockResolvedValue(null)

    await expect(requireFinancialPermission('despesas')(request(funcionario))).resolves.toBeUndefined()
    await expect(requireFinancialPermission('recebimentos')(request(funcionario))).resolves.toBeUndefined()
  })

  it('bloqueia apenas o módulo cuja permissão foi removida', async () => {
    database.findUnique.mockResolvedValue({ despesas: false, recebimentos: true })

    await expect(requireFinancialPermission('despesas')(request(funcionario))).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    })
    await expect(requireFinancialPermission('recebimentos')(request(funcionario))).resolves.toBeUndefined()
  })

  it('não consulta nem restringe um ADMIN por permissões de funcionário', async () => {
    await expect(requireFinancialPermission('despesas')(request(admin))).resolves.toBeUndefined()
    expect(database.findUnique).not.toHaveBeenCalled()
  })

  it('restringe categorias pelo módulo solicitado e exige ambos os módulos para consulta sem tipo', async () => {
    database.findUnique.mockResolvedValue({ despesas: false, recebimentos: true })

    await expect(
      requireAnyFinancialPermission(request(funcionario, { tipo: 'DESPESA' }))
    ).rejects.toMatchObject({
      statusCode: 403,
    })
    await expect(
      requireAnyFinancialPermission(request(funcionario, { tipo: 'RECEBIMENTO' }))
    ).resolves.toBeUndefined()
    await expect(requireAnyFinancialPermission(request(funcionario))).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})
