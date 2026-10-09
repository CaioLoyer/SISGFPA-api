import type { Categoria, Despesa, DespesaParcela } from '@sisgfpa/database'
import type { DespesaComParcelasDto, DespesaDto } from '@sisgfpa/validation'

import { categoriaResumo, toDay } from '../../domain/dto.js'

export type DespesaComCategoria = Despesa & { categoria: Pick<Categoria, 'id' | 'nome'> | null }

export const toDespesaDto = (d: DespesaComCategoria): DespesaDto => ({
  id: d.id,
  descricao: d.descricao,
  fornecedor: d.fornecedor,
  valor: Number(d.valor),
  valorPago: Number(d.valorPago),
  dataLancamento: toDay(d.dataLancamento),
  dataVencimento: toDay(d.dataVencimento),
  numeroParcelas: d.numeroParcelas,
  observacoes: d.observacoes,
  categoria: categoriaResumo(d.categoria),
  status: d.status,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
})

export const toDespesaParcelaDto = (p: DespesaParcela) => ({
  id: p.id,
  numero: p.numero,
  valor: Number(p.valor),
  valorLiquidado: Number(p.valorPago),
  dataVencimento: toDay(p.dataVencimento),
  status: p.status,
})

export const toDespesaComParcelasDto = (
  d: DespesaComCategoria & { parcelas: DespesaParcela[] }
): DespesaComParcelasDto => ({
  ...toDespesaDto(d),
  parcelas: [...d.parcelas].sort((a, b) => a.numero - b.numero).map(toDespesaParcelaDto),
})
