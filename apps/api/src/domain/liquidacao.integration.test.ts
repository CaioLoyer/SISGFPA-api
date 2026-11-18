import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { prisma as Database } from '@sisgfpa/database'
import { aplicarBaixaRecebimento, aplicarPagamentoDespesa } from './liquidacao.js'

const testUrl = process.env.LIQUIDACAO_TEST_DATABASE_URL
vi.mock('@sisgfpa/auth', () => ({ getAuthenticatedUser: vi.fn() }))

describe.skipIf(!testUrl)('liquidação idempotente em PostgreSQL isolado', () => {
  let db: typeof Database
  const actor = 'liquidacao-admin'
  beforeAll(async () => {
    const url = new URL(testUrl!)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/sisgfpa_liquidacao_test') {
      throw new Error('Use somente banco local exclusivo sisgfpa_liquidacao_test, vazio e migrado.')
    }
    process.env.DATABASE_URL = testUrl
    db = (await import('@sisgfpa/database')).prisma
    if (await db.user.count()) throw new Error('O banco de testes deve estar vazio.')
    await db.user.create({
      data: { id: actor, name: 'Admin teste', email: 'admin@liquidacao.test', role: 'ADMIN' },
    })
    await db.caixa.create({ data: { codigo: 'PRINCIPAL', saldoInicial: 1000 } })
  })
  afterAll(async () => {
    await db?.$disconnect()
  })

  it.each(['DESPESA', 'RECEBIMENTO'] as const)(
    'deduplica repetição sequencial e concorrente de %s',
    async (tipo) => {
      const despesa = tipo === 'DESPESA'
      const data = {
        descricao: 'Título teste',
        valor: 100,
        dataVencimento: new Date('2032-03-10'),
        criadoPorId: actor,
      }
      const title = despesa
        ? await db.despesa.create({
            data: {
              ...data,
              fornecedor: 'Fornecedor',
              parcelas: { create: { numero: 1, valor: 100, dataVencimento: data.dataVencimento } },
            },
          })
        : await db.recebimento.create({
            data: {
              ...data,
              cliente: 'Cliente',
              parcelas: { create: { numero: 1, valor: 100, dataVencimento: data.dataVencimento } },
            },
          })
      const instant = new Date('2032-03-11T02:00:00Z')
      const key = crypto.randomUUID()
      const pay = (valor: number, idempotencyKey = key) =>
        db.$transaction((tx) =>
          despesa
            ? aplicarPagamentoDespesa(tx, {
                despesaId: title.id,
                valor,
                pagoEm: instant,
                usuarioId: actor,
                idempotencyKey,
              })
            : aplicarBaixaRecebimento(tx, {
                recebimentoId: title.id,
                valor,
                recebidoEm: instant,
                usuarioId: actor,
                idempotencyKey,
              })
        )

      await pay(25)
      await pay(25)
      await expect(pay(26)).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
      const second = crypto.randomUUID()
      await Promise.all([pay(30, second), pay(30, second)])
      const current = despesa
        ? await db.despesa.findUniqueOrThrow({ where: { id: title.id } })
        : await db.recebimento.findUniqueOrThrow({ where: { id: title.id } })
      expect(Number('valorPago' in current ? current.valorPago : current.valorRecebido)).toBe(55)
      expect(current.status).toBe('PARCIAL')
      const payments = despesa
        ? await db.despesaPagamento.findMany({
            where: { despesaId: title.id },
            include: { movimentacaoCaixa: true },
          })
        : await db.recebimentoBaixa.findMany({
            where: { recebimentoId: title.id },
            include: { movimentacaoCaixa: true },
          })
      expect(payments).toHaveLength(2)
      expect(payments.every((payment) => payment.movimentacaoCaixa !== null)).toBe(true)
      expect(
        await (despesa
          ? db.despesaHistorico.count({ where: { despesaId: title.id } })
          : db.recebimentoHistorico.count({ where: { recebimentoId: title.id } }))
      ).toBe(2)
    }
  )
})
