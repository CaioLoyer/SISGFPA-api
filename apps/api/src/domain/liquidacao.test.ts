import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  caixaFindUnique: vi.fn(),
  caixaMovementCreate: vi.fn(),
  despesaFindUnique: vi.fn(),
  despesaPagamentoCreate: vi.fn(),
  despesaParcelaUpdate: vi.fn(),
  despesaHistoricoCreate: vi.fn(),
  despesaUpdate: vi.fn(),
  recebimentoFindUnique: vi.fn(),
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
    despesaPagamento: { create: state.despesaPagamentoCreate },
    despesaParcela: { update: state.despesaParcelaUpdate },
    despesaHistorico: { create: state.despesaHistoricoCreate },
    recebimento: { findUnique: state.recebimentoFindUnique, update: state.recebimentoUpdate },
    recebimentoBaixa: { create: state.recebimentoBaixaCreate },
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
