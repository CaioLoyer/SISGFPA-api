import { ErrorSchema } from '@sisgfpa/validation'
import type { ZodType } from 'zod'

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 500 | 502

/**
 * Monta o `response` de uma rota: o(s) schema(s) de sucesso mais os erros possíveis,
 * todos no formato `{ error, code }`. Evita repetir `401: ErrorSchema, 500: ErrorSchema...` em cada rota.
 */
export function responses<S extends Record<number, ZodType>>(success: S, ...errors: ErrorStatus[]) {
  const withErrors: Record<number, ZodType> = { ...success }
  for (const status of [...errors, 500 as const]) withErrors[status] = ErrorSchema
  return withErrors as S & Record<ErrorStatus, typeof ErrorSchema>
}
