/**
 * Erro com status HTTP e código estável. Qualquer erro de domínio estende esta classe:
 * o tratador central (error-handler.ts) o converte em `{ error, code }` sem try/catch nas rotas.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super(404, 'NOT_FOUND', message)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') {
    super(401, 'UNAUTHORIZED', message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Você não tem permissão para realizar esta ação') {
    super(403, 'FORBIDDEN', message)
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message)
  }
}

/** Violação de regra de negócio ou dado inválido (400). */
export class BusinessRuleError extends AppError {
  constructor(code: string, message: string) {
    super(400, code, message)
  }
}
