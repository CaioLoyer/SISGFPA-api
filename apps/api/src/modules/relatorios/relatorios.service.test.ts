import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  despesaFindMany: vi.fn(),
  recebimentoFindMany: vi.fn(),
}))

vi.mock('@sisgfpa/database', () => ({
  prisma: {
    despesa: { findMany: prismaMock.despesaFindMany },
    recebimento: { findMany: prismaMock.recebimentoFindMany },
  },
}))

import {
  contasAPagar,
  contasAPagarCsv,
  contasAReceber,
  contasAReceberCsv,
} from './relatorios.service.js'

const periodo = { dataInicio: '2026-10-01', dataFim: '2026-10-31' }
const dataDentroPeriodo = new Date('2026-10-15T12:00:00.000Z')
const dataForaPeriodo = new Date('2026-11-01T12:00:00.000Z')
const hoje = new Date('2026-10-09T12:00:00.000Z')
const categoria = { id: 'categoria-1', nome: 'Operacional' }

const decimal = (value: number) => ({
  toNumber: () => value,
  valueOf: () => value,
})

const despesas = [
  {
    id: 'despesa-pendente',
    descricao: 'Título pendente',
    fornecedor: 'Fornecedor ativo',
    valor: decimal(125),
    valorPago: decimal(0),
    dataLancamento: hoje,
    dataVencimento: dataDentroPeriodo,
    numeroParcelas: 1,
    observacoes: null,
    categoria,
    status: 'PENDENTE',
    createdAt: hoje,
    updatedAt: hoje,
  },
  {
    id: 'despesa-cancelada',
    descricao: 'Título cancelado parcialmente pago',
    fornecedor: 'Fornecedor cancelado',
    valor: decimal(80),
    valorPago: decimal(25),
    dataLancamento: hoje,
    dataVencimento: dataDentroPeriodo,
    numeroParcelas: 1,
    observacoes: null,
    categoria,
    status: 'CANCELADO',
    createdAt: hoje,
    updatedAt: hoje,
  },
  {
    id: 'despesa-fora-periodo',
    descricao: 'Título fora do período',
    fornecedor: 'Fornecedor posterior',
    valor: decimal(50),
    valorPago: decimal(0),
    dataLancamento: hoje,
    dataVencimento: dataForaPeriodo,
    numeroParcelas: 1,
    observacoes: null,
    categoria,
    status: 'PENDENTE',
    createdAt: hoje,
    updatedAt: hoje,
  },
]

const recebimentos = [
  {
    id: 'recebimento-pendente',
    descricao: 'Recebimento pendente',
    cliente: 'Cliente ativo',
    valor: decimal(240),
    valorRecebido: decimal(0),
    dataLancamento: hoje,
    dataVencimento: dataDentroPeriodo,
    numeroParcelas: 1,
    observacoes: null,
    categoria,
    status: 'PENDENTE',
    createdAt: hoje,
    updatedAt: hoje,
  },
  {
    id: 'recebimento-cancelado',
    descricao: 'Recebimento cancelado parcialmente recebido',
    cliente: 'Cliente cancelado',
    valor: decimal(90),
    valorRecebido: decimal(35),
    dataLancamento: hoje,
    dataVencimento: dataDentroPeriodo,
    numeroParcelas: 1,
    observacoes: null,
    categoria,
    status: 'CANCELADO',
    createdAt: hoje,
    updatedAt: hoje,
  },
  {
    id: 'recebimento-fora-periodo',
    descricao: 'Recebimento fora do período',
    cliente: 'Cliente posterior',
    valor: decimal(60),
    valorRecebido: decimal(0),
    dataLancamento: hoje,
    dataVencimento: dataForaPeriodo,
    numeroParcelas: 1,
    observacoes: null,
    categoria,
    status: 'PENDENTE',
    createdAt: hoje,
    updatedAt: hoje,
  },
]

type QueryWhere = {
  status?: { not?: string }
  dataVencimento?: { gte?: Date; lte?: Date }
}

function resultadoDaConsulta<T extends { status: string; dataVencimento: Date }>(records: T[], where: QueryWhere) {
  return records.filter((record) => {
    if (where.status?.not && record.status === where.status.not) return false
    if (where.dataVencimento?.gte && record.dataVencimento < where.dataVencimento.gte) return false
    if (where.dataVencimento?.lte && record.dataVencimento > where.dataVencimento.lte) return false
    return true
  })
}

function configurarConsultas() {
  prismaMock.despesaFindMany.mockImplementation(({ where }: { where: QueryWhere }) =>
    Promise.resolve(resultadoDaConsulta(despesas, where))
  )
  prismaMock.recebimentoFindMany.mockImplementation(({ where }: { where: QueryWhere }) =>
    Promise.resolve(resultadoDaConsulta(recebimentos, where))
  )
}

function esperarFiltroComPeriodo(findMany: ReturnType<typeof vi.fn>) {
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        status: { not: 'CANCELADO' },
        dataVencimento: {
          gte: new Date('2026-10-01'),
          lte: new Date('2026-10-31'),
        },
      },
    })
  )
}

describe('relatórios financeiros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configurarConsultas()
  })

  it('contas a pagar exclui cancelados parcialmente pagos dos itens e totais', async () => {
    const resultado = await contasAPagar(periodo)

    expect(resultado).toMatchObject({ totalAPagar: 125, totalPago: 0, totalPendente: 125 })
    expect(resultado.itens.map((item) => item.id)).toEqual(['despesa-pendente'])
    esperarFiltroComPeriodo(prismaMock.despesaFindMany)
  })

  it('contas a receber exclui cancelados parcialmente recebidos dos itens e totais', async () => {
    const resultado = await contasAReceber(periodo)

    expect(resultado).toMatchObject({ totalAReceber: 240, totalRecebido: 0, totalPendente: 240 })
    expect(resultado.itens.map((item) => item.id)).toEqual(['recebimento-pendente'])
    esperarFiltroComPeriodo(prismaMock.recebimentoFindMany)
  })

  it('CSV de contas a pagar segue o filtro do relatório JSON', async () => {
    const resultado = await contasAPagarCsv(periodo)

    expect(resultado).toContain('Título pendente')
    expect(resultado).not.toContain('Título cancelado parcialmente pago')
    expect(resultado).not.toContain('Título fora do período')
    esperarFiltroComPeriodo(prismaMock.despesaFindMany)
  })

  it('CSV de contas a receber segue o filtro do relatório JSON', async () => {
    const resultado = await contasAReceberCsv(periodo)

    expect(resultado).toContain('Recebimento pendente')
    expect(resultado).not.toContain('Recebimento cancelado parcialmente recebido')
    expect(resultado).not.toContain('Recebimento fora do período')
    esperarFiltroComPeriodo(prismaMock.recebimentoFindMany)
  })
})
