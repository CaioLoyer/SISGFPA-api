import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { auth, fromNodeHeaders } from '@sisgfpa/auth'
import { BusinessRuleError } from '@sisgfpa/http'
import { PROFILE_IMAGE_MAX_BASE64_LENGTH, PROFILE_IMAGE_MAX_BYTES } from '@sisgfpa/validation'
import type { FastifyRequest } from 'fastify'

import { getProfileImageStorageDirectory } from '../../config/env.js'

export const MAX_PROFILE_IMAGE_BYTES = PROFILE_IMAGE_MAX_BYTES
export const MAX_PROFILE_IMAGE_BASE64_LENGTH = PROFILE_IMAGE_MAX_BASE64_LENGTH
export const MAX_PROFILE_IMAGE_DIMENSION = 4096
export const MAX_PROFILE_IMAGE_PIXELS = MAX_PROFILE_IMAGE_DIMENSION ** 2

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const managedImagePattern = /^\/usuarios\/me\/foto\/([0-9a-f-]{36})\.(jpg|png|webp)$/
const jpegFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

interface ValidatedImage {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
  extension: 'jpg' | 'png' | 'webp'
  width: number
  height: number
}

export interface StoredProfileImage {
  contentType: ValidatedImage['contentType']
  bytes: Buffer
}

function invalidImage(): BusinessRuleError {
  return new BusinessRuleError(
    'PROFILE_IMAGE_INVALID',
    'Envie uma imagem JPEG, PNG ou WebP válida, de até 2 MB e no máximo 4096 px por lado.'
  )
}

function validateDimensions(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_PROFILE_IMAGE_DIMENSION &&
    height <= MAX_PROFILE_IMAGE_DIMENSION &&
    width * height <= MAX_PROFILE_IMAGE_PIXELS
  )
}

function parsePng(bytes: Buffer): ValidatedImage | null {
  if (bytes.length < 57 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null

  let offset = PNG_SIGNATURE.length
  let width = 0
  let height = 0
  let hasHeader = false
  let hasImageData = false
  while (offset + 12 <= bytes.length) {
    const chunkLength = bytes.readUInt32BE(offset)
    const chunkType = bytes.toString('ascii', offset + 4, offset + 8)
    const nextOffset = offset + 12 + chunkLength
    if (nextOffset > bytes.length) return null

    if (!hasHeader) {
      if (chunkType !== 'IHDR' || chunkLength !== 13) return null
      width = bytes.readUInt32BE(offset + 8)
      height = bytes.readUInt32BE(offset + 12)
      hasHeader = true
    } else if (chunkType === 'IHDR') {
      return null
    }

    if (chunkType === 'IDAT' && chunkLength > 0) hasImageData = true
    if (chunkType === 'IEND') {
      return chunkLength === 0 &&
        nextOffset === bytes.length &&
        hasImageData &&
        validateDimensions(width, height)
        ? { contentType: 'image/png', extension: 'png', width, height }
        : null
    }
    offset = nextOffset
  }
  return null
}

function parseJpeg(bytes: Buffer): ValidatedImage | null {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null

  let offset = 2
  let width = 0
  let height = 0
  while (offset + 4 < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return null
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === undefined || marker === 0x00) return null
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) return null

    const segmentLength = bytes.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null
    if (jpegFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null
      if (width !== 0 || height !== 0) return null
      height = bytes.readUInt16BE(offset + 3)
      width = bytes.readUInt16BE(offset + 5)
    }
    if (marker === 0xda) {
      const scanDataStart = offset + segmentLength
      return validateDimensions(width, height) && scanDataStart < bytes.length - 2
        ? { contentType: 'image/jpeg', extension: 'jpg', width, height }
        : null
    }
    offset += segmentLength
  }
  return null
}

function parseWebp(bytes: Buffer): ValidatedImage | null {
  if (
    bytes.length < 30 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP' ||
    bytes.readUInt32LE(4) + 8 !== bytes.length
  )
    return null

  let offset = 12
  let width = 0
  let height = 0
  let hasImagePayload = false
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString('ascii', offset, offset + 4)
    const chunkLength = bytes.readUInt32LE(offset + 4)
    const dataOffset = offset + 8
    if (dataOffset + chunkLength > bytes.length) return null

    if (chunkType === 'VP8X' && chunkLength >= 10) {
      if (width !== 0 || height !== 0) return null
      width = 1 + bytes.readUIntLE(dataOffset + 4, 3)
      height = 1 + bytes.readUIntLE(dataOffset + 7, 3)
    } else if (chunkType === 'VP8L' && chunkLength >= 5 && bytes[dataOffset] === 0x2f) {
      const b1 = bytes[dataOffset + 1]!
      const b2 = bytes[dataOffset + 2]!
      const b3 = bytes[dataOffset + 3]!
      const b4 = bytes[dataOffset + 4]!
      width ||= 1 + b1 + ((b2 & 0x3f) << 8)
      height ||= 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10)
      hasImagePayload = true
    } else if (
      chunkType === 'VP8 ' &&
      chunkLength >= 10 &&
      bytes[dataOffset + 3] === 0x9d &&
      bytes[dataOffset + 4] === 0x01 &&
      bytes[dataOffset + 5] === 0x2a
    ) {
      width ||= bytes.readUInt16LE(dataOffset + 6) & 0x3fff
      height ||= bytes.readUInt16LE(dataOffset + 8) & 0x3fff
      hasImagePayload = true
    }

    offset = dataOffset + chunkLength + (chunkLength % 2)
  }
  return hasImagePayload && validateDimensions(width, height)
    ? { contentType: 'image/webp', extension: 'webp', width, height }
    : null
}

function validateImage(bytes: Buffer): ValidatedImage {
  const image = parsePng(bytes) ?? parseJpeg(bytes) ?? parseWebp(bytes)
  if (!image) throw invalidImage()
  return image
}

function decodeImage(encoded: string): Buffer {
  if (
    encoded.length === 0 ||
    encoded.length > MAX_PROFILE_IMAGE_BASE64_LENGTH ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    throw invalidImage()

  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length === 0 || bytes.length > MAX_PROFILE_IMAGE_BYTES || bytes.toString('base64') !== encoded)
    throw invalidImage()
  return bytes
}

function storageDirectory(): string {
  return getProfileImageStorageDirectory()
}

function userFilePrefix(userId: string): string {
  return createHash('sha256').update(userId).digest('hex')
}

function imageFilePath(
  userId: string,
  imageUrl: string
): { path: string; contentType: StoredProfileImage['contentType'] } | null {
  const match = managedImagePattern.exec(imageUrl)
  if (!match) return null
  const [, fileId, extension] = match
  const contentType = extension === 'jpg' ? 'image/jpeg' : extension === 'png' ? 'image/png' : 'image/webp'
  return { path: join(storageDirectory(), `${userFilePrefix(userId)}-${fileId}.${extension}`), contentType }
}

async function removeStoredImage(userId: string, imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return
  const image = imageFilePath(userId, imageUrl)
  if (image) await rm(image.path, { force: true })
}

export async function saveOwnProfileImage(
  userId: string,
  encodedImage: string,
  headers: FastifyRequest['headers'],
  previousImage?: string | null
): Promise<{ image: string }> {
  const bytes = decodeImage(encodedImage)
  const metadata = validateImage(bytes)
  const fileId = randomUUID()
  const imageUrl = `/usuarios/me/foto/${fileId}.${metadata.extension}`
  const directory = storageDirectory()
  const filePath = join(directory, `${userFilePrefix(userId)}-${fileId}.${metadata.extension}`)

  await mkdir(directory, { recursive: true, mode: 0o750 })
  await writeFile(filePath, bytes, { flag: 'wx', mode: 0o640 })
  try {
    await auth.api.updateUser({ headers: fromNodeHeaders(headers), body: { image: imageUrl } })
  } catch (error) {
    await rm(filePath, { force: true })
    throw error
  }
  await removeStoredImage(userId, previousImage)
  return { image: imageUrl }
}

export async function removeOwnProfileImage(
  userId: string,
  headers: FastifyRequest['headers'],
  previousImage?: string | null
): Promise<{ image: null }> {
  await auth.api.updateUser({ headers: fromNodeHeaders(headers), body: { image: null } })
  await removeStoredImage(userId, previousImage)
  return { image: null }
}

export async function readOwnProfileImage(
  userId: string,
  imageUrl: string | null | undefined
): Promise<StoredProfileImage | null> {
  if (!imageUrl) return null
  const storedImage = imageFilePath(userId, imageUrl)
  if (!storedImage) return null
  try {
    return { contentType: storedImage.contentType, bytes: await readFile(storedImage.path) }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}
