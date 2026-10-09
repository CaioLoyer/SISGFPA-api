# Arquitetura e revisão técnica do SISGFPA

Documento da revisão arquitetural feita após a unificação (API Financeira + Chatbot). Registra o que foi
encontrado, o que mudou, o que foi **deliberadamente mantido** e o que ficou como pendência.

## 1. Visão geral

```
                 Usuário / futuro frontend
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
  apps/chatbot  ───── HTTP/REST ─────▶  apps/api
  (interpreta)       (cookie do usuário)  (decide e executa)
        │                                   │
        └──────────── packages/* ───────────┘
                  PostgreSQL (Prisma)
```

| Pacote                | Responsabilidade                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/api`            | Domínio financeiro: despesas, recebimentos, parcelas, pagamentos/baixas, cancelamento, relatórios, permissões |
| `apps/chatbot`        | Conversas: interpreta a mensagem, pede confirmação, chama a API; guarda só `Chat` e `Message`                 |
| `packages/http`       | Base Fastify comum: `createApp`, erros (`AppError`), hooks `requireAuth`/`requireAdmin`, env                  |
| `packages/auth`       | Instância única do Better Auth + `getAuthenticatedUser`                                                       |
| `packages/database`   | Schema Prisma único, migrations, seed, `PrismaClient` único                                                   |
| `packages/validation` | Schemas Zod (contratos da API) com exemplos do Scalar                                                         |
| `packages/types`      | Constantes/tipos sem dependências (status, categorias, ids de exemplo)                                        |

## 2. Estrutura final

```
apps/api/src/
├── app.ts · server.ts          # buildApp() separado de listen() (facilita testes)
├── config/env.ts               # variáveis validadas com Zod
├── errors.ts                   # erros das regras financeiras (viram HTTP 400 { error, code })
├── domain/                     # regras compartilhadas por despesas e recebimentos
│   ├── parcelas.ts             #   divisão em centavos, vencimentos, abatimento
│   ├── liquidacao.ts           #   pagamento/baixa transacional (usado por endpoint e por liquidarNoAto)
│   ├── categoria.ts · periodo.ts · dto.ts
└── modules/                    # um diretório por recurso
    ├── auth/ · categorias/ · despesas/ · recebimentos/ · relatorios/
    └── <recurso>.routes.ts · <recurso>.service.ts · (<recurso>.mapper.ts)

apps/chatbot/src/
├── app.ts · server.ts · config/env.ts
└── modules/
    ├── chat/          # rotas, serviço de conversas, serviço de mensagens, schemas, mapper
    ├── interpreter/   # message-parser, category-classifier, planner (interpreta), replies (textos)
    └── financial-api/ # cliente HTTP da API Financeira
```

## 3. Diagnóstico (antes → depois)

| Prioridade | Problema encontrado                                                                                                                     | Solução                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **ALTO**   | `app.ts` da API e do Chatbot repetiam ~50 linhas de infraestrutura (erros, rate limit, CORS, Swagger/Scalar); `requireUser` duplicado   | `packages/http` (`createApp`, `requireAuth`, `requireAdmin`). Cada app só registra suas rotas                    |
| **ALTO**   | 22 blocos `try/catch` nas rotas, todos repetindo a conversão de erro → HTTP                                                             | Erros de domínio estendem `AppError`; **um** tratador central. Rotas ficaram com 1–5 linhas por handler          |
| **ALTO**   | `DATABASE_URL` ausente virava a string `"undefined"` e o driver tentava o host `base` (erro confuso)                                    | `@sisgfpa/database` e `@sisgfpa/auth` falham na importação com mensagem clara; apps validam o ambiente com Zod   |
| **MÉDIO**  | 17 casos de uso como classes instanciadas a cada chamada (`new X().execute()`), espalhados em `usecases/` longe das rotas               | Funções em `modules/<recurso>/<recurso>.service.ts`, junto das rotas e do mapper                                 |
| **MÉDIO**  | `chat-service.ts` (307 linhas) misturava conversas, interpretação, confirmação e chamadas à API; `planner.ts` misturava lógica e textos | `chat.service` (conversas) · `message.service` (fluxo da mensagem) · `planner` (interpreta) · `replies` (textos) |
| **MÉDIO**  | `process.env` lido em 15 lugares, com defaults repetidos                                                                                | `config/env.ts` por app (Zod); só ele toca em `process.env` (verificado por `verify:arch`)                       |
| **MÉDIO**  | Versões de dependências podiam divergir (`@types/node` já divergia)                                                                     | `catalog:` do pnpm para versões compartilhadas                                                                   |
| **MÉDIO**  | Scripts `e2e` e `docs-check` duplicavam ~80 linhas (subir servidores, http, passos)                                                     | `scripts/lib/` (`servers`, `http`, `runner`)                                                                     |
| **BAIXO**  | 3 exports sem uso em `validation`; plugin de ESLint instalado e desligado; `.env.example` repetido em 4 lugares                         | Removidos / consolidado em um `.env.example` na raiz                                                             |
| **BAIXO**  | Rota inexistente respondia no formato padrão do Fastify (≠ `{ error, code }`)                                                           | `setNotFoundHandler` no `createApp`                                                                              |
| **BAIXO**  | Logs poderiam registrar cookie/autorização                                                                                              | `redact` de `cookie`, `authorization` e `set-cookie`                                                             |
| **BAIXO**  | `Message.parsedData` (JSON) lido com casts espalhados                                                                                   | Um único ponto de leitura tipado (`lerParsedData`)                                                               |
| **BAIXO**  | Enums duplicados entre Prisma e `@sisgfpa/types` poderiam divergir                                                                      | Teste `enums.test.ts` falha se divergirem                                                                        |

## 4. Decisões deliberadas (o que **não** foi feito, e por quê)

- **Sem camada `repositories/`.** O Prisma já é a camada de persistência e os services têm pouca lógica de
  consulta além de transações. Um repository só repassaria chamadas (abstração artificial). Se um dia houver
  outro banco ou consultas reutilizadas em vários services, a camada pode ser extraída módulo a módulo.
- **Sem `controllers/` separados.** No Fastify, a rota com seu handler faz o papel do controller
  (recebe, chama o service, responde). Os handlers ficaram pequenos o bastante para não justificar outro arquivo.
- **Despesas e Recebimentos continuam como módulos "espelho".** São duas tabelas e duas regras de negócio que
  hoje coincidem, mas podem divergir (juros, tipo de baixa). Um módulo genérico sobre dois delegates do Prisma
  trocaria duplicação visível por abstração difícil de entender. O que realmente é comum está em `domain/`.
- **URLs mantidas** (`/despesas`, `/recebimentos`, `/relatorios`, `/categorias`). Mudar para `/financeiro/...`
  quebraria Chatbot, exemplos do Scalar e testes sem ganho funcional. É uma alteração de uma linha por módulo
  em `app.ts` (`prefix`), caso a banca peça esse padrão.
- **Sem aliases de import.** Com `modules/` os imports têm no máximo dois níveis (`../../domain/...`); aliases
  exigiriam configuração extra no Node e no TypeScript sem ganho.
- **Nomenclatura:** conceitos do domínio financeiro em português (`Despesa`, `Recebimento`, `Parcela`);
  vocabulário técnico e conversacional em inglês (`routes`, `service`, `Chat`, `Message`). Os enums de mensagem
  (`MensagemStatus` etc.) ficaram em português para não exigir migration.
- **Sem camadas extras no Chatbot** (factory, adapter...): `FinancialApiClient` é a única abstração
  de integração, e tem testes.

## 5. Regras de negócio observadas e **não alteradas**

Esta revisão é estrutural. Os pontos abaixo merecem decisão do autor do TCC:

1. **Relatórios filtram pelo vencimento do título** (= vencimento da 1ª parcela), não por parcela. Um título de
   6 parcelas aparece inteiro no mês da primeira. Corrigir exige consultar `*_parcela`.
2. **Relatórios não têm paginação.** Adequado para o volume de uma papelaria; vira gargalo com muitos títulos.
3. **Cancelar título `PARCIAL`** mantém `valorPago`/`valorRecebido` e as parcelas já pagas. Falta definir se
   isso exige estorno/registro adicional.
4. **`liquidarNoAto` com `parcelas > 1`** quita tudo de uma vez na API (o Chatbot nunca envia essa combinação).
   Pode-se rejeitar na validação.
5. **Alterar valor/vencimento** (sem pagamentos) apaga e recria as parcelas do título.
6. **Chatbot: "pagou/pagamos" + fornecedor/cliente com título em aberto** vira pagamento/baixa nesse título
   (heurística; sempre passa por confirmação, com resumo explícito).
7. **Fornecedor e cliente são texto livre** no título (sem cadastro): grafias diferentes não se unificam.

## 6. Performance

Sem gargalos comprovados. Pontos conferidos: listagens fazem 1 consulta com `include` + 1 `count` (sem N+1);
pagamento/baixa atualizam no máximo as parcelas afetadas, dentro de uma transação com `FOR UPDATE`;
`PrismaClient` é instanciado uma única vez. Possível melhoria futura: cache curto das categorias no Chatbot
(hoje 1 chamada HTTP por confirmação) e paginação de relatórios.

## 7. Testes

| Onde                | O que cobre                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `apps/api`          | Regras de parcelamento e abatimento (centavos, fim de mês, ponto flutuante)               |
| `apps/chatbot`      | Parser pt-BR, classificador, planner (criar × pagar × cancelar × perguntar), cliente HTTP |
| `packages/http`     | Formato único de erros, validação, 401/403 por hook, sessão consultada uma vez            |
| `packages/database` | Enums do Prisma = constantes de `@sisgfpa/types`                                          |
| `pnpm e2e`          | Fluxos do Chatbot contra API e PostgreSQL reais, permissões por perfil                    |
| `pnpm verify:docs`  | Exemplos do Scalar extraídos do OpenAPI e executados                                      |
| `pnpm verify:arch`  | Fastify, schema único, Chatbot sem acesso às tabelas financeiras, sem try/catch em rotas  |
