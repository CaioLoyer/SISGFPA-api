import type { AuthenticatedUser } from '@sisgfpa/auth'
import { prisma, Prisma } from '@sisgfpa/database'
import type { DashboardMetric, DashboardOverview } from '@sisgfpa/types'
import type { DashboardOverviewQuery } from '@sisgfpa/validation'

import { consultarPermissoesFinanceiras } from '../../authorization/financial-permissions.js'
import { fromCents, toCents } from '../../domain/parcelas.js'

function cents(value: unknown) {
  return toCents(Number(value ?? 0))
}

function monthStart(month: string, offset = 0) {
  const date = new Date(`${month}-01T00:00:00.000Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7)
}

function metric(current: number | null, previous: number | null): DashboardMetric {
  return {
    valor: current === null ? null : fromCents(current),
    variacaoPercentual:
      current === null || previous === null || previous === 0
        ? null
        : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10,
  }
}

const sourceJoins = Prisma.sql`
  LEFT JOIN caixa_movimentacao original ON original.id = m."estornoDeId"
  LEFT JOIN despesa_pagamento dp ON dp.id = CASE
    WHEN m.origem = 'ESTORNO' THEN original."despesaPagamentoId" ELSE m."despesaPagamentoId" END
  LEFT JOIN despesa d ON d.id = dp."despesaId"
  LEFT JOIN recebimento_baixa rb ON rb.id = CASE
    WHEN m.origem = 'ESTORNO' THEN original."recebimentoBaixaId" ELSE m."recebimentoBaixaId" END
  LEFT JOIN recebimento r ON r.id = rb."recebimentoId"
`

type MonthlyGroup = {
  mes: string
  tipo: 'ENTRADA' | 'SAIDA'
  valor: unknown
  ticketTotal: unknown
  ticketQuantidade: bigint
}

type CategoryGroup = { nome: string; valor: unknown }

export async function consultarVisaoGeral(
  query: DashboardOverviewQuery,
  user: AuthenticatedUser
): Promise<DashboardOverview> {
  const financial = await consultarPermissoesFinanceiras(user)
  const admin = user.role === 'ADMIN'
  const result: DashboardOverview = {
    mes: query.mes,
    permissoes: { ...financial, caixa: admin, relatorios: admin },
    caixaConfigurado: null,
    indicadores: {
      entradas: metric(null, null),
      saidas: metric(null, null),
      resultado: metric(null, null),
      ticketMedio: metric(null, null),
    },
    serieMensal: [],
    saidasPorCategoria: [],
    ultimasMovimentacoes: [],
    resumo: { saldoAtual: null, aPagar: null, aReceber: null },
  }
  if (!financial.despesas && !financial.recebimentos) return result

  const start = monthStart(query.mes)
  const end = monthStart(query.mes, 1)
  const seriesStart = monthStart(query.mes, -6)

  return prisma.$transaction(
    async (tx) => {
      const [caixa, despesas, recebimentos] = await Promise.all([
        tx.caixa.findUnique({ where: { codigo: 'PRINCIPAL' }, select: { id: true, saldoInicial: true } }),
        financial.despesas
          ? tx.despesa.aggregate({
              where: { status: { not: 'CANCELADO' }, dataVencimento: { gte: start, lt: end } },
              _sum: { valor: true, valorPago: true },
            })
          : null,
        financial.recebimentos
          ? tx.recebimento.aggregate({
              where: { status: { not: 'CANCELADO' }, dataVencimento: { gte: start, lt: end } },
              _sum: { valor: true, valorRecebido: true },
            })
          : null,
      ])
      result.resumo.aPagar = despesas
        ? fromCents(cents(despesas._sum.valor) - cents(despesas._sum.valorPago))
        : null
      result.resumo.aReceber = recebimentos
        ? fromCents(cents(recebimentos._sum.valor) - cents(recebimentos._sum.valorRecebido))
        : null
      result.caixaConfigurado = caixa !== null
      if (!caixa) return result

      const access = Prisma.sql`(${admin} OR (${financial.despesas} AND d.id IS NOT NULL) OR (${financial.recebimentos} AND r.id IS NOT NULL))`
      const [monthly, categories, latest, balance] = await Promise.all([
        tx.$queryRaw<MonthlyGroup[]>(Prisma.sql`
        SELECT to_char(m.data AT TIME ZONE 'UTC', 'YYYY-MM') AS mes, m.tipo, SUM(m.valor) AS valor,
          SUM(CASE WHEN m.origem = 'LIQUIDACAO' AND m.tipo = 'ENTRADA' AND rb.id IS NOT NULL
            THEN m.valor ELSE 0 END) AS "ticketTotal",
          COUNT(CASE WHEN m.origem = 'LIQUIDACAO' AND m.tipo = 'ENTRADA' AND rb.id IS NOT NULL
            THEN 1 END) AS "ticketQuantidade"
        FROM caixa_movimentacao m ${sourceJoins}
        WHERE m."caixaId" = ${caixa.id} AND m.data >= ${seriesStart.toISOString()}::timestamptz AND m.data < ${end.toISOString()}::timestamptz AND ${access}
        GROUP BY mes, m.tipo ORDER BY mes, m.tipo
      `),
        tx.$queryRaw<CategoryGroup[]>(Prisma.sql`
        SELECT COALESCE(cd.nome, cr.nome, 'Sem categoria') AS nome, SUM(m.valor) AS valor
        FROM caixa_movimentacao m ${sourceJoins}
        LEFT JOIN categoria cd ON cd.id = d."categoriaId"
        LEFT JOIN categoria cr ON cr.id = r."categoriaId"
        WHERE m."caixaId" = ${caixa.id} AND m.tipo = 'SAIDA'
          AND m.data >= ${start.toISOString()}::timestamptz AND m.data < ${end.toISOString()}::timestamptz AND ${access}
        GROUP BY COALESCE(cd.nome, cr.nome, 'Sem categoria') ORDER BY valor DESC, nome ASC
      `),
        tx.$queryRaw<
          (Omit<DashboardOverview['ultimasMovimentacoes'][number], 'valor'> & { valor: unknown })[]
        >(Prisma.sql`
          SELECT m.id, to_char(m.data AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS data,
            m.descricao, m.valor, m.tipo, m.origem, COALESCE(cd.nome, cr.nome) AS categoria,
            COALESCE(d.id, r.id) AS "tituloId",
            CASE WHEN d.id IS NOT NULL THEN 'DESPESA' WHEN r.id IS NOT NULL THEN 'RECEBIMENTO' END AS "tipoTitulo"
          FROM caixa_movimentacao m ${sourceJoins}
          LEFT JOIN categoria cd ON cd.id = d."categoriaId"
          LEFT JOIN categoria cr ON cr.id = r."categoriaId"
          WHERE m."caixaId" = ${caixa.id} AND m.data >= ${start.toISOString()}::timestamptz
            AND m.data < ${end.toISOString()}::timestamptz AND ${access}
          ORDER BY m.data DESC, m."createdAt" DESC, m.id DESC LIMIT 5
        `),
        admin
          ? tx.caixaMovimentacao.groupBy({
              by: ['tipo'],
              where: { caixaId: caixa.id },
              _sum: { valor: true },
            })
          : null,
      ])

      function monthValues(month: string) {
        const rows = monthly.filter((row) => row.mes === month)
        const entradas = cents(rows.find((row) => row.tipo === 'ENTRADA')?.valor)
        const saidas = cents(rows.find((row) => row.tipo === 'SAIDA')?.valor)
        const ticketRow = rows.find((row) => row.tipo === 'ENTRADA')
        const count = Number(ticketRow?.ticketQuantidade ?? 0)
        return {
          entradas,
          saidas,
          resultado: entradas - saidas,
          ticket: count > 0 ? Math.round(cents(ticketRow?.ticketTotal) / count) : null,
        }
      }

      const current = monthValues(query.mes)
      const previous = monthValues(monthKey(monthStart(query.mes, -1)))
      result.indicadores = {
        entradas: metric(current.entradas, previous.entradas),
        saidas: metric(current.saidas, previous.saidas),
        resultado: metric(current.resultado, previous.resultado),
        ticketMedio: financial.recebimentos ? metric(current.ticket, previous.ticket) : metric(null, null),
      }
      result.serieMensal = Array.from({ length: 7 }, (_, index) => {
        const mes = monthKey(monthStart(query.mes, index - 6))
        const values = monthValues(mes)
        return { mes, entradas: fromCents(values.entradas), saidas: fromCents(values.saidas) }
      })
      const categoryValues = categories.map((row) => ({ nome: row.nome, valor: fromCents(cents(row.valor)) }))
      result.saidasPorCategoria =
        categoryValues.length <= 5
          ? categoryValues
          : [
              ...categoryValues.slice(0, 4),
              {
                nome: 'Outras (agrupadas)',
                valor: fromCents(categoryValues.slice(4).reduce((sum, row) => sum + cents(row.valor), 0)),
              },
            ]
      result.ultimasMovimentacoes = latest.map((movement) => ({ ...movement, valor: Number(movement.valor) }))
      if (balance) {
        const entries = cents(balance.find((row) => row.tipo === 'ENTRADA')?._sum.valor)
        const exits = cents(balance.find((row) => row.tipo === 'SAIDA')?._sum.valor)
        result.resumo.saldoAtual = fromCents(cents(caixa.saldoInicial) + entries - exits)
      }
      return result
    },
    { isolationLevel: 'RepeatableRead' }
  )
}
