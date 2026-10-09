import { prisma } from '@sisgfpa/database'
import type { TipoCategoria } from '@sisgfpa/types'

export async function listarCategorias(tipo?: TipoCategoria) {
  const items = await prisma.categoria.findMany({
    where: { tipo },
    orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
  })
  return { items: items.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })) }
}
