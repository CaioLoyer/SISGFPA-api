import { prisma } from '@sisgfpa/database'
import { NotFoundError } from '@sisgfpa/http'
import type {
  CreateDespesaInput,
  ListDespesasQuery,
  RegistrarPagamentoInput,
  UpdateDespesaInput,
} from '@sisgfpa/validation'

import { assertCategoria } from '../../domain/categoria.js'
import { toHistoricoDto } from '../../domain/dto.js'
import { aplicarPagamentoDespesa } from '../../domain/liquidacao.js'
import { gerarParcelas, toCents } from '../../domain/parcelas.js'
import { paginacao, periodoVencimento } from '../../domain/periodo.js'
import { TituloCanceladoError, TituloComPagamentoError, TituloJaLiquidadoError } from '../../errors.js'
import { toDespesaComParcelasDto, toDespesaDto } from './despesas.mapper.js'

export async function criarDespesa(input: CreateDespesaInput & { criadoPorId: string }) {
  await assertCategoria(input.categoriaId, 'DESPESA')

  const parcelas = gerarParcelas(input.valor, input.parcelas, input.dataVencimento)

  const despesa = await prisma.$transaction(async (tx) => {
    const criada = await tx.despesa.create({
      data: {
        descricao: input.descricao,
        fornecedor: input.fornecedor,
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

    await tx.despesaHistorico.create({
      data: {
        despesaId: criada.id,
        acao: 'CRIADO',
        statusNovo: criada.status,
        alteradoPorId: input.criadoPorId,
      },
    })

    if (input.liquidarNoAto) {
      return aplicarPagamentoDespesa(tx, {
        despesaId: criada.id,
        valor: input.valor,
        usuarioId: input.criadoPorId,
      })
    }

    return tx.despesa.findUniqueOrThrow({
      where: { id: criada.id },
      include: { categoria: true, parcelas: true },
    })
  })

  return toDespesaComParcelasDto(despesa)
}

export async function listarDespesas(query: ListDespesasQuery) {
  const where = {
    status: query.status,
    categoriaId: query.categoriaId,
    fornecedor: query.fornecedor ? { contains: query.fornecedor, mode: 'insensitive' as const } : undefined,
    dataVencimento: periodoVencimento(query.dataInicio, query.dataFim),
  }

  const [items, total] = await Promise.all([
    prisma.despesa.findMany({
      where,
      include: { categoria: true },
      orderBy: { dataVencimento: 'asc' },
      ...paginacao(query.page, query.pageSize),
    }),
    prisma.despesa.count({ where }),
  ])

  return { items: items.map(toDespesaDto), total, page: query.page, pageSize: query.pageSize }
}

export async function buscarDespesa(id: string) {
  const despesa = await prisma.despesa.findUnique({
    where: { id },
    include: {
      categoria: true,
      parcelas: true,
      pagamentos: { orderBy: { pagoEm: 'desc' } },
      historico: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!despesa) throw new NotFoundError('Despesa não encontrada')

  return {
    ...toDespesaComParcelasDto(despesa),
    pagamentos: despesa.pagamentos.map((p) => ({
      id: p.id,
      valor: Number(p.valor),
      pagoEm: p.pagoEm.toISOString(),
      registradoPorId: p.registradoPorId,
    })),
    historico: despesa.historico.map(toHistoricoDto),
  }
}

export async function atualizarDespesa(id: string, input: UpdateDespesaInput, usuarioId: string) {
  const despesa = await prisma.despesa.findUnique({ where: { id } })
  if (!despesa) throw new NotFoundError('Despesa não encontrada')
  if (despesa.status === 'CANCELADO') throw new TituloCanceladoError('Título cancelado não pode ser alterado')
  if (despesa.status === 'PAGO') {
    throw new TituloJaLiquidadoError('Título já totalmente pago não pode ser alterado')
  }
  await assertCategoria(input.categoriaId, 'DESPESA')

  const vencimentoAtual = despesa.dataVencimento.toISOString().slice(0, 10)
  const mudouValor = input.valor !== undefined && toCents(input.valor) !== toCents(Number(despesa.valor))
  const mudouVencimento = input.dataVencimento !== undefined && input.dataVencimento !== vencimentoAtual
  const recalcularParcelas = mudouValor || mudouVencimento

  // Com pagamento já registrado, valor e vencimento ficam congelados: as parcelas
  // pagas não podem ser recalculadas sem quebrar o histórico financeiro.
  if (recalcularParcelas && Number(despesa.valorPago) > 0) {
    throw new TituloComPagamentoError(
      'Título com pagamento registrado: só é possível alterar descrição, fornecedor, categoria e observações'
    )
  }

  const atualizada = await prisma.$transaction(async (tx) => {
    if (recalcularParcelas) {
      const novoValor = input.valor ?? Number(despesa.valor)
      const novoVencimento = input.dataVencimento ?? vencimentoAtual
      await tx.despesaParcela.deleteMany({ where: { despesaId: id } })
      await tx.despesaParcela.createMany({
        data: gerarParcelas(novoValor, despesa.numeroParcelas, novoVencimento).map((p) => ({
          despesaId: id,
          numero: p.numero,
          valor: p.valor,
          dataVencimento: new Date(p.dataVencimento),
        })),
      })
    }

    const result = await tx.despesa.update({
      where: { id },
      data: {
        descricao: input.descricao,
        fornecedor: input.fornecedor,
        valor: input.valor,
        dataVencimento: input.dataVencimento ? new Date(input.dataVencimento) : undefined,
        categoriaId: input.categoriaId,
        observacoes: input.observacoes,
      },
      include: { categoria: true },
    })

    await tx.despesaHistorico.create({
      data: {
        despesaId: id,
        acao: 'ATUALIZADO',
        statusAnterior: despesa.status,
        statusNovo: result.status,
        alteradoPorId: usuarioId,
      },
    })

    return result
  })

  return toDespesaDto(atualizada)
}

/**
 * Nunca há exclusão física: cancelar altera o status do título e das parcelas em aberto.
 * A restrição a ADMIN é aplicada na rota (RF-FM-014).
 */
export async function cancelarDespesa(id: string, usuarioId: string) {
  const despesa = await prisma.despesa.findUnique({ where: { id } })
  if (!despesa) throw new NotFoundError('Despesa não encontrada')
  if (despesa.status === 'CANCELADO') throw new TituloCanceladoError('Título já está cancelado')
  if (despesa.status === 'PAGO') {
    throw new TituloJaLiquidadoError('Título já totalmente pago não pode ser cancelado')
  }

  const cancelada = await prisma.$transaction(async (tx) => {
    await tx.despesaParcela.updateMany({
      where: { despesaId: id, status: { not: 'PAGO' } },
      data: { status: 'CANCELADO' },
    })

    const updated = await tx.despesa.update({
      where: { id },
      data: { status: 'CANCELADO' },
      include: { categoria: true },
    })

    await tx.despesaHistorico.create({
      data: {
        despesaId: id,
        acao: 'CANCELADO',
        statusAnterior: despesa.status,
        statusNovo: 'CANCELADO',
        alteradoPorId: usuarioId,
      },
    })

    return updated
  })

  return toDespesaDto(cancelada)
}

export async function registrarPagamento(id: string, input: RegistrarPagamentoInput, usuarioId: string) {
  const atualizada = await prisma.$transaction((tx) =>
    aplicarPagamentoDespesa(tx, {
      despesaId: id,
      valor: input.valor,
      pagoEm: input.pagoEm ? new Date(input.pagoEm) : undefined,
      usuarioId,
    })
  )

  return toDespesaDto(atualizada)
}
