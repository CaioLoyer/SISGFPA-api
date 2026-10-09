import type { Prisma } from '@sisgfpa/database'
import { NotFoundError } from '@sisgfpa/http'

import { TituloCanceladoError, TituloJaLiquidadoError, ValorPagamentoInvalidoError } from '../errors.js'
import { distribuirNasParcelas, fromCents, statusPorValor, toCents } from './parcelas.js'

export type Tx = Prisma.TransactionClient

const formatBRL = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`

/**
 * Registra pagamento (total ou parcial) de uma despesa dentro de uma transação:
 * bloqueia a linha do título, valida saldo, abate das parcelas mais antigas,
 * atualiza status e grava histórico. Usado pelo endpoint de pagamento e pela
 * criação com `liquidarNoAto`, garantindo a mesma regra nos dois caminhos.
 */
export async function aplicarPagamentoDespesa(
  tx: Tx,
  input: { despesaId: string; valor: number; pagoEm?: Date; usuarioId: string }
) {
  await tx.$queryRaw`SELECT id FROM despesa WHERE id = ${input.despesaId} FOR UPDATE`

  const despesa = await tx.despesa.findUnique({
    where: { id: input.despesaId },
    include: { parcelas: true },
  })
  if (!despesa) throw new NotFoundError('Despesa não encontrada')
  if (despesa.status === 'CANCELADO') {
    throw new TituloCanceladoError('Não é possível pagar um título cancelado')
  }
  if (despesa.status === 'PAGO') throw new TituloJaLiquidadoError('Título já está totalmente pago')

  const totalCents = toCents(Number(despesa.valor))
  const jaPagoCents = toCents(Number(despesa.valorPago))
  const novoPagoCents = jaPagoCents + toCents(input.valor)

  if (novoPagoCents > totalCents) {
    throw new ValorPagamentoInvalidoError(
      `Valor excede o saldo restante (R$ ${fromCents(totalCents - jaPagoCents).toFixed(2)})`
    )
  }

  const novoStatus = statusPorValor(novoPagoCents, totalCents)

  await tx.despesaPagamento.create({
    data: {
      despesaId: despesa.id,
      valor: input.valor,
      pagoEm: input.pagoEm ?? new Date(),
      registradoPorId: input.usuarioId,
    },
  })

  const atualizacoes = distribuirNasParcelas(
    despesa.parcelas.map((p) => ({
      id: p.id,
      numero: p.numero,
      valor: Number(p.valor),
      valorLiquidado: Number(p.valorPago),
      status: p.status,
    })),
    input.valor
  )
  for (const parcela of atualizacoes) {
    await tx.despesaParcela.update({
      where: { id: parcela.id },
      data: { valorPago: parcela.valorLiquidado, status: parcela.status },
    })
  }

  await tx.despesaHistorico.create({
    data: {
      despesaId: despesa.id,
      acao: 'PAGAMENTO_REGISTRADO',
      statusAnterior: despesa.status,
      statusNovo: novoStatus,
      detalhes: `Pagamento de ${formatBRL(toCents(input.valor))}`,
      alteradoPorId: input.usuarioId,
    },
  })

  return tx.despesa.update({
    where: { id: despesa.id },
    data: { valorPago: fromCents(novoPagoCents), status: novoStatus },
    include: { categoria: true, parcelas: true },
  })
}

/** Equivalente de `aplicarPagamentoDespesa` para recebimentos (baixa total ou parcial). */
export async function aplicarBaixaRecebimento(
  tx: Tx,
  input: { recebimentoId: string; valor: number; recebidoEm?: Date; usuarioId: string }
) {
  await tx.$queryRaw`SELECT id FROM recebimento WHERE id = ${input.recebimentoId} FOR UPDATE`

  const recebimento = await tx.recebimento.findUnique({
    where: { id: input.recebimentoId },
    include: { parcelas: true },
  })
  if (!recebimento) throw new NotFoundError('Recebimento não encontrado')
  if (recebimento.status === 'CANCELADO') {
    throw new TituloCanceladoError('Não é possível dar baixa em título cancelado')
  }
  if (recebimento.status === 'PAGO') {
    throw new TituloJaLiquidadoError('Título já está totalmente recebido')
  }

  const totalCents = toCents(Number(recebimento.valor))
  const jaRecebidoCents = toCents(Number(recebimento.valorRecebido))
  const novoRecebidoCents = jaRecebidoCents + toCents(input.valor)

  if (novoRecebidoCents > totalCents) {
    throw new ValorPagamentoInvalidoError(
      `Valor excede o saldo restante (R$ ${fromCents(totalCents - jaRecebidoCents).toFixed(2)})`
    )
  }

  const novoStatus = statusPorValor(novoRecebidoCents, totalCents)

  await tx.recebimentoBaixa.create({
    data: {
      recebimentoId: recebimento.id,
      valor: input.valor,
      recebidoEm: input.recebidoEm ?? new Date(),
      registradoPorId: input.usuarioId,
    },
  })

  const atualizacoes = distribuirNasParcelas(
    recebimento.parcelas.map((p) => ({
      id: p.id,
      numero: p.numero,
      valor: Number(p.valor),
      valorLiquidado: Number(p.valorRecebido),
      status: p.status,
    })),
    input.valor
  )
  for (const parcela of atualizacoes) {
    await tx.recebimentoParcela.update({
      where: { id: parcela.id },
      data: { valorRecebido: parcela.valorLiquidado, status: parcela.status },
    })
  }

  await tx.recebimentoHistorico.create({
    data: {
      recebimentoId: recebimento.id,
      acao: 'BAIXA_REGISTRADA',
      statusAnterior: recebimento.status,
      statusNovo: novoStatus,
      detalhes: `Baixa de ${formatBRL(toCents(input.valor))}`,
      alteradoPorId: input.usuarioId,
    },
  })

  return tx.recebimento.update({
    where: { id: recebimento.id },
    data: { valorRecebido: fromCents(novoRecebidoCents), status: novoStatus },
    include: { categoria: true, parcelas: true },
  })
}
