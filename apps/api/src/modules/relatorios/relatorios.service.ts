import { type Prisma, prisma } from '@sisgfpa/database'
import type { RelatorioQuery } from '@sisgfpa/validation'

import { fromCents, toCents } from '../../domain/parcelas.js'
import { periodoVencimento } from '../../domain/periodo.js'
import { toDespesaDto } from '../despesas/despesas.mapper.js'
import { toRecebimentoDto } from '../recebimentos/recebimentos.mapper.js'
import { toCsv } from './csv.js'

const somaCentavos = (valores: Prisma.Decimal[]): number =>
  valores.reduce((acc, v) => acc + toCents(v.toNumber()), 0)

const buscarDespesas = (q: RelatorioQuery) =>
  prisma.despesa.findMany({
    where: { dataVencimento: periodoVencimento(q.dataInicio, q.dataFim) },
    include: { categoria: true },
    orderBy: { dataVencimento: 'asc' },
  })

const buscarRecebimentos = (q: RelatorioQuery) =>
  prisma.recebimento.findMany({
    where: { dataVencimento: periodoVencimento(q.dataInicio, q.dataFim) },
    include: { categoria: true },
    orderBy: { dataVencimento: 'asc' },
  })

export async function contasAPagar(query: RelatorioQuery) {
  const itens = await buscarDespesas(query)
  const totalAPagar = somaCentavos(itens.map((i) => i.valor))
  const totalPago = somaCentavos(itens.map((i) => i.valorPago))

  return {
    totalAPagar: fromCents(totalAPagar),
    totalPago: fromCents(totalPago),
    totalPendente: fromCents(totalAPagar - totalPago),
    itens: itens.map(toDespesaDto),
  }
}

export async function contasAReceber(query: RelatorioQuery) {
  const itens = await buscarRecebimentos(query)
  const totalAReceber = somaCentavos(itens.map((i) => i.valor))
  const totalRecebido = somaCentavos(itens.map((i) => i.valorRecebido))

  return {
    totalAReceber: fromCents(totalAReceber),
    totalRecebido: fromCents(totalRecebido),
    totalPendente: fromCents(totalAReceber - totalRecebido),
    itens: itens.map(toRecebimentoDto),
  }
}

export async function contasAPagarCsv(query: RelatorioQuery) {
  const itens = await buscarDespesas(query)
  return toCsv(
    ['Descrição', 'Fornecedor', 'Categoria', 'Valor', 'Valor Pago', 'Parcelas', 'Vencimento', 'Status'],
    itens.map((i) => [
      i.descricao,
      i.fornecedor,
      i.categoria?.nome ?? '',
      Number(i.valor),
      Number(i.valorPago),
      i.numeroParcelas,
      i.dataVencimento.toISOString().slice(0, 10),
      i.status,
    ])
  )
}

export async function contasAReceberCsv(query: RelatorioQuery) {
  const itens = await buscarRecebimentos(query)
  return toCsv(
    ['Descrição', 'Cliente', 'Categoria', 'Valor', 'Valor Recebido', 'Parcelas', 'Vencimento', 'Status'],
    itens.map((i) => [
      i.descricao,
      i.cliente,
      i.categoria?.nome ?? '',
      Number(i.valor),
      Number(i.valorRecebido),
      i.numeroParcelas,
      i.dataVencimento.toISOString().slice(0, 10),
      i.status,
    ])
  )
}
