import dayjs from 'dayjs'

import type { IntencaoChat } from '@sisgfpa/types'

import { classificarDespesa, classificarRecebimento } from './category-classifier.js'

/** Resultado da interpretação de uma mensagem em linguagem natural (sem IA generativa: regras em pt-BR). */
export interface ParsedMessage {
  intent: IntencaoChat
  descricao?: string
  fornecedor?: string
  cliente?: string
  valor?: number
  quantidade?: string
  parcelas: number
  dataVencimento?: string // YYYY-MM-DD
  /** Fato já ocorrido ("pagamos", "recebemos", "à vista"): o título nasce liquidado. */
  liquidado: boolean
  categoria?: string
  /** Campos que o usuário ainda precisa informar. */
  faltando: Array<'valor' | 'tipo' | 'fornecedor_ou_cliente'>
}

const normalize = (text: string) =>
  text.normalize('NFC').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const NUM = '\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?'
const NAME = "[A-ZÀ-Ú][\\wÀ-ú&'-]*(?:\\s+[A-ZÀ-Ú][\\wÀ-ú&'-]*)*"
const ORACAO_FIM =
  '(?=\\s+(?:por|do fornecedor|da fornecedora|no valor|de r\\$|em \\d|para pagar|com vencimento|vencimento|a vista|à vista|divididos|dividido|parcelad)\\b|[.,;!?]|$)'

export function parseBRNumber(raw: string): number {
  if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.'))
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, ''))
  return Number(raw)
}

function extractValor(nfc: string, norm: string): { valor?: number; texto?: string } {
  // Remove trechos que contêm números que NÃO são valores (parcelas, datas, dia do vencimento).
  const blank = (s: string, re: RegExp) => s.replace(re, (m) => ' '.repeat(m.length))
  let work = norm
  work = blank(work, /\d+\s*(?:x|vezes|parcelas?)\b/g)
  work = blank(work, /(?:em|dividid[oa]s?\s+em|parcelad[oa]s?\s+em)\s+\d+\s*(?:x|vezes|parcelas?)?/g)
  work = blank(work, /\bdia\s+\d{1,2}\b/g)
  work = blank(work, /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g)
  work = blank(work, /\bem\s+\d+\s+dias\b/g)

  const tryRe = (re: RegExp) => {
    const m = re.exec(work)
    if (!m?.[1]) return undefined
    const valor = parseBRNumber(m[1])
    return Number.isFinite(valor) && valor > 0
      ? { valor, texto: nfc.slice(m.index, m.index + m[0].length) }
      : undefined
  }

  const FIM_OK =
    '(?=\\s+(?:de|em|para|pra|do|da|dos|das|no|na|ao|a|referente|pelo|pela|com|reais|real)\\b|\\s*[.,;!?]?\\s*$)'

  return (
    tryRe(new RegExp(`r\\$\\s*(${NUM})`)) ??
    tryRe(new RegExp(`\\b(${NUM})\\s*(?:reais|real)\\b`)) ??
    tryRe(new RegExp(`\\b(?:por|valor de|total de|no valor de|custou|custa)\\s+(${NUM})\\b`)) ??
    tryRe(
      new RegExp(
        `\\b(?:pagamento de|pagamos|paguei|pagou|pago|recebemos|recebi|recebimento de|venda de|de)\\s+(${NUM})\\b${FIM_OK}`
      )
    ) ??
    {}
  )
}

function extractParcelas(norm: string): number {
  const patterns = [
    /(\d+)\s*(?:x|vezes|parcelas?)\b/,
    /(?:parcelad[oa]s?|dividid[oa]s?)\s+em\s+(\d+)/,
    /em\s+(\d+)\s*(?:x|vezes|parcelas?)\b/,
  ]
  for (const re of patterns) {
    const m = re.exec(norm)
    if (m?.[1]) {
      const n = Number(m[1])
      if (n >= 1 && n <= 120) return n
    }
  }
  return 1
}

function extractVencimento(norm: string, hoje: dayjs.Dayjs): string | undefined {
  const full = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(norm)
  if (full) {
    const day = Number(full[1])
    const month = Number(full[2])
    let year = full[3] ? Number(full[3]) : hoje.year()
    if (year < 100) year += 2000
    let date = dayjs(new Date(year, month - 1, day))
    if (!full[3] && date.isBefore(hoje, 'day')) date = date.add(1, 'year')
    if (date.isValid() && date.date() === day) return date.format('YYYY-MM-DD')
  }

  const dia = /\bdia\s+(\d{1,2})\b/.exec(norm)
  if (dia?.[1]) {
    const day = Number(dia[1])
    if (day >= 1 && day <= 31) {
      let date = hoje.date(Math.min(day, hoje.daysInMonth()))
      if (day < hoje.date()) {
        const proximo = hoje.add(1, 'month')
        date = proximo.date(Math.min(day, proximo.daysInMonth()))
      }
      return date.format('YYYY-MM-DD')
    }
  }

  if (/\b(proximo mes|mes que vem)\b/.test(norm)) return hoje.add(1, 'month').format('YYYY-MM-DD')
  if (/\bamanha\b/.test(norm)) return hoje.add(1, 'day').format('YYYY-MM-DD')
  const emDias = /\bem\s+(\d+)\s+dias\b/.exec(norm)
  if (emDias?.[1]) return hoje.add(Number(emDias[1]), 'day').format('YYYY-MM-DD')
  if (/\bhoje\b/.test(norm)) return hoje.format('YYYY-MM-DD')
  return undefined
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function extractFornecedor(nfc: string): string | undefined {
  const capitalized = new RegExp(`fornecedor(?:a)?\\s+(${NAME})`).exec(nfc)
  if (capitalized?.[1]) return capitalized[1].trim()
  const loose = /fornecedor(?:a)?\s+([^\s,.;!?]+)/i.exec(nfc)
  return loose?.[1]?.trim()
}

function extractCliente(nfc: string): string | undefined {
  const explicit = new RegExp(`cliente\\s+(${NAME})`).exec(nfc)
  if (explicit?.[1]) return explicit[1].trim()
  const looseExplicit = /cliente\s+([^\s,.;!?]+)/i.exec(nfc)
  if (looseExplicit?.[1] && !/^(pagou|comprou|deve)$/i.test(looseExplicit[1])) return looseExplicit[1].trim()
  const pagou = new RegExp(`^\\s*(${NAME})\\s+pagou\\b`).exec(nfc)
  if (pagou?.[1]) return pagou[1].trim()
  const venda = new RegExp(
    `(?:venda|vendemos|vendi|receb\\w+)[^.]*?\\b(?:para|pro|ao|a)\\s+(?:o\\s+|a\\s+)?(${NAME})`
  ).exec(nfc)
  if (venda?.[1]) return venda[1].trim()
  return undefined
}

function limparItem(bruto: string): string {
  return bruto
    .replace(new RegExp(`r\\$\\s*(?:${NUM})`, 'i'), ' ')
    .replace(/\bfornecedor(?:a)?\b.*$/i, ' ')
    .replace(/^\s*(?:em|de|d[oa]s?|uma?|umas?)\s+/i, '')
    .replace(/\s+d[aeo]s?\s+(?:loja|papelaria|empresa|mes)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractDescricaoDespesa(nfc: string, fornecedor?: string) {
  let quantidade: string | undefined

  const compra = new RegExp(
    `(?:compramos|comprei|comprar|compra\\s+de|compra|registre\\s+uma\\s+compra\\s+de)\\s+(?:de\\s+)?(.+?)${ORACAO_FIM}`,
    'i'
  ).exec(nfc)
  if (compra?.[1]) {
    let item = limparItem(compra[1])
    const q = /^(\d+)\s+(.+)$/.exec(item)
    if (q?.[1] && q[2]) {
      quantidade = `${q[1]} ${q[2]}`
      item = q[2]
    }
    return { descricao: item ? `Compra de ${item}` : 'Compra', quantidade }
  }

  const pagamento = new RegExp(
    `(?:pagamos|paguei|pagamento|pago|pagar)\\s+(?:de\\s+|o\\s+|a\\s+)?(.+?)${ORACAO_FIM}`,
    'i'
  ).exec(nfc)
  if (pagamento?.[1]) {
    const item = limparItem(pagamento[1]).replace(/^(?:ao|aos|à|para|pro|pra|o|a)\s+/i, '')
    if (item && !/^(?:ao|aos|à|para|pro|pra|o|a|\d)/i.test(item)) {
      return { descricao: `Pagamento de ${item}`, quantidade }
    }
  }

  return { descricao: fornecedor ? `Pagamento ao fornecedor ${fornecedor}` : 'Despesa', quantidade }
}

function extractDescricaoRecebimento(nfc: string, norm: string) {
  const referente = /referente\s+(?:a|à|ao|aos|as|às)\s+(.+?)(?=[.,;!?]|$)/i.exec(nfc)
  if (referente?.[1]) return capitalize(referente[1].trim())
  if (/\b(venda|vendemos|vendi)\b/.test(norm)) return 'Venda'
  return 'Recebimento'
}

/**
 * Interpreta a mensagem. NÃO decide nada financeiro: apenas extrai dados estruturados.
 * Validação, permissão, parcelamento e baixa pertencem à API Financeira.
 */
export function parseMessage(text: string, hoje: dayjs.Dayjs = dayjs()): ParsedMessage {
  const nfc = text.normalize('NFC').trim()
  const norm = normalize(nfc)

  const fornecedor = extractFornecedor(nfc)
  const cliente = extractCliente(nfc)
  const { valor } = extractValor(nfc, norm)
  const parcelas = extractParcelas(norm)
  const dataVencimento = extractVencimento(norm, hoje)

  const cancelar = /\bcancel(?:ar|e|a|amos|ei|ado)\b/.test(norm)
  const receber = Boolean(
    cliente || /\b(recebemos|recebi|recebimento|receber|vendemos|vendi|venda|pagou)\b/.test(norm)
  )
  const gastar =
    /\b(compramos|comprei|compra|comprar|pagamos|paguei|pagamento|pagar|despesa|gastamos|gastei)\b/.test(norm)

  let intent: IntencaoChat = 'DESCONHECIDA'
  if (cancelar) {
    if (fornecedor || /\b(despesa|compra|conta a pagar)\b/.test(norm)) intent = 'CANCELAR_DESPESA'
    else if (receber) intent = 'CANCELAR_RECEBIMENTO'
  } else if (receber) intent = 'CRIAR_RECEBIMENTO'
  else if (gastar) intent = 'CRIAR_DESPESA'

  const liquidadoCue = /\b(pagamos|paguei|pagou|pagamento|pago|recebemos|recebi|recebimento|a vista)\b/.test(
    norm
  )
  const liquidado = liquidadoCue && parcelas === 1

  const parsed: ParsedMessage = { intent, parcelas, liquidado, faltando: [] }
  if (dataVencimento) parsed.dataVencimento = dataVencimento
  if (valor !== undefined) parsed.valor = valor

  if (intent === 'CRIAR_DESPESA') {
    const { descricao, quantidade } = extractDescricaoDespesa(nfc, fornecedor)
    parsed.descricao = descricao
    if (quantidade) parsed.quantidade = quantidade
    if (fornecedor) parsed.fornecedor = fornecedor
    parsed.categoria = classificarDespesa(`${descricao} ${nfc}`)
    if (valor === undefined) parsed.faltando.push('valor')
  } else if (intent === 'CRIAR_RECEBIMENTO') {
    parsed.descricao = extractDescricaoRecebimento(nfc, norm)
    if (cliente) parsed.cliente = cliente
    parsed.categoria = classificarRecebimento(`${parsed.descricao} ${nfc}`)
    if (valor === undefined) parsed.faltando.push('valor')
  } else if (intent === 'CANCELAR_DESPESA' || intent === 'CANCELAR_RECEBIMENTO') {
    if (fornecedor) parsed.fornecedor = fornecedor
    if (cliente) parsed.cliente = cliente
    if (!fornecedor && !cliente) parsed.faltando.push('fornecedor_ou_cliente')
  } else if (cancelar) {
    parsed.faltando.push('tipo')
  }

  return parsed
}
