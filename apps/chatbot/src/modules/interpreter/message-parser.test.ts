import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'

import { parseMessage } from './message-parser.js'

const hoje = dayjs('2026-09-29')
const p = (text: string) => parseMessage(text, hoje)

describe('despesas da papelaria', () => {
  it('compra de mercadoria: valor vem do "por", não da quantidade', () => {
    const r = p('Compramos 500 cadernos do fornecedor ABC por R$ 2500.')
    expect(r).toMatchObject({
      intent: 'CRIAR_DESPESA',
      valor: 2500,
      fornecedor: 'ABC',
      categoria: 'Mercadorias',
      parcelas: 1,
      liquidado: false,
      quantidade: '500 cadernos',
    })
    expect(r.descricao).toBe('Compra de cadernos')
    expect(r.faltando).toEqual([])
  })

  it('despesa operacional já paga vira liquidada', () => {
    const r = p('Pagamos R$ 800 de energia da papelaria.')
    expect(r).toMatchObject({
      intent: 'CRIAR_DESPESA',
      valor: 800,
      categoria: 'Despesas Operacionais',
      liquidado: true,
    })
  })

  it('aluguel', () => {
    expect(p('Pagamos R$ 1200 de aluguel da papelaria')).toMatchObject({
      valor: 1200,
      categoria: 'Despesas Operacionais',
    })
  })

  it('material de escritório', () => {
    expect(p('Compramos material de escritório por R$ 350')).toMatchObject({
      valor: 350,
      categoria: 'Material de Escritório',
    })
  })

  it('caixas de caneta', () => {
    expect(p('Compramos 100 caixas de caneta por R$ 500')).toMatchObject({
      valor: 500,
      categoria: 'Mercadorias',
    })
  })

  it('parcelamento: 6 parcelas, não liquidada, valor total preservado', () => {
    const r = p('Compramos R$ 6000 em mercadorias do fornecedor ABC em 6 parcelas.')
    expect(r).toMatchObject({
      valor: 6000,
      parcelas: 6,
      fornecedor: 'ABC',
      liquidado: false,
      categoria: 'Mercadorias',
    })
  })

  it('parcelamento com fornecedor de nome composto e vencimento no próximo mês', () => {
    const r = p(
      'Compramos R$ 3000 em mercadorias do fornecedor Papelaria ABC para pagar em 6 parcelas, com vencimento da primeira parcela no próximo mês.'
    )
    expect(r).toMatchObject({
      valor: 3000,
      parcelas: 6,
      fornecedor: 'Papelaria ABC',
      dataVencimento: '2026-10-29',
    })
  })

  it('formato brasileiro de valor', () => {
    expect(p('Compramos R$ 1.250,50 em papel A4 do fornecedor Kalunga')).toMatchObject({
      valor: 1250.5,
      categoria: 'Material de Escritório',
    })
  })

  it('"Compra de mercadorias de R$ 3000 em 6 parcelas"', () => {
    expect(p('Compra de mercadorias de R$ 3000 em 6 parcelas')).toMatchObject({
      valor: 3000,
      parcelas: 6,
      intent: 'CRIAR_DESPESA',
    })
  })

  it('vencimento por "dia 10"', () => {
    expect(p('Compramos R$ 400 de toner, vencimento dia 10').dataVencimento).toBe('2026-10-10')
  })
})

describe('recebimentos da papelaria', () => {
  it('cliente pagou referente a material escolar', () => {
    const r = p('Cliente João pagou R$ 500 referente à compra de materiais escolares.')
    expect(r).toMatchObject({
      intent: 'CRIAR_RECEBIMENTO',
      cliente: 'João',
      valor: 500,
      liquidado: true,
      categoria: 'Vendas',
    })
    expect(r.descricao).toBe('Compra de materiais escolares')
  })

  it('recebemos da venda para João', () => {
    expect(p('Recebemos R$ 500 da venda para João')).toMatchObject({
      intent: 'CRIAR_RECEBIMENTO',
      cliente: 'João',
      valor: 500,
      liquidado: true,
    })
  })

  it('recebimento de empresa', () => {
    expect(p('Recebimento de R$ 1200 do cliente Empresa XYZ')).toMatchObject({
      intent: 'CRIAR_RECEBIMENTO',
      cliente: 'Empresa XYZ',
      valor: 1200,
    })
  })

  it('venda à vista', () => {
    expect(p('Venda de R$ 250 à vista')).toMatchObject({
      intent: 'CRIAR_RECEBIMENTO',
      valor: 250,
      liquidado: true,
      categoria: 'Vendas',
    })
  })

  it('"João pagou R$ 250" identifica o cliente', () => {
    expect(p('João pagou R$ 250.')).toMatchObject({
      intent: 'CRIAR_RECEBIMENTO',
      cliente: 'João',
      valor: 250,
    })
  })
})

describe('mensagens ambíguas', () => {
  it('sem valor: pede o valor e não inventa número', () => {
    const r = p('Comprei cadernos.')
    expect(r.intent).toBe('CRIAR_DESPESA')
    expect(r.valor).toBeUndefined()
    expect(r.faltando).toContain('valor')
  })

  it('"Pagamos o fornecedor ABC" exige valor', () => {
    const r = p('Pagamos o fornecedor ABC.')
    expect(r.intent).toBe('CRIAR_DESPESA')
    expect(r.fornecedor).toBe('ABC')
    expect(r.faltando).toContain('valor')
  })

  it('quantidade sem valor monetário não vira valor', () => {
    expect(p('Compramos 500 cadernos').valor).toBeUndefined()
  })

  it('texto sem relação com finanças', () => {
    expect(p('Bom dia, tudo bem?').intent).toBe('DESCONHECIDA')
  })
})

describe('cancelamento', () => {
  it('cancelar despesa do fornecedor', () => {
    expect(p('Cancele a despesa do fornecedor ABC')).toMatchObject({
      intent: 'CANCELAR_DESPESA',
      fornecedor: 'ABC',
    })
  })

  it('cancelar recebimento do cliente', () => {
    expect(p('Cancelar o recebimento do cliente João')).toMatchObject({
      intent: 'CANCELAR_RECEBIMENTO',
      cliente: 'João',
    })
  })

  it('cancelar sem dizer qual', () => {
    expect(p('Cancele a despesa').faltando).toContain('fornecedor_ou_cliente')
  })
})

describe('pagamento a fornecedor', () => {
  it('"Pagamos R$ 300 ao fornecedor Kalunga" não gera descrição quebrada', () => {
    const r = p('Pagamos R$ 300 ao fornecedor Kalunga')
    expect(r).toMatchObject({ intent: 'CRIAR_DESPESA', valor: 300, fornecedor: 'Kalunga', liquidado: true })
    expect(r.descricao).toBe('Pagamento ao fornecedor Kalunga')
  })
})
