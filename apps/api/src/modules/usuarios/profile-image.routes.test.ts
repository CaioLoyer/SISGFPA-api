import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const testState = vi.hoisted(() => ({
  users: new Map<
    string,
    { id: string; name: string; email: string; role: 'FUNCIONARIO'; image: string | null }
  >(),
  updateUser: vi.fn(),
}))

vi.mock('@sisgfpa/auth', () => ({
  auth: { api: { updateUser: testState.updateUser } },
  fromNodeHeaders: (headers: unknown) => headers,
  getAuthenticatedUser: async (headers: Record<string, string | string[] | undefined>) => {
    const cookie = headers.cookie
    const sessionId = typeof cookie === 'string' ? /(?:^|;\s*)session=([^;]+)/.exec(cookie)?.[1] : undefined
    const user = sessionId ? testState.users.get(sessionId) : undefined
    return user ? { ...user } : null
  },
}))

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXJkAAAAASUVORK5CYII='

describe('foto de perfil pela API', () => {
  let app: FastifyInstance
  let storageDir: string

  beforeAll(async () => {
    const [{ createApp }, { profileImageRoutes }] = await Promise.all([
      import('@sisgfpa/http'),
      import('./profile-image.routes.js'),
    ])
    app = await createApp({
      title: 'API de teste',
      description: 'Teste de foto de perfil',
      serverUrl: 'http://localhost:8080',
      trustedOrigins: ['http://localhost:3000'],
      rateLimitMax: 1000,
      logger: false,
    })
    await app.register(profileImageRoutes, { prefix: '/usuarios' })
    await app.ready()
  })

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'sisgfpa-profile-image-route-'))
    process.env.PROFILE_IMAGE_STORAGE_DIR = storageDir
    testState.users.clear()
    testState.users.set('user-a', {
      id: 'user-a',
      name: 'Ana Funcionária',
      email: 'ana@example.test',
      role: 'FUNCIONARIO',
      image: null,
    })
    testState.users.set('user-b', {
      id: 'user-b',
      name: 'Bia Funcionária',
      email: 'bia@example.test',
      role: 'FUNCIONARIO',
      image: null,
    })
    testState.updateUser.mockReset().mockImplementation(async ({ headers, body }) => {
      const cookie = (headers as Record<string, string>).cookie
      const sessionId = /(?:^|;\s*)session=([^;]+)/.exec(cookie)?.[1]
      const user = sessionId ? testState.users.get(sessionId) : undefined
      if (!user) throw new Error('Sessão de teste inválida')
      user.image = body.image
      return { status: true }
    })
  })

  afterEach(async () => {
    delete process.env.PROFILE_IMAGE_STORAGE_DIR
    if (storageDir) await rm(storageDir, { recursive: true, force: true })
  })

  afterAll(async () => {
    await app?.close()
  })

  function inject(method: 'GET' | 'POST' | 'DELETE', url: string, session?: string, payload?: unknown) {
    return app.inject({
      method,
      url,
      headers: {
        host: 'localhost:8080',
        origin: 'http://localhost:3000',
        ...(session ? { cookie: `session=${session}` } : {}),
      },
      ...(payload === undefined ? {} : { payload }),
    })
  }

  it('exige sessão e só devolve a foto vinculada à conta autenticada', async () => {
    expect(
      (await inject('POST', '/usuarios/me/foto', undefined, { imageBase64: pngBase64 })).statusCode
    ).toBe(401)

    const uploaded = await inject('POST', '/usuarios/me/foto', 'user-a', { imageBase64: pngBase64 })
    expect(uploaded.statusCode).toBe(200)
    const { image } = uploaded.json() as { image: string }
    expect(image).toMatch(/^\/usuarios\/me\/foto\/[0-9a-f-]+\.png$/)

    const ownPhoto = await inject('GET', image, 'user-a')
    expect(ownPhoto.statusCode).toBe(200)
    expect(ownPhoto.headers['content-type']).toContain('image/png')
    expect(Buffer.from(ownPhoto.rawPayload).toString('base64')).toBe(pngBase64)
    expect((await inject('GET', image, 'user-b')).statusCode).toBe(404)
  })

  it('rejeita SVG e remove a foto persistida da própria conta', async () => {
    const invalid = await inject('POST', '/usuarios/me/foto', 'user-a', {
      imageBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),
    })
    expect(invalid.statusCode).toBe(400)

    const uploaded = await inject('POST', '/usuarios/me/foto', 'user-a', { imageBase64: pngBase64 })
    const { image } = uploaded.json() as { image: string }
    const removed = await inject('DELETE', '/usuarios/me/foto', 'user-a')
    expect(removed.statusCode).toBe(200)
    expect(removed.json()).toEqual({ image: null })
    expect((await inject('GET', image, 'user-a')).statusCode).toBe(404)
  })

  it('documenta os endpoints de upload, consulta e remoção da própria foto', async () => {
    const spec = app.swagger()
    const upload = spec.paths['/usuarios/me/foto']?.post
    expect(upload).toBeDefined()
    expect(spec.paths['/usuarios/me/foto']?.delete).toBeDefined()
    expect(upload?.requestBody?.content?.['application/json']?.schema?.example?.imageBase64).toBe(pngBase64)
    const image = spec.paths['/usuarios/me/foto/{arquivo}']?.get
    expect(image).toBeDefined()
    expect(
      image?.parameters?.find((parameter: { name: string }) => parameter.name === 'arquivo')?.schema?.example
    ).toBe('9a82f177-bf5e-4a3d-a8f8-4e463a31bb8c.png')
  })
})
