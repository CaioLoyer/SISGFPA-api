import { effectivePermissions } from '@sisgfpa/types'
import { describe, expect, it } from 'vitest'

import { getChatbotTopics } from './chatbot-topics'

describe('tópicos do assistente guiado', () => {
  it('encaminha ADMIN para módulos operacionais e administrativos', () => {
    expect(getChatbotTopics(effectivePermissions('ADMIN')).map((topic) => topic.to)).toEqual([
      '/comercial',
      '/despesas',
      '/recebimentos',
      '/caixa',
      '/relatorios',
      '/admin',
      '/perfil',
    ])
  })

  it('respeita revogação e relatórios limitados ao módulo permitido', () => {
    const topics = getChatbotTopics(
      effectivePermissions('FUNCIONARIO', {
        comercial: false,
        despesas: false,
        recebimentos: true,
        relatorios: true,
      })
    )
    expect(topics.map((topic) => topic.to)).toEqual(['/recebimentos', '/relatorios', '/perfil'])
    expect(getChatbotTopics(null).map((topic) => topic.to)).toEqual(['/perfil'])
  })

  it('não oferece módulos administrativos para FUNCIONARIO', () => {
    const topics = getChatbotTopics(effectivePermissions('FUNCIONARIO'))

    expect(topics.map((topic) => topic.to)).toEqual(['/comercial', '/despesas', '/recebimentos', '/perfil'])
    expect(topics.some((topic) => topic.adminOnly)).toBe(false)
  })
})
