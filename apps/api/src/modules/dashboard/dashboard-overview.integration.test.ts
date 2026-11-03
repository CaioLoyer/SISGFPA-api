import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { prisma as Database } from '@sisgfpa/database'
import type { consultarVisaoGeral as Consult } from './dashboard-overview.service.js'

// Opt-in: apenas um banco descartável, já migrado. Nunca usa DATABASE_URL do projeto.
const testUrl = process.env.DASHBOARD_TEST_DATABASE_URL
vi.mock('@sisgfpa/auth', () => ({ getAuthenticatedUser: vi.fn() }))
const admin = {
  id: 'dashboard-admin',
  name: 'Administrador',
  email: 'admin@dashboard.test',
  role: 'ADMIN' as const,
}
const employee = {
  id: 'dashboard-employee',
  name: 'Funcionário',
  email: 'employee@dashboard.test',
  role: 'FUNCIONARIO' as const,
}

describe.skipIf(!testUrl)('dashboard com PostgreSQL isolado', () => {
  let db: typeof Database
  let consult: typeof Consult
  let caixaId: string
  let expenseId: string
  let receiptId: string
  let cancelledReceiptId: string

  beforeAll(async () => {
    const url = new URL(testUrl!)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/sisgfpa_dashboard_test') {
      throw new Error('Os testes exigem PostgreSQL local com banco exclusivo sisgfpa_dashboard_test.')
    }
    process.env.DATABASE_URL = testUrl
    db = (await import('@sisgfpa/database')).prisma
    consult = (await import('./dashboard-overview.service.js')).consultarVisaoGeral
    // O banco precisa estar vazio. Não apaga nem reutiliza registros existentes.
    if (await db.user.count()) throw new Error('O banco de testes deve estar vazio.')
    await db.user.createMany({ data: [admin, employee] })
    caixaId = (await db.caixa.create({ data: { codigo: 'PRINCIPAL', saldoInicial: 1000 } })).id
    const expenseCategory = await db.categoria.create({ data: { nome: 'Material', tipo: 'DESPESA' } })
    const receiptCategory = await db.categoria.create({ data: { nome: 'Vendas', tipo: 'RECEBIMENTO' } })
    expenseId = (
      await db.despesa.create({
        data: {
          descricao: 'Compra de material',
          fornecedor: 'Fornecedor teste',
          valor: 500,
          valorPago: 100,
          dataVencimento: new Date('2026-11-10'),
          criadoPorId: admin.id,
          categoriaId: expenseCategory.id,
          status: 'PARCIAL',
        },
      })
    ).id
    receiptId = (
      await db.recebimento.create({
        data: {
          descricao: 'Venda de papel',
          cliente: 'Cliente teste',
          valor: 1000,
          valorRecebido: 350,
          dataVencimento: new Date('2026-11-20'),
          criadoPorId: admin.id,
          categoriaId: receiptCategory.id,
          status: 'PARCIAL',
        },
      })
    ).id
    cancelledReceiptId = (
      await db.recebimento.create({
        data: {
          descricao: 'Venda cancelada',
          cliente: 'Cliente teste',
          valor: 200,
          valorRecebido: 100,
          dataVencimento: new Date('2026-11-20'),
          criadoPorId: admin.id,
          status: 'CANCELADO',
        },
      })
    ).id
    async function payment(kind: 'DESPESA' | 'RECEBIMENTO', valor: number, date: string, cancelled = false) {
      const data = new Date(date)
      const link =
        kind === 'DESPESA'
          ? {
              despesaPagamentoId: (
                await db.despesaPagamento.create({
                  data: { despesaId: expenseId, valor, pagoEm: data, registradoPorId: admin.id },
                })
              ).id,
            }
          : {
              recebimentoBaixaId: (
                await db.recebimentoBaixa.create({
                  data: {
                    recebimentoId: cancelled ? cancelledReceiptId : receiptId,
                    valor,
                    recebidoEm: data,
                    registradoPorId: admin.id,
                  },
                })
              ).id,
            }
      return db.caixaMovimentacao.create({
        data: {
          caixaId,
          valor,
          data,
          tipo: kind === 'DESPESA' ? 'SAIDA' : 'ENTRADA',
          origem: 'LIQUIDACAO',
          descricao:
            kind === 'DESPESA'
              ? 'Pagamento de material'
              : cancelled
                ? 'Baixa de venda cancelada'
                : 'Baixa de venda de papel',
          registradoPorId: admin.id,
          ...link,
        },
      })
    }
    // Fora da série; ainda participa do saldo atual.
    await payment('RECEBIMENTO', 10, '2026-04-30T23:59:59.999Z')
    await payment('RECEBIMENTO', 200, '2026-10-15T12:00:00Z')
    await payment('DESPESA', 50, '2026-10-15T12:00:00Z')
    await payment('RECEBIMENTO', 100, '2026-11-01T00:00:00Z')
    const receipt = await payment('RECEBIMENTO', 50, '2026-11-10T12:00:00Z')
    const expense = await payment('DESPESA', 100, '2026-11-12T12:00:00Z')
    await payment('RECEBIMENTO', 100, '2026-11-13T12:00:00Z', true)
    await db.caixaMovimentacao.createMany({
      data: [
        {
          caixaId,
          tipo: 'SAIDA',
          origem: 'ESTORNO',
          valor: 50,
          data: new Date('2026-11-14T12:00:00Z'),
          descricao: 'Estorno de recebimento',
          estornoDeId: receipt.id,
          registradoPorId: admin.id,
        },
        {
          caixaId,
          tipo: 'ENTRADA',
          origem: 'ESTORNO',
          valor: 100,
          data: new Date('2026-11-30T23:59:59.999Z'),
          descricao: 'Estorno de despesa',
          estornoDeId: expense.id,
          registradoPorId: admin.id,
        },
      ],
    })
    await payment('RECEBIMENTO', 999, '2026-12-01T00:00:00Z')
  })

  afterAll(async () => {
    await db?.$disconnect()
  })

  it('conta baixas parciais, exclui estornos do ticket e inclui cancelados no caixa', async () => {
    const data = await consult({ mes: '2026-11' }, admin)
    expect(data.indicadores).toEqual({
      entradas: { valor: 350, variacaoPercentual: 75 },
      saidas: { valor: 150, variacaoPercentual: 200 },
      resultado: { valor: 200, variacaoPercentual: 33.3 },
      ticketMedio: { valor: 83.33, variacaoPercentual: -58.3 },
    })
    expect(data.resumo).toEqual({ saldoAtual: 2359, aPagar: 400, aReceber: 650 })
    expect(data.serieMensal).toHaveLength(7)
    expect(data.serieMensal[0]).toEqual({ mes: '2026-05', entradas: 0, saidas: 0 })
    expect(data.serieMensal.at(-1)).toEqual({ mes: '2026-11', entradas: 350, saidas: 150 })
    expect(data.saidasPorCategoria).toEqual([
      { nome: 'Material', valor: 100 },
      { nome: 'Vendas', valor: 50 },
    ])
    expect(data.ultimasMovimentacoes).toHaveLength(5)
    expect(data.ultimasMovimentacoes[0]).toMatchObject({
      descricao: 'Estorno de despesa',
      tituloId: expenseId,
      tipoTitulo: 'DESPESA',
      categoria: 'Material',
    })
    expect(data.ultimasMovimentacoes.every((item) => item.data.startsWith('2026-11'))).toBe(true)
  })

  it('restringe todos os agregados e estornos por módulo e reavalia permissões na próxima consulta', async () => {
    const defaults = await consult({ mes: '2026-11' }, employee)
    expect(defaults.indicadores).toEqual((await consult({ mes: '2026-11' }, admin)).indicadores)
    expect(defaults.resumo.saldoAtual).toBeNull()
    await db.funcionarioPermissao.create({
      data: { funcionarioId: employee.id, despesas: true, recebimentos: false },
    })
    const expenseOnly = await consult({ mes: '2026-11' }, employee)
    expect(expenseOnly.indicadores).toMatchObject({
      entradas: { valor: 100 },
      saidas: { valor: 100 },
      resultado: { valor: 0 },
      ticketMedio: { valor: null },
    })
    expect(expenseOnly.saidasPorCategoria).toEqual([{ nome: 'Material', valor: 100 }])
    expect(expenseOnly.ultimasMovimentacoes).toHaveLength(2)
    expect(expenseOnly.ultimasMovimentacoes.every((item) => item.tipoTitulo === 'DESPESA')).toBe(true)
    expect(expenseOnly.resumo).toEqual({ saldoAtual: null, aPagar: 400, aReceber: null })
    await db.funcionarioPermissao.update({
      where: { funcionarioId: employee.id },
      data: { despesas: false, recebimentos: true },
    })
    const receiptOnly = await consult({ mes: '2026-11' }, employee)
    expect(receiptOnly.indicadores).toMatchObject({
      entradas: { valor: 250 },
      saidas: { valor: 50 },
      resultado: { valor: 200 },
      ticketMedio: { valor: 83.33 },
    })
    expect(receiptOnly.saidasPorCategoria).toEqual([{ nome: 'Vendas', valor: 50 }])
    expect(receiptOnly.ultimasMovimentacoes.every((item) => item.tipoTitulo === 'RECEBIMENTO')).toBe(true)
    expect(receiptOnly.resumo).toEqual({ saldoAtual: null, aPagar: null, aReceber: 650 })
    await db.funcionarioPermissao.update({
      where: { funcionarioId: employee.id },
      data: { recebimentos: false },
    })
    const noAccess = await consult({ mes: '2026-11' }, employee)
    expect(noAccess).toMatchObject({
      caixaConfigurado: null,
      serieMensal: [],
      saidasPorCategoria: [],
      ultimasMovimentacoes: [],
      resumo: { saldoAtual: null, aPagar: null, aReceber: null },
    })
    expect(Object.values(noAccess.indicadores).every((item) => item.valor === null)).toBe(true)
  })

  it('distingue mês sem movimento de caixa não configurado', async () => {
    const empty = await consult({ mes: '2026-01' }, admin)
    expect(empty.indicadores.entradas).toEqual({ valor: 0, variacaoPercentual: null })
    expect(empty.indicadores.ticketMedio).toEqual({ valor: null, variacaoPercentual: null })
    expect(empty.ultimasMovimentacoes).toEqual([])
    await db.caixa.update({ where: { id: caixaId }, data: { codigo: 'TESTE-SEM-PRINCIPAL' } })
    const unconfigured = await consult({ mes: '2026-11' }, admin)
    expect(unconfigured).toMatchObject({
      caixaConfigurado: false,
      resumo: { saldoAtual: null, aPagar: 400, aReceber: 650 },
    })
    expect(unconfigured.indicadores.entradas.valor).toBeNull()
    await db.caixa.update({ where: { id: caixaId }, data: { codigo: 'PRINCIPAL' } })
  })
})
