import { prisma } from '@sisgfpa/database'
import type { OrigemMovimentacaoCaixa, StatusTitulo, TipoMovimentacaoCaixa } from '@sisgfpa/database'
import { financialDayStart } from '@sisgfpa/types'
import { ConflictError, NotFoundError } from '@sisgfpa/http'
import type {
  AbrirCaixaInput,
  EstornarMovimentacaoInput,
  LancamentoAvulsoCaixaInput,
  ListCaixaMovimentacoesQuery,
} from '@sisgfpa/validation'

import { CaixaNaoConfiguradoError, EstornoInvalidoError } from '../../errors.js'
import { periodoMovimentacao } from '../../domain/periodo.js'

const CODIGO_CAIXA_PRINCIPAL = 'PRINCIPAL'

function numero(valor: unknown) {
  return Number(valor ?? 0)
}

function centavos(valor: unknown) {
  return Math.round(numero(valor) * 100)
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
    movimentacao.origem === 'AVULSA'
      ? valorEstornado === 0
        ? valor
        : 0
      : movimentacao.origem === 'LIQUIDACAO' && titulo?.status === 'CANCELADO'
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

export async function registrarLancamentoAvulso(input: LancamentoAvulsoCaixaInput, usuarioId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM caixa WHERE codigo = 'PRINCIPAL' FOR UPDATE`
    const caixa = await tx.caixa.findUnique({
      where: { codigo: CODIGO_CAIXA_PRINCIPAL },
      select: { id: true },
    })
    if (!caixa) throw new CaixaNaoConfiguradoError()

    const existente = await tx.caixaMovimentacao.findUnique({
      where: { caixaId_idempotencyKey: { caixaId: caixa.id, idempotencyKey: input.idempotencyKey } },
      include: selectMovimentacao,
    })
    if (existente) {
      const mesmosDados =
        existente.origem === 'AVULSA' &&
        existente.tipo === input.tipo &&
        centavos(existente.valor) === centavos(input.valor) &&
        existente.data.getTime() === financialDayStart(input.data).getTime() &&
        existente.descricao === input.descricao &&
        existente.registradoPorId === usuarioId
      if (!mesmosDados) {
        throw new ConflictError(
          'IDEMPOTENCY_KEY_REUSED',
          'Esta chave já foi usada com outros dados de movimento'
        )
      }
      return toMovimentacaoDto(existente)
    }

    const movimento = await tx.caixaMovimentacao.create({
      data: {
        caixaId: caixa.id,
        tipo: input.tipo,
        origem: 'AVULSA',
        valor: input.valor,
        data: financialDayStart(input.data),
        descricao: input.descricao,
        idempotencyKey: input.idempotencyKey,
        registradoPorId: usuarioId,
      },
    })
    return toMovimentacaoDto({
      ...movimento,
      despesaPagamento: null,
      recebimentoBaixa: null,
      estornoDe: null,
      estornos: [],
    })
  })
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

    const despesa = original.despesaPagamento?.despesa
    const recebimento = original.recebimentoBaixa?.recebimento
    const titulo = despesa ?? recebimento
    const descricaoEstornoAvulso = `Estorno do lançamento avulso: ${original.descricao}. Motivo: ${input.motivo ?? ''}`
    if (input.idempotencyKey) {
      const repeticao = await tx.caixaMovimentacao.findUnique({
        where: {
          caixaId_idempotencyKey: { caixaId: original.caixaId, idempotencyKey: input.idempotencyKey },
        },
        include: selectMovimentacao,
      })
      if (repeticao) {
        const mesmosDados =
          repeticao.origem === 'ESTORNO' &&
          repeticao.estornoDeId === original.id &&
          centavos(repeticao.valor) === centavos(input.valor) &&
          repeticao.registradoPorId === usuarioId &&
          (original.origem !== 'AVULSA' || repeticao.descricao === descricaoEstornoAvulso)
        if (!mesmosDados) {
          throw new ConflictError(
            'IDEMPOTENCY_KEY_REUSED',
            'Esta chave já foi usada com outros dados de movimento'
          )
        }
        return toMovimentacaoDto(repeticao)
      }
    }

    if (original.origem === 'LIQUIDACAO') {
      if (!titulo || titulo.status !== 'CANCELADO') {
        throw new EstornoInvalidoError('Só é possível estornar uma liquidação de título cancelado')
      }
    } else if (original.origem === 'AVULSA') {
      if (!input.motivo || !input.idempotencyKey) {
        throw new EstornoInvalidoError(
          'Informe o motivo e a chave da tentativa para corrigir um lançamento avulso'
        )
      }
    } else {
      throw new EstornoInvalidoError(
        'Somente liquidações canceladas ou lançamentos avulsos podem receber estorno'
      )
    }

    const anteriores = await tx.caixaMovimentacao.aggregate({
      where: { estornoDeId: original.id },
      _sum: { valor: true },
    })
    const valorJaEstornado = numero(anteriores._sum.valor)
    if (
      original.origem === 'AVULSA' &&
      (centavos(valorJaEstornado) > 0 || centavos(input.valor) !== centavos(original.valor))
    ) {
      throw new EstornoInvalidoError('Um lançamento avulso deve ser estornado integralmente uma única vez')
    }
    if (centavos(valorJaEstornado) + centavos(input.valor) > centavos(original.valor)) {
      throw new EstornoInvalidoError('O valor do estorno excede o saldo da liquidação original')
    }

    const movimento = await tx.caixaMovimentacao.create({
      data: {
        caixaId: original.caixaId,
        tipo: original.tipo === 'ENTRADA' ? 'SAIDA' : 'ENTRADA',
        origem: 'ESTORNO',
        valor: input.valor,
        data: new Date(),
        descricao:
          original.origem === 'AVULSA'
            ? descricaoEstornoAvulso
            : `Estorno: ${titulo?.descricao ?? 'Título cancelado'}`,
        estornoDeId: original.id,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
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
      titulo:
        titulo && original.origem === 'LIQUIDACAO'
          ? {
              id: titulo.id,
              descricao: titulo.descricao,
              pessoa: despesa ? despesa.fornecedor : (recebimento?.cliente ?? ''),
              status: titulo.status,
            }
          : null,
      estornoDeId: original.id,
      valorEstornado: valorJaEstornado + input.valor,
      saldoEstornavel: Math.max(0, numero(original.valor) - valorJaEstornado - input.valor),
      podeEstornar:
        original.origem === 'LIQUIDACAO' &&
        centavos(valorJaEstornado) + centavos(input.valor) < centavos(original.valor),
    }
  })
}
