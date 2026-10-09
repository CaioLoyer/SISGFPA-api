import { INTENCOES_CHAT, ROLES, STATUS_TITULO, TIPOS_CATEGORIA } from '@sisgfpa/types'
import { describe, expect, it } from 'vitest'

import { MensagemIntencao, Role, StatusTitulo, TipoCategoria } from './generated/prisma/enums.js'

// `@sisgfpa/types` repete estes valores para uso sem Prisma (ex.: futuro frontend).
// Este teste garante que as duas listas nunca divergem.
describe('enums do Prisma x constantes de @sisgfpa/types', () => {
  it.each([
    ['Role', Object.values(Role), ROLES],
    ['StatusTitulo', Object.values(StatusTitulo), STATUS_TITULO],
    ['TipoCategoria', Object.values(TipoCategoria), TIPOS_CATEGORIA],
    ['MensagemIntencao', Object.values(MensagemIntencao), INTENCOES_CHAT],
  ])('%s', (_nome, prisma, tipos) => {
    expect([...prisma].sort()).toEqual([...tipos].sort())
  })
})
