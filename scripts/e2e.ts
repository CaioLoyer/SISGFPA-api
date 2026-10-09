/**
 * Teste ponta a ponta do SISGFPA: sobe a API Financeira e o Chatbot, cria usuários reais
 * (FUNCIONARIO e ADMIN) e percorre os cenários obrigatórios via HTTP.
 *
 * Requer: Postgres com migrations aplicadas + seed (pnpm db:deploy && pnpm db:seed),
 * DATABASE_URL e BETTER_AUTH_SECRET definidos, e `pnpm build` executado.
 * Uso: pnpm e2e
 */
import './load-env.js'

import assert from 'node:assert/strict'

import { cookieDe, http, type Json, type Session } from './lib/http.js'
import { passedCount, runMain, step } from './lib/runner.js'
import { API, BOT, startServers } from './lib/servers.js'

const run = Date.now()
// Nomes únicos por execução (só letras, para o parser): o teste não depende de banco limpo.
const suf = run
  .toString(36)
  .replace(/\d/g, (d) => 'ABCDEFGHIJ'[Number(d)]!)
  .toUpperCase()
  .slice(-5)
const ABC = `ABC${suf}`,
  KALUNGA = `Kalunga${suf}`,
  FABER = `Faber${suf}`,
  DIST = `Distribuidora${suf}`
const JOAO = `João${suf}`,
  MARIA = `Maria${suf}`

interface SessionComId extends Session {
  id: string
}

async function signUp(name: string): Promise<SessionComId> {
  const res = await fetch(`${API}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: API },
    body: JSON.stringify({ name, email: `${name.toLowerCase()}-${run}@e2e.test`, password: 'senha12345' }),
  })
  assert.equal(res.status, 200, `sign-up ${name}`)
  const cookie = cookieDe(res.headers.getSetCookie())
  const body = (await res.json()) as Json
  return { cookie, id: body.user.id }
}

async function main() {
  const { prisma } = await import('../packages/database/dist/index.js')
  await startServers()

  const func = await signUp('Funcionario')
  const admin = await signUp('Administrador')
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })

  const chatF = (await http(BOT, func, 'POST', '/chats', {})).body.id as string
  const chatA = (await http(BOT, admin, 'POST', '/chats', {})).body.id as string

  /** Envia a mensagem; se o bot pedir confirmação, confirma. */
  async function dizer(s: Session, chatId: string, content: string, confirmar = true) {
    const sent = await http(BOT, s, 'POST', `/chats/${chatId}/messages`, { content })
    assert.equal(sent.status, 200, JSON.stringify(sent.body))
    if (!sent.body.confirmacao || !confirmar) return { sent: sent.body, done: null as Json | null }
    const done = await http(
      BOT,
      s,
      'POST',
      `/chats/${chatId}/messages/${sent.body.confirmacao.messageId}/confirm`
    )
    assert.equal(done.status, 200, JSON.stringify(done.body))
    return { sent: sent.body, done: done.body }
  }
  const despesa = async (s: Session, id: string) => (await http(API, s, 'GET', `/despesas/${id}`)).body
  const recebimento = async (s: Session, id: string) =>
    (await http(API, s, 'GET', `/recebimentos/${id}`)).body

  console.log('\nDespesas')
  await step('mercadoria: "Compramos 500 cadernos do fornecedor ABC por R$ 2500."', async () => {
    const { sent, done } = await dizer(
      func,
      chatF,
      `Compramos 500 cadernos do fornecedor ${ABC} por R$ 2500.`
    )
    assert.match(sent.confirmacao.resumo, /Deseja confirmar\?/)
    assert.equal(done!.userMessage.status, 'EXECUTADA')
    const d = await despesa(func, done!.userMessage.despesaId)
    assert.equal(d.valor, 2500)
    assert.equal(d.fornecedor, ABC)
    assert.equal(d.categoria.nome, 'Mercadorias')
    assert.equal(d.status, 'PENDENTE')
    assert.equal(d.observacoes, 'Quantidade: 500 cadernos')
  })

  await step('operacional já paga: "Pagamos R$ 800 de energia da papelaria."', async () => {
    const { done } = await dizer(func, chatF, 'Pagamos R$ 800 de energia da papelaria.')
    const d = await despesa(func, done!.userMessage.despesaId)
    assert.equal(d.categoria.nome, 'Despesas Operacionais')
    assert.equal(d.status, 'PAGO')
    assert.equal(d.valorPago, 800)
  })

  await step('parcelada em 6x: parcelas geradas pela API, não pelo Chatbot', async () => {
    const { done } = await dizer(
      func,
      chatF,
      `Compramos R$ 6000 em mercadorias do fornecedor ${DIST} em 6 parcelas.`
    )
    const d = await despesa(func, done!.userMessage.despesaId)
    assert.equal(d.numeroParcelas, 6)
    assert.equal(d.parcelas.length, 6)
    assert.ok(d.parcelas.every((p: Json) => p.valor === 1000))
    assert.equal(d.status, 'PENDENTE')
  })

  await step('pagamento parcial de título existente (Kalunga)', async () => {
    await dizer(func, chatF, `Compramos R$ 1000 em papel A4 do fornecedor ${KALUNGA}`)
    const { sent, done } = await dizer(func, chatF, `Pagamos R$ 300 ao fornecedor ${KALUNGA}`)
    assert.match(sent.confirmacao.resumo, /título já existente/)
    const d = await despesa(func, done!.userMessage.despesaId)
    assert.equal(d.categoria.nome, 'Material de Escritório')
    assert.equal(d.status, 'PARCIAL')
    assert.equal(d.valorPago, 300)
  })

  console.log('\nRecebimentos')
  await step('"Cliente João pagou R$ 500 referente à compra de materiais escolares."', async () => {
    const { done } = await dizer(
      func,
      chatF,
      `Cliente ${JOAO} pagou R$ 500 referente à compra de materiais escolares.`
    )
    const r = await recebimento(func, done!.userMessage.recebimentoId)
    assert.equal(r.cliente, JOAO)
    assert.equal(r.valor, 500)
    assert.equal(r.status, 'PAGO')
    assert.equal(r.categoria.nome, 'Vendas')
  })

  await step('recebimento parcial: venda parcelada e baixa parcial (regra na API)', async () => {
    await dizer(func, chatF, `Vendemos R$ 900 para o cliente ${MARIA} em 3 parcelas`)
    const { done } = await dizer(func, chatF, `Cliente ${MARIA} pagou R$ 400`)
    const r = await recebimento(func, done!.userMessage.recebimentoId)
    assert.equal(r.status, 'PARCIAL')
    assert.equal(r.valorRecebido, 400)
    assert.deepEqual(
      r.parcelas.map((p: Json) => p.status),
      ['PAGO', 'PARCIAL', 'PENDENTE']
    )
  })

  console.log('\nMensagens ambíguas e confirmação')
  await step('sem valor: pergunta e NÃO cria; resposta "R$ 300" completa a operação', async () => {
    const antes = (await http(API, func, 'GET', '/despesas?pageSize=100')).body.total
    const first = await dizer(func, chatF, 'Comprei cadernos.')
    assert.equal(first.sent.confirmacao, null)
    assert.match(first.sent.assistantMessage.content, /Qual foi o valor da compra\?/)
    assert.equal((await http(API, func, 'GET', '/despesas?pageSize=100')).body.total, antes)

    const { done } = await dizer(func, chatF, 'R$ 300')
    const d = await despesa(func, done!.userMessage.despesaId)
    assert.equal(d.valor, 300)
    assert.equal(d.categoria.nome, 'Mercadorias')
  })

  await step('descartar confirmação não grava nada', async () => {
    const antes = (await http(API, func, 'GET', '/despesas?pageSize=100')).body.total
    const { sent } = await dizer(
      func,
      chatF,
      `Registre uma compra de R$ 5000 em mercadorias do fornecedor ${ABC}`,
      false
    )
    assert.match(sent.confirmacao.resumo, /R\$ 5\.000,00/)
    const cancel = await http(
      BOT,
      func,
      'POST',
      `/chats/${chatF}/messages/${sent.confirmacao.messageId}/cancel`
    )
    assert.equal(cancel.status, 200)
    assert.equal(cancel.body.userMessage.status, 'CANCELADA')
    assert.equal((await http(API, func, 'GET', '/despesas?pageSize=100')).body.total, antes)
  })

  await step('confirmar duas vezes não duplica (409)', async () => {
    const { sent } = await dizer(func, chatF, `Compramos R$ 100 de borracha do fornecedor ${FABER}`, true)
    const again = await http(
      BOT,
      func,
      'POST',
      `/chats/${chatF}/messages/${sent.confirmacao.messageId}/confirm`
    )
    assert.equal(again.status, 409)
    const lista = await http(API, func, 'GET', `/despesas?fornecedor=${FABER}`)
    assert.equal(lista.body.total, 1)
  })

  console.log('\nAutorização (decidida pela API Financeira)')
  await step('FUNCIONARIO tenta cancelar pelo Chatbot: recusado pela API (403), título intacto', async () => {
    const { sent, done } = await dizer(func, chatF, `Cancele a despesa do fornecedor ${KALUNGA}`)
    assert.match(sent.confirmacao.resumo, /Vou cancelar/)
    assert.equal(done!.userMessage.status, 'ERRO')
    assert.equal(done!.erro.status, 403)
    assert.equal(done!.erro.code, 'FORBIDDEN')
    const kalunga = (await http(API, func, 'GET', `/despesas?fornecedor=${KALUNGA}`)).body.items[0]
    assert.equal(kalunga.status, 'PARCIAL')
  })

  await step('ADMIN cancela pelo Chatbot: título vira CANCELADO (sem exclusão física)', async () => {
    const { done } = await dizer(admin, chatA, `Cancele a despesa do fornecedor ${KALUNGA}`)
    assert.equal(done!.userMessage.status, 'EXECUTADA')
    const d = await despesa(admin, done!.userMessage.despesaId)
    assert.equal(d.status, 'CANCELADO')
    assert.ok(d.historico.some((h: Json) => h.acao === 'CANCELADO'))
  })

  await step('relatório continua restrito a ADMIN', async () => {
    assert.equal((await http(API, func, 'GET', '/relatorios/contas-a-pagar')).status, 403)
    assert.equal((await http(API, admin, 'GET', '/relatorios/contas-a-pagar')).status, 200)
  })

  await step('sem sessão: 401 no Chatbot e na API', async () => {
    assert.equal((await http(BOT, null, 'GET', '/chats')).status, 401)
    assert.equal((await http(API, null, 'GET', '/despesas')).status, 401)
  })

  await step('conversa de outro usuário não é acessível (404)', async () => {
    assert.equal((await http(BOT, func, 'GET', `/chats/${chatA}`)).status, 404)
    assert.equal((await http(BOT, func, 'POST', `/chats/${chatA}/messages`, { content: 'oi' })).status, 404)
  })

  await step('Chat/Message guardam intenção, dados extraídos e referência ao título', async () => {
    const chat = await http(BOT, func, 'GET', `/chats/${chatF}`)
    const exec = chat.body.messages.filter((m: Json) => m.status === 'EXECUTADA')
    assert.ok(exec.length >= 6)
    assert.ok(exec.every((m: Json) => m.intent && m.parsedData && (m.despesaId || m.recebimentoId)))
  })

  console.log(`\n${passedCount()} cenários OK`)
  await prisma.$disconnect()
}

runMain(main)
