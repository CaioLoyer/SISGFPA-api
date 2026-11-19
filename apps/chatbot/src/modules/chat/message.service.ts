import { type Prisma, prisma } from '@sisgfpa/database'
import type { MensagemIntencao, MensagemStatus } from '@sisgfpa/database'
import { ConflictError, NotFoundError } from '@sisgfpa/http'

import { type FinancialApiClient, FinancialApiError } from '../financial-api/financial-api-client.js'
import { type Escolha, interpretar, type Alvo, type Plano } from '../interpreter/planner.js'
import {
  brl,
  MENSAGEM_NAO_ENTENDIDA,
  perguntaEscolha,
  perguntaFaltando,
  resumoDoPlano,
} from '../interpreter/replies.js'
import { gerarTituloAutomatico } from './chat-title.js'
import { buscarChatDoUsuario } from './chat.service.js'
import type { NavigationTopicId } from '../interpreter/navigation-intents.js'

const json = (value: unknown) => value as Prisma.InputJsonValue

/** `Message.parsedData` é JSON no banco; este é o único ponto que o reinterpreta como `ParsedData`. */
const lerParsedData = (value: Prisma.JsonValue | null | undefined) =>
  (value as unknown as ParsedData | null) ?? null

interface ParsedData {
  textoBase: string
  parsed?: unknown
  candidatos?: Alvo[]
  plano?: Plano
  topicos?: NavigationTopicId[]
}

function assistente(chatId: string, userId: string, content: string, status: MensagemStatus = 'INFORMATIVA') {
  return prisma.message.create({ data: { chatId, userId, papel: 'ASSISTENTE', content, status } })
}

/** Resposta do usuário a uma lista de títulos ("2" ou "novo"). */
function lerEscolha(texto: string, candidatos: Alvo[]): Escolha | 'invalida' {
  if (/^\s*novo\b/i.test(texto)) return { novo: true }
  const n = /^\s*(\d+)\s*$/.exec(texto)
  if (n?.[1]) {
    const alvo = candidatos[Number(n[1]) - 1]
    if (alvo) return { alvo }
  }
  return 'invalida'
}

export async function processarMensagem(input: {
  chatId: string
  userId: string
  content: string
  client: FinancialApiClient
}) {
  const { chatId, userId, content, client } = input
  const chatInicial = await buscarChatDoUsuario(chatId, userId)

  // Última mensagem do usuário ainda incompleta (o bot perguntou algo)?
  const ultima = await prisma.message.findFirst({
    where: { chatId, userId, papel: 'USUARIO' },
    orderBy: { createdAt: 'desc' },
  })
  const pendente = ultima?.status === 'INFORMACAO_INSUFICIENTE' ? ultima : null
  const pendenteData = lerParsedData(pendente?.parsedData)

  let textoBase = content
  let escolha: Escolha = {}

  if (pendenteData?.candidatos) {
    // Respondendo à lista de títulos.
    const lida = lerEscolha(content, pendenteData.candidatos)
    if (lida !== 'invalida') {
      escolha = lida
      textoBase = pendenteData.textoBase
    }
  }

  let interpretacao: Awaited<ReturnType<typeof interpretar>>
  if (textoBase === content) {
    interpretacao = await interpretar(content, client)
    // Mensagem sozinha não bastou: tenta complementar a anterior ("Comprei cadernos" + "R$ 300").
    if (
      pendenteData &&
      !pendenteData.candidatos &&
      (interpretacao.kind === 'desconhecida' || interpretacao.kind === 'faltando')
    ) {
      textoBase = `${pendenteData.textoBase} ${content}`
      interpretacao = await interpretar(textoBase, client)
    }
  } else {
    interpretacao = await interpretar(textoBase, client, escolha)
  }

  let status: MensagemStatus
  let intent: MensagemIntencao | undefined
  let parsedData: ParsedData | undefined
  let assistantContent: string
  let confirmationPlan: Plano | null = null
  switch (interpretacao.kind) {
    case 'navegacao': {
      status = 'INFORMATIVA'
      intent = 'DESCONHECIDA'
      parsedData = { textoBase, parsed: interpretacao.parsed, topicos: interpretacao.topicos }
      assistantContent = interpretacao.topicos.length
        ? interpretacao.topicos.length === 1
          ? 'Encontrei este módulo para você:'
          : 'Escolha um dos módulos que podem ajudar:'
        : 'Não encontrei módulos disponíveis para este pedido. Peça ao administrador acesso ao módulo correspondente.'
      break
    }
    case 'desconhecida': {
      status = 'INFORMATIVA'
      intent = 'DESCONHECIDA'
      parsedData = { textoBase }
      assistantContent = MENSAGEM_NAO_ENTENDIDA
      break
    }
    case 'faltando': {
      status = 'INFORMACAO_INSUFICIENTE'
      intent = interpretacao.parsed.intent
      parsedData = {
        textoBase,
        parsed: interpretacao.parsed,
      }
      assistantContent = perguntaFaltando(interpretacao.parsed)
      break
    }
    case 'nao-encontrado': {
      status = 'INFORMATIVA'
      intent = interpretacao.parsed.intent
      parsedData = {
        textoBase,
        parsed: interpretacao.parsed,
      }
      assistantContent = interpretacao.texto
      break
    }
    case 'escolher': {
      status = 'INFORMACAO_INSUFICIENTE'
      intent = interpretacao.parsed.intent
      parsedData = {
        textoBase,
        parsed: interpretacao.parsed,
        candidatos: interpretacao.candidatos,
      }
      assistantContent = perguntaEscolha(interpretacao.candidatos)
      break
    }
    case 'plano': {
      status = 'PENDENTE_CONFIRMACAO'
      intent = interpretacao.plano.tipo
      parsedData = {
        textoBase,
        parsed: interpretacao.parsed,
        plano: interpretacao.plano,
      }
      confirmationPlan = interpretacao.plano
      assistantContent = resumoDoPlano(interpretacao.plano)
      break
    }
  }

  // Bloqueia a conversa enquanto grava as duas mensagens. Se a exclusão ganhar a
  // corrida, nenhuma mensagem é persistida; se este envio ganhar, ambas ficam no histórico.
  const { userMessage, assistantMessage, chat } = await prisma.$transaction(async (tx) => {
    const updatedAt = new Date()
    const titulo = gerarTituloAutomatico(chatInicial.title, textoBase)
    const atualizacaoComTitulo = titulo
      ? await tx.chat.updateMany({
          where: { id: chatId, userId, deletedAt: null, title: chatInicial.title },
          data: { title: titulo, updatedAt },
        })
      : { count: 0 }

    // Se outro envio definiu o título primeiro, mantém esse título e só atualiza a atividade.
    if (atualizacaoComTitulo.count === 0) {
      const atualizacaoAtiva = await tx.chat.updateMany({
        where: { id: chatId, userId, deletedAt: null },
        data: { updatedAt },
      })
      if (atualizacaoAtiva.count === 0) throw new NotFoundError('Chat não encontrado')
    }

    const chat = await tx.chat.findFirst({ where: { id: chatId, userId, deletedAt: null } })
    if (!chat) throw new NotFoundError('Chat não encontrado')

    const userMessage = await tx.message.create({
      data: {
        chatId,
        userId,
        papel: 'USUARIO',
        content,
        status,
        intent,
        parsedData: parsedData ? json(parsedData) : undefined,
      },
    })
    const assistantMessage = await tx.message.create({
      data: { chatId, userId, papel: 'ASSISTENTE', content: assistantContent, status: 'INFORMATIVA' },
    })
    return { userMessage, assistantMessage, chat }
  })

  const confirmacao = confirmationPlan
    ? { messageId: userMessage.id, resumo: resumoDoPlano(confirmationPlan) }
    : null
  return { userMessage, assistantMessage, confirmacao, chat }
}

/** Categorias são resolvidas por nome na API (fonte única de categorias = domínio financeiro). */
async function categoriaId(client: FinancialApiClient, tipo: 'DESPESA' | 'RECEBIMENTO', nome?: string) {
  if (!nome) return undefined
  const { items } = await client.listCategorias(tipo)
  return items.find((c) => c.nome === nome)?.id
}

export async function confirmarMensagem(input: {
  chatId: string
  messageId: string
  userId: string
  client: FinancialApiClient
}) {
  const { chatId, messageId, userId, client } = input
  await buscarChatDoUsuario(chatId, userId)

  // Atualizar a conversa e reivindicar a mensagem na mesma transação serializa
  // confirmação e exclusão. A exclusão vê PROCESSANDO e espera a operação terminar.
  await prisma.$transaction(async (tx) => {
    const conversaAtiva = await tx.chat.updateMany({
      where: { id: chatId, userId, deletedAt: null },
      data: { updatedAt: new Date() },
    })
    if (conversaAtiva.count === 0) throw new NotFoundError('Chat não encontrado')

    const claim = await tx.message.updateMany({
      where: {
        id: messageId,
        chatId,
        userId,
        papel: 'USUARIO',
        status: 'PENDENTE_CONFIRMACAO',
        chat: { is: { userId, deletedAt: null } },
      },
      data: { status: 'PROCESSANDO' },
    })
    if (claim.count === 0)
      throw new ConflictError('MESSAGE_NOT_PENDING', 'Mensagem não está aguardando confirmação')
  })

  const mensagem = await prisma.message.findUniqueOrThrow({ where: { id: messageId } })
  const plano = lerParsedData(mensagem.parsedData)?.plano as Plano

  try {
    let resultado: unknown
    let despesaId: string | undefined
    let recebimentoId: string | undefined
    let texto: string

    switch (plano.tipo) {
      case 'CRIAR_DESPESA': {
        const catId = await categoriaId(client, 'DESPESA', plano.categoria)
        const d = await client.createDespesa({ ...plano.body, categoriaId: catId })
        resultado = d
        despesaId = d.id
        texto = `Despesa registrada: ${d.descricao} (${d.fornecedor}), ${brl(d.valor)}${
          d.numeroParcelas > 1 ? ` em ${d.numeroParcelas} parcelas` : ''
        }. Status: ${d.status}.`
        break
      }
      case 'CRIAR_RECEBIMENTO': {
        const catId = await categoriaId(client, 'RECEBIMENTO', plano.categoria)
        const r = await client.createRecebimento({ ...plano.body, categoriaId: catId })
        resultado = r
        recebimentoId = r.id
        texto = `Recebimento registrado: ${r.descricao} (${r.cliente}), ${brl(r.valor)}${
          r.numeroParcelas > 1 ? ` em ${r.numeroParcelas} parcelas` : ''
        }. Status: ${r.status}.`
        break
      }
      case 'REGISTRAR_PAGAMENTO': {
        const d = await client.registrarPagamento(plano.alvo.id, plano.valor)
        resultado = d
        despesaId = d.id
        texto = `Pagamento de ${brl(plano.valor)} registrado em "${d.descricao}". Status: ${d.status}.`
        break
      }
      case 'REGISTRAR_BAIXA': {
        const r = await client.registrarBaixa(plano.alvo.id, plano.valor)
        resultado = r
        recebimentoId = r.id
        texto = `Baixa de ${brl(plano.valor)} registrada em "${r.descricao}". Status: ${r.status}.`
        break
      }
      case 'CANCELAR_DESPESA': {
        const d = await client.cancelarDespesa(plano.alvo.id)
        resultado = d
        despesaId = d.id
        texto = `Despesa "${d.descricao}" cancelada.`
        break
      }
      case 'CANCELAR_RECEBIMENTO': {
        const r = await client.cancelarRecebimento(plano.alvo.id)
        resultado = r
        recebimentoId = r.id
        texto = `Recebimento "${r.descricao}" cancelado.`
        break
      }
    }

    const userMessage = await prisma.message.update({
      where: { id: messageId },
      data: { status: 'EXECUTADA', resultado: json(resultado), despesaId, recebimentoId },
    })
    const assistantMessage = await assistente(chatId, userId, texto)
    return { userMessage, assistantMessage, erro: null }
  } catch (error) {
    if (!(error instanceof FinancialApiError)) {
      await prisma.message.update({ where: { id: messageId }, data: { status: 'ERRO' } })
      throw error
    }

    // A API Financeira recusou (sem permissão, regra de negócio, indisponível...): nada foi gravado.
    const texto =
      error.apiStatus === 403
        ? 'A API Financeira recusou: você não tem permissão para esta operação.'
        : error.apiStatus === 401
          ? 'Sua sessão expirou. Faça login novamente.'
          : `A API Financeira recusou a operação: ${error.message}`

    const userMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'ERRO',
        resultado: json({ status: error.apiStatus, code: error.code, error: error.message }),
      },
    })
    const assistantMessage = await assistente(chatId, userId, texto, 'ERRO')
    return {
      userMessage,
      assistantMessage,
      erro: { status: error.apiStatus, code: error.code, message: error.message },
    }
  }
}

export async function cancelarConfirmacao(input: { chatId: string; messageId: string; userId: string }) {
  const { chatId, messageId, userId } = input
  await buscarChatDoUsuario(chatId, userId)

  const claim = await prisma.message.updateMany({
    where: {
      id: messageId,
      chatId,
      userId,
      papel: 'USUARIO',
      status: 'PENDENTE_CONFIRMACAO',
      chat: { is: { userId, deletedAt: null } },
    },
    data: { status: 'CANCELADA' },
  })
  if (claim.count === 0)
    throw new ConflictError('MESSAGE_NOT_PENDING', 'Mensagem não está aguardando confirmação')

  const userMessage = await prisma.message.findUniqueOrThrow({ where: { id: messageId } })
  const assistantMessage = await assistente(chatId, userId, 'Tudo bem, não registrei nada.')
  return { userMessage, assistantMessage }
}
