CREATE TABLE "funcionario_permissao" (
    "funcionarioId" TEXT NOT NULL,
    "despesas" BOOLEAN NOT NULL DEFAULT true,
    "recebimentos" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "funcionario_permissao_pkey" PRIMARY KEY ("funcionarioId"),
    CONSTRAINT "funcionario_permissao_funcionarioId_fkey"
      FOREIGN KEY ("funcionarioId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "funcionario_permissao_historico" (
    "id" TEXT NOT NULL,
    "funcionarioId" TEXT NOT NULL,
    "alteradoPorId" TEXT NOT NULL,
    "permissoesAnteriores" JSONB NOT NULL,
    "permissoesNovas" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funcionario_permissao_historico_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "funcionario_permissao_historico_funcionarioId_fkey"
      FOREIGN KEY ("funcionarioId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "funcionario_permissao_historico_alteradoPorId_fkey"
      FOREIGN KEY ("alteradoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "funcionario_permissao_historico_funcionarioId_createdAt_idx"
    ON "funcionario_permissao_historico"("funcionarioId", "createdAt");
CREATE INDEX "funcionario_permissao_historico_alteradoPorId_createdAt_idx"
    ON "funcionario_permissao_historico"("alteradoPorId", "createdAt");
