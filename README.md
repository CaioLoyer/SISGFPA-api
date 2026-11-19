# SISGFPA — Sistema de Gerenciamento Financeiro para Papelarias

Monorepo pnpm com API Financeira, frontend web e Chatbot opcional, compartilhando **um único domínio financeiro**, banco e identidade de usuário.

```
sisgfpa/
├── apps/
│   ├── api/        Módulo Financeiro (Fastify) — autoridade do domínio: regras, validação, autorização
│   ├── web/        Aplicativo web (React/Vite) — interface do usuário
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
# configure a URL da API para o frontend
cp apps/web/.env.example apps/web/.env
# e edite DATABASE_URL e BETTER_AUTH_SECRET (o segredo deve ser o MESMO nos três)
pnpm build            # gera o client Prisma e compila os pacotes
pnpm db:deploy        # aplica as migrations
pnpm db:seed          # categorias da papelaria
# em banco sem ADMIN, injete INITIAL_ADMIN_NAME/EMAIL/PASSWORD e execute uma vez:
pnpm db:create-admin
pnpm dev              # API (8080) e frontend (3000), sem iniciar o Chatbot
                      # alternativamente: pnpm dev:api / pnpm dev:web / pnpm dev:chatbot
                      # interface: http://localhost:3000; documentação (Scalar): http://localhost:8080/docs
```

Para usar conversas e enviar mensagens pelo assistente, inicie também `pnpm dev:chatbot` em outro terminal. Os atalhos de tópicos continuam levando às telas dos módulos mesmo quando o serviço de Chatbot está parado.

O frontend em `http://localhost:3000` faz login, restaura e encerra a sessão usando os endpoints Better Auth da API (`/api/auth/*`), com cookies e a origem local já permitida em `TRUSTED_ORIGINS`. As URLs dos serviços podem ser ajustadas em `apps/web/.env` (`VITE_API_URL` e `VITE_CHATBOT_API_URL`). O cadastro público do Better Auth está desabilitado; a rota curinga não encaminha as rotas administrativas genéricas do plugin. O Chatbot valida a mesma sessão (mesmo banco e segredo) e repassa o cookie do usuário à API.

Na área autenticada, **Meu perfil** exibe nome, e-mail e tipo de usuário. Cada usuário pode alterar somente o próprio nome e a própria senha; e-mail e tipo são somente leitura. A troca normal de senha exige a senha atual, usa o Better Auth e encerra as outras sessões, mantendo a sessão atual ativa. Se a pessoa não souber a senha atual, pode pedir autorização autenticada ao ADMIN; após aprovação, ela própria define a nova senha em até 10 minutos. O pedido expira em 24 horas, só pode ser aprovado por outro ADMIN, permite até três pedidos por usuário a cada 24 horas e encerra todas as sessões após a redefinição. A senha nova nunca é exibida ao ADMIN. O cadastro público permanece fechado e a recuperação por código via e-mail continua disponível.

A recuperação de senha usa um código de seis dígitos enviado por SMTP, válido por cinco minutos e com até três tentativas. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` e, quando o servidor exigir autenticação, `SMTP_USER`/`SMTP_PASSWORD` no ambiente da API. `SMTP_SECURE=true` é usado para SMTPS; deixe `false` para STARTTLS. A aplicação continua iniciando sem SMTP configurado, mas responde indisponível de forma uniforme para qualquer e-mail ao solicitar um código. E-mails existentes e inexistentes recebem a mesma confirmação quando o serviço está habilitado. O código é armazenado como HMAC protegido por `BETTER_AUTH_SECRET`, é de uso único e a redefinição encerra as sessões existentes da conta.

O primeiro administrador de cada banco é criado uma única vez por um operador confiável, depois das migrations, com `pnpm db:create-admin` e as variáveis `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` injetadas no ambiente (use o gerenciador de segredos da implantação; não versione a senha). O comando recusa executar se já existir um `ADMIN` e cria a credencial pelo Better Auth. Não há endpoint público de bootstrap.

Somente um `ADMIN` autenticado pode usar `POST /usuarios/funcionarios` para criar conta com nome, e-mail e senha inicial. Essa operação sempre cria `FUNCIONARIO`; o servidor define o papel e rejeita campos extras como `role`. O registro usa o fluxo de criação e hash de senha do Better Auth e não cria uma sessão para o funcionário. O padrão preserva os acessos financeiros atuais. O ADMIN pode listar funcionários (`GET /usuarios/funcionarios`), consultar todas as contas da equipe (`GET /usuarios/contas`) e alterar individualmente o acesso a Comercial, contas a pagar, contas a receber e Relatórios (`PATCH /usuarios/funcionarios/:id/permissoes`). A operação `POST /usuarios/funcionarios/:id/promover` promove outro FUNCIONARIO a ADMIN; não permite autopromoção e registra o papel anterior, novo papel e executor em auditoria. ADMIN tem acesso completo. As permissões do funcionário não são apagadas pela promoção. As alterações de permissões são consultadas pela API em cada requisição e registradas em auditoria. Caixa, cancelamentos e gestão de contas continuam exclusivos de ADMIN. Relatórios exigem a permissão própria e acesso ao tipo financeiro consultado, igualmente em JSON e CSV.

Na operação de cadastro considerada no escopo de RF001/RF012, o tipo criado é sempre `FUNCIONARIO`, definido pelo servidor. A decisão de permitir que somente `ADMIN` execute a operação diverge do diagrama de casos de uso do PDF, que associa “Manter Funcionários” ao ator Funcionário.

Validação: `pnpm typecheck && pnpm test && pnpm build && pnpm lint` (e `pnpm format:check`), mais:

| Comando            | O que verifica                                                                                                                                                                                | Precisa de banco |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `pnpm verify:arch` | Fastify nos dois apps, Prisma/PostgreSQL/Better Auth/Zod/Scalar, schema único, Chatbot sem acesso direto às tabelas financeiras                                                               | não              |
| `pnpm e2e`         | Cenários do Chatbot (despesa, recebimento, parcelamento, baixa parcial, cancelamento, permissões)                                                                                             | sim              |
| `pnpm verify:docs` | Todos os endpoints documentados com exemplos preenchidos **e** os exemplos extraídos do OpenAPI executados contra a API (fluxos criar → consultar → pagar → consultar, erros 400/401/403/404) | sim              |

## Documentação interativa (Scalar)

- API: http://localhost:8080/docs — Chatbot: http://localhost:3001/docs
- Rode `pnpm db:seed:demo` (depois de `db:deploy` e `db:seed`): cria os usuários `admin@sisgfpa.dev` (ADMIN) e `funcionario@sisgfpa.dev`, senha `senha12345`, e registros com **ids fixos** usados nos exemplos (despesa, recebimento, categorias, conversa com duas mensagens pendentes). Cada execução restaura esses registros; use apenas em ambientes não produtivos.
- Fluxo no Scalar: `Autenticação → Login` (body já preenchido) → qualquer endpoint com `Execute`. O cookie de sessão vale para API e Chatbot (mesmo host). Para o Chatbot, faça o login na documentação da API.
- Os exemplos dos ids (`/despesas/{id}`, `/chats/{chatId}/...`) apontam para os registros de demonstração; `confirm`/`cancel` de mensagem só funcionam uma vez por `db:seed:demo` (depois retornam 409, como esperado).

## Domínio financeiro (API)

| Recurso                | Endpoints                                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Despesas               | `POST/GET /despesas`, `GET/PATCH /despesas/:id`, `POST /despesas/:id/pagamentos`, `POST /despesas/:id/cancelar` (ADMIN)                                                                                              |
| Recebimentos           | `POST/GET /recebimentos`, `GET/PATCH /recebimentos/:id`, `POST /recebimentos/:id/baixas`, `POST /recebimentos/:id/cancelar` (ADMIN)                                                                                  |
| Caixa (ADMIN)          | `GET /caixa`, `POST /caixa/abertura`, `GET /caixa/movimentacoes`, `POST /caixa/movimentacoes/avulsas`, `POST /caixa/movimentacoes/:id/estornos`                                                                      |
| Dashboard (ADMIN)      | `GET /dashboard/resumo?dataInicio=AAAA-MM-DD&dataFim=AAAA-MM-DD`                                                                                                                                                     |
| Relatórios autorizados | `GET /relatorios/contas-a-pagar`, `/contas-a-receber` (`?formato=csv`)                                                                                                                                               |
| Comercial              | `GET/POST /contatos`, `PATCH /contatos/:id`, `PATCH /contatos/:id/situacao`, `GET /contatos/sugestoes`, `GET /contatos/vinculos-pendentes`, `POST /contatos/vinculos`                                                |
| Categorias             | `GET /categorias?tipo=DESPESA\|RECEBIMENTO`                                                                                                                                                                          |
| Usuários               | `POST/GET /usuarios/me/redefinicao-senha`, `POST /usuarios/me/redefinicao-senha/concluir`; ADMIN: `GET /usuarios/redefinicoes-senha`, `PATCH /usuarios/redefinicoes-senha/:id`                                       |
| Usuários (ADMIN)       | `GET/POST /usuarios/funcionarios`, `GET /usuarios/contas`, `PATCH /usuarios/funcionarios/:id/permissoes`, `POST /usuarios/funcionarios/:id/promover` (cadastro define `FUNCIONARIO`; promoção exige conta existente) |
| Autenticação           | `POST /api/auth/email-otp/request-password-reset`, `POST /api/auth/email-otp/reset-password` (código enviado por e-mail)                                                                                             |

Novidades desta unificação: `Categoria`, `Parcela` (despesa e recebimento), `observacoes`, `dataLancamento`, filtros de listagem (fornecedor/cliente, categoria, período) e `liquidarNoAto` (cria o título e registra o pagamento/baixa e o movimento no Caixa Principal na **mesma transação**, para fatos já ocorridos como "Pagamos R$ 800 de energia"). Uma liquidação feita depois também atualiza o Caixa automaticamente. A operação exige que o ADMIN tenha configurado o saldo inicial.

Regras de parcelamento: valor dividido em centavos (a última parcela absorve o arredondamento), vencimentos mensais, pagamentos abatem da parcela mais antiga. Título com pagamento registrado só permite alterar descrição, fornecedor/cliente, categoria e observações. Cancelamento nunca apaga: muda o status do título e das parcelas em aberto.

O Caixa começa com um único **Caixa Principal**. O ADMIN informa o saldo atual consolidado ao configurá-lo; pagamentos e recebimentos anteriores não são importados nem atribuídos a um caixa. Cada nova liquidação gera uma saída ou entrada vinculada ao pagamento/baixa original. Cancelar um título parcialmente liquidado preserva o movimento efetivo; não há estorno automático. Se o dinheiro for devolvido, o ADMIN registra um estorno vinculado à liquidação, limitado ao valor ainda não devolvido. O ADMIN também pode registrar entradas e saídas avulsas com data e descrição, sem criar títulos. Cada lançamento avulso pode ser corrigido uma única vez por estorno integral, com motivo e vínculo ao original; os dois registros permanecem no histórico. A tela do Caixa e seu histórico são exclusivos de ADMIN; funcionários com permissão financeira continuam podendo liquidar títulos, e a API atualiza o Caixa automaticamente. Transferências entre caixas não fazem parte desta versão.

O dashboard e os relatórios são exclusivos de ADMIN. O resumo separa títulos ativos por vencimento no período (cancelados ficam fora) das movimentações efetivas do Caixa Principal pela data em que ocorreram, incluindo liquidações, movimentos avulsos e estornos. O ticket médio considera somente recebimentos vinculados a títulos. O dashboard informa quando o Caixa ainda não foi configurado, em vez de apresentar esse estado como saldo zero.

O cadastro Comercial mantém um contato único com código, nome, CPF/CNPJ, tipo de pessoa, telefone, cidade/UF e atuação como cliente, fornecedor ou ambos. Funcionários só consultam e mantêm os papéis liberados em suas permissões financeiras; um contato com dois papéis exige as permissões correspondentes para ser inativado. Inativar preserva o cadastro e seus vínculos. Títulos novos podem receber `fornecedorContatoId` ou `clienteContatoId`; o nome permanece como texto histórico. Títulos antigos ficam sem vínculo até um usuário associá-los manualmente na tela Comercial, escolhendo sugestões por nome e selecionando títulos individualmente ou em lote. A associação grava o usuário e a ação no histórico do título, sem substituir o nome original.

## Chatbot

`POST /chats` → `POST /chats/:id/messages` → (se houver operação) `POST /chats/:id/messages/:messageId/confirm` ou `/cancel`.

- Interpretação por regras em pt-BR (sem IA generativa): intenção, valor, fornecedor/cliente, parcelas, vencimento, quantidade e categoria.
- Faltou informação (ex.: "Comprei cadernos") → pergunta ("Qual foi o valor da compra?") e **não cria nada**; a resposta seguinte completa a operação.
- **Toda** operação passa por confirmação antes de chamar a API.
- A tela web oferece tópicos que encaminham aos módulos do sistema e conversas persistidas. As mensagens de operação continuam interpretadas por regras, sem IA generativa; o Chatbot é opcional para os demais módulos.
- "Pagamos/Cliente X pagou" com título em aberto do mesmo fornecedor/cliente vira pagamento/baixa nesse título (se houver mais de um, o bot lista e pergunta); sem título, cria um título já liquidado.
- Fornecedor/cliente ausentes ficam como "Não informado" (aparece no resumo de confirmação).
- Permissões: o Chatbot não checa perfil; a API responde 403 e o bot repassa a recusa.

## Pendências conhecidas

- O Chatbot ainda preenche o nome livre de fornecedor/cliente. Sua integração com os cadastros de contato será feita na etapa final do Chatbot; títulos já criados podem ser associados pela tela Comercial.
- O parser é baseado em regras: frases muito fora dos padrões serão pedidas de novo em vez de adivinhadas.
- Relatórios agrupam pelo vencimento do título (= 1ª parcela); ainda não filtram por parcela.
- Exportação PDF/XLSX prevista no README original do Módulo Financeiro não existe (só CSV).

## Datas e repetição de liquidações

Movimentos de Caixa, dashboard e horários de liquidação usam o fuso da papelaria
`America/Campo_Grande`, mesmo quando o computador do usuário está em outro fuso.
Instantes continuam armazenados e transportados em UTC; lançamento e vencimento
dos títulos são datas civis (`AAAA-MM-DD`). Filtros de dia incluem todo o dia local.
O pool da aplicação fixa a sessão PostgreSQL em UTC, preservando os instantes mesmo
se o servidor de banco tiver outro fuso padrão; isso não altera registros existentes.

Para repetir um pagamento ou recebimento após falha de rede, reutilize o mesmo UUID
em `idempotencyKey` no corpo ou no cabeçalho `Idempotency-Key`. Se enviar ambos,
os valores devem ser iguais. A API deduplica dentro da transação; reutilizar uma
chave com valor, data ou executor diferentes retorna conflito. Sem chave, cada
requisição continua sendo uma nova operação.

Testes opcionais de concorrência: use `LIQUIDACAO_TEST_DATABASE_URL` em um banco
PostgreSQL local, vazio, descartável e migrado chamado `sisgfpa_liquidacao_test`,
e execute `pnpm --filter api exec vitest run src/domain/liquidacao.integration.test.ts`.
Eles nunca usam automaticamente o banco de desenvolvimento.

## Permissões por módulo

O ADMIN tem acesso completo e configura quatro permissões por funcionário:

| Permissão        | Regra                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Comercial        | Cadastro completo de clientes e fornecedores, nos dois papéis, independente do Financeiro.                |
| Contas a pagar   | Consulta, criação, edição e pagamento de despesas; categorias correspondentes.                            |
| Contas a receber | Consulta, criação, edição e baixa de recebimentos; categorias correspondentes.                            |
| Relatórios       | JSON/CSV apenas dos tipos financeiros também autorizados. Sem pagar/receber, nenhum relatório é liberado. |

O agrupamento Financeiro na Administração alterna pagar e receber juntos; os
controles individuais continuam disponíveis. A associação de títulos históricos
exige Comercial e a permissão do tipo financeiro. Caixa, cancelamentos e gestão
de funcionários permanecem ADMIN. Esta etapa não promove contas para ADMIN.

`GET /usuarios/me/permissoes` retorna o acesso efetivo da sessão autenticada.
A API relê as permissões em cada requisição, inclusive nas chamadas do Chatbot;
menu, URL direta e tópicos usam esse catálogo. A interface atualiza ao navegar,
retomar o foco, receber recusa de acesso ou a cada 30 segundos com a página visível.
Uma alteração de permissões remove da tela dados e formulários do acesso anterior.

Sem Comercial, `GET /contatos/opcoes?tipo=DESPESA|RECEBIMENTO&busca=nome`
permite selecionar até dez contatos ativos do tipo financeiro autorizado, retornando
somente `id` e `nome`, sem documento, telefone ou operações de cadastro.

Novas contas FUNCIONARIO mantêm Comercial, pagar e receber habilitados e Relatórios
desabilitado. A migration `20261118193000_permissoes_por_modulo` preserva os acessos
financeiros existentes, inicializa Comercial conforme o acesso anterior
(`despesas OU recebimentos`) e não concede Relatórios. Contas sem configuração
individual mantêm os padrões anteriores. Alterações são auditadas com executor,
alvo, valores anteriores/novos e data; PATCH aceita campos parciais e não altera
os campos omitidos. Aplique `pnpm db:deploy` no banco do ambiente antes de iniciar
a versão nova da API.
