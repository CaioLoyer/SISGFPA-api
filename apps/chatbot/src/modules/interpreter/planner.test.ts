import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'

import type { FinancialApiClient } from '../financial-api/financial-api-client.js'
import { interpretar } from './planner.js'
import { resumoDoPlano } from './replies.js'

const hoje = dayjs('2026-09-30')

const despesa = (id: string, fornecedor: string, valor: number, valorPago = 0, descricao = 'Compra') => ({
  id,
  descricao,
  fornecedor,
  valor,
  valorPago,
  status: valorPago > 0 ? 'PARCIAL' : 'PENDENTE',
  dataVencimento: '2026-10-30',
})

/** API Financeira falsa: o planner só LÊ títulos em aberto; nada é gravado aqui. */
const apiComDespesas = (items: unknown[]) =>
  ({
    listDespesas: async () => ({ items, total: items.length }),
    listRecebimentos: async () => ({ items: [], total: 0 }),
  }) as unknown as FinancialApiClient

describe('interpretar: criação', () => {
  it('compra pendente vira CRIAR_DESPESA sem consultar títulos', async () => {
    const r = await interpretar(
      'Compramos 500 cadernos do fornecedor ABC por R$ 2500',
      apiComDespesas([]),
      {},
      hoje
    )
    expect(r.kind).toBe('plano')
    if (r.kind !== 'plano' || r.plano.tipo !== 'CRIAR_DESPESA') throw new Error('plano inesperado')
    expect(r.plano.body).toMatchObject({ valor: 2500, fornecedor: 'ABC', parcelas: 1, liquidarNoAto: false })
    expect(r.plano.body.dataVencimento).toBe('2026-09-30') // sem vencimento informado: hoje
    expect(r.plano.categoria).toBe('Mercadorias')
  })

  it('sem fornecedor/cliente o resumo mostra "Não informado"', async () => {
    const r = await interpretar('Pagamos R$ 800 de energia da papelaria', apiComDespesas([]), {}, hoje)
    if (r.kind !== 'plano') throw new Error('plano esperado')
    expect(resumoDoPlano(r.plano)).toContain('Fornecedor: Não informado')
    expect(resumoDoPlano(r.plano)).toContain('Situação: já paga')
  })

  it('sem valor pede a informação em vez de criar', async () => {
    const r = await interpretar('Comprei cadernos', apiComDespesas([]), {}, hoje)
    expect(r.kind).toBe('faltando')
  })

  it('texto fora do domínio é DESCONHECIDA', async () => {
    expect((await interpretar('bom dia!', apiComDespesas([]), {}, hoje)).kind).toBe('desconhecida')
  })
})

describe('interpretar: pagamento de título existente', () => {
  it('um único título em aberto com saldo suficiente → REGISTRAR_PAGAMENTO', async () => {
    const api = apiComDespesas([despesa('d1', 'Kalunga', 1000)])
    const r = await interpretar('Pagamos R$ 300 ao fornecedor Kalunga', api, {}, hoje)
    if (r.kind !== 'plano') throw new Error('plano esperado')
    expect(r.plano).toMatchObject({ tipo: 'REGISTRAR_PAGAMENTO', valor: 300 })
    expect(r.plano.tipo === 'REGISTRAR_PAGAMENTO' && r.plano.alvo.id).toBe('d1')
  })

  it('título com saldo menor que o valor não é usado: cria novo lançamento já pago', async () => {
    const api = apiComDespesas([despesa('d1', 'Kalunga', 1000, 900)]) // saldo 100
    const r = await interpretar('Pagamos R$ 300 ao fornecedor Kalunga', api, {}, hoje)
    if (r.kind !== 'plano') throw new Error('plano esperado')
    expect(r.plano.tipo).toBe('CRIAR_DESPESA')
  })

  it('dois títulos de mesmo saldo: pergunta qual; "novo" força novo lançamento', async () => {
    const api = apiComDespesas([despesa('d1', 'ABC', 500), despesa('d2', 'ABC', 500)])
    const r = await interpretar('Pagamos R$ 500 ao fornecedor ABC', api, {}, hoje)
    expect(r.kind).toBe('escolher')
    const novo = await interpretar('Pagamos R$ 500 ao fornecedor ABC', api, { novo: true }, hoje)
    expect(novo.kind === 'plano' && novo.plano.tipo).toBe('CRIAR_DESPESA')
  })

  it('dois títulos, mas só um com saldo exatamente igual: escolhe esse', async () => {
    const api = apiComDespesas([despesa('d1', 'ABC', 500), despesa('d2', 'ABC', 800)])
    const r = await interpretar('Pagamos R$ 500 ao fornecedor ABC', api, {}, hoje)
    expect(r.kind === 'plano' && r.plano.tipo === 'REGISTRAR_PAGAMENTO' && r.plano.alvo.id).toBe('d1')
  })
})

describe('interpretar: cancelamento', () => {
  it('título único → plano de cancelamento (a permissão é decidida pela API)', async () => {
    const r = await interpretar(
      'Cancele a despesa do fornecedor ABC',
      apiComDespesas([despesa('d1', 'ABC', 500)]),
      {},
      hoje
    )
    expect(r.kind === 'plano' && r.plano.tipo).toBe('CANCELAR_DESPESA')
  })

  it('sem título em aberto: informa que não encontrou', async () => {
    const r = await interpretar('Cancele a despesa do fornecedor ABC', apiComDespesas([]), {}, hoje)
    expect(r.kind).toBe('nao-encontrado')
  })
})
