import { describe, expect, it } from 'vitest'

import { distribuirNasParcelas, gerarParcelas } from './parcelas.js'

describe('gerarParcelas', () => {
  it('divide 6000 em 6 parcelas mensais de 1000', () => {
    const parcelas = gerarParcelas(6000, 6, '2026-10-05')
    expect(parcelas).toHaveLength(6)
    expect(parcelas.every((p) => p.valor === 1000)).toBe(true)
    expect(parcelas.map((p) => p.dataVencimento)).toEqual([
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
      '2027-02-05',
      '2027-03-05',
    ])
  })

  it('a última parcela absorve o arredondamento e a soma fecha em centavos', () => {
    const parcelas = gerarParcelas(100, 3, '2026-10-05')
    expect(parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34])
    const soma = parcelas.reduce((acc, p) => acc + Math.round(p.valor * 100), 0)
    expect(soma).toBe(10000)
  })

  it('não estoura o fim do mês (31/jan -> 28/fev)', () => {
    const parcelas = gerarParcelas(200, 2, '2027-01-31')
    expect(parcelas[1]?.dataVencimento).toBe('2027-02-28')
  })

  it('uma parcela mantém valor e vencimento', () => {
    expect(gerarParcelas(250.5, 1, '2026-10-01')).toEqual([
      { numero: 1, valor: 250.5, dataVencimento: '2026-10-01' },
    ])
  })
})

describe('distribuirNasParcelas', () => {
  const base = [1, 2, 3].map((numero) => ({
    id: `p${numero}`,
    numero,
    valor: 100,
    valorLiquidado: 0,
    status: 'PENDENTE' as const,
  }))

  it('abate da parcela mais antiga para a mais nova', () => {
    const r = distribuirNasParcelas(base, 150)
    expect(r).toEqual([
      { id: 'p1', valorLiquidado: 100, status: 'PAGO' },
      { id: 'p2', valorLiquidado: 50, status: 'PARCIAL' },
    ])
  })

  it('continua de onde parou e ignora parcelas canceladas', () => {
    const parcelas = [
      { ...base[0]!, valorLiquidado: 100, status: 'PAGO' as const },
      { ...base[1]!, status: 'CANCELADO' as const },
      base[2]!,
    ]
    expect(distribuirNasParcelas(parcelas, 40)).toEqual([{ id: 'p3', valorLiquidado: 40, status: 'PARCIAL' }])
  })

  it('não sofre com ponto flutuante (0,1 + 0,2)', () => {
    const r = distribuirNasParcelas(
      [{ id: 'a', numero: 1, valor: 0.3, valorLiquidado: 0.1, status: 'PARCIAL' }],
      0.2
    )
    expect(r).toEqual([{ id: 'a', valorLiquidado: 0.3, status: 'PAGO' }])
  })
})
