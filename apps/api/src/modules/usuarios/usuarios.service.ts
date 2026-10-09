import { auth, fromNodeHeaders } from '@sisgfpa/auth'
import { prisma } from '@sisgfpa/database'
import { ConflictError } from '@sisgfpa/http'
import type { CreateFuncionarioBodySchema } from '@sisgfpa/validation'
import type { FastifyRequest } from 'fastify'
import type { z } from 'zod'

type CreateFuncionarioInput = z.infer<typeof CreateFuncionarioBodySchema>

/** Cria a credencial pelo Better Auth; o papel não é derivado de dados enviados pelo cliente. */
export async function criarFuncionario(input: CreateFuncionarioInput, headers: FastifyRequest['headers']) {
  const email = input.email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new ConflictError('USER_ALREADY_EXISTS', 'Já existe uma conta com este e-mail')

  const { user } = await auth.api.createUser({
    headers: fromNodeHeaders(headers),
    body: {
      name: input.name,
      email,
      password: input.password,
      role: 'FUNCIONARIO',
    },
  })

  return { id: user.id, name: user.name, email: user.email, role: 'FUNCIONARIO' as const }
}
