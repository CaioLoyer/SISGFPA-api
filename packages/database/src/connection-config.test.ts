import { describe, expect, it } from 'vitest'
import { connectionStringWithUtc } from './connection-config.js'

describe('fuso da conexão PostgreSQL', () => {
  it('força UTC e preserva as demais opções de conexão', () => {
    const url = new URL(
      connectionStringWithUtc(
        'postgresql://usuario:senha@localhost/teste?sslmode=prefer&options=-c%20statement_timeout%3D5000'
      )
    )
    expect(url.searchParams.get('options')).toBe('-c statement_timeout=5000 -c timezone=UTC')
    expect(url.searchParams.get('sslmode')).toBe('prefer')
    expect(url.pathname).toBe('/teste')
  })
  it('substitui um fuso de sessão explícito pela última opção UTC', () => {
    const url = new URL(
      connectionStringWithUtc('postgresql://localhost/teste?options=-c%20timezone%3DAmerica%2FCampo_Grande')
    )
    expect(url.searchParams.get('options')).toBe('-c timezone=America/Campo_Grande -c timezone=UTC')
  })
})
