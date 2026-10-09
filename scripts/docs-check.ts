/**
 * Valida a documentação (Scalar/OpenAPI) da API e do Chatbot:
 *  1. todos os endpoints esperados estão documentados;
 *  2. body/path/query têm exemplos preenchidos (sem obrigatórios vazios);
 *  3. os exemplos EXTRAÍDOS do OpenAPI são executados contra os servidores (como o botão Execute),
 *     em fluxos dependentes (criar → consultar → pagar → consultar) e com verificação das respostas,
 *     incluindo erros de validação/autorização.
 *
 * Requer: pnpm build, migrations + seed aplicados. Restaura os dados de demonstração antes de rodar.
 * Uso: pnpm verify:docs
 */
import './load-env.js'

import assert from 'node:assert/strict'

import { EXEMPLOS } from '../packages/types/dist/index.js'
import { http, type Json, type Session } from './lib/http.js'
import { passedCount, runMain, step } from './lib/runner.js'
import { API, BOT, startServers } from './lib/servers.js'
import { seedDemo } from './seed-demo.js'

// ------------------------------------------------------------------ helpers de exemplo
function exemplo(s: any): any {
  if (!s) return undefined
  if (s.example !== undefined) return s.example
  if (s.type === 'object' && s.properties) {
    const out: Json = {}
    for (const [k, v] of Object.entries<any>(s.properties)) {
      const e = exemplo(v)
      if (e !== undefined) out[k] = e
    }
    return out
  }
  if (s.type === 'array') {
    const e = exemplo(s.items)
    return e === undefined ? undefined : [e]
  }
  return undefined
}
const vazio = (v: unknown) =>
  v === undefined ||
  v === null ||
  v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

class Doc {
  constructor(public spec: Json) {}
  op(method: string, path: string): Json {
    const op = this.spec.paths?.[path]?.[method.toLowerCase()]
    assert.ok(op, `endpoint não documentado: ${method} ${path}`)
    return op
  }
  body(method: string, path: string) {
    return exemplo(this.op(method, path).requestBody?.content?.['application/json']?.schema)
  }
  /** Query string montada só com os exemplos documentados. */
  query(method: string, path: string) {
    const q = new URLSearchParams()
    for (const p of this.op(method, path).parameters ?? []) {
      if (p.in !== 'query') continue
      const e = p.schema?.example
      if (e !== undefined) q.set(p.name, String(e))
    }
    const s = q.toString()
    return s ? `?${s}` : ''
  }
  /** Substitui {param} pelos exemplos documentados (ou por ids informados). */
  url(method: string, path: string, override: Record<string, string> = {}) {
    const op = this.op(method, path)
    return path
      .replace(/\{(\w+)\}/g, (_, name) => {
        const ex = (op.parameters ?? []).find((p: Json) => p.name === name)?.schema?.example
        return override[name] ?? ex
      })
      .replace(/\/$/, '')
  }
}

// ------------------------------------------------------------------ endpoints esperados
const ESPERADOS_API = [
  'POST /api/auth/sign-in/email',
  'POST /api/auth/sign-out',
  'GET /api/auth/get-session',
  'POST /usuarios/funcionarios',
  'GET /categorias/',
  'POST /despesas/',
  'GET /despesas/',
  'GET /despesas/{id}',
  'PATCH /despesas/{id}',
  'POST /despesas/{id}/cancelar',
  'POST /despesas/{id}/pagamentos',
  'POST /recebimentos/',
  'GET /recebimentos/',
  'GET /recebimentos/{id}',
  'PATCH /recebimentos/{id}',
  'POST /recebimentos/{id}/cancelar',
  'POST /recebimentos/{id}/baixas',
  'GET /relatorios/contas-a-pagar',
  'GET /relatorios/contas-a-receber',
]
const ESPERADOS_BOT = [
  'POST /chats/',
  'GET /chats/',
  'GET /chats/{chatId}',
  'POST /chats/{chatId}/messages',
  'POST /chats/{chatId}/messages/{messageId}/confirm',
  'POST /chats/{chatId}/messages/{messageId}/cancel',
]

function lintDocs(nome: string, spec: Json, esperados: string[]) {
  const problemas: string[] = []
  for (const e of esperados) {
    const [method, path] = e.split(' ') as [string, string]
    const op = spec.paths?.[path]?.[method.toLowerCase()]
    if (!op) {
      problemas.push(`${nome}: não documentado -> ${e}`)
      continue
    }

    for (const p of op.parameters ?? []) {
      if (p.schema?.example === undefined)
        problemas.push(`${nome}: ${e} parâmetro "${p.name}" (${p.in}) sem exemplo`)
    }
    const schema = op.requestBody?.content?.['application/json']?.schema
    if (schema) {
      const ex = exemplo(schema)
      if (vazio(ex)) {
        problemas.push(`${nome}: ${e} body sem exemplo`)
        continue
      }
      for (const campo of schema.required ?? []) {
        if (vazio(ex[campo])) problemas.push(`${nome}: ${e} campo obrigatório "${campo}" sem exemplo`)
      }
    }
  }
  assert.equal(problemas.length, 0, '\n      ' + problemas.join('\n      '))
}

// ------------------------------------------------------------------ main
async function main() {
  console.log('\nPreparando (restaura os dados de demonstração)')
  await seedDemo()
  const { prisma } = await import('../packages/database/dist/index.js')

  await startServers()

  const api = new Doc((await http(API, null, 'GET', '/swagger.json')).body)
  const bot = new Doc((await http(BOT, null, 'GET', '/swagger.json')).body)

  console.log('\nDocumentação (OpenAPI/Scalar)')
  await step('Scalar acessível nos dois serviços (/docs)', async () => {
    assert.equal((await fetch(`${API}/docs`)).status, 200)
    assert.equal((await fetch(`${BOT}/docs`)).status, 200)
  })
  await step('API: todos os endpoints documentados, com exemplos preenchidos', async () =>
    lintDocs('API', api.spec, ESPERADOS_API)
  )
  await step('Chatbot: todos os endpoints documentados, com exemplos preenchidos', async () =>
    lintDocs('Chatbot', bot.spec, ESPERADOS_BOT)
  )
  await step('rota curinga de autenticação não polui a documentação', async () => {
    assert.ok(!Object.keys(api.spec.paths).some((p) => p.includes('*')))
  })

  const login = async (creds?: Json) => {
    const r = await http(
      API,
      null,
      'POST',
      '/api/auth/sign-in/email',
      creds ?? api.body('POST', '/api/auth/sign-in/email')
    )
    assert.equal(r.status, 200, r.text)
    return { cookie: r.setCookie.map((c) => c.split(';')[0]).join('; ') } as Session
  }

  console.log('\nAutenticação (exemplos do Scalar)')
  let admin!: Session
  let func!: Session
  await step('Login: exemplo do body (ADMIN de demonstração)', async () => {
    admin = await login()
    const s = await http(API, admin, 'GET', '/api/auth/get-session')
    assert.equal(s.body.user.email, EXEMPLOS.admin.email)
    assert.equal(s.body.user.role, 'ADMIN')
  })
  let funcionarioEmail = ''
  await step('Cadastro público recusado e rotas genéricas de ADMIN inacessíveis', async () => {
    const cadastroPublico = await http(API, null, 'POST', '/api/auth/sign-up/email', {
      name: 'Cadastro Público',
      email: `publico-${Date.now()}@docs-check.test`,
      password: 'senha12345',
    })
    assert.ok(cadastroPublico.status >= 400, `${cadastroPublico.status} ${cadastroPublico.text}`)

    const rotaAdminGenerica = await http(API, admin, 'POST', '/api/auth/admin/create-user', {
      name: 'Admin Indevido',
      email: `admin-indevido-${Date.now()}@docs-check.test`,
      password: 'senha12345',
      role: 'ADMIN',
    })
    assert.equal(rotaAdminGenerica.status, 404)
  })
  await step('ADMIN cadastra funcionário pelo exemplo documentado; sessão permanece ativa', async () => {
    const body = api.body('POST', '/usuarios/funcionarios')
    funcionarioEmail = `funcionario-${Date.now()}@docs-check.test`
    const r = await http(API, admin, 'POST', '/usuarios/funcionarios', { ...body, email: funcionarioEmail })
    assert.equal(r.status, 201, r.text)
    assert.equal(r.body.role, 'FUNCIONARIO')
    assert.equal(r.setCookie.length, 0, 'criar funcionário não deve emitir sessão nova')

    const s = await http(API, admin, 'GET', '/api/auth/get-session')
    assert.equal(s.body.user.email, EXEMPLOS.admin.email)
    assert.equal(s.body.user.role, 'ADMIN')
  })
  await step('Funcionário criado entra como FUNCIONARIO e não pode cadastrar contas', async () => {
    func = await login({ email: funcionarioEmail, password: 'senha12345' })
    const session = await http(API, func, 'GET', '/api/auth/get-session')
    assert.equal(session.body.user.email, funcionarioEmail)
    assert.equal(session.body.user.role, 'FUNCIONARIO')
    const forbidden = await http(API, func, 'POST', '/usuarios/funcionarios', {
      name: 'Outro funcionário',
      email: `outro-${Date.now()}@docs-check.test`,
      password: 'senha12345',
    })
    assert.equal(forbidden.status, 403)
  })
  await step('Login do FUNCIONARIO de demonstração continua funcionando', async () => {
    await login({ email: EXEMPLOS.funcionario.email, password: EXEMPLOS.funcionario.password })
  })
  await step('Login com senha errada é recusado', async () => {
    const r = await http(API, null, 'POST', '/api/auth/sign-in/email', {
      email: EXEMPLOS.admin.email,
      password: 'errada-123',
    })
    assert.equal(r.status, 401)
  })

  console.log('\nCategorias')
  let catMercadorias = ''
  let catVendas = ''
  await step('GET /categorias (query de exemplo)', async () => {
    const r = await http(API, admin, 'GET', `/categorias${api.query('GET', '/categorias/')}`)
    assert.equal(r.status, 200)
    assert.ok(r.body.items.every((c: Json) => c.tipo === 'DESPESA'))
    catMercadorias = r.body.items.find((c: Json) => c.nome === 'Mercadorias').id
    const rec = await http(API, admin, 'GET', '/categorias?tipo=RECEBIMENTO')
    catVendas = rec.body.items.find((c: Json) => c.nome === 'Vendas').id
    // Os exemplos do Scalar usam estes ids: precisam existir e ser os mesmos da listagem.
    assert.equal(catMercadorias, EXEMPLOS.categoriaDespesaId)
    assert.equal(catVendas, EXEMPLOS.categoriaRecebimentoId)
  })

  console.log('\nDespesas')
  let despesaId = ''
  await step('Criar: body de exemplo (5 parcelas de R$ 500)', async () => {
    const r = await http(API, admin, 'POST', '/despesas', api.body('POST', '/despesas/'))
    assert.equal(r.status, 201, r.text)
    despesaId = r.body.id
    assert.equal(r.body.numeroParcelas, 5)
    assert.equal(r.body.status, 'PENDENTE')
    assert.deepEqual(
      r.body.parcelas.map((p: Json) => p.valor),
      [500, 500, 500, 500, 500]
    )
    assert.equal(r.body.parcelas[0].dataVencimento, '2026-10-30')
    assert.equal(r.body.categoria.nome, 'Mercadorias')
  })
  await step('Criar sem categoria e com categoria de outro tipo (400)', async () => {
    const semCategoria = { ...api.body('POST', '/despesas/') }
    delete semCategoria.categoriaId
    assert.equal((await http(API, admin, 'POST', '/despesas', semCategoria)).body.categoria, null)
    const errada = await http(API, admin, 'POST', '/despesas', {
      ...api.body('POST', '/despesas/'),
      categoriaId: catVendas,
    })
    assert.equal(errada.status, 400)
    assert.equal(errada.body.code, 'CATEGORIA_INVALIDA')
  })
  await step('Listar: query de exemplo', async () => {
    const r = await http(API, admin, 'GET', `/despesas${api.query('GET', '/despesas/')}`)
    assert.equal(r.status, 200, r.text)
    assert.ok(
      r.body.total >= 1 &&
        r.body.items.every((d: Json) => d.status === 'PENDENTE' && /distribuidora/i.test(d.fornecedor))
    )
  })
  await step('Consultar: título criado e despesa de demonstração (id do exemplo)', async () => {
    const r = await http(API, admin, 'GET', `/despesas/${despesaId}`)
    assert.equal(r.status, 200)
    assert.equal(r.body.parcelas.length, 5)
    assert.equal(r.body.historico[0].acao, 'CRIADO')
    const demo = await http(API, admin, 'GET', api.url('GET', '/despesas/{id}'))
    assert.equal(demo.status, 200, demo.text)
    assert.equal(demo.body.id, EXEMPLOS.despesaId)
  })
  await step('Atualizar: body de exemplo', async () => {
    const r = await http(API, admin, 'PATCH', `/despesas/${despesaId}`, api.body('PATCH', '/despesas/{id}'))
    assert.equal(r.status, 200, r.text)
    assert.equal(r.body.descricao, 'Compra de cadernos e canetas')
    const demo = await http(
      API,
      admin,
      'PATCH',
      api.url('PATCH', '/despesas/{id}'),
      api.body('PATCH', '/despesas/{id}')
    )
    assert.equal(demo.status, 200, demo.text)
  })
  await step('Registrar pagamento: exemplo → consultar de novo → status e saldo', async () => {
    const pay = await http(
      API,
      admin,
      'POST',
      `/despesas/${despesaId}/pagamentos`,
      api.body('POST', '/despesas/{id}/pagamentos')
    )
    assert.equal(pay.status, 200, pay.text)
    assert.equal(pay.body.valorPago, 500)
    assert.equal(pay.body.status, 'PARCIAL')
    const after = await http(API, admin, 'GET', `/despesas/${despesaId}`)
    assert.equal(after.body.valorPago, 500)
    assert.equal(after.body.parcelas[0].status, 'PAGO')
    assert.equal(after.body.parcelas[1].status, 'PENDENTE')
    assert.equal(after.body.pagamentos.length, 1)
    const demo = await http(
      API,
      admin,
      'POST',
      api.url('POST', '/despesas/{id}/pagamentos'),
      api.body('POST', '/despesas/{id}/pagamentos')
    )
    assert.equal(demo.status, 200, demo.text)
  })
  await step('Erros: validação (400), saldo excedido (400), 404, valor travado após pagamento', async () => {
    const vazio = await http(API, admin, 'POST', '/despesas', {})
    assert.equal(vazio.status, 400)
    assert.equal(vazio.body.code, 'VALIDATION_ERROR')
    const excede = await http(API, admin, 'POST', `/despesas/${despesaId}/pagamentos`, { valor: 999999 })
    assert.equal(excede.status, 400)
    assert.equal(excede.body.code, 'VALOR_INVALIDO')
    const nf = await http(API, admin, 'GET', '/despesas/d0000000-0000-4000-8000-0000000000ff')
    assert.equal(nf.status, 404)
    const travado = await http(API, admin, 'PATCH', `/despesas/${despesaId}`, { valor: 9000 })
    assert.equal(travado.body.code, 'TITULO_COM_PAGAMENTO')
    assert.equal((await http(API, null, 'GET', '/despesas')).status, 401)
  })
  await step('Cancelar: FUNCIONARIO 403; ADMIN 200 (sem exclusão física); pagar cancelado 400', async () => {
    const path = `/despesas/${despesaId}/cancelar`
    assert.equal((await http(API, func, 'POST', path)).status, 403)
    const r = await http(API, admin, 'POST', path)
    assert.equal(r.status, 200, r.text)
    assert.equal(r.body.status, 'CANCELADO')
    const again = await http(API, admin, 'POST', `/despesas/${despesaId}/pagamentos`, { valor: 10 })
    assert.equal(again.body.code, 'TITULO_CANCELADO')
    const demo = await http(API, admin, 'POST', api.url('POST', '/despesas/{id}/cancelar'))
    assert.equal(demo.status, 200, demo.text)
  })

  console.log('\nRecebimentos')
  let recebimentoId = ''
  await step('Criar: body de exemplo', async () => {
    const r = await http(API, admin, 'POST', '/recebimentos', api.body('POST', '/recebimentos/'))
    assert.equal(r.status, 201, r.text)
    recebimentoId = r.body.id
    assert.equal(r.body.valor, 350)
    assert.equal(r.body.parcelas.length, 1)
    assert.equal(r.body.categoria.nome, 'Vendas')
  })
  await step('Listar e consultar (query e id de exemplo)', async () => {
    const list = await http(API, admin, 'GET', `/recebimentos${api.query('GET', '/recebimentos/')}`)
    assert.equal(list.status, 200, list.text)
    assert.ok(list.body.total >= 1)
    assert.equal((await http(API, admin, 'GET', `/recebimentos/${recebimentoId}`)).status, 200)
    const demo = await http(API, admin, 'GET', api.url('GET', '/recebimentos/{id}'))
    assert.equal(demo.body.id, EXEMPLOS.recebimentoId)
  })
  await step('Atualizar: body de exemplo', async () => {
    const r = await http(
      API,
      admin,
      'PATCH',
      `/recebimentos/${recebimentoId}`,
      api.body('PATCH', '/recebimentos/{id}')
    )
    assert.equal(r.status, 200, r.text)
    assert.equal(r.body.descricao, 'Venda de material escolar (kit completo)')
  })
  await step(
    'Registrar baixa: exemplo (parcial) → consultar → restante (total) → novo pagamento recusado',
    async () => {
      const p1 = await http(
        API,
        admin,
        'POST',
        `/recebimentos/${recebimentoId}/baixas`,
        api.body('POST', '/recebimentos/{id}/baixas')
      )
      assert.equal(p1.status, 200, p1.text)
      assert.equal(p1.body.status, 'PARCIAL')
      assert.equal(p1.body.valorRecebido, 150)
      const p2 = await http(API, admin, 'POST', `/recebimentos/${recebimentoId}/baixas`, { valor: 200 })
      assert.equal(p2.body.status, 'PAGO')
      const after = await http(API, admin, 'GET', `/recebimentos/${recebimentoId}`)
      assert.equal(after.body.valorRecebido, 350)
      assert.equal(after.body.baixas.length, 2)
      assert.equal(
        (await http(API, admin, 'POST', `/recebimentos/${recebimentoId}/baixas`, { valor: 1 })).body.code,
        'TITULO_JA_LIQUIDADO'
      )
      const demo = await http(
        API,
        admin,
        'POST',
        api.url('POST', '/recebimentos/{id}/baixas'),
        api.body('POST', '/recebimentos/{id}/baixas')
      )
      assert.equal(demo.status, 200, demo.text)
    }
  )
  await step('Cancelar: FUNCIONARIO 403; ADMIN 200', async () => {
    const novo = await http(API, admin, 'POST', '/recebimentos', api.body('POST', '/recebimentos/'))
    const path = `/recebimentos/${novo.body.id}/cancelar`
    assert.equal((await http(API, func, 'POST', path)).status, 403)
    const r = await http(API, admin, 'POST', path)
    assert.equal(r.body.status, 'CANCELADO')
    const demo = await http(API, admin, 'POST', api.url('POST', '/recebimentos/{id}/cancelar'))
    assert.equal(demo.status, 200, demo.text)
    assert.equal((await http(API, admin, 'POST', '/recebimentos', {})).status, 400)
  })

  console.log('\nRelatórios (ADMIN)')
  await step('contas a pagar/receber (JSON e CSV) com query de exemplo; FUNCIONARIO 403', async () => {
    const pagar = await http(
      API,
      admin,
      'GET',
      `/relatorios/contas-a-pagar${api.query('GET', '/relatorios/contas-a-pagar')}`
    )
    assert.equal(pagar.status, 200, pagar.text)
    assert.equal(typeof pagar.body.totalAPagar, 'number')
    const csv = await http(API, admin, 'GET', '/relatorios/contas-a-receber?formato=csv')
    assert.equal(csv.status, 200)
    assert.match(String(csv.headers.get('content-type')), /text\/csv/)
    assert.match(csv.text, /Cliente/)
    assert.equal((await http(API, func, 'GET', '/relatorios/contas-a-pagar')).status, 403)
  })

  console.log('\nChat (exemplos do Scalar do Chatbot)')
  let chatId = ''
  await step('Consultar histórico da conversa de demonstração (id do exemplo)', async () => {
    const r = await http(BOT, admin, 'GET', bot.url('GET', '/chats/{chatId}'))
    assert.equal(r.status, 200, r.text)
    assert.equal(r.body.messages.length, 2)
    assert.ok(r.body.messages.every((m: Json) => m.status === 'PENDENTE_CONFIRMACAO'))
  })
  await step('Criar conversa: body de exemplo', async () => {
    const r = await http(BOT, admin, 'POST', '/chats', bot.body('POST', '/chats/'))
    assert.equal(r.status, 201, r.text)
    assert.equal(r.body.title, 'Lançamentos de setembro')
    chatId = r.body.id
  })
  let messageId = ''
  await step('Enviar mensagem: exemplo → resumo pede confirmação', async () => {
    const r = await http(
      BOT,
      admin,
      'POST',
      `/chats/${chatId}/messages`,
      bot.body('POST', '/chats/{chatId}/messages')
    )
    assert.equal(r.status, 200, r.text)
    assert.ok(r.body.confirmacao)
    assert.match(r.body.confirmacao.resumo, /Distribuidora Escolar ABC/)
    assert.match(r.body.confirmacao.resumo, /R\$ 2\.500,00/)
    messageId = r.body.confirmacao.messageId
  })
  await step('Confirmar → título criado na API Financeira → consultar histórico', async () => {
    const r = await http(BOT, admin, 'POST', `/chats/${chatId}/messages/${messageId}/confirm`)
    assert.equal(r.status, 200, r.text)
    assert.equal(r.body.userMessage.status, 'EXECUTADA')
    const titulo = await http(API, admin, 'GET', `/despesas/${r.body.userMessage.despesaId}`)
    assert.equal(titulo.body.fornecedor, 'Distribuidora Escolar ABC')
    assert.equal(titulo.body.valor, 2500)
    assert.equal(titulo.body.categoria.nome, 'Mercadorias')
    const hist = await http(BOT, admin, 'GET', `/chats/${chatId}`)
    assert.equal(hist.body.messages.length, 3) // usuário (atualizada para EXECUTADA), resumo e resultado do bot
    assert.ok(hist.body.messages.some((m: Json) => m.status === 'EXECUTADA' && m.despesaId))
    assert.ok((await http(BOT, admin, 'GET', '/chats')).body.some((c: Json) => c.id === chatId))
  })
  await step('Confirmar e descartar as mensagens pendentes de demonstração (ids dos exemplos)', async () => {
    const c = await http(BOT, admin, 'POST', bot.url('POST', '/chats/{chatId}/messages/{messageId}/confirm'))
    assert.equal(c.status, 200, c.text)
    assert.equal(c.body.userMessage.status, 'EXECUTADA')
    const d = await http(BOT, admin, 'POST', bot.url('POST', '/chats/{chatId}/messages/{messageId}/cancel'))
    assert.equal(d.status, 200, d.text)
    assert.equal(d.body.userMessage.status, 'CANCELADA')
    const again = await http(
      BOT,
      admin,
      'POST',
      bot.url('POST', '/chats/{chatId}/messages/{messageId}/confirm')
    )
    assert.equal(again.status, 409)
  })
  await step('Erros: mensagem sem valor pergunta; body inválido 400; sem login 401', async () => {
    const r = await http(BOT, admin, 'POST', `/chats/${chatId}/messages`, { content: 'Comprei cadernos.' })
    assert.equal(r.body.confirmacao, null)
    assert.match(r.body.assistantMessage.content, /Qual foi o valor/)
    assert.equal((await http(BOT, admin, 'POST', `/chats/${chatId}/messages`, {})).status, 400)
    assert.equal((await http(BOT, null, 'GET', '/chats')).status, 401)
  })

  console.log('\nLogout')
  await step('Logout encerra a sessão: rotas protegidas passam a dar 401', async () => {
    const s = await login()
    assert.equal((await http(API, s, 'GET', '/despesas')).status, 200)
    const out = await http(API, s, 'POST', '/api/auth/sign-out')
    assert.equal(out.status, 200, out.text)
    assert.equal((await http(API, s, 'GET', '/despesas')).status, 401)
    assert.equal((await http(BOT, s, 'GET', '/chats')).status, 401)
  })

  console.log(`\n${passedCount()} verificações OK`)
  await prisma.$disconnect()
}

runMain(main)
