import type { AuthenticatedUser } from '@sisgfpa/auth'
import { prisma } from '@sisgfpa/database'
import { ForbiddenError, UnauthorizedError } from '@sisgfpa/http'
import { effectivePermissions } from '@sisgfpa/types'
import type { EffectivePermissions } from '@sisgfpa/types'
import type { FastifyRequest } from 'fastify'

export async function consultarPermissoes(user: AuthenticatedUser): Promise<EffectivePermissions> {
  const config =
    user.role === 'ADMIN'
      ? null
      : await prisma.funcionarioPermissao.findUnique({
          where: { funcionarioId: user.id },
          select: { comercial: true, despesas: true, recebimentos: true, relatorios: true },
        })
  return effectivePermissions(user.role, config)
}

// Cache apenas da requisição corrente; uma alteração vale já na requisição seguinte da mesma sessão.
const requests = new WeakMap<FastifyRequest, Promise<EffectivePermissions>>()
export function permissoesDaRequisicao(request: FastifyRequest) {
  if (!request.user) throw new UnauthorizedError()
  let permissions = requests.get(request)
  if (!permissions) {
    permissions = consultarPermissoes(request.user)
    requests.set(request, permissions)
  }
  return permissions
}

export function requireModulePermission(permission: keyof EffectivePermissions) {
  return async (request: FastifyRequest) => {
    if (!(await permissoesDaRequisicao(request))[permission])
      throw new ForbiddenError('Seu usuário não tem acesso a este módulo')
  }
}
