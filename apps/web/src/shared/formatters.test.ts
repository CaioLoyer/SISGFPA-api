import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatarDataPtBr, formatarInstante, periodoDoMesAtual } from './formatters'

afterEach(() => vi.useRealTimers())
describe('apresentação das datas financeiras', () => {
  it('distingue instantes de datas civis', () => {
    expect(formatarInstante('2032-03-11T02:00:00Z')).toContain('10/03/2032')
    expect(formatarInstante('2032-03-11T02:00:00Z')).toContain('22:00')
    expect(formatarDataPtBr('2032-03-10')).toBe('10/03/2032')
  })
  it('seleciona o mês vigente na papelaria durante a virada do mês UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2032-04-01T02:00:00Z'))
    expect(periodoDoMesAtual()).toEqual({ dataInicio: '2032-03-01', dataFim: '2032-03-31' })
  })
})
