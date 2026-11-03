ALTER TABLE "despesa_pagamento"
ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "recebimento_baixa"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "despesa_pagamento_despesaId_idempotencyKey_key"
ON "despesa_pagamento"("despesaId", "idempotencyKey");

CREATE UNIQUE INDEX "recebimento_baixa_recebimentoId_idempotencyKey_key"
ON "recebimento_baixa"("recebimentoId", "idempotencyKey");
