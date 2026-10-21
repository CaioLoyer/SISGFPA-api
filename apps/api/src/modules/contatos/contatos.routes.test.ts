import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const state = vi.hoisted(() => ({
  permission: vi.fn(),
  listarContatos: vi.fn(),
  criarContato: vi.fn(),
  atualizarContato: vi.fn(),
  alterarSituacaoContato: vi.fn(),
  sugerirContatos: vi.fn(),
  listarVinculosPendentes: vi.fn(),
  vincularTitulos: vi.fn(),
}))

vi.mock('@sisgfpa/auth', () => ({
  getAuthenticatedUser: async (headers: Record<string, string | string[] | undefined>) => {
    const role = headers['x-test-role']
    if (role !== 'ADMIN' && role !== 'FUNCIONARIO') return null
    return {
      id: role === 'ADMIN' ? 'admin-id' : 'funcionario-id',
      name: 'Usuário de teste',
      email: 'teste@example.com',
      role,
    }
  },
}))

vi.mock('@sisgfpa/database', () => ({
  prisma: { funcionarioPermissao: { findUnique: state.permission } },
}))

vi.mock('./contatos.service.js', () => ({
  listarContatos: state.listarContatos,
  criarContato: state.criarContato,
  atualizarContato: state.atualizarContato,
  alterarSituacaoContato: state.alterarSituacaoContato,
  sugerirContatos: state.sugerirContatos,
  listarVinculosPendentes: state.listarVinculosPendentes,
  vincularTitulos: state.vincularTitulos,
}))

describe('autorização das rotas comerciais', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const [{ createApp }, { contatosRoutes }] = await Promise.all([
      import('@sisgfpa/http'),
      import('./contatos.routes.js'),
    ])
    app = await createApp({
      title: 'API Comercial de teste',
      description: 'Verifica as permissões comerciais',
      serverUrl: 'http://localhost:8080',
      trustedOrigins: ['http://localhost:8080'],
      rateLimitMax: 100,
      logger: false,
    })
    await app.register(contatosRoutes, { prefix: '/contatos' })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
  })

  beforeEach(() => {
    for (const mock of Object.values(state)) mock.mockReset()
    state.permission.mockResolvedValue({ despesas: true, recebimentos: false })
    state.listarContatos.mockImplementation(async (query, papeisPermitidos) => ({
      items: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
      papeisPermitidos,
    }))
    state.sugerirContatos.mockResolvedValue({ items: [] })
    state.vincularTitulos.mockResolvedValue({ vinculados: 1 })
    state.listarVinculosPendentes.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
  })

  function get(url: string, role?: 'ADMIN' | 'FUNCIONARIO') {
    return app.inject({ method: 'GET', url, headers: role ? { 'x-test-role': role } : {} })
  }

  function post(url: string, payload: unknown, role?: 'ADMIN' | 'FUNCIONARIO') {
    return app.inject({
      method: 'POST',
      url,
      headers: {
        ...(role ? { 'x-test-role': role } : {}),
        'content-type': 'application/json',
      },
      payload,
    })
  }

  it('exige sessão para consultar contatos', async () => {
    expect((await get('/contatos/')).statusCode).toBe(401)
  })

  it('publica exemplos para as rotas comerciais e seus filtros', () => {
    const spec = app.swagger() as {
      paths: Record<string, Record<string, any>>
    }
    const list = spec.paths['/contatos/']?.get
    const create = spec.paths['/contatos/']?.post
    const link = spec.paths['/contatos/vinculos']?.post
    const suggestions = spec.paths['/contatos/sugestoes']?.get

    expect(list).toBeDefined()
    expect(create?.requestBody?.content?.['application/json']?.schema?.example).toMatchObject({
      papeis: ['CLIENTE', 'FORNECEDOR'],
    })
    expect(link?.requestBody?.content?.['application/json']?.schema?.example?.itens).toHaveLength(1)
    expect(suggestions?.parameters?.every((parameter: any) => parameter.schema?.example !== undefined)).toBe(
      true
    )
  })

  it('limita funcionários aos contatos da permissão financeira correspondente', async () => {
    const fornecedores = await get('/contatos/?papel=FORNECEDOR', 'FUNCIONARIO')
    const clientes = await get('/contatos/?papel=CLIENTE', 'FUNCIONARIO')
    const sugestaoCliente = await get('/contatos/sugestoes?papel=CLIENTE&nome=Maria', 'FUNCIONARIO')

    expect(fornecedores.statusCode).toBe(200)
    expect(fornecedores.json().papeisPermitidos).toEqual(['FORNECEDOR'])
    expect(clientes.statusCode).toBe(403)
    expect(sugestaoCliente.statusCode).toBe(403)
  })

  it('bloqueia associação de recebimentos ao funcionário sem permissão, mas permite fornecedores', async () => {
    const item = {
      tituloId: 'd0000000-0000-4000-8000-000000000001',
      contatoId: 'c0000000-0000-4000-8000-000000000003',
    }
    const recebimento = await post(
      '/contatos/vinculos',
      { tipo: 'RECEBIMENTO', itens: [item] },
      'FUNCIONARIO'
    )
    const despesa = await post('/contatos/vinculos', { tipo: 'DESPESA', itens: [item] }, 'FUNCIONARIO')

    expect(recebimento.statusCode).toBe(403)
    expect(despesa.statusCode).toBe(200)
    expect(state.vincularTitulos).toHaveBeenCalledOnce()
  })

  it('ADMIN consulta os dois papéis sem depender das permissões de funcionário', async () => {
    const result = await get('/contatos/', 'ADMIN')

    expect(result.statusCode).toBe(200)
    expect(result.json().papeisPermitidos).toEqual(['CLIENTE', 'FORNECEDOR'])
    expect(state.permission).not.toHaveBeenCalled()
  })
})
