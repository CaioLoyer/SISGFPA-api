import { BusinessRuleError } from '@sisgfpa/http'

/** O corpo mantém compatibilidade; o cabeçalho usa o mesmo mecanismo transacional. */
export function chaveLiquidacao(corpo?: string, cabecalho?: string) {
  if (corpo && cabecalho && corpo !== cabecalho) {
    throw new BusinessRuleError(
      'IDEMPOTENCY_KEY_DIVERGENTE',
      'A chave do cabeçalho deve ser igual à chave do corpo'
    )
  }
  return corpo ?? cabecalho
}
