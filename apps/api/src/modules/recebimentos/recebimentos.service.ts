import { prisma } from '@sisgfpa/database'
import { NotFoundError } from '@sisgfpa/http'
import type {
  CreateRecebimentoInput,
  ListRecebimentosQuery,
  RegistrarBaixaInput,
  UpdateRecebimentoInput,
} from '@sisgfpa/validation'

import { assertCategoria } from '../../domain/categoria.js'
import { toHistoricoDto } from '../../domain/dto.js'
import { aplicarBaixaRecebimento } from '../../domain/liquidacao.js'
import { gerarParcelas, toCents } from '../../domain/parcelas.js'
import { paginacao, periodoVencimento } from '../../domain/periodo.js'
import { TituloCanceladoError, TituloComPagamentoError, TituloJaLiquidadoError } from '../../errors.js'
import { toRecebimentoComParcelasDto, toRecebimentoDto } from './recebimentos.mapper.js'

export async function criarRecebimento(input: CreateRecebimentoInput & { criadoPorId: string }) {
  await assertCategoria(input.categoriaId, 'RECEBIMENTO')

  const parcelas = gerarParcelas(input.valor, input.parcelas, input.dataVencimento)

  const recebimento = await prisma.$transaction(async (tx) => {
    const criada = await tx.recebimento.create({
      data: {
        descricao: input.descricao,
        cliente: input.cliente,
        valor: input.valor,
        dataVencimento: new Date(input.dataVencimento),
        dataLancamento: input.dataLancamento ? new Date(input.dataLancamento) : undefined,
        numeroParcelas: input.parcelas,
        observacoes: input.observacoes,
        categoriaId: input.categoriaId,
        criadoPorId: input.criadoPorId,
        parcelas: {
          create: parcelas.map((p) => ({
            numero: p.numero,
            valor: p.valor,
            dataVencimento: new Date(p.dataVencimento),
          })),
        },
      },
    })

    await tx.recebimentoHistorico.create({
      data: {
        recebimentoId: criada.id,
        acao: 'CRIADO',
        statusNovo: criada.status,
        alteradoPorId: input.criadoPorId,
      },
    })

    if (input.liquidarNoAto) {
      return aplicarBaixaRecebimento(tx, {
        recebimentoId: criada.id,
        valor: input.valor,
        usuarioId: input.criadoPorId,
      })
    }

    return tx.recebimento.findUniqueOrThrow({
      where: { id: criada.id },
      include: { categoria: true, parcelas: true },
    })
  })

  return toRecebimentoComParcelasDto(recebimento)
}

export async function listarRecebimentos(query: ListRecebimentosQuery) {
  const where = {
    status: query.status,
    categoriaId: query.categoriaId,
    cliente: query.cliente ? { contains: query.cliente, mode: 'insensitive' as const } : undefined,
    dataVencimento: periodoVencimento(query.dataInicio, query.dataFim),
  }

  const [items, total] = await Promise.all([
    prisma.recebimento.findMany({
      where,
      include: { categoria: true },
      orderBy: { dataVencimento: 'asc' },
      ...paginacao(query.page, query.pageSize),
    }),
    prisma.recebimento.count({ where }),
  ])

  return { items: items.map(toRecebimentoDto), total, page: query.page, pageSize: query.pageSize }
}

export async function buscarRecebimento(id: string) {
  const recebimento = await prisma.recebimento.findUnique({
    where: { id },
    include: {
      categoria: true,
      parcelas: true,
      baixas: { orderBy: { recebidoEm: 'desc' } },
      historico: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!recebimento) throw new NotFoundError('Recebimento não encontrada')

  return {
    ...toRecebimentoComParcelasDto(recebimento),
    baixas: recebimento.baixas.map((p) => ({
      id: p.id,
      valor: Number(p.valor),
      recebidoEm: p.recebidoEm.toISOString(),
      registradoPorId: p.registradoPorId,
    })),
    historico: recebimento.historico.map(toHistoricoDto),
  }
}

export async function atualizarRecebimento(id: string, input: UpdateRecebimentoInput, usuarioId: string) {
  const recebimento = await prisma.recebimento.findUnique({ where: { id } })
  if (!recebimento) throw new NotFoundError('Recebimento não encontrada')
  if (recebimento.status === 'CANCELADO')
    throw new TituloCanceladoError('Título cancelado não pode ser alterado')
  if (recebimento.status === 'PAGO') {
    throw new TituloJaLiquidadoError('Título já totalmente recebido não pode ser alterado')
  }
  await assertCategoria(input.categoriaId, 'RECEBIMENTO')

  const vencimentoAtual = recebimento.dataVencimento.toISOString().slice(0, 10)
  const mudouValor = input.valor !== undefined && toCents(input.valor) !== toCents(Number(recebimento.valor))
  const mudouVencimento = input.dataVencimento !== undefined && input.dataVencimento !== vencimentoAtual
  const recalcularParcelas = mudouValor || mudouVencimento

  // Com baixa já registrada, valor e vencimento ficam congelados: as parcelas
  // recebidas não podem ser recalculadas sem quebrar o histórico financeiro.
  if (recalcularParcelas && Number(recebimento.valorRecebido) > 0) {
    throw new TituloComPagamentoError(
      'Título com baixa registrada: só é possível alterar descrição, cliente, categoria e observações'
    )
  }

  const atualizada = await prisma.$transaction(async (tx) => {
    if (recalcularParcelas) {
      const novoValor = input.valor ?? Number(recebimento.valor)
      const novoVencimento = input.dataVencimento ?? vencimentoAtual
      await tx.recebimentoParcela.deleteMany({ where: { recebimentoId: id } })
      await tx.recebimentoParcela.createMany({
        data: gerarParcelas(novoValor, recebimento.numeroParcelas, novoVencimento).map((p) => ({
          recebimentoId: id,
          numero: p.numero,
          valor: p.valor,
          dataVencimento: new Date(p.dataVencimento),
        })),
      })
    }

    const result = await tx.recebimento.update({
      where: { id },
      data: {
        descricao: input.descricao,
        cliente: input.cliente,
        valor: input.valor,
        dataVencimento: input.dataVencimento ? new Date(input.dataVencimento) : undefined,
        categoriaId: input.categoriaId,
        observacoes: input.observacoes,
      },
      include: { categoria: true },
    })

    await tx.recebimentoHistorico.create({
      data: {
        recebimentoId: id,
        acao: 'ATUALIZADO',
        statusAnterior: recebimento.status,
        statusNovo: result.status,
        alteradoPorId: usuarioId,
      },
    })

    return result
  })

  return toRecebimentoDto(atualizada)
}

/**
 * Nunca há exclusão física: cancelar altera o status do título e das parcelas em aberto.
 * A restrição a ADMIN é aplicada na rota (RF-FM-014).
 */
export async function cancelarRecebimento(id: string, usuarioId: string) {
  const recebimento = await prisma.recebimento.findUnique({ where: { id } })
  if (!recebimento) throw new NotFoundError('Recebimento não encontrada')
  if (recebimento.status === 'CANCELADO') throw new TituloCanceladoError('Título já está cancelado')
  if (recebimento.status === 'PAGO') {
    throw new TituloJaLiquidadoError('Título já totalmente recebido não pode ser cancelado')
  }

  const cancelada = await prisma.$transaction(async (tx) => {
    await tx.recebimentoParcela.updateMany({
      where: { recebimentoId: id, status: { not: 'PAGO' } },
      data: { status: 'CANCELADO' },
    })

    const updated = await tx.recebimento.update({
      where: { id },
      data: { status: 'CANCELADO' },
      include: { categoria: true },
    })

    await tx.recebimentoHistorico.create({
      data: {
        recebimentoId: id,
        acao: 'CANCELADO',
        statusAnterior: recebimento.status,
        statusNovo: 'CANCELADO',
        alteradoPorId: usuarioId,
      },
    })

    return updated
  })

  return toRecebimentoDto(cancelada)
}

export async function registrarBaixa(id: string, input: RegistrarBaixaInput, usuarioId: string) {
  const atualizada = await prisma.$transaction((tx) =>
    aplicarBaixaRecebimento(tx, {
      recebimentoId: id,
      valor: input.valor,
      recebidoEm: input.recebidoEm ? new Date(input.recebidoEm) : undefined,
      usuarioId,
    })
  )

  return toRecebimentoDto(atualizada)
}
