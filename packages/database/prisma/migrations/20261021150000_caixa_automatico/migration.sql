CREATE TYPE "TipoMovimentacaoCaixa" AS ENUM ('ENTRADA', 'SAIDA');
CREATE TYPE "OrigemMovimentacaoCaixa" AS ENUM ('LIQUIDACAO', 'ESTORNO');

CREATE TABLE "caixa" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL DEFAULT 'PRINCIPAL',
    "saldoInicial" DECIMAL(12,2) NOT NULL,
    "iniciadoEm" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "caixa_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "caixa_saldoInicial_nonnegative" CHECK ("saldoInicial" >= 0)
);

CREATE TABLE "caixa_movimentacao" (
    "id" TEXT NOT NULL,
    "caixaId" TEXT NOT NULL,
    "tipo" "TipoMovimentacaoCaixa" NOT NULL,
    "origem" "OrigemMovimentacaoCaixa" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "data" TIMESTAMPTZ NOT NULL,
    "descricao" TEXT NOT NULL,
    "despesaPagamentoId" TEXT,
    "recebimentoBaixaId" TEXT,
    "estornoDeId" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caixa_movimentacao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "caixa_movimentacao_valor_positive" CHECK ("valor" > 0),
    CONSTRAINT "caixa_movimentacao_origem_check" CHECK (
      ("origem" = 'LIQUIDACAO' AND (("despesaPagamentoId" IS NOT NULL) <> ("recebimentoBaixaId" IS NOT NULL)) AND "estornoDeId" IS NULL)
      OR
      ("origem" = 'ESTORNO' AND "despesaPagamentoId" IS NULL AND "recebimentoBaixaId" IS NULL AND "estornoDeId" IS NOT NULL)
    ),
    CONSTRAINT "caixa_movimentacao_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "caixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "caixa_movimentacao_despesaPagamentoId_fkey" FOREIGN KEY ("despesaPagamentoId") REFERENCES "despesa_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "caixa_movimentacao_recebimentoBaixaId_fkey" FOREIGN KEY ("recebimentoBaixaId") REFERENCES "recebimento_baixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "caixa_movimentacao_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "caixa_movimentacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "caixa_movimentacao_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "caixa_codigo_key" ON "caixa"("codigo");
CREATE UNIQUE INDEX "caixa_movimentacao_despesaPagamentoId_key" ON "caixa_movimentacao"("despesaPagamentoId");
CREATE UNIQUE INDEX "caixa_movimentacao_recebimentoBaixaId_key" ON "caixa_movimentacao"("recebimentoBaixaId");
CREATE INDEX "caixa_movimentacao_caixaId_data_idx" ON "caixa_movimentacao"("caixaId", "data");
CREATE INDEX "caixa_movimentacao_estornoDeId_idx" ON "caixa_movimentacao"("estornoDeId");
