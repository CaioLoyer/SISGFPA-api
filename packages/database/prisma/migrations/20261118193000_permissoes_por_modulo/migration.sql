ALTER TABLE "funcionario_permissao"
  ADD COLUMN "comercial" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "relatorios" BOOLEAN NOT NULL DEFAULT false;

-- Preserva o acesso comercial efetivo anterior, sem conceder relatórios automaticamente.
-- Despesas e recebimentos, assim como o histórico de decisões anterior, não são alterados.
UPDATE "funcionario_permissao" SET "comercial" = ("despesas" OR "recebimentos");
