import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { prisma as Database } from '@sisgfpa/database'
import type {
  consultarCaixa as ConsultarCaixa,
  registrarEstorno as RegistrarEstorno,
  registrarLancamentoAvulso as RegistrarLancamentoAvulso,
} from './caixa.service.js'

const testUrl = process.env.CAIXA_TEST_DATABASE_URL
vi.mock('@sisgfpa/auth', () => ({ getAuthenticatedUser: vi.fn() }))

describe.skipIf(!testUrl)('lançamentos avulsos com PostgreSQL isolado', () => {
  let db: typeof Database
  let consultarCaixa: typeof ConsultarCaixa
  let registrarEstorno: typeof RegistrarEstorno
  let registrarLancamentoAvulso: typeof RegistrarLancamentoAvulso
  const actor = 'caixa-admin'

  beforeAll(async () => {
    const url = new URL(testUrl!)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/sisgfpa_caixa_test') {
      throw new Error('Use somente banco local exclusivo sisgfpa_caixa_test, vazio e migrado.')
    }
    process.env.DATABASE_URL = testUrl
    db = (await import('@sisgfpa/database')).prisma
    const service = await import('./caixa.service.js')
    consultarCaixa = service.consultarCaixa
    registrarEstorno = service.registrarEstorno
    registrarLancamentoAvulso = service.registrarLancamentoAvulso
    if (await db.user.count()) throw new Error('O banco de testes deve estar vazio.')
    await db.user.create({
      data: { id: actor, name: 'Admin teste', email: 'admin@caixa.test', role: 'ADMIN' },
    })
    await db.caixa.create({ data: { codigo: 'PRINCIPAL', saldoInicial: 500 } })
  })

  afterAll(async () => {
    await db?.$disconnect()
  })

  it('deduplica entradas e saídas concorrentes, permite estorno integral e atualiza apenas o Caixa', async () => {
    const entrada = {
      tipo: 'ENTRADA' as const,
      valor: 100,
      data: '2032-03-10',
      descricao: 'Aporte para troco',
      idempotencyKey: crypto.randomUUID(),
    }
    const saida = {
      tipo: 'SAIDA' as const,
      valor: 40,
      data: '2032-03-10',
      descricao: 'Retirada para despesas menores',
      idempotencyKey: crypto.randomUUID(),
    }

    const [primeiraEntrada, repeticaoEntrada] = await Promise.all([
      registrarLancamentoAvulso(entrada, actor),
      registrarLancamentoAvulso(entrada, actor),
    ])
    const [primeiraSaida, repeticaoSaida] = await Promise.all([
      registrarLancamentoAvulso(saida, actor),
      registrarLancamentoAvulso(saida, actor),
    ])
    expect(primeiraEntrada.id).toBe(repeticaoEntrada.id)
    expect(primeiraSaida.id).toBe(repeticaoSaida.id)

    const motivo = 'Aporte registrado para corrigir a conferência'
    const chaveEstorno = crypto.randomUUID()
    const [estorno, repeticaoEstorno] = await Promise.all([
      registrarEstorno(primeiraEntrada.id, { valor: 100, motivo, idempotencyKey: chaveEstorno }, actor),
      registrarEstorno(primeiraEntrada.id, { valor: 100, motivo, idempotencyKey: chaveEstorno }, actor),
    ])
    expect(estorno.id).toBe(repeticaoEstorno.id)
    expect(estorno.estornoDeId).toBe(primeiraEntrada.id)

    await expect(registrarLancamentoAvulso({ ...entrada, valor: 101 }, actor)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    })
    await expect(
      registrarEstorno(primeiraSaida.id, { valor: 20, motivo, idempotencyKey: crypto.randomUUID() }, actor)
    ).rejects.toMatchObject({ code: 'ESTORNO_INVALIDO' })

    expect(await db.caixaMovimentacao.count()).toBe(3)
    expect(await db.despesa.count()).toBe(0)
    expect(await db.recebimento.count()).toBe(0)
    await expect(consultarCaixa()).resolves.toMatchObject({
      caixa: { totalEntradas: 100, totalSaidas: 140, saldoAtual: 460, quantidadeMovimentacoes: 3 },
    })
  })
})
