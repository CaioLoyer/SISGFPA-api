import dayjs from 'dayjs'

import type { CreateDespesaBody, CreateRecebimentoBody } from '@sisgfpa/validation'

import type { FinancialApiClient } from '../financial-api/financial-api-client.js'
import { type ParsedMessage, parseMessage } from './message-parser.js'

export interface Alvo {
  id: string
  tipo: 'DESPESA' | 'RECEBIMENTO'
  descricao: string
  parte: string // fornecedor ou cliente
  valor: number
  saldo: number
  vencimento: string
}

/** O que será enviado à API Financeira se o usuário confirmar. */
export type Plano =
  | { tipo: 'CRIAR_DESPESA'; body: CreateDespesaBody; categoria?: string }
  | { tipo: 'CRIAR_RECEBIMENTO'; body: CreateRecebimentoBody; categoria?: string }
  | { tipo: 'REGISTRAR_PAGAMENTO'; alvo: Alvo; valor: number }
  | { tipo: 'REGISTRAR_BAIXA'; alvo: Alvo; valor: number }
  | { tipo: 'CANCELAR_DESPESA'; alvo: Alvo }
  | { tipo: 'CANCELAR_RECEBIMENTO'; alvo: Alvo }

export interface Escolha {
  alvo?: Alvo
  novo?: boolean
}

export type Interpretacao =
  | { kind: 'desconhecida' }
  | { kind: 'faltando'; parsed: ParsedMessage }
  | { kind: 'nao-encontrado'; parsed: ParsedMessage; texto: string }
  | { kind: 'escolher'; parsed: ParsedMessage; candidatos: Alvo[] }
  | { kind: 'plano'; parsed: ParsedMessage; plano: Plano }

const NAO_INFORMADO = 'Não informado'
const cents = (n: number) => Math.round(n * 100)

async function despesasAbertas(client: FinancialApiClient, fornecedor: string): Promise<Alvo[]> {
  const { items } = await client.listDespesas({ fornecedor })
  return items
    .filter((d) => d.status === 'PENDENTE' || d.status === 'PARCIAL')
    .map((d) => ({
      id: d.id,
      tipo: 'DESPESA' as const,
      descricao: d.descricao,
      parte: d.fornecedor,
      valor: d.valor,
      saldo: (cents(d.valor) - cents(d.valorPago)) / 100,
      vencimento: d.dataVencimento,
    }))
}

async function recebimentosAbertos(client: FinancialApiClient, cliente: string): Promise<Alvo[]> {
  const { items } = await client.listRecebimentos({ cliente })
  return items
    .filter((r) => r.status === 'PENDENTE' || r.status === 'PARCIAL')
    .map((r) => ({
      id: r.id,
      tipo: 'RECEBIMENTO' as const,
      descricao: r.descricao,
      parte: r.cliente,
      valor: r.valor,
      saldo: (cents(r.valor) - cents(r.valorRecebido)) / 100,
      vencimento: r.dataVencimento,
    }))
}

/**
 * Transforma a mensagem em um plano de chamadas à API Financeira.
 * Só LÊ da API (para localizar títulos em aberto); nenhuma decisão financeira é tomada aqui.
 */
export async function interpretar(
  texto: string,
  client: FinancialApiClient,
  escolha: Escolha = {},
  hoje = dayjs()
): Promise<Interpretacao> {
  const parsed = parseMessage(texto, hoje)

  if (parsed.intent === 'DESCONHECIDA') return { kind: 'desconhecida' }
  if (parsed.faltando.length > 0) return { kind: 'faltando', parsed }

  const dataHoje = hoje.format('YYYY-MM-DD')

  if (parsed.intent === 'CANCELAR_DESPESA' || parsed.intent === 'CANCELAR_RECEBIMENTO') {
    const despesa = parsed.intent === 'CANCELAR_DESPESA'
    const candidatos = despesa
      ? await despesasAbertas(client, parsed.fornecedor ?? '')
      : await recebimentosAbertos(client, parsed.cliente ?? '')
    const plano = (alvo: Alvo): Interpretacao => ({
      kind: 'plano',
      parsed,
      plano: { tipo: parsed.intent as 'CANCELAR_DESPESA' | 'CANCELAR_RECEBIMENTO', alvo },
    })

    if (escolha.alvo) return plano(escolha.alvo)
    const parte = parsed.fornecedor ?? parsed.cliente ?? ''
    if (candidatos.length === 0) {
      return { kind: 'nao-encontrado', parsed, texto: `Não encontrei título em aberto de ${parte}.` }
    }
    if (candidatos.length === 1) return plano(candidatos[0]!)
    return { kind: 'escolher', parsed, candidatos }
  }

  const valor = parsed.valor as number
  const despesa = parsed.intent === 'CRIAR_DESPESA'
  const parte = despesa ? parsed.fornecedor : parsed.cliente

  // Fato já ocorrido envolvendo alguém conhecido: pode ser o pagamento/baixa de um título em aberto.
  if (parsed.liquidado && parte && !escolha.novo) {
    const abertos = despesa ? await despesasAbertas(client, parte) : await recebimentosAbertos(client, parte)
    const comSaldo = abertos.filter((t) => cents(t.saldo) >= cents(valor))
    const exatos = comSaldo.filter((t) => cents(t.saldo) === cents(valor))

    const alvo =
      escolha.alvo ?? (comSaldo.length === 1 ? comSaldo[0] : exatos.length === 1 ? exatos[0] : undefined)

    if (alvo) {
      return {
        kind: 'plano',
        parsed,
        plano: despesa
          ? { tipo: 'REGISTRAR_PAGAMENTO', alvo, valor }
          : { tipo: 'REGISTRAR_BAIXA', alvo, valor },
      }
    }
    if (comSaldo.length > 1) return { kind: 'escolher', parsed, candidatos: comSaldo }
  }

  const base = {
    descricao: parsed.descricao ?? (despesa ? 'Despesa' : 'Recebimento'),
    valor,
    dataVencimento: parsed.dataVencimento ?? dataHoje,
    dataLancamento: dataHoje,
    parcelas: parsed.parcelas,
    observacoes: parsed.quantidade ? `Quantidade: ${parsed.quantidade}` : undefined,
    liquidarNoAto: parsed.liquidado,
  }

  return despesa
    ? {
        kind: 'plano',
        parsed,
        plano: {
          tipo: 'CRIAR_DESPESA',
          body: { ...base, fornecedor: parsed.fornecedor ?? NAO_INFORMADO },
          categoria: parsed.categoria,
        },
      }
    : {
        kind: 'plano',
        parsed,
        plano: {
          tipo: 'CRIAR_RECEBIMENTO',
          body: { ...base, cliente: parsed.cliente ?? NAO_INFORMADO },
          categoria: parsed.categoria,
        },
      }
}
