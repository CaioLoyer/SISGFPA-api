/** Bootstrap único do primeiro ADMIN de um banco, sem endpoint público nem gravação manual de senha. */
import './load-env.js'

import { pathToFileURL } from 'node:url'

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Defina ${name} no ambiente antes de executar pnpm db:create-admin.`)
  return value
}

export async function createInitialAdmin() {
  const name = requiredEnv('INITIAL_ADMIN_NAME')
  const email = requiredEnv('INITIAL_ADMIN_EMAIL').toLowerCase()
  const password = requiredEnv('INITIAL_ADMIN_PASSWORD')
  if (password.length < 8 || password.length > 128) {
    throw new Error('INITIAL_ADMIN_PASSWORD precisa ter entre 8 e 128 caracteres.')
  }

  const [{ auth }, { prisma }] = await Promise.all([
    import('../packages/auth/dist/index.js'),
    import('../packages/database/dist/index.js'),
  ])

  try {
    const adminExistente = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
    if (adminExistente) throw new Error('Este banco já possui um ADMIN; o bootstrap inicial foi recusado.')

    const { user } = await auth.api.createUser({ body: { name, email, password, role: 'ADMIN' } })
    return { id: user.id, email: user.email }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createInitialAdmin()
    .then((admin) => console.log(`Primeiro ADMIN criado: ${admin.email}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
