import { describe, expect, it } from 'vitest'

import { getChatbotTopics } from './chatbot-topics'

describe('tópicos do assistente guiado', () => {
  it('encaminha ADMIN para módulos operacionais e administrativos', () => {
    expect(getChatbotTopics('ADMIN').map((topic) => topic.to)).toEqual([
      '/comercial',
      '/despesas',
      '/recebimentos',
      '/caixa',
      '/relatorios',
      '/admin',
      '/perfil',
    ])
  })

  it('não oferece módulos administrativos para FUNCIONARIO', () => {
    const topics = getChatbotTopics('FUNCIONARIO')

    expect(topics.map((topic) => topic.to)).toEqual(['/comercial', '/despesas', '/recebimentos', '/perfil'])
    expect(topics.some((topic) => topic.adminOnly)).toBe(false)
  })
})
