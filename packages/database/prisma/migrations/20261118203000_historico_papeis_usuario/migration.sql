CREATE TABLE "usuario_papel_historico" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "alteradoPorId" TEXT NOT NULL,
    "papelAnterior" "Role" NOT NULL,
    "papelNovo" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_papel_historico_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usuario_papel_historico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "usuario_papel_historico_alteradoPorId_fkey" FOREIGN KEY ("alteradoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "usuario_papel_historico_usuarioId_createdAt_idx" ON "usuario_papel_historico"("usuarioId", "createdAt");
CREATE INDEX "usuario_papel_historico_alteradoPorId_createdAt_idx" ON "usuario_papel_historico"("alteradoPorId", "createdAt");
