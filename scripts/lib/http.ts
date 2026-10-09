import { API } from './servers.js'

// Respostas JSON dos testes são inspecionadas campo a campo; tipá-las aqui seria repetir os DTOs.
export type Json = Record<string, any>

export interface Session {
  cookie: string
}

/** Requisição HTTP de teste, com o cookie de sessão opcional. */
export async function http(
  base: string,
  session: Session | null,
  method: string,
  path: string,
  body?: unknown
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin: API, // exigido pelo Better Auth nas rotas /api/auth
      ...(session ? { cookie: session.cookie } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: Json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    // resposta não-JSON (ex.: CSV): use `text`
  }
  return { status: res.status, body: json, text, headers: res.headers, setCookie: res.headers.getSetCookie() }
}

export const cookieDe = (setCookie: string[]) => setCookie.map((c) => c.split(';')[0]).join('; ')
