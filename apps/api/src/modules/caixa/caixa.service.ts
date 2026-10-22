import { prisma } from '@sisgfpa/database'
import type { OrigemMovimentacaoCaixa, StatusTitulo, TipoMovimentacaoCaixa } from '@sisgfpa/database'
import { ConflictError, NotFoundError } from '@sisgfpa/http'
import type {
  AbrirCaixaInput,
  EstornarMovimentacaoInput,
  ListCaixaMovimentacoesQuery,
} from '@sisgfpa/validation'

import { EstornoInvalidoError } from '../../errors.js'

const CODIGO_CAIXA_PRINCIPAL = 'PRINCIPAL'

function numero(valor: unknown) {
  return Number(valor ?? 0)
}

function periodoMovimentacao(dataInicio?: string, dataFim?: string) {
  if (!dataInicio && !dataFim) return undefined
  return {
    gte: dataInicio ? new Date(`${dataInicio}T00:00:00.000Z`) : undefined,
    lte: dataFim ? new Date(`${dataFim}T23:59:59.999Z`) : undefined,
  }
}

export async function consultarCaixa() {
  const caixa = await prisma.caixa.findUnique({ where: { codigo: CODIGO_CAIXA_PRINCIPAL } })
  if (!caixa) return { caixa: null }

  const [entradas, saidas, quantidadeMovimentacoes] = await Promise.all([
    prisma.caixaMovimentacao.aggregate({
      where: { caixaId: caixa.id, tipo: 'ENTRADA' },
      _sum: { valor: true },
    }),
    prisma.caixaMovimentacao.aggregate({
      where: { caixaId: caixa.id, tipo: 'SAIDA' },
      _sum: { valor: true },
    }),
    prisma.caixaMovimentacao.count({ where: { caixaId: caixa.id } }),
  ])

  const saldoInicial = numero(caixa.saldoInicial)
  const totalEntradas = numero(entradas._sum.valor)
  const totalSaidas = numero(saidas._sum.valor)
  return {
    caixa: {
      id: caixa.id,
      codigo: CODIGO_CAIXA_PRINCIPAL as 'PRINCIPAL',
      saldoInicial,
      iniciadoEm: caixa.iniciadoEm.toISOString(),
      totalEntradas,
      totalSaidas,
      quantidadeMovimentacoes,
      saldoAtual: saldoInicial + totalEntradas - totalSaidas,
    },
  }
}

/** Configura o saldo atual. Antes da primeira liquidação, o ADMIN pode corrigir o valor informado. */
export async function abrirCaixa(input: AbrirCaixaInput) {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.caixa.findUnique({ where: { codigo: CODIGO_CAIXA_PRINCIPAL } })
    if (existente) {
      await tx.$queryRaw`SELECT id FROM caixa WHERE id = ${existente.id} FOR UPDATE`
      const movimentos = await tx.caixaMovimentacao.count({ where: { caixaId: existente.id } })
      if (movimentos > 0) {
        throw new ConflictError(
          'CAIXA_JA_MOVIMENTADO',
          'O saldo inicial não pode ser alterado depois do primeiro movimento'
        )
      }
      await tx.caixa.update({
        where: { id: existente.id },
        data: { saldoInicial: input.saldoInicial, iniciadoEm: new Date() },
      })
    } else {
      await tx.caixa.create({ data: { codigo: CODIGO_CAIXA_PRINCIPAL, saldoInicial: input.saldoInicial } })
    }

    const caixa = await tx.caixa.findUniqueOrThrow({ where: { codigo: CODIGO_CAIXA_PRINCIPAL } })
    return {
      caixa: {
        id: caixa.id,
        codigo: CODIGO_CAIXA_PRINCIPAL as 'PRINCIPAL',
        saldoInicial: numero(caixa.saldoInicial),
        iniciadoEm: caixa.iniciadoEm.toISOString(),
        totalEntradas: 0,
        totalSaidas: 0,
        quantidadeMovimentacoes: 0,
        saldoAtual: numero(caixa.saldoInicial),
      },
    }
  })
}

const selectMovimentacao = {
  despesaPagamento: {
    select: { despesa: { select: { id: true, descricao: true, fornecedor: true, status: true } } },
  },
  recebimentoBaixa: {
    select: { recebimento: { select: { id: true, descricao: true, cliente: true, status: true } } },
  },
  estornoDe: {
    select: {
      despesaPagamento: {
        select: { despesa: { select: { id: true, descricao: true, fornecedor: true, status: true } } },
      },
      recebimentoBaixa: {
        select: { recebimento: { select: { id: true, descricao: true, cliente: true, status: true } } },
      },
    },
  },
  estornos: { select: { valor: true } },
} as const

function dadosTitulo(movimentacao: {
  origem: OrigemMovimentacaoCaixa
  despesaPagamento?: {
    despesa: { id: string; descricao: string; fornecedor: string; status: StatusTitulo }
  } | null
  recebimentoBaixa?: {
    recebimento: { id: string; descricao: string; cliente: string; status: StatusTitulo }
  } | null
  estornoDe?: {
    despesaPagamento?: {
      despesa: { id: string; descricao: string; fornecedor: string; status: StatusTitulo }
    } | null
    recebimentoBaixa?: {
      recebimento: { id: string; descricao: string; cliente: string; status: StatusTitulo }
    } | null
  } | null
}) {
  const origem = movimentacao.origem === 'ESTORNO' ? movimentacao.estornoDe : movimentacao
  const despesa = origem?.despesaPagamento?.despesa
  if (despesa) {
    return {
      id: despesa.id,
      descricao: despesa.descricao,
      pessoa: despesa.fornecedor,
      status: despesa.status,
    }
  }
  const recebimento = origem?.recebimentoBaixa?.recebimento
  if (recebimento) {
    return {
      id: recebimento.id,
      descricao: recebimento.descricao,
      pessoa: recebimento.cliente,
      status: recebimento.status,
    }
  }
  return null
}

function toMovimentacaoDto(movimentacao: {
  id: string
  tipo: TipoMovimentacaoCaixa
  origem: OrigemMovimentacaoCaixa
  valor: unknown
  data: Date
  descricao: string
  estornoDeId: string | null
  despesaPagamento?: {
    despesa: { id: string; descricao: string; fornecedor: string; status: StatusTitulo }
  } | null
  recebimentoBaixa?: {
    recebimento: { id: string; descricao: string; cliente: string; status: StatusTitulo }
  } | null
  estornoDe?: {
    despesaPagamento?: {
      despesa: { id: string; descricao: string; fornecedor: string; status: StatusTitulo }
    } | null
    recebimentoBaixa?: {
      recebimento: { id: string; descricao: string; cliente: string; status: StatusTitulo }
    } | null
  } | null
  estornos: Array<{ valor: unknown }>
}) {
  const valor = numero(movimentacao.valor)
  const valorEstornado = movimentacao.estornos.reduce((total, estorno) => total + numero(estorno.valor), 0)
  const titulo = dadosTitulo(movimentacao)
  const saldoEstornavel =
    movimentacao.origem === 'LIQUIDACAO' && titulo?.status === 'CANCELADO'
      ? Math.max(0, valor - valorEstornado)
      : 0
  return {
    id: movimentacao.id,
    tipo: movimentacao.tipo,
    origem: movimentacao.origem,
    valor,
    data: movimentacao.data.toISOString(),
    descricao: movimentacao.descricao,
    titulo,
    estornoDeId: movimentacao.estornoDeId,
    valorEstornado,
    saldoEstornavel,
    podeEstornar: saldoEstornavel > 0,
  }
}

export async function listarMovimentacoes(query: ListCaixaMovimentacoesQuery) {
  const caixa = await prisma.caixa.findUnique({
    where: { codigo: CODIGO_CAIXA_PRINCIPAL },
    select: { id: true },
  })
  if (!caixa) return { items: [], total: 0, page: query.page, pageSize: query.pageSize }

  const where = {
    caixaId: caixa.id,
    tipo: query.tipo,
    data: periodoMovimentacao(query.dataInicio, query.dataFim),
  }
  const [items, total] = await Promise.all([
    prisma.caixaMovimentacao.findMany({
      where,
      include: selectMovimentacao,
      orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.caixaMovimentacao.count({ where }),
  ])

  return { items: items.map(toMovimentacaoDto), total, page: query.page, pageSize: query.pageSize }
}

export async function registrarEstorno(
  movimentacaoId: string,
  input: EstornarMovimentacaoInput,
  usuarioId: string
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM caixa_movimentacao WHERE id = ${movimentacaoId} FOR UPDATE`
    const original = await tx.caixaMovimentacao.findUnique({
      where: { id: movimentacaoId },
      include: {
        despesaPagamento: {
          select: { despesa: { select: { id: true, descricao: true, fornecedor: true, status: true } } },
        },
        recebimentoBaixa: {
          select: { recebimento: { select: { id: true, descricao: true, cliente: true, status: true } } },
        },
      },
    })
    if (!original) throw new NotFoundError('Movimentação não encontrada')
    if (original.origem !== 'LIQUIDACAO') {
      throw new EstornoInvalidoError('Somente uma liquidação original pode receber estorno')
    }

    const despesa = original.despesaPagamento?.despesa
    const recebimento = original.recebimentoBaixa?.recebimento
    const titulo = despesa ?? recebimento
    if (!titulo || titulo.status !== 'CANCELADO') {
      throw new EstornoInvalidoError('Só é possível estornar uma liquidação de título cancelado')
    }

    const anteriores = await tx.caixaMovimentacao.aggregate({
      where: { estornoDeId: original.id },
      _sum: { valor: true },
    })
    const valorJaEstornado = numero(anteriores._sum.valor)
    const cents = (valor: number) => Math.round(valor * 100)
    if (cents(valorJaEstornado) + cents(input.valor) > cents(numero(original.valor))) {
      throw new EstornoInvalidoError('O valor do estorno excede o saldo da liquidação original')
    }

    const movimento = await tx.caixaMovimentacao.create({
      data: {
        caixaId: original.caixaId,
        tipo: original.tipo === 'ENTRADA' ? 'SAIDA' : 'ENTRADA',
        origem: 'ESTORNO',
        valor: input.valor,
        data: new Date(),
        descricao: `Estorno: ${titulo.descricao}`,
        estornoDeId: original.id,
        registradoPorId: usuarioId,
      },
    })

    return {
      id: movimento.id,
      tipo: movimento.tipo,
      origem: movimento.origem,
      valor: numero(movimento.valor),
      data: movimento.data.toISOString(),
      descricao: movimento.descricao,
      titulo: {
        id: titulo.id,
        descricao: titulo.descricao,
        pessoa: despesa ? despesa.fornecedor : (recebimento?.cliente ?? ''),
        status: titulo.status,
      },
      estornoDeId: original.id,
      valorEstornado: valorJaEstornado + input.valor,
      saldoEstornavel: Math.max(0, numero(original.valor) - valorJaEstornado - input.valor),
      podeEstornar: cents(valorJaEstornado) + cents(input.valor) < cents(numero(original.valor)),
    }
  })
}
