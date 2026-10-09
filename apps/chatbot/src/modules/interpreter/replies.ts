import type { CreateDespesaBody, CreateRecebimentoBody } from '@sisgfpa/validation'

import type { ParsedMessage } from './message-parser.js'
import type { Alvo, Plano } from './planner.js'

/** Textos que o Chatbot devolve ao usuário (resumo para confirmação, perguntas e avisos). */

export const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ')

const dataBR = (iso: string) => iso.split('-').reverse().join('/')

export function resumoDoPlano(plano: Plano): string {
  const linhas: string[] = []

  switch (plano.tipo) {
    case 'CRIAR_DESPESA':
    case 'CRIAR_RECEBIMENTO': {
      const despesa = plano.tipo === 'CRIAR_DESPESA'
      const b = plano.body
      linhas.push('Vou registrar:', '', despesa ? 'Despesa' : 'Recebimento')
      linhas.push(`Descrição: ${b.descricao}`)
      if (despesa) linhas.push(`Fornecedor: ${(b as CreateDespesaBody).fornecedor}`)
      else linhas.push(`Cliente: ${(b as CreateRecebimentoBody).cliente}`)
      linhas.push(`Valor: ${brl(b.valor)}`)
      const parcelas = b.parcelas ?? 1
      if (parcelas > 1) {
        linhas.push(`Parcelas: ${parcelas}x de aproximadamente ${brl(b.valor / parcelas)}`)
        linhas.push(`Vencimento da 1ª parcela: ${dataBR(b.dataVencimento)}`)
      } else {
        linhas.push(`Vencimento: ${dataBR(b.dataVencimento)}`)
      }
      if (plano.categoria) linhas.push(`Categoria: ${plano.categoria}`)
      if (b.observacoes) linhas.push(`Observações: ${b.observacoes}`)
      if (b.liquidarNoAto) linhas.push(despesa ? 'Situação: já paga' : 'Situação: já recebido')
      break
    }
    case 'REGISTRAR_PAGAMENTO':
    case 'REGISTRAR_BAIXA': {
      const pag = plano.tipo === 'REGISTRAR_PAGAMENTO'
      linhas.push(
        pag ? 'Vou registrar um pagamento em título já existente:' : 'Vou dar baixa em título já existente:',
        '',
        `Título: ${plano.alvo.descricao} (${plano.alvo.parte})`,
        `Valor do título: ${brl(plano.alvo.valor)} | Saldo em aberto: ${brl(plano.alvo.saldo)}`,
        `${pag ? 'Pagamento' : 'Baixa'}: ${brl(plano.valor)}`
      )
      break
    }
    case 'CANCELAR_DESPESA':
    case 'CANCELAR_RECEBIMENTO':
      linhas.push(
        'Vou cancelar o título:',
        '',
        `${plano.alvo.descricao} (${plano.alvo.parte})`,
        `Valor: ${brl(plano.alvo.valor)} | Vencimento: ${dataBR(plano.alvo.vencimento)}`,
        'O cancelamento é restrito a administradores e a API Financeira validará sua permissão.'
      )
      break
  }

  linhas.push('', 'Deseja confirmar?')
  return linhas.join('\n')
}

export function perguntaFaltando(parsed: ParsedMessage): string {
  if (parsed.faltando.includes('valor')) {
    return parsed.intent === 'CRIAR_RECEBIMENTO'
      ? 'Qual foi o valor do recebimento?'
      : 'Qual foi o valor da compra?'
  }
  if (parsed.faltando.includes('fornecedor_ou_cliente')) return 'De qual fornecedor ou cliente é o título?'
  if (parsed.faltando.includes('tipo'))
    return 'Você quer cancelar uma despesa (informe o fornecedor) ou um recebimento (informe o cliente)?'
  return 'Pode detalhar melhor a operação?'
}

export function perguntaEscolha(candidatos: Alvo[]): string {
  const linhas = candidatos.map(
    (c, i) =>
      `${i + 1}) ${c.descricao} (${c.parte}) - saldo ${brl(c.saldo)}, vencimento ${dataBR(c.vencimento)}`
  )
  return [
    `Encontrei ${candidatos.length} títulos em aberto. Responda com o número do título:`,
    ...linhas,
    'ou responda "novo" para registrar como um novo lançamento.',
  ].join('\n')
}

export const MENSAGEM_NAO_ENTENDIDA =
  'Não entendi a operação. Exemplos: "Compramos 500 cadernos do fornecedor ABC por R$ 2500", "Pagamos R$ 800 de energia da papelaria", "Cliente Maria pagou R$ 350 referente a material escolar".'
