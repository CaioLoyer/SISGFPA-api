# SISGFPA — Sistema de Gerenciamento Financeiro para Papelarias

Monorepo pnpm com dois aplicativos que compartilham **um único domínio financeiro**, um banco e uma identidade de usuário.

```
sisgfpa/
├── apps/
│   ├── api/        Módulo Financeiro (Fastify) — autoridade do domínio: regras, validação, autorização
│   └── chatbot/    Interface conversacional (pt-BR): interpreta a mensagem e chama a API por HTTP
├── packages/
│   ├── http/       Base Fastify comum: createApp, erros, hooks de autenticação, env
│   ├── database/   Prisma + PostgreSQL: schema único, migrations e seed
│   ├── auth/       Better Auth (instância única) + resolução do usuário logado
│   ├── validation/ Schemas Zod compartilhados (contratos da API, com exemplos do Scalar)
│   └── types/      Constantes/tipos sem dependências (status, categorias, ids de exemplo)
├── scripts/        e2e, verify:docs, verify:arch, seed-demo (+ lib/ com helpers de teste)
└── docs/ARQUITETURA.md   Diagnóstico da revisão, decisões e pendências
```

> Detalhes da organização interna, decisões de projeto e regras de negócio em observação:
> [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

**Regra central: o Chatbot interpreta; o Módulo Financeiro decide e executa.**

```
Usuário → Chatbot (parser, intenção, categoria, confirmação) → HTTP → API Financeira → Prisma → PostgreSQL
```

O Chatbot só grava `Chat` e `Message` (com referência ao título criado). Parcelamento, pagamento, baixa, cancelamento e permissões ficam **somente** na API.

## Como rodar

Requisitos: Node 22+, pnpm 10, PostgreSQL.
git
```bash
pnpm install
# copie .env.example para apps/api/.env, apps/chatbot/.env e packages/database/.env
cp .env.example apps/api/.env && cp .env.example apps/chatbot/.env && cp .env.example packages/database/.env
# e edite DATABASE_URL e BETTER_AUTH_SECRET (o segredo deve ser o MESMO nos três)
pnpm build            # gera o client Prisma e compila os pacotes
pnpm db:deploy        # aplica as migrations
pnpm db:seed          # categorias da papelaria
pnpm dev              # API (8080) e Chatbot (3001) juntos — ou: pnpm dev:api / pnpm dev:chatbot
                      # documentação (Scalar): http://localhost:8080/docs e http://localhost:3001/docs
```

Login e cadastro são feitos **na API** (`/api/auth/*`). O Chatbot valida a mesma sessão (mesmo banco e segredo) e repassa o cookie do usuário à API. Todo cadastro entra como `FUNCIONARIO`; para promover: `UPDATE "user" SET role = 'ADMIN' WHERE email = '...';`.

Validação: `pnpm typecheck && pnpm test && pnpm build && pnpm lint` (e `pnpm format:check`), mais:

| Comando            | O que verifica                                                                                                                                                                                | Precisa de banco |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `pnpm verify:arch` | Fastify nos dois apps, Prisma/PostgreSQL/Better Auth/Zod/Scalar, schema único, Chatbot sem acesso direto às tabelas financeiras                                                               | não              |
| `pnpm e2e`         | Cenários do Chatbot (despesa, recebimento, parcelamento, baixa parcial, cancelamento, permissões)                                                                                             | sim              |
| `pnpm verify:docs` | Todos os endpoints documentados com exemplos preenchidos **e** os exemplos extraídos do OpenAPI executados contra a API (fluxos criar → consultar → pagar → consultar, erros 400/401/403/404) | sim              |

## Documentação interativa (Scalar)

- API: http://localhost:8080/docs — Chatbot: http://localhost:3001/docs
- Rode `pnpm db:seed:demo` (depois de `db:deploy` e `db:seed`): cria os usuários `admin@sisgfpa.dev` (ADMIN) e `funcionario@sisgfpa.dev`, senha `senha12345`, e registros com **ids fixos** usados nos exemplos (despesa, recebimento, categorias, conversa com duas mensagens pendentes). Cada execução restaura esses registros; não roda em produção.
- Fluxo no Scalar: `Autenticação → Login` (body já preenchido) → qualquer endpoint com `Execute`. O cookie de sessão vale para API e Chatbot (mesmo host). Para o Chatbot, faça o login na documentação da API.
- Os exemplos dos ids (`/despesas/{id}`, `/chats/{chatId}/...`) apontam para os registros de demonstração; `confirm`/`cancel` de mensagem só funcionam uma vez por `db:seed:demo` (depois retornam 409, como esperado).

## Domínio financeiro (API)

| Recurso            | Endpoints                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Despesas           | `POST/GET /despesas`, `GET/PATCH /despesas/:id`, `POST /despesas/:id/pagamentos`, `POST /despesas/:id/cancelar` (ADMIN)             |
| Recebimentos       | `POST/GET /recebimentos`, `GET/PATCH /recebimentos/:id`, `POST /recebimentos/:id/baixas`, `POST /recebimentos/:id/cancelar` (ADMIN) |
| Categorias         | `GET /categorias?tipo=DESPESA\|RECEBIMENTO`                                                                                         |
| Relatórios (ADMIN) | `GET /relatorios/contas-a-pagar`, `/contas-a-receber` (`?formato=csv`)                                                              |

Novidades desta unificação: `Categoria`, `Parcela` (despesa e recebimento), `observacoes`, `dataLancamento`, filtros de listagem (fornecedor/cliente, categoria, período) e `liquidarNoAto` (cria o título e registra o pagamento/baixa na **mesma transação**, para fatos já ocorridos como "Pagamos R$ 800 de energia").

Regras de parcelamento: valor dividido em centavos (a última parcela absorve o arredondamento), vencimentos mensais, pagamentos abatem da parcela mais antiga. Título com pagamento registrado só permite alterar descrição, fornecedor/cliente, categoria e observações. Cancelamento nunca apaga: muda o status do título e das parcelas em aberto.

## Chatbot

`POST /chats` → `POST /chats/:id/messages` → (se houver operação) `POST /chats/:id/messages/:messageId/confirm` ou `/cancel`.

- Interpretação por regras em pt-BR (sem IA generativa): intenção, valor, fornecedor/cliente, parcelas, vencimento, quantidade e categoria.
- Faltou informação (ex.: "Comprei cadernos") → pergunta ("Qual foi o valor da compra?") e **não cria nada**; a resposta seguinte completa a operação.
- **Toda** operação passa por confirmação antes de chamar a API.
- "Pagamos/Cliente X pagou" com título em aberto do mesmo fornecedor/cliente vira pagamento/baixa nesse título (se houver mais de um, o bot lista e pergunta); sem título, cria um título já liquidado.
- Fornecedor/cliente ausentes ficam como "Não informado" (aparece no resumo de confirmação).
- Permissões: o Chatbot não checa perfil; a API responde 403 e o bot repassa a recusa.

## Pendências conhecidas

- O nome do fornecedor/cliente continua sendo texto no título (como no Módulo Financeiro original); não há cadastro de entidades.
- O parser é baseado em regras: frases muito fora dos padrões serão pedidas de novo em vez de adivinhadas.
- Relatórios agrupam pelo vencimento do título (= 1ª parcela); ainda não filtram por parcela.
- Exportação PDF/XLSX prevista no README original do Módulo Financeiro não existe (só CSV).
