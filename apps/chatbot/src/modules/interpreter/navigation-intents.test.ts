import { describe, expect, it } from 'vitest'

import { classificarIntencoesDeNavegacao } from './navigation-intents.js'

describe('intenções de navegação do Chatbot', () => {
  it('reconhece pedido para consultar contas a receber', () => {
    expect(classificarIntencoesDeNavegacao('Quero ver o que tenho a receber')).toEqual(['receipts'])
  })

  it('direciona cadastro de fornecedor para Comercial', () => {
    expect(classificarIntencoesDeNavegacao('Preciso cadastrar um fornecedor')).toEqual(['commercial'])
  })

  it('sugere pagar e receber quando o pedido de navegação é amplo', () => {
    expect(classificarIntencoesDeNavegacao('Quero consultar o financeiro')).toEqual(['expenses', 'receipts'])
  })

  it('prefere Relatórios quando a consulta pede um relatório de despesas', () => {
    expect(classificarIntencoesDeNavegacao('Onde consulto o relatório de despesas?')).toEqual(['reports'])
  })

  it('não transforma uma operação financeira real em sugestão de navegação', () => {
    expect(classificarIntencoesDeNavegacao('Paguei R$ 300 ao fornecedor Kalunga')).toEqual([])
  })

  it('ignora saudações e texto sem pedido de navegação', () => {
    expect(classificarIntencoesDeNavegacao('Bom dia, tudo bem?')).toEqual([])
  })
})
