import dayjs from 'dayjs'

import type { StatusTitulo } from '@sisgfpa/types'

export const toCents = (value: number) => Math.round(value * 100)
export const fromCents = (cents: number) => cents / 100

export interface ParcelaGerada {
  numero: number
  valor: number
  dataVencimento: string // YYYY-MM-DD
}

/**
 * Divide o valor total em `quantidade` parcelas mensais.
 * Trabalha em centavos: a última parcela absorve a diferença de arredondamento,
 * então a soma das parcelas é sempre exatamente o valor total.
 */
export function gerarParcelas(
  valorTotal: number,
  quantidade: number,
  primeiroVencimento: string
): ParcelaGerada[] {
  const totalCents = toCents(valorTotal)
  const baseCents = Math.floor(totalCents / quantidade)
  const base = dayjs(primeiroVencimento)

  return Array.from({ length: quantidade }, (_, index) => {
    const isLast = index === quantidade - 1
    const cents = isLast ? totalCents - baseCents * (quantidade - 1) : baseCents

    return {
      numero: index + 1,
      valor: fromCents(cents),
      dataVencimento: base.add(index, 'month').format('YYYY-MM-DD'),
    }
  })
}

export function statusPorValor(valorLiquidadoCents: number, valorCents: number): StatusTitulo {
  if (valorLiquidadoCents >= valorCents) return 'PAGO'
  if (valorLiquidadoCents > 0) return 'PARCIAL'
  return 'PENDENTE'
}

export interface ParcelaParaDistribuir {
  id: string
  numero: number
  valor: number
  valorLiquidado: number
  status: StatusTitulo
}

export interface ParcelaAtualizada {
  id: string
  valorLiquidado: number
  status: StatusTitulo
}

/**
 * Abate `valor` das parcelas em aberto, da mais antiga (menor número) para a mais nova.
 * Retorna apenas as parcelas que mudaram.
 */
export function distribuirNasParcelas(parcelas: ParcelaParaDistribuir[], valor: number): ParcelaAtualizada[] {
  let restante = toCents(valor)
  const atualizadas: ParcelaAtualizada[] = []

  const ordenadas = [...parcelas]
    .filter((parcela) => parcela.status !== 'CANCELADO')
    .sort((a, b) => a.numero - b.numero)

  for (const parcela of ordenadas) {
    if (restante <= 0) break

    const valorCents = toCents(parcela.valor)
    const liquidadoCents = toCents(parcela.valorLiquidado)
    const saldo = valorCents - liquidadoCents
    if (saldo <= 0) continue

    const aplicado = Math.min(saldo, restante)
    const novoLiquidado = liquidadoCents + aplicado
    restante -= aplicado

    atualizadas.push({
      id: parcela.id,
      valorLiquidado: fromCents(novoLiquidado),
      status: statusPorValor(novoLiquidado, valorCents),
    })
  }

  return atualizadas
}
