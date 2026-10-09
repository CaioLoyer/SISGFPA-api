-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'FUNCIONARIO');

-- CreateEnum
CREATE TYPE "StatusTitulo" AS ENUM ('PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoCategoria" AS ENUM ('DESPESA', 'RECEBIMENTO');

-- CreateEnum
CREATE TYPE "MensagemPapel" AS ENUM ('USUARIO', 'ASSISTENTE');

-- CreateEnum
CREATE TYPE "MensagemStatus" AS ENUM ('INFORMACAO_INSUFICIENTE', 'PENDENTE_CONFIRMACAO', 'EXECUTADA', 'CANCELADA', 'ERRO', 'INFORMATIVA');

-- CreateEnum
CREATE TYPE "MensagemIntencao" AS ENUM ('CRIAR_DESPESA', 'CRIAR_RECEBIMENTO', 'REGISTRAR_PAGAMENTO', 'REGISTRAR_BAIXA', 'CANCELAR_DESPESA', 'CANCELAR_RECEBIMENTO', 'DESCONHECIDA');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'FUNCIONARIO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCategoria" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despesa" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "valorPago" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dataLancamento" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataVencimento" DATE NOT NULL,
    "numeroParcelas" INTEGER NOT NULL DEFAULT 1,
    "observacoes" TEXT,
    "status" "StatusTitulo" NOT NULL DEFAULT 'PENDENTE',
    "categoriaId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "despesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despesa_parcela" (
    "id" TEXT NOT NULL,
    "despesaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "valorPago" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dataVencimento" DATE NOT NULL,
    "status" "StatusTitulo" NOT NULL DEFAULT 'PENDENTE',

    CONSTRAINT "despesa_parcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despesa_pagamento" (
    "id" TEXT NOT NULL,
    "despesaId" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "pagoEm" TIMESTAMPTZ NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "despesa_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despesa_historico" (
    "id" TEXT NOT NULL,
    "despesaId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "statusAnterior" "StatusTitulo",
    "statusNovo" "StatusTitulo",
    "detalhes" TEXT,
    "alteradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "despesa_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebimento" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "valorRecebido" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dataLancamento" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataVencimento" DATE NOT NULL,
    "numeroParcelas" INTEGER NOT NULL DEFAULT 1,
    "observacoes" TEXT,
    "status" "StatusTitulo" NOT NULL DEFAULT 'PENDENTE',
    "categoriaId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recebimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebimento_parcela" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "valorRecebido" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dataVencimento" DATE NOT NULL,
    "status" "StatusTitulo" NOT NULL DEFAULT 'PENDENTE',

    CONSTRAINT "recebimento_parcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebimento_baixa" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "recebidoEm" TIMESTAMPTZ NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recebimento_baixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebimento_historico" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "statusAnterior" "StatusTitulo",
    "statusNovo" "StatusTitulo",
    "detalhes" TEXT,
    "alteradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recebimento_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "papel" "MensagemPapel" NOT NULL DEFAULT 'USUARIO',
    "content" TEXT NOT NULL,
    "intent" "MensagemIntencao",
    "status" "MensagemStatus" NOT NULL DEFAULT 'INFORMATIVA',
    "parsedData" JSONB,
    "resultado" JSONB,
    "despesaId" TEXT,
    "recebimentoId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nome_tipo_key" ON "categoria"("nome", "tipo");

-- CreateIndex
CREATE INDEX "despesa_status_idx" ON "despesa"("status");

-- CreateIndex
CREATE INDEX "despesa_categoriaId_idx" ON "despesa"("categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "despesa_parcela_despesaId_numero_key" ON "despesa_parcela"("despesaId", "numero");

-- CreateIndex
CREATE INDEX "recebimento_status_idx" ON "recebimento"("status");

-- CreateIndex
CREATE INDEX "recebimento_categoriaId_idx" ON "recebimento"("categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "recebimento_parcela_recebimentoId_numero_key" ON "recebimento_parcela"("recebimentoId", "numero");

-- CreateIndex
CREATE INDEX "chat_userId_idx" ON "chat"("userId");

-- CreateIndex
CREATE INDEX "message_chatId_idx" ON "message"("chatId");

-- CreateIndex
CREATE INDEX "message_userId_idx" ON "message"("userId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesa" ADD CONSTRAINT "despesa_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesa" ADD CONSTRAINT "despesa_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesa_parcela" ADD CONSTRAINT "despesa_parcela_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "despesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesa_pagamento" ADD CONSTRAINT "despesa_pagamento_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "despesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesa_pagamento" ADD CONSTRAINT "despesa_pagamento_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesa_historico" ADD CONSTRAINT "despesa_historico_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "despesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesa_historico" ADD CONSTRAINT "despesa_historico_alteradoPorId_fkey" FOREIGN KEY ("alteradoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento" ADD CONSTRAINT "recebimento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento" ADD CONSTRAINT "recebimento_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento_parcela" ADD CONSTRAINT "recebimento_parcela_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "recebimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento_baixa" ADD CONSTRAINT "recebimento_baixa_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "recebimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento_baixa" ADD CONSTRAINT "recebimento_baixa_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento_historico" ADD CONSTRAINT "recebimento_historico_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "recebimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimento_historico" ADD CONSTRAINT "recebimento_historico_alteradoPorId_fkey" FOREIGN KEY ("alteradoPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat" ADD CONSTRAINT "chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "despesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "recebimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
