import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const testState = vi.hoisted(() => ({
  auth: undefined as any,
  users: new Map<
    string,
    { id: string; name: string; email: string; role: 'ADMIN' | 'FUNCIONARIO'; createdAt: Date }
  >(),
  permissions: new Map<
    string,
    { despesas: boolean; recebimentos: boolean; comercial: boolean; relatorios: boolean }
  >(),
  permissionHistory: [] as Array<Record<string, unknown>>,
  roleHistory: [] as Array<Record<string, unknown>>,
}))

vi.mock('@sisgfpa/auth', async () => {
  const { fromNodeHeaders } = await import('better-auth/node')
  return {
    get auth() {
      return testState.auth
    },
    fromNodeHeaders,
    getAuthenticatedUser: async (headers: Record<string, string | string[] | undefined>) => {
      const session = await testState.auth.api.getSession({ headers: fromNodeHeaders(headers) })
      if (!session) return null
      const { id, name, email, role } = session.user
      return { id, name, email, role }
    },
  }
})

vi.mock('@sisgfpa/database', () => {
  const prisma: any = {
    $queryRaw: async () => [],
    user: {
      findUnique: async ({ where }: { where: { email: string } | { id: string } }) => {
        if ('email' in where) {
          const user = testState.users.get(where.email)
          return user ? { ...user } : null
        }
        return [...testState.users.values()].find((user) => user.id === where.id) ?? null
      },
      findMany: async () =>
        [...testState.users.values()]
          .filter((user) => user.role === 'FUNCIONARIO')
          .map((user) => ({
            ...user,
            permissoesFuncionario: testState.permissions.get(user.id) ?? null,
          })),
      findFirst: async ({ where }: { where: { id: string; role: 'FUNCIONARIO' } }) => {
        const user = [...testState.users.values()].find(
          (candidate) => candidate.id === where.id && candidate.role === where.role
        )
        return user ? { id: user.id } : null
      },
    },
    funcionarioPermissao: {
      findMany: async ({ where }: { where: { funcionarioId: { in: string[] } } }) =>
        where.funcionarioId.in.flatMap((funcionarioId) => {
          const permissoes = testState.permissions.get(funcionarioId)
          return permissoes ? [{ funcionarioId, ...permissoes }] : []
        }),
      findUnique: async ({ where }: { where: { funcionarioId: string } }) =>
        testState.permissions.get(where.funcionarioId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const value = { ...(testState.permissions.get(where.funcionarioId) ?? create), ...update }
        testState.permissions.set(where.funcionarioId, value)
        return value
      },
    },
    funcionarioPermissaoHistorico: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        testState.permissionHistory.push(data)
        return data
      },
    },
    usuarioPapelHistorico: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        testState.roleHistory.push(data)
        return data
      },
    },
  }
  prisma.$transaction = async (callback: (tx: typeof prisma) => unknown) => callback(prisma)
  return { prisma }
})

const origin = 'http://localhost:8080'
const password = 'senha-inicial-123'
const adminEmail = 'admin@regression.test'
const existingFuncionarioEmail = 'funcionario@regression.test'
const createdFuncionarioEmail = 'novo-funcionario@regression.test'

describe('criação administrativa de contas', () => {
  let app: FastifyInstance
  let adminCookie = ''
  let funcionarioCookie = ''
  let createResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let unauthenticatedCreateResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let publicSignupResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let genericAdminResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let genericSetRoleResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioCreateResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let adminRoleInjectionResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let adminSessionAfterCreation: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioLoginResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioSession: Awaited<ReturnType<FastifyInstance['inject']>>
  let listFuncionariosResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let updatePermissoesResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioListDeniedResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioWriteDeniedResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let permissionRoleInjectionResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let adminPermissionTargetResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let despesasNegadaResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let recebimentosNegadoResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let cancelamentoNegadoResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let relatorioNegadoResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let adminId = ''
  let promotionFuncionarioId = ''
  let promotionFuncionarioCookie = ''
  let noSessionPromotionResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioPromotionResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let selfPromotionResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let promotionResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let promotedSessionResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let promotedPermissionsResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let adminAccountsResult: Awaited<ReturnType<FastifyInstance['inject']>>
  let funcionarioAccountsDeniedResult: Awaited<ReturnType<FastifyInstance['inject']>>

  beforeAll(async () => {
    const [{ getTestInstance }, { openAPI }, { createSisgfpaAdminPlugin, emailAndPasswordOptions }] =
      await Promise.all([
        import('better-auth/test'),
        import('better-auth/plugins'),
        import('../../../../../packages/auth/src/account-config.js'),
      ])
    const instance = await getTestInstance(
      {
        baseURL: origin,
        basePath: '/api/auth',
        secret: 'better-auth-regression-test-secret-long-enough-123456',
        trustedOrigins: [origin],
        emailAndPassword: emailAndPasswordOptions,
        plugins: [createSisgfpaAdminPlugin(), openAPI()],
      },
      { disableTestUser: true }
    )
    testState.auth = instance.auth
    testState.users.clear()
    testState.permissions.clear()
    testState.permissionHistory.length = 0
    testState.roleHistory.length = 0

    const { createApp } = await import('@sisgfpa/http')
    const [
      { authRoutes },
      { usuariosRoutes },
      { despesasRoutes },
      { recebimentosRoutes },
      { categoriasRoutes },
      { relatoriosRoutes },
    ] = await Promise.all([
      import('../auth/auth.routes.js'),
      import('./usuarios.routes.js'),
      import('../despesas/despesas.routes.js'),
      import('../recebimentos/recebimentos.routes.js'),
      import('../categorias/categorias.routes.js'),
      import('../relatorios/relatorios.routes.js'),
    ])
    app = await createApp({
      title: 'API de teste',
      description: 'Teste de regressão do fluxo de contas',
      serverUrl: origin,
      trustedOrigins: [origin],
      rateLimitMax: 1000,
      logger: false,
    })
    await app.register(authRoutes)
    await app.register(usuariosRoutes, { prefix: '/usuarios' })
    await app.register(despesasRoutes, { prefix: '/despesas' })
    await app.register(recebimentosRoutes, { prefix: '/recebimentos' })
    await app.register(categoriasRoutes, { prefix: '/categorias' })
    await app.register(relatoriosRoutes, { prefix: '/relatorios' })
    await app.ready()

    const admin = await instance.auth.api.createUser({
      body: { name: 'Admin Regression', email: adminEmail, password, role: 'ADMIN' },
    })
    testState.users.set(adminEmail, {
      id: admin.user.id,
      name: admin.user.name,
      email: admin.user.email,
      role: 'ADMIN',
      createdAt: new Date(),
    })
    const funcionario = await instance.auth.api.createUser({
      body: {
        name: 'Funcionario Regression',
        email: existingFuncionarioEmail,
        password,
        role: 'FUNCIONARIO',
      },
    })
    testState.users.set(existingFuncionarioEmail, {
      id: funcionario.user.id,
      name: funcionario.user.name,
      email: funcionario.user.email,
      role: 'FUNCIONARIO',
      createdAt: new Date(),
    })
    const promotionFuncionario = await instance.auth.api.createUser({
      body: {
        name: 'Funcionário para promoção',
        email: 'promocao@regression.test',
        password,
        role: 'FUNCIONARIO',
      },
    })
    promotionFuncionarioId = promotionFuncionario.user.id
    testState.users.set(promotionFuncionario.user.email, {
      id: promotionFuncionario.user.id,
      name: promotionFuncionario.user.name,
      email: promotionFuncionario.user.email,
      role: 'FUNCIONARIO',
      createdAt: new Date(),
    })

    const login = async (email: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
        payload: { email, password },
      })
    const responseCookie = (response: Awaited<ReturnType<FastifyInstance['inject']>>) => {
      const value = response.headers['set-cookie']
      return (Array.isArray(value) ? value : value ? [value] : [])
        .map((cookie) => cookie.split(';')[0])
        .join('; ')
    }

    adminCookie = responseCookie(await login(adminEmail))
    funcionarioCookie = responseCookie(await login(existingFuncionarioEmail))
    promotionFuncionarioCookie = responseCookie(await login('promocao@regression.test'))
    adminId = admin.user.id
    expect(adminCookie).not.toBe('')
    expect(funcionarioCookie).not.toBe('')

    publicSignupResult = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { host: 'localhost:8080', origin, 'content-type': 'application/json' },
      payload: { name: 'Cadastro Público', email: 'publico@regression.test', password },
    })

    genericAdminResult = await app.inject({
      method: 'POST',
      url: '/api/auth/admin/create-user',
      headers: { host: 'localhost:8080', origin, cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Outro Admin', email: 'outro-admin@regression.test', password, role: 'ADMIN' },
    })
    genericSetRoleResult = await app.inject({
      method: 'POST',
      url: '/api/auth/admin/set-role',
      headers: { host: 'localhost:8080', origin, cookie: adminCookie, 'content-type': 'application/json' },
      payload: { userId: funcionario.user.id, role: 'ADMIN' },
    })

    unauthenticatedCreateResult = await app.inject({
      method: 'POST',
      url: '/usuarios/funcionarios',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Sem sessão', email: 'sem-sessao@regression.test', password },
    })

    funcionarioCreateResult = await app.inject({
      method: 'POST',
      url: '/usuarios/funcionarios',
      headers: { cookie: funcionarioCookie, 'content-type': 'application/json' },
      payload: { name: 'Não autorizado', email: 'nao-autorizado@regression.test', password },
    })

    adminRoleInjectionResult = await app.inject({
      method: 'POST',
      url: '/usuarios/funcionarios',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Papel Injetado', email: 'papel-injetado@regression.test', password, role: 'ADMIN' },
    })

    createResult = await app.inject({
      method: 'POST',
      url: '/usuarios/funcionarios',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Novo Funcionário', email: createdFuncionarioEmail, password },
    })
    const createdUser = createResult.json()
    testState.users.set(createdFuncionarioEmail, {
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      role: createdUser.role,
      createdAt: new Date(),
    })

    listFuncionariosResult = await app.inject({
      method: 'GET',
      url: '/usuarios/funcionarios',
      headers: { cookie: adminCookie },
    })
    updatePermissoesResult = await app.inject({
      method: 'PATCH',
      url: `/usuarios/funcionarios/${createdUser.id}/permissoes`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { despesas: false, recebimentos: true },
    })
    await app.inject({
      method: 'PATCH',
      url: `/usuarios/funcionarios/${funcionario.user.id}/permissoes`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { despesas: true, recebimentos: false },
    })
    funcionarioListDeniedResult = await app.inject({
      method: 'GET',
      url: '/usuarios/funcionarios',
      headers: { cookie: funcionarioCookie },
    })
    funcionarioWriteDeniedResult = await app.inject({
      method: 'PATCH',
      url: `/usuarios/funcionarios/${createdUser.id}/permissoes`,
      headers: { cookie: funcionarioCookie, 'content-type': 'application/json' },
      payload: { despesas: true, recebimentos: true },
    })
    permissionRoleInjectionResult = await app.inject({
      method: 'PATCH',
      url: `/usuarios/funcionarios/${createdUser.id}/permissoes`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { despesas: true, recebimentos: true, role: 'ADMIN' },
    })
    adminPermissionTargetResult = await app.inject({
      method: 'PATCH',
      url: `/usuarios/funcionarios/${admin.user.id}/permissoes`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { despesas: false, recebimentos: false },
    })

    adminSessionAfterCreation = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { host: 'localhost:8080', origin, cookie: adminCookie },
    })
    funcionarioLoginResult = await login(createdFuncionarioEmail)
    funcionarioSession = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: {
        host: 'localhost:8080',
        origin,
        cookie: responseCookie(funcionarioLoginResult),
      },
    })
    despesasNegadaResult = await app.inject({
      method: 'GET',
      url: '/despesas',
      headers: { cookie: responseCookie(funcionarioLoginResult) },
    })
    recebimentosNegadoResult = await app.inject({
      method: 'GET',
      url: '/recebimentos',
      headers: { cookie: funcionarioCookie },
    })
    cancelamentoNegadoResult = await app.inject({
      method: 'POST',
      url: '/despesas/d0000000-0000-4000-8000-000000000001/cancelar',
      headers: { cookie: funcionarioCookie },
    })
    relatorioNegadoResult = await app.inject({
      method: 'GET',
      url: '/relatorios/contas-a-pagar',
      headers: { cookie: funcionarioCookie },
    })

    noSessionPromotionResult = await app.inject({
      method: 'POST',
      url: `/usuarios/funcionarios/${promotionFuncionarioId}/promover`,
    })
    funcionarioPromotionResult = await app.inject({
      method: 'POST',
      url: `/usuarios/funcionarios/${promotionFuncionarioId}/promover`,
      headers: { cookie: funcionarioCookie },
    })
    selfPromotionResult = await app.inject({
      method: 'POST',
      url: `/usuarios/funcionarios/${adminId}/promover`,
      headers: { cookie: adminCookie },
    })
    promotionResult = await app.inject({
      method: 'POST',
      url: `/usuarios/funcionarios/${promotionFuncionarioId}/promover`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { role: 'FUNCIONARIO' },
    })
    promotedSessionResult = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { host: 'localhost:8080', origin, cookie: promotionFuncionarioCookie },
    })
    promotedPermissionsResult = await app.inject({
      method: 'GET',
      url: '/usuarios/me/permissoes',
      headers: { cookie: promotionFuncionarioCookie },
    })
    adminAccountsResult = await app.inject({
      method: 'GET',
      url: '/usuarios/contas',
      headers: { cookie: adminCookie },
    })
    funcionarioAccountsDeniedResult = await app.inject({
      method: 'GET',
      url: '/usuarios/contas',
      headers: { cookie: funcionarioCookie },
    })
  }, 30_000)

  afterAll(async () => {
    await app?.close()
  })

  it('nega cadastro público e não expõe o create-user genérico do plugin', () => {
    expect(publicSignupResult.statusCode).toBeGreaterThanOrEqual(400)
    expect(genericAdminResult.statusCode).toBe(404)
    expect(genericSetRoleResult.statusCode).toBe(404)
  })

  it('impede FUNCIONARIO de criar contas', () => {
    expect(unauthenticatedCreateResult.statusCode).toBe(401)
    expect(funcionarioCreateResult.statusCode).toBe(403)
  })

  it('permite ADMIN criar somente FUNCIONARIO, sem substituir sua sessão', () => {
    expect(adminRoleInjectionResult.statusCode).toBe(400)
    expect(createResult.statusCode).toBe(201)
    expect(createResult.json()).toMatchObject({ email: createdFuncionarioEmail, role: 'FUNCIONARIO' })
    expect(createResult.headers['set-cookie']).toBeUndefined()
    expect(adminSessionAfterCreation.statusCode).toBe(200)
    expect(adminSessionAfterCreation.json().user).toMatchObject({ email: adminEmail, role: 'ADMIN' })
  })

  it('cria uma credencial que pode fazer login como FUNCIONARIO', () => {
    expect(funcionarioLoginResult.statusCode).toBe(200)
    expect(funcionarioSession.statusCode).toBe(200)
    expect(funcionarioSession.json().user).toMatchObject({
      email: createdFuncionarioEmail,
      role: 'FUNCIONARIO',
    })
  })

  it('permite ADMIN listar funcionários e altera permissões com registro de auditoria', () => {
    expect(listFuncionariosResult.statusCode).toBe(200)
    expect(listFuncionariosResult.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: createdFuncionarioEmail,
          permissoes: { comercial: true, despesas: true, recebimentos: true, relatorios: false },
        }),
      ])
    )
    expect(updatePermissoesResult.statusCode).toBe(200)
    expect(updatePermissoesResult.json()).toMatchObject({
      permissoes: { despesas: false, recebimentos: true },
    })
    expect(testState.permissionHistory).toHaveLength(2)
    expect(testState.permissionHistory[0]).toMatchObject({
      alteradoPorId: expect.any(String),
      permissoesAnteriores: { comercial: true, despesas: true, recebimentos: true, relatorios: false },
      permissoesNovas: { comercial: true, despesas: false, recebimentos: true, relatorios: false },
    })
  })

  it('mantém a listagem de funcionários exclusiva de ADMIN', () => {
    expect(funcionarioListDeniedResult.statusCode).toBe(403)
    expect(funcionarioWriteDeniedResult.statusCode).toBe(403)
    expect(permissionRoleInjectionResult.statusCode).toBe(400)
    expect(adminPermissionTargetResult.statusCode).toBe(404)
  })

  it('expõe somente as permissões da própria sessão, sem liberar a administração', async () => {
    expect((await app.inject({ url: '/usuarios/me/permissoes' })).statusCode).toBe(401)
    const own = await app.inject({ url: '/usuarios/me/permissoes', headers: { cookie: funcionarioCookie } })
    expect(own.statusCode).toBe(200)
    expect(own.json()).toEqual({
      comercial: true,
      despesas: true,
      recebimentos: false,
      relatorios: false,
      caixa: false,
      administracao: false,
    })
    const admin = await app.inject({ url: '/usuarios/me/permissoes', headers: { cookie: adminCookie } })
    expect(Object.values(admin.json()).every((value) => value === true)).toBe(true)
  })

  it('aplica as permissões individuais na API para funcionários já autenticados', () => {
    expect(despesasNegadaResult.statusCode).toBe(403)
    expect(recebimentosNegadoResult.statusCode).toBe(403)
  })

  it('mantém cancelamento exclusivo de ADMIN e relatórios negados sem permissão', () => {
    expect(cancelamentoNegadoResult.statusCode).toBe(403)
    expect(relatorioNegadoResult.statusCode).toBe(403)
  })

  it('promove somente outro FUNCIONARIO por ADMIN e registra a mudança de papel', () => {
    expect(noSessionPromotionResult.statusCode).toBe(401)
    expect(funcionarioPromotionResult.statusCode).toBe(403)
    expect(selfPromotionResult.statusCode).toBe(400)
    expect(promotionResult.statusCode).toBe(200)
    expect(promotionResult.json()).toMatchObject({
      id: promotionFuncionarioId,
      email: 'promocao@regression.test',
      role: 'ADMIN',
    })
    expect(promotionResult.headers['set-cookie']).toBeUndefined()
    expect(promotedSessionResult.json().user).toMatchObject({
      id: promotionFuncionarioId,
      role: 'ADMIN',
    })
    expect(promotedPermissionsResult.json()).toEqual({
      comercial: true,
      despesas: true,
      recebimentos: true,
      relatorios: true,
      caixa: true,
      administracao: true,
    })
    expect(adminAccountsResult.statusCode).toBe(200)
    expect(adminAccountsResult.json().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: promotionFuncionarioId, role: 'ADMIN' })])
    )
    expect(funcionarioAccountsDeniedResult.statusCode).toBe(403)
    expect(testState.roleHistory).toEqual([
      expect.objectContaining({
        usuarioId: promotionFuncionarioId,
        alteradoPorId: adminId,
        papelAnterior: 'FUNCIONARIO',
        papelNovo: 'ADMIN',
      }),
    ])
  })
})
