import { prisma } from '@sisgfpa/database'
import { NotFoundError } from '@sisgfpa/http'
import type { FuncionarioPermissoesSchema } from '@sisgfpa/validation'
import type { z } from 'zod'

type FuncionarioPermissoes = z.infer<typeof FuncionarioPermissoesSchema>

export const PERMISSOES_FUNCIONARIO_PADRAO: FuncionarioPermissoes = {
  despesas: true,
  recebimentos: true,
}

export async function listarFuncionarios() {
  const funcionarios = await prisma.user.findMany({
    where: { role: 'FUNCIONARIO' },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      permissoesFuncionario: { select: { despesas: true, recebimentos: true } },
    },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  })

  return {
    items: funcionarios.map(({ permissoesFuncionario, ...funcionario }) => ({
      ...funcionario,
      createdAt: funcionario.createdAt.toISOString(),
      permissoes: permissoesFuncionario ?? PERMISSOES_FUNCIONARIO_PADRAO,
    })),
  }
}

export async function atualizarPermissoesFuncionario(
  funcionarioId: string,
  alteradoPorId: string,
  novasPermissoes: FuncionarioPermissoes
) {
  return prisma.$transaction(async (tx) => {
    const funcionario = await tx.user.findFirst({
      where: { id: funcionarioId, role: 'FUNCIONARIO' },
      select: { id: true },
    })
    if (!funcionario) throw new NotFoundError('Funcionário não encontrado')

    const atual = await tx.funcionarioPermissao.findUnique({ where: { funcionarioId } })
    const permissoesAnteriores = atual
      ? { despesas: atual.despesas, recebimentos: atual.recebimentos }
      : PERMISSOES_FUNCIONARIO_PADRAO
    const mudou =
      permissoesAnteriores.despesas !== novasPermissoes.despesas ||
      permissoesAnteriores.recebimentos !== novasPermissoes.recebimentos

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
