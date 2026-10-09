import type { Categoria, Recebimento, RecebimentoParcela } from '@sisgfpa/database'
import type { RecebimentoComParcelasDto, RecebimentoDto } from '@sisgfpa/validation'

import { categoriaResumo, toDay } from '../../domain/dto.js'

export type RecebimentoComCategoria = Recebimento & { categoria: Pick<Categoria, 'id' | 'nome'> | null }

export const toRecebimentoDto = (d: RecebimentoComCategoria): RecebimentoDto => ({
  id: d.id,
  descricao: d.descricao,
  cliente: d.cliente,
  valor: Number(d.valor),
  valorRecebido: Number(d.valorRecebido),
  dataLancamento: toDay(d.dataLancamento),
  dataVencimento: toDay(d.dataVencimento),
  numeroParcelas: d.numeroParcelas,
  observacoes: d.observacoes,
  categoria: categoriaResumo(d.categoria),
  status: d.status,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
})

export const toRecebimentoParcelaDto = (p: RecebimentoParcela) => ({
  id: p.id,
  numero: p.numero,
  valor: Number(p.valor),
  valorLiquidado: Number(p.valorRecebido),
  dataVencimento: toDay(p.dataVencimento),
  status: p.status,
})

export const toRecebimentoComParcelasDto = (
  d: RecebimentoComCategoria & { parcelas: RecebimentoParcela[] }
): RecebimentoComParcelasDto => ({
  ...toRecebimentoDto(d),
  parcelas: [...d.parcelas].sort((a, b) => a.numero - b.numero).map(toRecebimentoParcelaDto),
})
