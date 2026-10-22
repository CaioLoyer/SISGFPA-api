import { prisma } from '@sisgfpa/database'
import type { DashboardResumoQuery } from '@sisgfpa/validation'

import { fromCents, toCents } from '../../domain/parcelas.js'
import { periodoVencimento } from '../../domain/periodo.js'

const CODIGO_CAIXA_PRINCIPAL = 'PRINCIPAL'

function centavos(valor: unknown) {
  return toCents(Number(valor ?? 0))
}

function dataMovimentacao(dataInicio: string, dataFim: string) {
  return {
    gte: new Date(`${dataInicio}T00:00:00.000Z`),
    lte: new Date(`${dataFim}T23:59:59.999Z`),
  }
}

export async function consultarResumo(query: DashboardResumoQuery) {
  const periodo = periodoVencimento(query.dataInicio, query.dataFim)
  const [despesas, recebimentos, caixa] = await Promise.all([
    prisma.despesa.aggregate({
      where: { status: { not: 'CANCELADO' }, dataVencimento: periodo },
      _sum: { valor: true, valorPago: true },
    }),
    prisma.recebimento.aggregate({
      where: { status: { not: 'CANCELADO' }, dataVencimento: periodo },
      _sum: { valor: true, valorRecebido: true },
    }),
    prisma.caixa.findUnique({ where: { codigo: CODIGO_CAIXA_PRINCIPAL }, select: { id: true } }),
  ])

  const movimentos = caixa
    ? await prisma.caixaMovimentacao.groupBy({
        by: ['tipo'],
        where: { caixaId: caixa.id, data: dataMovimentacao(query.dataInicio, query.dataFim) },
        _sum: { valor: true },
      })
    : []

  const totalAPagar = centavos(despesas._sum.valor)
  const totalPago = centavos(despesas._sum.valorPago)
  const totalAReceber = centavos(recebimentos._sum.valor)
  const totalRecebido = centavos(recebimentos._sum.valorRecebido)
  const entradas = movimentos.find((movimento) => movimento.tipo === 'ENTRADA')
  const saidas = movimentos.find((movimento) => movimento.tipo === 'SAIDA')
  const totalEntradas = centavos(entradas?._sum.valor)
  const totalSaidas = centavos(saidas?._sum.valor)

  return {
    periodo: query,
    contasAPagar: {
      total: fromCents(totalAPagar),
      pago: fromCents(totalPago),
      pendente: fromCents(totalAPagar - totalPago),
    },
    contasAReceber: {
      total: fromCents(totalAReceber),
      recebido: fromCents(totalRecebido),
      pendente: fromCents(totalAReceber - totalRecebido),
    },
    caixa: {
      configurado: caixa !== null,
      entradas: fromCents(totalEntradas),
      saidas: fromCents(totalSaidas),
      saldoLiquido: fromCents(totalEntradas - totalSaidas),
    },
  }
}
