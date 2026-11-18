ALTER TABLE "caixa_movimentacao"
ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "caixa_movimentacao"
DROP CONSTRAINT "caixa_movimentacao_origem_check";

ALTER TABLE "caixa_movimentacao"
ADD CONSTRAINT "caixa_movimentacao_origem_check" CHECK (
  ("origem" = 'LIQUIDACAO' AND (("despesaPagamentoId" IS NOT NULL) <> ("recebimentoBaixaId" IS NOT NULL)) AND "estornoDeId" IS NULL)
  OR
  ("origem" = 'ESTORNO' AND "despesaPagamentoId" IS NULL AND "recebimentoBaixaId" IS NULL AND "estornoDeId" IS NOT NULL)
  OR
  ("origem" = 'AVULSA' AND "despesaPagamentoId" IS NULL AND "recebimentoBaixaId" IS NULL AND "estornoDeId" IS NULL AND "idempotencyKey" IS NOT NULL)
);

CREATE UNIQUE INDEX "caixa_movimentacao_caixaId_idempotencyKey_key"
ON "caixa_movimentacao"("caixaId", "idempotencyKey");
