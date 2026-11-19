import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({ updateUser: vi.fn() }))

vi.mock('@sisgfpa/auth', () => ({
  auth: { api: { updateUser: testState.updateUser } },
  fromNodeHeaders: (headers: unknown) => headers,
}))

import { readOwnProfileImage, removeOwnProfileImage, saveOwnProfileImage } from './profile-image.service.js'

const onePixelPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXJkAAAAASUVORK5CYII='

describe('foto do próprio perfil', () => {
  let storageDir: string

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'sisgfpa-profile-image-'))
    process.env.PROFILE_IMAGE_STORAGE_DIR = storageDir
    testState.updateUser.mockReset().mockResolvedValue({ status: true })
  })

  afterEach(async () => {
    delete process.env.PROFILE_IMAGE_STORAGE_DIR
    await rm(storageDir, { recursive: true, force: true })
  })

  it('persiste uma imagem PNG validada e grava sua URL no perfil Better Auth do usuário', async () => {
    const result = await saveOwnProfileImage('user-123', onePixelPng, {})

    expect(result.image).toMatch(/^\/usuarios\/me\/foto\/[0-9a-f-]+\.png$/)
    expect(testState.updateUser).toHaveBeenCalledWith({
      headers: {},
      body: { image: result.image },
    })
    const storedImage = await readOwnProfileImage('user-123', result.image)
    expect(storedImage?.contentType).toBe('image/png')
    expect(storedImage?.bytes.toString('base64')).toBe(onePixelPng)
  })

  it('rejeita conteúdo que não seja imagem suportada', async () => {
    await expect(
      saveOwnProfileImage('user-123', Buffer.from('<svg/>').toString('base64'), {})
    ).rejects.toMatchObject({
      code: 'PROFILE_IMAGE_INVALID',
      statusCode: 400,
    })
    expect(testState.updateUser).not.toHaveBeenCalled()
  })

  it('rejeita arquivos maiores que 2 MB e imagens acima do limite de dimensões', async () => {
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')
    await expect(saveOwnProfileImage('user-123', oversized, {})).rejects.toMatchObject({
      code: 'PROFILE_IMAGE_INVALID',
    })

    const oversizedDimensions = Buffer.from(onePixelPng, 'base64')
    oversizedDimensions.writeUInt32BE(5000, 16)
    await expect(
      saveOwnProfileImage('user-123', oversizedDimensions.toString('base64'), {})
    ).rejects.toMatchObject({ code: 'PROFILE_IMAGE_INVALID' })
    expect(testState.updateUser).not.toHaveBeenCalled()
  })

  it('reconhece cabeçalhos JPEG e WebP e escolhe o tipo servido pelo servidor', async () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11,
      0x00, 0x03, 0x11, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xff, 0xd9,
    ])
    const jpegImage = await saveOwnProfileImage('user-123', jpeg.toString('base64'), {})
    expect((await readOwnProfileImage('user-123', jpegImage.image))?.contentType).toBe('image/jpeg')

    const webp = Buffer.alloc(44)
    webp.write('RIFF', 0)
    webp.writeUInt32LE(36, 4)
    webp.write('WEBP', 8)
    webp.write('VP8X', 12)
    webp.writeUInt32LE(10, 16)
    webp.write('VP8L', 30)
    webp.writeUInt32LE(5, 34)
    webp[38] = 0x2f
    const webpImage = await saveOwnProfileImage('user-456', webp.toString('base64'), {})
    expect((await readOwnProfileImage('user-456', webpImage.image))?.contentType).toBe('image/webp')
  })

  it('remove a foto persistida e limpa o campo image do Better Auth', async () => {
    const saved = await saveOwnProfileImage('user-123', onePixelPng, {})
    await removeOwnProfileImage('user-123', {}, saved.image)

    expect(testState.updateUser).toHaveBeenLastCalledWith({ headers: {}, body: { image: null } })
    expect(await readOwnProfileImage('user-123', saved.image)).toBeNull()
  })
})
