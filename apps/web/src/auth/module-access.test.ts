import { describe, expect, it } from 'vitest'
import { effectivePermissions } from '@sisgfpa/types'
import { canAccessPath } from './module-access'

describe('acesso direto aos módulos', () => {
  it('usa as mesmas permissões no menu e na URL', () => {
    const permissions = effectivePermissions('FUNCIONARIO', {
      comercial: false,
      despesas: false,
      recebimentos: true,
      relatorios: true,
    })
    expect(canAccessPath('/comercial', permissions)).toBe(false)
    expect(canAccessPath('/despesas?status=PENDENTE', permissions)).toBe(false)
    expect(canAccessPath('/despesas/editar', permissions)).toBe(false)
    expect(canAccessPath('/recebimentos', permissions)).toBe(true)
    expect(canAccessPath('/relatorios', permissions)).toBe(true)
    expect(canAccessPath('/caixa', permissions)).toBe(false)
    expect(canAccessPath('/admin', permissions)).toBe(false)
    expect(canAccessPath('/perfil', permissions)).toBe(true)
    expect(canAccessPath('/relatorios', null)).toBe(false)
  })
})
