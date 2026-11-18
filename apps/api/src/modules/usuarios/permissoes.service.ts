import { prisma } from '@sisgfpa/database'
import { NotFoundError } from '@sisgfpa/http'
import { DEFAULT_EMPLOYEE_PERMISSIONS, MODULE_PERMISSION_KEYS, employeePermissions } from '@sisgfpa/types'
import type { ModulePermissions } from '@sisgfpa/types'

export const PERMISSOES_FUNCIONARIO_PADRAO = DEFAULT_EMPLOYEE_PERMISSIONS

export async function listarFuncionarios() {
  const funcionarios = await prisma.user.findMany({
    where: { role: 'FUNCIONARIO' },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      permissoesFuncionario: {
        select: { comercial: true, despesas: true, recebimentos: true, relatorios: true },
      },
    },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  })

  return {
    items: funcionarios.map(({ permissoesFuncionario, ...funcionario }) => ({
      ...funcionario,
      createdAt: funcionario.createdAt.toISOString(),
      permissoes: employeePermissions(permissoesFuncionario),
    })),
  }
}

export async function atualizarPermissoesFuncionario(
  funcionarioId: string,
  alteradoPorId: string,
  alteracoes: Partial<ModulePermissions>
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${funcionarioId} FOR UPDATE`
    const funcionario = await tx.user.findFirst({
      where: { id: funcionarioId, role: 'FUNCIONARIO' },
      select: { id: true },
    })
    if (!funcionario) throw new NotFoundError('Funcionário não encontrado')

    const atual = await tx.funcionarioPermissao.findUnique({ where: { funcionarioId } })
    const permissoesAnteriores = employeePermissions(atual)
    const novasPermissoes = { ...permissoesAnteriores, ...alteracoes }
    const mudou = MODULE_PERMISSION_KEYS.some((key) => permissoesAnteriores[key] !== novasPermissoes[key])

    if (mudou) {
      await tx.funcionarioPermissao.upsert({
        where: { funcionarioId },
        create: { funcionarioId, ...novasPermissoes },
        update: novasPermissoes,
      })
      await tx.funcionarioPermissaoHistorico.create({
        data: {
          funcionarioId,
          alteradoPorId,
          permissoesAnteriores,
          permissoesNovas: novasPermissoes,
        },
      })
    }

    return { funcionarioId, permissoes: novasPermissoes }
  })
}
