import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  despesaAggregate: vi.fn(),
  recebimentoAggregate: vi.fn(),
  caixaFindUnique: vi.fn(),
  caixaMovimentacaoGroupBy: vi.fn(),
}))

vi.mock('@sisgfpa/database', () => ({
  prisma: {
    despesa: { aggregate: prismaMock.despesaAggregate },
    recebimento: { aggregate: prismaMock.recebimentoAggregate },
    caixa: { findUnique: prismaMock.caixaFindUnique },
    caixaMovimentacao: { groupBy: prismaMock.caixaMovimentacaoGroupBy },
  },
}))

import { consultarResumo } from './dashboard.service.js'

const periodo = { dataInicio: '2026-10-01', dataFim: '2026-10-31' }
const decimal = (value: number) => ({ toNumber: () => value, valueOf: () => value })

describe('resumo do dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.despesaAggregate.mockResolvedValue({
      _sum: { valor: decimal(2000), valorPago: decimal(500) },
    })
    prismaMock.recebimentoAggregate.mockResolvedValue({
      _sum: { valor: decimal(3000), valorRecebido: decimal(1000) },
    })
    prismaMock.caixaFindUnique.mockResolvedValue({ id: 'caixa-principal' })
    prismaMock.caixaMovimentacaoGroupBy.mockResolvedValue([
      { tipo: 'ENTRADA', _sum: { valor: decimal(1250.75) } },
      { tipo: 'SAIDA', _sum: { valor: decimal(600) } },
    ])
  })

  it('resume títulos ativos pelo vencimento e dinheiro movimentado pela data efetiva', async () => {
    await expect(consultarResumo(periodo)).resolves.toEqual({
      periodo,
      contasAPagar: { total: 2000, pago: 500, pendente: 1500 },
      contasAReceber: { total: 3000, recebido: 1000, pendente: 2000 },
      caixa: { configurado: true, entradas: 1250.75, saidas: 600, saldoLiquido: 650.75 },
    })

    expect(prismaMock.despesaAggregate).toHaveBeenCalledWith({
      where: {
        status: { not: 'CANCELADO' },
        dataVencimento: { gte: new Date('2026-10-01'), lte: new Date('2026-10-31') },
      },
      _sum: { valor: true, valorPago: true },
    })
    expect(prismaMock.recebimentoAggregate).toHaveBeenCalledWith({
      where: {
        status: { not: 'CANCELADO' },
        dataVencimento: { gte: new Date('2026-10-01'), lte: new Date('2026-10-31') },
      },
      _sum: { valor: true, valorRecebido: true },
    })
    expect(prismaMock.caixaMovimentacaoGroupBy).toHaveBeenCalledWith({
      by: ['tipo'],
      where: {
        caixaId: 'caixa-principal',
        data: {
          gte: new Date('2026-10-01T00:00:00.000Z'),
          lte: new Date('2026-10-31T23:59:59.999Z'),
        },
      },
      _sum: { valor: true },
    })
  })

  it('retorna movimentos do caixa zerados quando o Caixa Principal ainda não foi configurado', async () => {
    prismaMock.caixaFindUnique.mockResolvedValue(null)

    await expect(consultarResumo(periodo)).resolves.toMatchObject({
      caixa: { configurado: false, entradas: 0, saidas: 0, saldoLiquido: 0 },
    })
    expect(prismaMock.caixaMovimentacaoGroupBy).not.toHaveBeenCalled()
  })
})
