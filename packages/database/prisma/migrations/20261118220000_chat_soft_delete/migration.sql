ALTER TABLE "chat"
ADD COLUMN "deletedAt" TIMESTAMPTZ;

ALTER TYPE "MensagemStatus" ADD VALUE 'PROCESSANDO';

CREATE INDEX "chat_userId_deletedAt_updatedAt_idx"
ON "chat"("userId", "deletedAt", "updatedAt");
