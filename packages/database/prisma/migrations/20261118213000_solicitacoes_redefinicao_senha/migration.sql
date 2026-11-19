CREATE TYPE "StatusSolicitacaoRedefinicaoSenha" AS ENUM (
  'PENDENTE',
  'APROVADA',
  'RECUSADA',
  'CONSUMIDA',
  'EXPIRADA'
);

CREATE TABLE "password_reset_request" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "requesterSessionId" TEXT NOT NULL,
  "status" "StatusSolicitacaoRedefinicaoSenha" NOT NULL DEFAULT 'PENDENTE',
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "consumedAt" TIMESTAMPTZ,

  CONSTRAINT "password_reset_request_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_request_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "password_reset_request_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "password_reset_request_status_requestedAt_idx"
  ON "password_reset_request"("status", "requestedAt");
CREATE INDEX "password_reset_request_requesterId_requestedAt_idx"
  ON "password_reset_request"("requesterId", "requestedAt");
CREATE INDEX "password_reset_request_decidedById_decidedAt_idx"
  ON "password_reset_request"("decidedById", "decidedAt");
