import { BusinessRuleError } from '@sisgfpa/http'

// Erros das regras financeiras. Todos viram HTTP 400 `{ error, code }` pelo tratador central.

export class TituloCanceladoError extends BusinessRuleError {
  constructor(message: string) {
    super('TITULO_CANCELADO', message)
  }
}

export class TituloJaLiquidadoError extends BusinessRuleError {
  constructor(message: string) {
    super('TITULO_JA_LIQUIDADO', message)
  }
}

export class ValorPagamentoInvalidoError extends BusinessRuleError {
  constructor(message: string) {
    super('VALOR_INVALIDO', message)
  }
}

export class CategoriaInvalidaError extends BusinessRuleError {
  constructor(message: string) {
    super('CATEGORIA_INVALIDA', message)
  }
}

export class TituloComPagamentoError extends BusinessRuleError {
  constructor(message: string) {
    super('TITULO_COM_PAGAMENTO', message)
  }
}
