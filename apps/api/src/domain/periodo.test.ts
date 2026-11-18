import { describe, expect, it } from 'vitest'
import { financialDateTime, financialDayStart, financialInstant } from '@sisgfpa/types'
import { periodoMovimentacao, periodoVencimento } from './periodo.js'

describe('datas financeiras no fuso da papelaria', () => {
  it('inclui 22h do dia escolhido mesmo quando o instante UTC pertence ao dia seguinte', () => {
    const range = periodoMovimentacao('2032-03-10', '2032-03-10')!
    expect(range).toEqual({ gte: new Date('2032-03-10T04:00:00Z'), lt: new Date('2032-03-11T04:00:00Z') })
    const instant = financialInstant('2032-03-10T22:00')
    expect(instant.toISOString()).toBe('2032-03-11T02:00:00.000Z')
    expect(instant >= range.gte! && instant < range.lt!).toBe(true)
    expect(financialDateTime(instant)).toBe('2032-03-10T22:00:00')
  })

  it('mantém limites opcionais, virada de ano e datas civis dos títulos', () => {
    expect(periodoMovimentacao()).toBeUndefined()
    expect(periodoMovimentacao(undefined, '2032-12-31')).toEqual({
      gte: undefined,
      lt: new Date('2033-01-01T04:00:00Z'),
    })
    expect(periodoMovimentacao('2032-02-29')).toEqual({
      gte: new Date('2032-02-29T04:00:00Z'),
      lt: undefined,
    })
    expect(periodoVencimento('2032-03-10', '2032-03-10')).toEqual({
      gte: new Date('2032-03-10'),
      lte: new Date('2032-03-10'),
    })
  })

  it('usa o primeiro instante do dia em uma transição histórica de horário de verão', () => {
    expect(financialDayStart('2018-11-04').toISOString()).toBe('2018-11-04T04:00:00.000Z')
    expect(financialDateTime(financialDayStart('2018-11-04'))).toBe('2018-11-04T01:00:00')
    expect(() => financialInstant('2018-11-04T00:30')).toThrow('Horário inexistente')
  })
})
