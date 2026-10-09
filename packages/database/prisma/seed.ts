import { CATEGORIAS_DESPESA, CATEGORIAS_RECEBIMENTO } from '@sisgfpa/types'

import { prisma } from '../src/index.js'

// Categorias do contexto da papelaria. Idempotente (upsert).
async function main() {
  const categorias = [
    ...CATEGORIAS_DESPESA.map((nome) => ({ nome, tipo: 'DESPESA' as const })),
    ...CATEGORIAS_RECEBIMENTO.map((nome) => ({ nome, tipo: 'RECEBIMENTO' as const })),
  ]

  for (const categoria of categorias) {
    await prisma.categoria.upsert({
      where: { nome_tipo: { nome: categoria.nome, tipo: categoria.tipo } },
      update: {},
      create: categoria,
    })
  }

  console.log(`Seed concluído: ${categorias.length} categorias.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
