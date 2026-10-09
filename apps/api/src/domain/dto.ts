import type { Categoria } from '@sisgfpa/database'
import type { StatusTituloDto } from '@sisgfpa/validation'

/** Conversores compartilhados de Prisma → DTO (datas em ISO, categoria resumida, histórico). */

export const toDay = (date: Date) => date.toISOString().slice(0, 10)

export const categoriaResumo = (categoria: Pick<Categoria, 'id' | 'nome'> | null | undefined) =>
  categoria ? { id: categoria.id, nome: categoria.nome } : null

export const toHistoricoDto = (h: {
  id: string
  acao: string
  statusAnterior: StatusTituloDto | null
  statusNovo: StatusTituloDto | null
  detalhes: string | null
  alteradoPorId: string
  createdAt: Date
}) => ({
  id: h.id,
  acao: h.acao,
  statusAnterior: h.statusAnterior,
  statusNovo: h.statusNovo,
  detalhes: h.detalhes,
  alteradoPorId: h.alteradoPorId,
  createdAt: h.createdAt.toISOString(),
})
