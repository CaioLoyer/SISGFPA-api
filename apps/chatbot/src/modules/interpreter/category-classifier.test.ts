import { describe, expect, it } from 'vitest'

import { classificarDespesa, classificarRecebimento } from './category-classifier.js'

describe('classificarDespesa', () => {
  it.each([
    ['Compra de 500 cadernos', 'Mercadorias'],
    ['Compramos 100 caixas de caneta', 'Mercadorias'],
    ['Pagamento de energia da loja', 'Despesas Operacionais'],
    ['Aluguel da papelaria', 'Despesas Operacionais'],
    ['Compramos toner para a impressora', 'Material de Escritório'],
    ['Conserto do equipamento de encadernação', 'Manutenção'],
    ['Compramos presente para a equipe', 'Outros'],
  ])('%s → %s', (texto, categoria) => {
    expect(classificarDespesa(texto)).toBe(categoria)
  })

  it('regra específica vence a genérica: "papel A4" é escritório, não mercadoria', () => {
    expect(classificarDespesa('Compramos papel A4')).toBe('Material de Escritório')
    expect(classificarDespesa('Compramos papel crepom')).toBe('Mercadorias')
  })

  it('ignora acentos e caixa', () => {
    expect(classificarDespesa('MANUTENÇÃO do ar condicionado')).toBe('Manutenção')
  })
})

describe('classificarRecebimento', () => {
  it('vendas e pagamentos de clientes', () => {
    expect(classificarRecebimento('Venda de material escolar')).toBe('Vendas')
    expect(classificarRecebimento('Cliente João pagou')).toBe('Vendas')
    expect(classificarRecebimento('Devolução de imposto')).toBe('Outros recebimentos')
  })
})
