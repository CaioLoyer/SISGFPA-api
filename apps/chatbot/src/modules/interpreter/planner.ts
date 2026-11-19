import dayjs from 'dayjs'

import type { CreateDespesaBody, CreateRecebimentoBody } from '@sisgfpa/validation'

import type { ContatoSelecionavel, FinancialApiClient } from '../financial-api/financial-api-client.js'
import type { EffectivePermissions } from '@sisgfpa/types'
import { classificarIntencoesDeNavegacao, type NavigationTopicId } from './navigation-intents.js'
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
  contato?: ContatoSelecionavel
}

export type Interpretacao =
  | { kind: 'desconhecida' }
  | { kind: 'navegacao'; parsed: ParsedMessage; topicos: NavigationTopicId[] }
  | {
      kind: 'escolher-contato'
      parsed: ParsedMessage
      tipo: 'DESPESA' | 'RECEBIMENTO'
      contatos: ContatoSelecionavel[]
    }
  | {
      kind: 'contato-nao-encontrado'
      parsed: ParsedMessage
      tipo: 'DESPESA' | 'RECEBIMENTO'
      nome: string
    }
  | { kind: 'faltando'; parsed: ParsedMessage }
  | { kind: 'nao-encontrado'; parsed: ParsedMessage; texto: string }
  | { kind: 'escolher'; parsed: ParsedMessage; candidatos: Alvo[] }
  | { kind: 'plano'; parsed: ParsedMessage; plano: Plano }

const NAO_INFORMADO = 'Não informado'
const cents = (n: number) => Math.round(n * 100)

const permissaoPorTopico: Record<Exclude<NavigationTopicId, 'profile'>, keyof EffectivePermissions> = {
  commercial: 'comercial',
  expenses: 'despesas',
  receipts: 'recebimentos',
  cash: 'caixa',
  reports: 'relatorios',
  administration: 'administracao',
}

function podeAcessarTopico(topico: NavigationTopicId, permissions: EffectivePermissions) {
  return topico === 'profile' || permissions[permissaoPorTopico[topico]]
}

async function buscarContatoParaTitulo(
  client: FinancialApiClient,
  tipo: 'DESPESA' | 'RECEBIMENTO',
  nome: string,
  escolha: Escolha
): Promise<
  | { kind: 'selecionado'; contato: ContatoSelecionavel }
  | { kind: 'escolher'; contatos: ContatoSelecionavel[] }
  | { kind: 'nao-encontrado' }
> {
  if (escolha.contato?.tipo === tipo) return { kind: 'selecionado', contato: escolha.contato }
  if (nome.trim().length < 2) return { kind: 'nao-encontrado' }

  const { items } = await client.listContactOptions(tipo, nome)
  const contatos = items.map((item) => ({ ...item, tipo }))
  return contatos.length > 0 ? { kind: 'escolher', contatos } : { kind: 'nao-encontrado' }
}

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

  const intencoes = classificarIntencoesDeNavegacao(texto)
  const pedidoExplicitoDeConsulta =
    /\b(onde|ver|mostrar|consultar|acessar|abrir|me leva|me leve|ir para)\b/.test(
      texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
    )
  const eNavegacao =
    intencoes.length > 0 &&
    (parsed.intent === 'DESCONHECIDA' || (parsed.faltando.length > 0 && pedidoExplicitoDeConsulta))

  if (eNavegacao) {
    const permissions = await client.getCurrentPermissions()
    return {
      kind: 'navegacao',
      parsed,
      topicos: intencoes.filter((topico) => podeAcessarTopico(topico, permissions)),
    }
  }

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

  if (despesa) {
    const contato = parsed.fornecedor
      ? await buscarContatoParaTitulo(client, 'DESPESA', parsed.fornecedor, escolha)
      : null
    if (contato?.kind === 'escolher')
      return { kind: 'escolher-contato', parsed, tipo: 'DESPESA', contatos: contato.contatos }
    if (contato?.kind === 'nao-encontrado')
      return {
        kind: 'contato-nao-encontrado',
        parsed,
        tipo: 'DESPESA',
        nome: parsed.fornecedor!,
      }

    return {
      kind: 'plano',
      parsed,
      plano: {
        tipo: 'CRIAR_DESPESA',
        body: {
          ...base,
          fornecedor: contato?.kind === 'selecionado' ? contato.contato.nome : NAO_INFORMADO,
          fornecedorContatoId: contato?.kind === 'selecionado' ? contato.contato.id : undefined,
        },
        categoria: parsed.categoria,
      },
    }
  }

  const contato = parsed.cliente
    ? await buscarContatoParaTitulo(client, 'RECEBIMENTO', parsed.cliente, escolha)
    : null
  if (contato?.kind === 'escolher')
    return { kind: 'escolher-contato', parsed, tipo: 'RECEBIMENTO', contatos: contato.contatos }
  if (contato?.kind === 'nao-encontrado')
    return {
      kind: 'contato-nao-encontrado',
      parsed,
      tipo: 'RECEBIMENTO',
      nome: parsed.cliente!,
    }

  return {
    kind: 'plano',
    parsed,
    plano: {
      tipo: 'CRIAR_RECEBIMENTO',
      body: {
        ...base,
        cliente: contato?.kind === 'selecionado' ? contato.contato.nome : NAO_INFORMADO,
        clienteContatoId: contato?.kind === 'selecionado' ? contato.contato.id : undefined,
      },
      categoria: parsed.categoria,
    },
  }
}
