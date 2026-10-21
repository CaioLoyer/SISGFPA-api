import { describe, expect, it } from 'vitest'

import { decideProtectedRoute, safeReturnPath } from './protected-route'

describe('decisão de acesso às rotas protegidas', () => {
  it('aguarda a restauração antes de mostrar conteúdo privado', () => {
    expect(decideProtectedRoute('loading', '/')).toEqual({ kind: 'loading' })
  })

  it('envia usuário sem sessão ao login e preserva o endereço pretendido', () => {
    expect(decideProtectedRoute('anonymous', '/financeiro/titulos?status=PENDENTE')).toEqual({
      kind: 'redirect',
      to: '/login?returnTo=%2Ffinanceiro%2Ftitulos%3Fstatus%3DPENDENTE',
    })
  })

  it('permite a área privada depois de autenticar', () => {
    expect(decideProtectedRoute('authenticated', '/')).toEqual({ kind: 'allow' })
  })

  it('não redireciona para URLs externas após o login', () => {
    expect(safeReturnPath('//malicioso.example')).toBe('/')
    expect(safeReturnPath('https://malicioso.example')).toBe('/')
    expect(safeReturnPath('/financeiro')).toBe('/financeiro')
  })
})
