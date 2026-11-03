import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  caixaFindUnique: vi.fn(),
  caixaMovementCreate: vi.fn(),
  despesaFindUnique: vi.fn(),
  despesaPagamentoFindUnique: vi.fn(),
  despesaPagamentoCreate: vi.fn(),
  despesaParcelaUpdate: vi.fn(),
  despesaHistoricoCreate: vi.fn(),
  despesaUpdate: vi.fn(),
  recebimentoFindUnique: vi.fn(),
  recebimentoBaixaFindUnique: vi.fn(),
  recebimentoBaixaCreate: vi.fn(),
  recebimentoParcelaUpdate: vi.fn(),
  recebimentoHistoricoCreate: vi.fn(),
  recebimentoUpdate: vi.fn(),
  queryRaw: vi.fn(),
}))

import { aplicarBaixaRecebimento, aplicarPagamentoDespesa } from './liquidacao.js'

function tx() {
  return {
    $queryRaw: state.queryRaw,
    caixa: { findUnique: state.caixaFindUnique },
    caixaMovimentacao: { create: state.caixaMovementCreate },
    despesa: { findUnique: state.despesaFindUnique, update: state.despesaUpdate },
    despesaPagamento: {
      findUnique: state.despesaPagamentoFindUnique,
      create: state.despesaPagamentoCreate,
    },
    despesaParcela: { update: state.despesaParcelaUpdate },
    despesaHistorico: { create: state.despesaHistoricoCreate },
    recebimento: { findUnique: state.recebimentoFindUnique, update: state.recebimentoUpdate },
    recebimentoBaixa: {
      findUnique: state.recebimentoBaixaFindUnique,
      create: state.recebimentoBaixaCreate,
    },
    recebimentoParcela: { update: state.recebimentoParcelaUpdate },
    recebimentoHistorico: { create: state.recebimentoHistoricoCreate },
  }
}

describe('liquidação automática no Caixa Principal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.caixaFindUnique.mockResolvedValue({ id: 'caixa-principal' })
    state.despesaPagamentoCreate.mockResolvedValue({ id: 'pagamento-1' })
    state.recebimentoBaixaCreate.mockResolvedValue({ id: 'baixa-1' })
    state.despesaParcelaUpdate.mockResolvedValue({})
    state.recebimentoParcelaUpdate.mockResolvedValue({})
    state.despesaHistoricoCreate.mockResolvedValue({})
    state.recebimentoHistoricoCreate.mockResolvedValue({})
    state.caixaMovementCreate.mockResolvedValue({})
    state.despesaUpdate.mockResolvedValue({ status: 'PARCIAL' })
    state.recebimentoUpdate.mockResolvedValue({ status: 'PARCIAL' })
  })

  it('registra pagamento como saída e mantém o valor parcial do título', async () => {
    state.despesaFindUnique.mockResolvedValue({
      id: 'despesa-1',
      descricao: 'Fornecedor de sacolas',
      valor: 100,
      valorPago: 0,
      status: 'PENDENTE',
      parcelas: [{ id: 'parcela-1', numero: 1, valor: 100, valorPago: 0, status: 'PENDENTE' }],
    })
    const transaction = tx()

    await aplicarPagamentoDespesa(transaction as never, {
      despesaId: 'despesa-1',
      valor: 25,
      pagoEm: new Date('2026-10-21T15:00:00.000Z'),
      usuarioId: 'funcionario-1',
    })

    expect(state.despesaPagamentoCreate).toHaveBeenCalledOnce()
    expect(state.caixaMovementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caixaId: 'caixa-principal',
        tipo: 'SAIDA',
        origem: 'LIQUIDACAO',
        valor: 25,
        despesaPagamentoId: 'pagamento-1',
      }),
    })
    expect(state.despesaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { valorPago: 25, status: 'PARCIAL' } })
    )
  })

  it('devolve o título sem criar outro pagamento ao repetir a mesma chave', async () => {
    const despesa = {
      id: 'despesa-1',
      descricao: 'Fornecedor de sacolas',
      valor: 100,
      valorPago: 25,
      status: 'PARCIAL',
      parcelas: [{ id: 'parcela-1', numero: 1, valor: 100, valorPago: 25, status: 'PARCIAL' }],
    }
    const pagoEm = new Date('2026-10-21T15:00:00.000Z')
    state.despesaFindUnique.mockResolvedValue(despesa)
    state.despesaPagamentoFindUnique.mockResolvedValue({
      despesaId: 'despesa-1',
      valor: 25,
      pagoEm,
      registradoPorId: 'funcionario-1',
    })

    const result = await aplicarPagamentoDespesa(tx() as never, {
      despesaId: 'despesa-1',
      valor: 25,
      pagoEm,
      usuarioId: 'funcionario-1',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    })

    expect(result).toBe(despesa)
    expect(state.despesaPagamentoCreate).not.toHaveBeenCalled()
    expect(state.caixaMovementCreate).not.toHaveBeenCalled()
  })

  it('rejeita reutilizar a chave de pagamento com outro valor', async () => {
    const pagoEm = new Date('2026-10-21T15:00:00.000Z')
    state.despesaFindUnique.mockResolvedValue({
      id: 'despesa-1',
      descricao: 'Fornecedor de sacolas',
      valor: 100,
      valorPago: 25,
      status: 'PARCIAL',
      parcelas: [{ id: 'parcela-1', numero: 1, valor: 100, valorPago: 25, status: 'PARCIAL' }],
    })
    state.despesaPagamentoFindUnique.mockResolvedValue({
      despesaId: 'despesa-1',
      valor: 25,
      pagoEm,
      registradoPorId: 'funcionario-1',
    })

    await expect(
      aplicarPagamentoDespesa(tx() as never, {
        despesaId: 'despesa-1',
        valor: 30,
        pagoEm,
        usuarioId: 'funcionario-1',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', statusCode: 409 })
    expect(state.despesaPagamentoCreate).not.toHaveBeenCalled()
    expect(state.caixaMovementCreate).not.toHaveBeenCalled()
  })

  it('registra baixa como entrada no mesmo contexto transacional', async () => {
    state.recebimentoFindUnique.mockResolvedValue({
      id: 'recebimento-1',
      descricao: 'Impressão de boletos',
      valor: 120,
      valorRecebido: 0,
      status: 'PENDENTE',
      parcelas: [{ id: 'parcela-1', numero: 1, valor: 120, valorRecebido: 0, status: 'PENDENTE' }],
    })
    const transaction = tx()

    await aplicarBaixaRecebimento(transaction as never, {
      recebimentoId: 'recebimento-1',
      valor: 40,
      recebidoEm: new Date('2026-10-21T15:00:00.000Z'),
      usuarioId: 'funcionario-1',
    })

    expect(state.recebimentoBaixaCreate).toHaveBeenCalledOnce()
    expect(state.caixaMovementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caixaId: 'caixa-principal',
        tipo: 'ENTRADA',
        origem: 'LIQUIDACAO',
        valor: 40,
        recebimentoBaixaId: 'baixa-1',
      }),
    })
    expect(state.recebimentoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { valorRecebido: 40, status: 'PARCIAL' } })
    )
  })

  it('devolve o título sem criar outra baixa ao repetir a mesma chave', async () => {
    const recebimento = {
      id: 'recebimento-1',
      descricao: 'Impressão de boletos',
      valor: 120,
      valorRecebido: 40,
      status: 'PARCIAL',
      parcelas: [{ id: 'parcela-1', numero: 1, valor: 120, valorRecebido: 40, status: 'PARCIAL' }],
    }
    const recebidoEm = new Date('2026-10-21T15:00:00.000Z')
    state.recebimentoFindUnique.mockResolvedValue(recebimento)
    state.recebimentoBaixaFindUnique.mockResolvedValue({
      recebimentoId: 'recebimento-1',
      valor: 40,
      recebidoEm,
      registradoPorId: 'funcionario-1',
    })

    const result = await aplicarBaixaRecebimento(tx() as never, {
      recebimentoId: 'recebimento-1',
      valor: 40,
      recebidoEm,
      usuarioId: 'funcionario-1',
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
    })

    expect(result).toBe(recebimento)
    expect(state.recebimentoBaixaCreate).not.toHaveBeenCalled()
    expect(state.caixaMovementCreate).not.toHaveBeenCalled()
  })

  it('rejeita reutilizar a chave de baixa com outro valor', async () => {
    const recebidoEm = new Date('2026-10-21T15:00:00.000Z')
    state.recebimentoFindUnique.mockResolvedValue({
      id: 'recebimento-1',
      descricao: 'Impressão de boletos',
      valor: 120,
      valorRecebido: 40,
      status: 'PARCIAL',
      parcelas: [{ id: 'parcela-1', numero: 1, valor: 120, valorRecebido: 40, status: 'PARCIAL' }],
    })
    state.recebimentoBaixaFindUnique.mockResolvedValue({
      recebimentoId: 'recebimento-1',
      valor: 40,
      recebidoEm,
      registradoPorId: 'funcionario-1',
    })

    await expect(
      aplicarBaixaRecebimento(tx() as never, {
        recebimentoId: 'recebimento-1',
        valor: 45,
        recebidoEm,
        usuarioId: 'funcionario-1',
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', statusCode: 409 })
    expect(state.recebimentoBaixaCreate).not.toHaveBeenCalled()
    expect(state.caixaMovementCreate).not.toHaveBeenCalled()
  })

  it('não liquida título nem cria movimento antes da configuração do saldo inicial', async () => {
    state.despesaFindUnique.mockResolvedValue({
      id: 'despesa-1',
      descricao: 'Fornecedor de sacolas',
      valor: 100,
      valorPago: 0,
      status: 'PENDENTE',
      parcelas: [{ id: 'parcela-1', numero: 1, valor: 100, valorPago: 0, status: 'PENDENTE' }],
    })
    state.caixaFindUnique.mockResolvedValue(null)

    await expect(
      aplicarPagamentoDespesa(tx() as never, {
        despesaId: 'despesa-1',
        valor: 25,
        usuarioId: 'funcionario-1',
      })
    ).rejects.toMatchObject({ code: 'CAIXA_NAO_CONFIGURADO', statusCode: 409 })
    expect(state.despesaPagamentoCreate).not.toHaveBeenCalled()
    expect(state.caixaMovementCreate).not.toHaveBeenCalled()
  })
})
