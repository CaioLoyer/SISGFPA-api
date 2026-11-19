import { describe, expect, it } from 'vitest'

import { gerarTituloAutomatico } from './chat-title.js'

describe('geração automática do título da conversa', () => {
  it('usa a primeira mensagem útil e remove a saudação inicial', () => {
    expect(gerarTituloAutomatico('Nova conversa', 'Bom dia, compramos cadernos por R$ 250.')).toBe(
      'Compramos cadernos por R$ 250'
    )
  })

  it('mantém a conversa sem título automático para saudações e escolhas curtas', () => {
    expect(gerarTituloAutomatico('Nova conversa', 'Olá, tudo bem?')).toBeNull()
    expect(gerarTituloAutomatico('Chat financeiro', '2')).toBeNull()
    expect(gerarTituloAutomatico('Nova conversa', 'novo')).toBeNull()
  })

  it('não altera um título personalizado', () => {
    expect(gerarTituloAutomatico('Despesas de outubro', 'Compramos cadernos por R$ 250')).toBeNull()
  })

  it('substitui apenas placeholders e limita o título sem cortar caracteres Unicode', () => {
    expect(gerarTituloAutomatico('Chat financeiro', '🙂'.repeat(60))).toBe(`${'🙂'.repeat(47)}…`)
    expect(gerarTituloAutomatico('minha conversa', '🙂 operação útil')).toBeNull()
  })
})
