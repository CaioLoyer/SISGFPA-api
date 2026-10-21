CREATE TYPE "PapelContato" AS ENUM ('CLIENTE', 'FORNECEDOR');
CREATE TYPE "TipoPessoaContato" AS ENUM ('FISICA', 'JURIDICA');

CREATE TABLE "contato" (
    "id" TEXT NOT NULL,
    "codigo" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoaContato" NOT NULL,
    "papeis" "PapelContato"[] NOT NULL,
    "telefone" TEXT NOT NULL,
    "cidade" TEXT,
    "uf" CHAR(2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "contato_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contato_papeis_not_empty" CHECK (cardinality("papeis") > 0),
    CONSTRAINT "contato_documento_tipo_check" CHECK (
        ("tipoPessoa" = 'FISICA' AND length("documento") = 11)
        OR ("tipoPessoa" = 'JURIDICA' AND length("documento") = 14)
    )
);

CREATE UNIQUE INDEX "contato_documento_key" ON "contato"("documento");
CREATE UNIQUE INDEX "contato_codigo_key" ON "contato"("codigo");
CREATE INDEX "contato_nome_idx" ON "contato"("nome");
CREATE INDEX "contato_ativo_idx" ON "contato"("ativo");

ALTER TABLE "despesa" ADD COLUMN "fornecedorContatoId" TEXT;
ALTER TABLE "recebimento" ADD COLUMN "clienteContatoId" TEXT;

CREATE INDEX "despesa_fornecedorContatoId_idx" ON "despesa"("fornecedorContatoId");
CREATE INDEX "recebimento_clienteContatoId_idx" ON "recebimento"("clienteContatoId");

ALTER TABLE "despesa"
ADD CONSTRAINT "despesa_fornecedorContatoId_fkey"
FOREIGN KEY ("fornecedorContatoId") REFERENCES "contato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recebimento"
ADD CONSTRAINT "recebimento_clienteContatoId_fkey"
FOREIGN KEY ("clienteContatoId") REFERENCES "contato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
