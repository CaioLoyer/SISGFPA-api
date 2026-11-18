import { describe, expect, it } from 'vitest'
import { chaveLiquidacao } from './idempotencia.js'
import { LiquidacaoHeadersSchema } from '@sisgfpa/validation'

describe('chave de repetição da liquidação', () => {
  const key = '00000000-0000-4000-8000-000000000001'
  it('aceita corpo, cabeçalho ou ambos iguais, preservando clientes anteriores', () => {
    expect(chaveLiquidacao(key)).toBe(key)
    expect(chaveLiquidacao(undefined, key)).toBe(key)
    expect(chaveLiquidacao(key, key)).toBe(key)
    expect(chaveLiquidacao()).toBeUndefined()
  })
  it('recusa duas chaves divergentes em vez de executar uma operação ambígua', () => {
    expect(() => chaveLiquidacao(key, 'outra')).toThrow('A chave do cabeçalho deve ser igual')
  })
  it('valida UUID no cabeçalho sem remover cookies e demais cabeçalhos', () => {
    expect(LiquidacaoHeadersSchema.parse({ 'idempotency-key': key, cookie: 'sessao' })).toEqual({
      'idempotency-key': key,
      cookie: 'sessao',
    })
    expect(LiquidacaoHeadersSchema.safeParse({ 'idempotency-key': 'invalida' }).success).toBe(false)
  })
})
