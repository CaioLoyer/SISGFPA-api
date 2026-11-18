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

import {
  abrirCaixa,
  consultarCaixa,
  listarMovimentacoes,
  registrarEstorno,
  registrarLancamentoAvulso,
} from './caixa.service.js'

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

  it('registra entrada avulsa no Caixa com data civil local, autoria e chave idempotente', async () => {
    state.caixaFindUnique.mockResolvedValue({ id: 'caixa-1' })
    state.movimentoFindUnique.mockResolvedValue(null)
    state.movimentoCreate.mockResolvedValue({
      id: 'movimento-avulso',
      caixaId: 'caixa-1',
      tipo: 'ENTRADA',
      origem: 'AVULSA',
      valor: 150,
      data: new Date('2026-11-18T04:00:00.000Z'),
      descricao: 'Aporte de capital',
      estornoDeId: null,
      registradoPorId: 'admin-1',
    })

    const result = await registrarLancamentoAvulso(
      {
        tipo: 'ENTRADA',
        valor: 150,
        data: '2026-11-18',
        descricao: 'Aporte de capital',
        idempotencyKey: '00000000-0000-4000-8000-000000000003',
      },
      'admin-1'
    )

    expect(state.queryRaw).toHaveBeenCalledOnce()
    expect(state.movimentoCreate).toHaveBeenCalledWith({
      data: {
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        origem: 'AVULSA',
        valor: 150,
        data: new Date('2026-11-18T04:00:00.000Z'),
        descricao: 'Aporte de capital',
        idempotencyKey: '00000000-0000-4000-8000-000000000003',
        registradoPorId: 'admin-1',
      },
    })
    expect(result).toMatchObject({
      id: 'movimento-avulso',
      tipo: 'ENTRADA',
      origem: 'AVULSA',
      valor: 150,
      descricao: 'Aporte de capital',
      titulo: null,
      podeEstornar: true,
    })
  })

  it('exige que o Caixa Principal esteja configurado antes de lançar entrada ou saída', async () => {
    state.caixaFindUnique.mockResolvedValue(null)

    await expect(
      registrarLancamentoAvulso(
        {
          tipo: 'SAIDA',
          valor: 25,
          data: '2026-11-18',
          descricao: 'Retirada para troco',
          idempotencyKey: '00000000-0000-4000-8000-000000000006',
        },
        'admin-1'
      )
    ).rejects.toMatchObject({ code: 'CAIXA_NAO_CONFIGURADO', statusCode: 409 })
    expect(state.movimentoCreate).not.toHaveBeenCalled()
  })

  it('retorna o mesmo lançamento quando a chave e os dados da tentativa são repetidos', async () => {
    const existente = {
      id: 'movimento-avulso',
      caixaId: 'caixa-1',
      tipo: 'SAIDA',
      origem: 'AVULSA',
      valor: 35,
      data: new Date('2026-11-18T04:00:00.000Z'),
      descricao: 'Retirada para troco',
      estornoDeId: null,
      registradoPorId: 'admin-1',
      despesaPagamento: null,
      recebimentoBaixa: null,
      estornoDe: null,
      estornos: [],
    }
    state.caixaFindUnique.mockResolvedValue({ id: 'caixa-1' })
    state.movimentoFindUnique.mockResolvedValue(existente)

    const result = await registrarLancamentoAvulso(
      {
        tipo: 'SAIDA',
        valor: 35,
        data: '2026-11-18',
        descricao: 'Retirada para troco',
        idempotencyKey: '00000000-0000-4000-8000-000000000004',
      },
      'admin-1'
    )

    expect(result).toMatchObject({ id: 'movimento-avulso', tipo: 'SAIDA', origem: 'AVULSA' })
    expect(state.movimentoCreate).not.toHaveBeenCalled()
  })

  it('recusa reutilizar chave de lançamento avulso com dados diferentes', async () => {
    state.caixaFindUnique.mockResolvedValue({ id: 'caixa-1' })
    state.movimentoFindUnique.mockResolvedValue({
      id: 'movimento-avulso',
      origem: 'AVULSA',
      tipo: 'ENTRADA',
      valor: 150,
      data: new Date('2026-11-18T04:00:00.000Z'),
      descricao: 'Aporte de capital',
      registradoPorId: 'admin-1',
    })

    await expect(
      registrarLancamentoAvulso(
        {
          tipo: 'ENTRADA',
          valor: 151,
          data: '2026-11-18',
          descricao: 'Aporte de capital',
          idempotencyKey: '00000000-0000-4000-8000-000000000003',
        },
        'admin-1'
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
    expect(state.movimentoCreate).not.toHaveBeenCalled()
  })

  it('aplica dias inclusivos no fuso da papelaria ao listar movimentos paginados', async () => {
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
            gte: new Date('2026-10-01T04:00:00.000Z'),
            lt: new Date('2026-11-01T04:00:00.000Z'),
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

  it('corrige lançamento avulso com estorno integral, motivo e vínculo ao original', async () => {
    state.movimentoFindUnique
      .mockResolvedValueOnce({
        id: 'movimento-avulso',
        caixaId: 'caixa-1',
        tipo: 'SAIDA',
        origem: 'AVULSA',
        valor: 80,
        descricao: 'Retirada registrada em duplicidade',
        despesaPagamento: null,
        recebimentoBaixa: null,
      })
      .mockResolvedValueOnce(null)
    state.movimentoAggregate.mockResolvedValue({ _sum: { valor: 0 } })
    state.movimentoCreate.mockResolvedValue({
      id: 'estorno-avulso',
      tipo: 'ENTRADA',
      origem: 'ESTORNO',
      valor: 80,
      data: openedAt,
      descricao:
        'Estorno do lançamento avulso: Retirada registrada em duplicidade. Motivo: Lançamento duplicado',
    })

    const result = await registrarEstorno(
      'movimento-avulso',
      {
        valor: 80,
        motivo: 'Lançamento duplicado',
        idempotencyKey: '00000000-0000-4000-8000-000000000005',
      },
      'admin-1'
    )

    expect(state.movimentoCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'ENTRADA',
        origem: 'ESTORNO',
        valor: 80,
        descricao: expect.stringContaining('Motivo: Lançamento duplicado'),
        estornoDeId: 'movimento-avulso',
        idempotencyKey: '00000000-0000-4000-8000-000000000005',
        registradoPorId: 'admin-1',
      }),
    })
    expect(result).toMatchObject({
      origem: 'ESTORNO',
      valor: 80,
      titulo: null,
      estornoDeId: 'movimento-avulso',
      saldoEstornavel: 0,
      podeEstornar: false,
    })
  })

  it('não permite correção parcial de um lançamento avulso', async () => {
    state.movimentoFindUnique.mockResolvedValueOnce({
      id: 'movimento-avulso',
      caixaId: 'caixa-1',
      tipo: 'ENTRADA',
      origem: 'AVULSA',
      valor: 100,
      descricao: 'Entrada lançada incorretamente',
      despesaPagamento: null,
      recebimentoBaixa: null,
    })
    state.movimentoAggregate.mockResolvedValue({ _sum: { valor: 0 } })

    await expect(
      registrarEstorno(
        'movimento-avulso',
        {
          valor: 75,
          motivo: 'Valor incorreto',
          idempotencyKey: '00000000-0000-4000-8000-000000000011',
        },
        'admin-1'
      )
    ).rejects.toMatchObject({ code: 'ESTORNO_INVALIDO' })
    expect(state.movimentoCreate).not.toHaveBeenCalled()
  })
})
