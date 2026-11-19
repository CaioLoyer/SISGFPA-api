const TITULOS_AUTOMATICOS = new Set(['nova conversa', 'chat financeiro'])

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()
}

function removerSaudacao(texto: string) {
  return texto
    .replace(/^(?:oi|ol(?:a|á)|bom dia|boa tarde|boa noite|e a[ií])(?:[,!?.\s]+|$)/i, '')
    .replace(/^(?:tudo bem|tudo certo|como vai)(?:[,!?.\s]+|$)/i, '')
    .trim()
}

/** Gera um título curto somente para conversas ainda sem título personalizado. */
export function gerarTituloAutomatico(tituloAtual: string, primeiraMensagemUtil: string): string | null {
  if (!TITULOS_AUTOMATICOS.has(normalizar(tituloAtual))) return null

  const texto = removerSaudacao(primeiraMensagemUtil.replace(/\s+/g, ' ').trim())
    .replace(/^[,;:\s]+|[,;:\s]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim()
  const mensagemNormalizada = normalizar(texto)

  if (
    !texto ||
    /^(?:oi|ola|bom dia|boa tarde|boa noite|e ai|tudo bem|tudo certo|como vai|ajuda|menu|novo|\d+)$/i.test(
      mensagemNormalizada
    )
  ) {
    return null
  }

  const caracteres = Array.from(texto)
  const textoCapitalizado = `${caracteres[0]?.toLocaleUpperCase('pt-BR') ?? ''}${caracteres.slice(1).join('')}`
  const caracteresCapitalizados = Array.from(textoCapitalizado)
  if (caracteresCapitalizados.length <= 48) return textoCapitalizado
  return `${caracteresCapitalizados.slice(0, 47).join('').trimEnd()}…`
}
