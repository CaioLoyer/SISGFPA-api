import { prisma } from '@sisgfpa/database'
import type { Role } from '@sisgfpa/types'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { fromNodeHeaders } from 'better-auth/node'
import { openAPI } from 'better-auth/plugins'

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    'BETTER_AUTH_SECRET não definida. Use a MESMA string longa e aleatória na API e no Chatbot.'
  )
}

// Origens confiáveis: BETTER_AUTH_URL + TRUSTED_ORIGINS (lista separada por vírgula, ex.: o futuro frontend).
const trustedOrigins = [
  process.env.BETTER_AUTH_URL ?? 'http://localhost:8080',
  ...(process.env.TRUSTED_ORIGINS?.split(',').map((origin) => origin.trim()) ?? []),
].filter(Boolean)

// Identidade única do sistema: API Financeira e Chatbot usam esta mesma instância
// (mesmo banco e mesmo BETTER_AUTH_SECRET).
export const auth = betterAuth({
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
  },
  // Perfil de acesso. Todo cadastro entra como FUNCIONARIO; promover para ADMIN é feito
  // diretamente no banco (ou por endpoint administrativo futuro), nunca pelo próprio cadastro.
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'FUNCIONARIO',
        input: false,
      },
    },
  },
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  plugins: [openAPI()],
})

type NodeHeaders = Parameters<typeof fromNodeHeaders>[0]

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
  role: Role
}

// Resolve o usuário autenticado a partir dos cabeçalhos HTTP (cookie de sessão do Better Auth).
export async function getAuthenticatedUser(headers: NodeHeaders): Promise<AuthenticatedUser | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) })
  if (!session) return null

  const user = session.user as unknown as AuthenticatedUser
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}

export { fromNodeHeaders }
