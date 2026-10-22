import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  caixaFindUnique: vi.fn(),
  caixaCreate: vi.fn(),
  caixaUpdate: vi.fn(),
  caixaFindUniqueOrThrow: vi.fn(),
  movimentoAggregate: vi.fn(),
  movimentoCount: vi.fn(),
  movimentoFindMany: vi.fn(),
  movimentoFindUnique: vi.fn(),
  movimentoCreate: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@sisgfpa/database', () => ({
  prisma: {
    caixa: {
      findUnique: state.caixaFindUnique,
      create: state.caixaCreate,
      update: state.caixaUpdate,
      findUniqueOrThrow: state.caixaFindUniqueOrThrow,
    },
    caixaMovimentacao: {
      aggregate: state.movimentoAggregate,
      count: state.movimentoCount,
      findMany: state.movimentoFindMany,
      findUnique: state.movimentoFindUnique,
      create: state.movimentoCreate,
    },
    $transaction: state.transaction,
  },
}))

import { abrirCaixa, consultarCaixa, listarMovimentacoes, registrarEstorno } from './caixa.service.js'

const openedAt = new Date('2026-10-21T12:00:00.000Z')

function transacao() {
  return {
    $queryRaw: state.queryRaw,
    caixa: {
      findUnique: state.caixaFindUnique,
      create: state.caixaCreate,
      update: state.caixaUpdate,
      findUniqueOrThrow: state.caixaFindUniqueOrThrow,
    },
    caixaMovimentacao: {
      aggregate: state.movimentoAggregate,
      count: state.movimentoCount,
      findUnique: state.movimentoFindUnique,
      create: state.movimentoCreate,
    },
  }
}

describe('Caixa Principal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.transaction.mockImplementation(async (callback) => callback(transacao()))
    state.caixaFindUnique.mockResolvedValue(null)
    state.caixaCreate.mockResolvedValue({})
    state.caixaUpdate.mockResolvedValue({})
    state.caixaFindUniqueOrThrow.mockResolvedValue({
      id: 'caixa-1',
      codigo: 'PRINCIPAL',
      saldoInicial: 500,
      iniciadoEm: openedAt,
    })
    state.movimentoAggregate.mockImplementation(async ({ where }) => ({
      _sum: { valor: where?.tipo === 'ENTRADA' ? 250 : 90 },
    }))
    state.movimentoCount.mockResolvedValue(3)
  })

  it('calcula saldo com saldo inicial mais entradas menos saídas', async () => {
    state.caixaFindUnique.mockResolvedValue({
      id: 'caixa-1',
      codigo: 'PRINCIPAL',
      saldoInicial: 500,
      iniciadoEm: openedAt,
    })

    await expect(consultarCaixa()).resolves.toEqual({
      caixa: {
        id: 'caixa-1',
        codigo: 'PRINCIPAL',
        saldoInicial: 500,
        iniciadoEm: openedAt.toISOString(),
        totalEntradas: 250,
        totalSaidas: 90,
        quantidadeMovimentacoes: 3,
        saldoAtual: 660,
      },
    })
  })

  it('não importa títulos liquidados anteriormente ao informar o saldo atual', async () => {
    await abrirCaixa({ saldoInicial: 1250.5 })

    expect(state.caixaCreate).toHaveBeenCalledWith({
      data: { codigo: 'PRINCIPAL', saldoInicial: 1250.5 },
    })
    expect(state.movimentoFindMany).not.toHaveBeenCalled()
    expect(state.movimentoCreate).not.toHaveBeenCalled()
  })

  it('impede alterar o saldo inicial depois de qualquer movimento', async () => {
    state.caixaFindUnique.mockResolvedValue({ id: 'caixa-1', codigo: 'PRINCIPAL' })
    state.movimentoCount.mockResolvedValue(1)

    await expect(abrirCaixa({ saldoInicial: 999 })).rejects.toMatchObject({
      code: 'CAIXA_JA_MOVIMENTADO',
      statusCode: 409,
    })
    expect(state.caixaUpdate).not.toHaveBeenCalled()
  })

  it('aplica filtros de data inclusivos ao listar movimentos paginados', async () => {
    state.caixaFindUnique.mockResolvedValue({ id: 'caixa-1' })
    state.movimentoFindMany.mockResolvedValue([])
    state.movimentoCount.mockResolvedValue(0)

    await listarMovimentacoes({
      tipo: 'SAIDA',
      dataInicio: '2026-10-01',
      dataFim: '2026-10-31',
      page: 2,
      pageSize: 20,
    })

    expect(state.movimentoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          caixaId: 'caixa-1',
          tipo: 'SAIDA',
          data: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-31T23:59:59.999Z'),
          },
        },
        skip: 20,
        take: 20,
      })
    )
  })

  it('registra estorno de devolução real como movimento inverso vinculado', async () => {
    state.movimentoFindUnique.mockResolvedValue({
      id: 'movimento-saida',
      caixaId: 'caixa-1',
      tipo: 'SAIDA',
      origem: 'LIQUIDACAO',
      valor: 100,
      despesaPagamento: {
        despesa: {
          id: 'despesa-1',
          descricao: 'Compra cancelada',
          fornecedor: 'Fornecedor X',
          status: 'CANCELADO',
        },
      },
      recebimentoBaixa: null,
    })
    state.movimentoAggregate.mockResolvedValue({ _sum: { valor: 20 } })
    state.movimentoCreate.mockResolvedValue({
      id: 'estorno-1',
      tipo: 'ENTRADA',
      origem: 'ESTORNO',
      valor: 30,
      data: openedAt,
      descricao: 'Estorno: Compra cancelada',
    })

    const result = await registrarEstorno('movimento-saida', { valor: 30 }, 'admin-1')

    expect(state.movimentoCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        origem: 'ESTORNO',
        valor: 30,
        estornoDeId: 'movimento-saida',
        registradoPorId: 'admin-1',
      }),
    })
    expect(result).toMatchObject({
      tipo: 'ENTRADA',
      origem: 'ESTORNO',
      valorEstornado: 50,
      saldoEstornavel: 50,
      titulo: { id: 'despesa-1', pessoa: 'Fornecedor X', status: 'CANCELADO' },
    })
  })

  it('bloqueia estorno acima do valor que ainda pode ser devolvido', async () => {
    state.movimentoFindUnique.mockResolvedValue({
      id: 'movimento-1',
      caixaId: 'caixa-1',
      tipo: 'ENTRADA',
      origem: 'LIQUIDACAO',
      valor: 100,
      despesaPagamento: null,
      recebimentoBaixa: {
        recebimento: {
          id: 'recebimento-1',
          descricao: 'Venda cancelada',
          cliente: 'Cliente X',
          status: 'CANCELADO',
        },
      },
    })
    state.movimentoAggregate.mockResolvedValue({ _sum: { valor: 80 } })

    await expect(registrarEstorno('movimento-1', { valor: 30 }, 'admin-1')).rejects.toMatchObject({
      code: 'ESTORNO_INVALIDO',
    })
    expect(state.movimentoCreate).not.toHaveBeenCalled()
  })

  it('registra devolução de recebimento cancelado como saída do Caixa', async () => {
    state.movimentoFindUnique.mockResolvedValue({
      id: 'movimento-entrada',
      caixaId: 'caixa-1',
      tipo: 'ENTRADA',
      origem: 'LIQUIDACAO',
      valor: 100,
      despesaPagamento: null,
      recebimentoBaixa: {
        recebimento: {
          id: 'recebimento-1',
          descricao: 'Venda cancelada',
          cliente: 'Cliente X',
          status: 'CANCELADO',
        },
      },
    })
    state.movimentoAggregate.mockResolvedValue({ _sum: { valor: 0 } })
    state.movimentoCreate.mockResolvedValue({
      id: 'estorno-2',
      tipo: 'SAIDA',
      origem: 'ESTORNO',
      valor: 40,
      data: openedAt,
      descricao: 'Estorno: Venda cancelada',
    })

    const result = await registrarEstorno('movimento-entrada', { valor: 40 }, 'admin-1')

    expect(state.movimentoCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'SAIDA', origem: 'ESTORNO', estornoDeId: 'movimento-entrada' }),
    })
    expect(result.titulo).toMatchObject({ pessoa: 'Cliente X', status: 'CANCELADO' })
  })
})
