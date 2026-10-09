import { prisma } from '@sisgfpa/database'
import type { TipoCategoria } from '@sisgfpa/types'

import { CategoriaInvalidaError } from '../errors.js'

/** Garante que a categoria existe e é do tipo certo (despesa x recebimento). */
export async function assertCategoria(categoriaId: string | null | undefined, tipo: TipoCategoria) {
  if (!categoriaId) return
  const categoria = await prisma.categoria.findUnique({ where: { id: categoriaId } })
  if (!categoria || categoria.tipo !== tipo) {
    throw new CategoriaInvalidaError(
      `Categoria inválida para ${tipo === 'DESPESA' ? 'despesa' : 'recebimento'}`
    )
  }
}
