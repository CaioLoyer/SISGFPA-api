# Adequação visual do frontend Mil Folhas

Data: 02/11/2026. Branch: `feature/integracao-telas`. Base: `486b5cd`.

## Referências e escopo

O autor pediu que todas as telas adotem a apresentação do exemplo, mantendo a integração com o backend. Foram examinados:

- `interfaces.zip`: 13 imagens PNG, preservadas sem edição em [referencias/interfaces](referencias/interfaces), com nomes normalizados.
- `sisgfpa-apresentacao.zip`: protótipo React/TypeScript com páginas, componentes, fonte Inter, ícones Lucide e estilos Tailwind. O código foi extraído somente para inspeção fora do projeto.

O segundo envio passa a orientar a implementação dos estilos e da composição. As imagens continuam como referência complementar. O protótipo usa dados locais e ações simuladas; os clientes HTTP, a sessão, as permissões e as operações reais do SISGFPA devem ser preservados.

Telas ou áreas ausentes no exemplo devem seguir a mesma fonte, paleta, formato e linguagem responsiva. Essa orientação autoriza adaptar visualmente as funcionalidades já existentes sem inventar dados ou acrescentar regras de negócio do protótipo.

As decisões em `docs/PLANO-INTEGRACAO-TELAS.md` continuam válidas: cadastro público fechado, autenticação por e-mail, senha mínima de oito caracteres, permissões aplicadas pela API e Caixa Principal automático. Novas operações financeiras ou alterações dessas regras exigem discussão própria.

## Padrão visual confirmado no código de exemplo

- Fonte Inter, com fallback `system-ui, sans-serif`.
- Verde principal `#1b7a4b`, verde escuro `#0f4f2c`, verde claro `#e8f2ec`, campos `#e4e9e5`, vermelho `#c0392b`.
- Login com fundo `#0f512d`, cartão de até 384 px, cantos de 16 px, faixa superior de 12 px e ícone circular de 64 px.
- Páginas internas com cabeçalhos brancos, cartões claros, tabelas e formulários em seções. O exemplo usa menu lateral de 224 px e subitens financeiros.
- Em larguras menores, adaptar menu, grades, tabelas e formulários para manter leitura e acesso às ações. O protótipo não resolve todos esses tamanhos; preservar sua linguagem visual ao acrescentar responsividade.

## Forma de entrega e autoria

- Alterar uma tela por entrega e produzir um commit local correspondente, com mensagem em português no padrão Conventional Commits.
- Usar autor e committer Shishura já configurados. Não adicionar coautoria ou atribuição de ferramenta aos commits, às branches ou ao código do projeto.
- Apresentar resultado, arquivos, verificações, limitações e hash do commit.
- Antes de cada push, apresentar hashes, resumo e branch de destino e pedir aprovação explícita. A aprovação de uma etapa e a aprovação do envio são decisões separadas.
- Apresentar o planejamento da próxima tela e aguardar a revisão exigida pelo `AGENTS.md`. A nova solicitação do autor autoriza iniciar pelo login nas condições aqui registradas.

## Sequência de telas

| Entrega | Tela/área                                     | Aplicação do exemplo e preservação funcional                                                                                                                                                       |
| ------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Login                                         | Reproduzir a apresentação de `pages/Auth.tsx`, preservando login real por e-mail, validação, sessão, redirecionamento e tratamento de erros.                                                       |
| 2       | Recuperação de acesso                         | Aplicar os estados de e-mail, código e nova senha do exemplo ao fluxo real. A API atual valida código e nova senha na mesma operação; não apresentar preenchimento como verificação pelo servidor. |
| 3       | Estrutura autenticada e início do funcionário | Aplicar marca, navegação, cabeçalhos, identificação real e responsividade, mantendo rotas e permissões. Componentes comuns poderão ser reaproveitados nas próximas telas.                          |
| 4       | Dashboard                                     | Usar a composição visual com indicadores e valores reais disponíveis. Não rotular total de títulos como receita efetiva ou lucro; não preencher gráficos com números fixos.                        |
| 5       | Administração/cadastro de funcionário         | Reorganizar cadastro e permissões existentes na linguagem do exemplo. Não exibir presença, administradores adicionais ou auditoria global sem dados reais.                                         |
| 6       | Clientes e fornecedores                       | Aplicar filtros, formulário em seções e tabela, preservando contatos com ambos os papéis, edição, inativação e associação de títulos antigos.                                                      |
| 7       | Gerenciamento de títulos                      | Aplicar a apresentação de filtros, tabela, ações, status e paginação às listagens reais. Manter despesas e recebimentos acessíveis e suas permissões.                                              |
| 8       | Lançamento/edição de títulos                  | Aplicar a composição do formulário aos campos suportados pela API. Não inventar número comercial, meta mensal ou alteração de status sem operação financeira.                                      |
| 9       | Caixa                                         | Aplicar cores, campos e cartões aos saldos, abertura, movimentos e estornos existentes. Lançamentos avulsos e transferências do protótipo não fazem parte do fluxo aprovado.                       |
| 10      | Relatórios                                    | Aplicar abas, filtros, resumo e tabela aos relatórios existentes, mantendo download CSV real. Não habilitar PDF/XLSX ou novos relatórios sem implementação.                                        |
| 11      | Perfil                                        | Aplicar identificação e seções de dados/segurança, preservando edição real do nome e troca de senha. Não simular telefone, CPF, 2FA ou exclusão de conta.                                          |
| 12      | Chatbot e revisão final                       | Aplicar a apresentação de `pages/Chatbot.tsx` às conversas e confirmações reais. Harmonizar estados auxiliares e conferir todos os tamanhos de tela.                                               |

A divisão poderá separar formulários em entregas adicionais quando necessário para cumprir a revisão por tela. Os demais módulos devem continuar funcionando sem o serviço de Chatbot em execução.

## Primeira entrega: login

**Objetivo:** aplicar ao login a apresentação do novo código de exemplo, preservando o fluxo de autenticação existente.

**Alterações:** `apps/web/src/App.tsx`, novo estilo isolado `apps/web/src/auth/login.css` e carregamento da fonte Inter em `apps/web/index.html`. A documentação e as 13 referências complementares acompanham a entrega.

O login adota cartão branco, faixa verde, cadeado circular, título Mil Folhas, campos, botão, rodapé e cores do exemplo. Os estilos da página são isolados para não reorganizar as demais telas nesta entrega. O carregamento de Inter usa Google Fonts, como no protótipo; sem acesso ao serviço, o navegador usa a fonte de sistema.

O usuário informa e-mail e senha vazios inicialmente. O formulário mantém a chamada real de autenticação, redirecionamento seguro, erros e recuperação. O cadastro público continua fechado. Durante o envio, campos e botão ficam desabilitados, e submissões repetidas são ignoradas.

**Verificações já concluídas:** typecheck do frontend, 46 testes existentes em nove arquivos, lint do código alterado, formatação e build do frontend. O build concluiu com avisos de diretivas `use client` da dependência React Router. A conferência em Chromium passou em 1280×720, 320×568, 390×844 e 1280×400, sem rolagem horizontal ou erros JavaScript. A fonte Inter carregou corretamente. Foram conferidos campos obrigatórios, navegação por teclado, erro de credenciais, envio do e-mail/senha, redirecionamento para a origem, logout, indisponibilidade com nova tentativa e link de recuperação, usando respostas HTTP controladas. Capturas para revisão: [desktop](validacao-visual/login/desktop.png) e [celular](validacao-visual/login/mobile.png).

**Limitação de integração:** a API local em `127.0.0.1:8080` não estava em execução durante esta verificação. Cenários com respostas HTTP controladas servem para conferir a interface e o fluxo do navegador; não comprovam autenticação contra banco real.

## Segunda entrega: recuperação de acesso

Autorizada pelo autor após a revisão do login. A mensagem do commit do login foi ajustada a seu pedido para `style(login): reformulando tela de login` (commit `7cc18db`).

**Objetivo e resultado:** a rota `/recuperar-senha` agora apresenta e-mail, código e nova senha em passos separados, com o mesmo cartão, fonte, cores, campos, ícones e comportamento responsivo do login. A confirmação de sucesso só aparece depois da resposta positiva do servidor.

**Arquivos:** extração do fluxo de `apps/web/src/App.tsx` para `apps/web/src/auth/PasswordRecoveryPage.tsx`, novo estilo `apps/web/src/auth/recovery.css` e capturas nesta documentação. Os estilos existentes do login são reaproveitados. O backend e o cliente HTTP de autenticação não foram alterados.

**Comportamento preservado:** solicitação e reenvio reais do código, resposta genérica sem revelar existência da conta, senha de 8 a 128 caracteres, confirmação, tratamento de limite de solicitações, código inválido/expirado e limite de tentativas. Avançar após digitar seis números não simula validação remota: o código e a nova senha continuam sendo confirmados juntos em `/api/auth/email-otp/reset-password`.

**Cuidados do fluxo:** envios simultâneos são bloqueados; é possível corrigir e-mail ou código. Reenvio confirmado limpa o código anterior e as senhas preenchidas. Erros de código retornam ao passo correspondente e limpam os campos sensíveis. A navegação direciona o foco ao primeiro campo ou ao resultado final. Sair da página descarta os dados do formulário.

**Verificações:** 46 testes existentes do frontend aprovados; typecheck, lint, formatação e build aprovados. Os três passos foram conferidos em Chromium em 1280×720, 320×568, 390×844 e 1280×400, sem rolagem horizontal nem erros JavaScript. Foram exercitados campos obrigatórios, envio duplicado, OTP numérico, confirmação de senha, expiração, limites, reenvio, alteração de e-mail, falha de rede, resposta sem confirmação de sucesso e retorno ao login.

**Limitação:** a API local continua sem execução. Os cenários de navegador usam respostas HTTP controladas; não validam entrega SMTP, alteração da senha no banco ou revogação de sessões reais. As chamadas da aplicação continuam apontando para os endpoints reais existentes.

Capturas para revisão:

| Passo                         | Desktop                                                      | Celular                                                     |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| E-mail                        | [Abrir](validacao-visual/recuperacao/email-desktop.png)      | [Abrir](validacao-visual/recuperacao/email-mobile.png)      |
| Código                        | [Abrir](validacao-visual/recuperacao/codigo-desktop.png)     | [Abrir](validacao-visual/recuperacao/codigo-mobile.png)     |
| Nova senha                    | [Abrir](validacao-visual/recuperacao/nova-senha-desktop.png) | [Abrir](validacao-visual/recuperacao/nova-senha-mobile.png) |
| Sucesso em cenário controlado | [Abrir](validacao-visual/recuperacao/sucesso-desktop.png)    | —                                                           |

## Terceira entrega: estrutura autenticada e início do funcionário

Autorizada pelo autor após a revisão da recuperação. Os commits `7cc18db` e `e45ae48` foram enviados, com aprovação explícita, para `origin/feature/integracao-telas` no repositório `https://github.com/CaioLoyer/SISGFPA-api`.

**Objetivo e resultado:** a estrutura autenticada agora acompanha o exemplo: menu de 224 px com gradiente verde, marca circular, ícones, seleção do item ativo, submenu Financeiro, usuário real e saída da conta. Os cabeçalhos das páginas internas usam fundo branco, título e descrição no padrão visual de referência. A página inicial do funcionário oferece atalhos sem métricas administrativas ou números simulados.

**Organização no monorepo:** `App.tsx` mantém as rotas e a proteção da sessão; a apresentação autenticada foi extraída para `apps/web/src/layout/AppShell.tsx` e `layout.css`. O início do funcionário fica em `dashboard/EmployeeHomePage.tsx` e `employee-home.css`. Os elementos reutilizáveis ficam em `shared/Icon.tsx` e `shared/PageHeader.tsx`. Os estilos antigos do menu e do início foram removidos de `index.css`. Não foram criadas dependências, branches adicionais, endpoints ou alterações nos pacotes de backend.

**Rotas e acesso:** preservadas `/`, `/comercial`, `/despesas`, `/recebimentos`, `/caixa`, `/relatorios`, `/admin`, `/chatbot` e `/perfil`. Financeiro agrupa as rotas existentes, sem criar uma tela unificada ou lançamento fictício. Caixa, relatórios e administração continuam exclusivos de ADMIN. Despesas e recebimentos continuam sujeitos às permissões consultadas pela API. Nome, iniciais e papel apresentados vêm da sessão; logout só redireciona após confirmação do serviço e impede envios duplicados.

**Responsividade e teclado:** abaixo de 900 px, uma barra compacta abre o menu lateral. O fundo fica inerte e sem rolagem enquanto o menu está aberto; foco é contido no painel, Escape e clique no fundo fecham o menu, e o foco retorna ao acionador. Selecionar uma rota fecha o painel e direciona o foco ao conteúdo. Há também um atalho para pular a navegação. O redimensionamento restaura o comportamento de desktop.

**Verificações:** os 46 testes existentes do frontend, typecheck, lint, formatação, build e o script `scripts/verify-architecture.ts` passaram. Em Chromium, foram conferidos desktop de 1280 px, início e menu em 1024/768/390/320 px, rotas existentes, seleção/expansão do Financeiro, ADMIN/FUNCIONARIO, recusa 403 de despesas, sessão ausente e indisponível, retorno seguro ao login, logout com erro e sem duplicação, foco e fechamento do menu. Não houve erros JavaScript; os cenários de início/menu e recebimentos no celular não apresentaram rolagem horizontal.

**Limitação:** API e banco locais não estavam em execução. A verificação de navegador usou respostas HTTP controladas, incluindo o nome e o papel dos usuários das capturas. Ela não comprova persistência ou autorização contra banco real. A navegação foi exercitada com o processo de Chatbot indisponível; os demais módulos mantiveram seus acessos.

Capturas para revisão:

- [Início do funcionário no desktop](validacao-visual/navegacao/funcionario-desktop.png).
- [Início do funcionário no celular](validacao-visual/navegacao/funcionario-mobile.png).
- [Menu aberto no celular](validacao-visual/navegacao/menu-mobile.png).
- [Estrutura de ADMIN no desktop](validacao-visual/navegacao/admin-desktop.png). O conteúdo interno do perfil permanece para sua própria etapa visual.

## Quarta entrega: dashboard financeira (priorizada pelo autor)

O autor antecipou a dashboard em relação à sequência original e enviou uma nova referência, preservada em [dashboard-atual.jpg](referencias/interfaces/dashboard-atual.jpg).

**Decisões confirmadas pelo autor:**

- ADMIN e funcionários acessam a dashboard conforme suas permissões financeiras. Despesas e recebimentos são reavaliados na API em cada consulta. Saldo consolidado, página do caixa e relatórios mantêm a restrição administrativa existente.
- Os indicadores e a série mensal usam movimentações efetivas do Caixa Principal, incluindo estornos, pela data da movimentação. A diferença entre entradas e saídas é apresentada como **Resultado do caixa**.
- O **ticket médio recebido** é a soma dos valores das baixas recebidas no mês dividida pela quantidade dessas baixas. Cada pagamento parcial conta como uma baixa; estornos não participam dessa fórmula. Uma baixa de título posteriormente cancelado continua representando dinheiro efetivamente recebido.
- Sem baixas, o ticket é indisponível, não zero. Variações percentuais só aparecem quando existe base diferente de zero no mês anterior. Pendências continuam usando vencimento do título no mês, com cancelados excluídos.

**Resultado visual e navegação:** `/dashboard` passa a ser a página inicial de todos os perfis e o primeiro item do menu; `/` redireciona para ela. O painel reproduz a composição da referência com quatro cartões, barras dos sete meses até o mês selecionado, rosca por categoria, cinco movimentações recentes e faixa verde de saldos/pendências. Mantém Inter, verdes, vermelho, cantos e estrutura do restante do frontend. O mês usa controle nativo; os gráficos também oferecem valores em texto/tabela. Categorias excedentes são agrupadas após as quatro principais. No celular, painéis são empilhados e a tabela tem rolagem própria.

**Integração:** novo `GET /dashboard/visao-geral?mes=AAAA-MM`, com contrato em `packages/types` e schema/exemplo em `packages/validation`. As consultas são parametrizadas, agregadas no PostgreSQL e lidas na mesma transação. Limites e agrupamentos mensais usam UTC explicitamente. Estornos herdam o módulo e a categoria da movimentação original para aplicar a autorização corretamente. O endpoint anterior `/dashboard/resumo` permanece exclusivo de ADMIN.

A interface destaca quando os dados representam somente contas a pagar ou somente contas a receber. Campos restritos retornam `null`; não são transformados em valores zero. Sem acesso financeiro, a dashboard mostra orientação e acesso ao perfil. Caixa não configurado, mês vazio, carregamento, erro e nova tentativa têm apresentações próprias. Requisições anteriores são canceladas ao trocar o mês ou sair da tela; atualização manual, a cada minuto e ao retomar a aba consultam novamente o servidor. Erros descartam resultados antigos.

**Arquivos principais:**

- `apps/web/src/dashboard/DashboardPage.tsx`, `DashboardCharts.tsx`, `dashboard-api.ts`, `dashboard-api.test.ts` e `dashboard.css`.
- `apps/web/src/App.tsx`, `layout/AppShell.tsx` e limpeza dos estilos antigos em `index.css`. A antiga página inicial separada do funcionário foi substituída pelo painel autorizado.
- `apps/api/src/modules/dashboard/dashboard-overview.service.ts`, `dashboard.routes.ts`, testes de rota e integração PostgreSQL; reaproveitamento da consulta de permissões em `authorization/financial-permissions.ts`.
- `packages/types/src/dashboard.ts`, exportação em `index.ts`, `packages/validation/src/index.ts` e inclusão do endpoint na lista de documentação de `scripts/docs-check.ts`.

**Verificações:** 56 testes do frontend e 71 testes da API aprovados. Os três testes opcionais de integração passaram separadamente em PostgreSQL local descartável com as cinco migrations existentes: valores e arredondamento do ticket, pagamentos parciais, cancelados, estornos, limites UTC, série de sete meses, pendências, saldo global, permissões alteradas entre consultas e caixa ausente. Typecheck de frontend/API e build dos pacotes compartilhados/frontend aprovados; lint, formatação e verificação de arquitetura aprovados. O build mantém os avisos de `use client` da dependência React Router.

O Chromium confirmou login e sessão reais do Better Auth, retorno da API igual aos cartões, mês selecionado, estado vazio, gráficos, atalhos, atualização das permissões já na sessão aberta, restrição do saldo e menu móvel. Conferidas larguras 1280, 1024, 768, 390 e 320 px sem rolagem horizontal da página ou erros JavaScript. Também foram conferidos o OpenAPI mensal, seu exemplo e a recusa HTTP 401 sem sessão. O Chatbot não foi iniciado. O relatório resumido do navegador está em [verificacao.json](validacao-visual/dashboard/verificacao.json).

**Ambiente e limites:** integração realizada contra PostgreSQL temporário, API local e contas/dados fictícios persistidos exclusivamente para teste. Os números dos prints não representam dados operacionais da papelaria. Não houve migração nem preenchimento de dados no banco do projeto. A aplicação não contém esses fixtures; usa as respostas reais da API configurada. A fonte Inter continua dependente do carregamento externo já adotado pelo projeto. Atualização é por consulta periódica/manual, sem canal de notificações em tempo real.

Capturas para revisão:

- [Dashboard no desktop](validacao-visual/dashboard/desktop.png).
- [Dashboard no celular](validacao-visual/dashboard/mobile.png).
- [Funcionário com acesso somente a recebimentos](validacao-visual/dashboard/funcionario-recebimentos.png).

Para repetir os testes opcionais, forneça `DASHBOARD_TEST_DATABASE_URL` apontando para um PostgreSQL **local, descartável, vazio e migrado**, com nome de banco `sisgfpa_dashboard_test` e fuso UTC. Execute `vitest run src/modules/dashboard/dashboard-overview.integration.test.ts` em `apps/api`. A suíte recusa bancos com outro nome/host e bancos já preenchidos, não usa automaticamente o `.env` do projeto e é ignorada quando essa variável não está definida. Use uma instância nova para repetir, pois os registros sintéticos permanecem nela após a execução.

## Quinta entrega: painel de Administração

**Objetivo e resultado:** `/admin` preserva cadastro de funcionários e configuração individual de acesso financeiro, agora no padrão visual do restante do aplicativo e da referência de administração. A página mostra o formulário de nova conta e a lista real de funcionários, com controles para contas a pagar e a receber.

**Comportamento:** o cadastro envia nome, e-mail e senha inicial ao endpoint existente; o papel `FUNCIONARIO` continua definido pelo servidor e a senha obedece à regra de 8 a 128 caracteres. A listagem e a gravação de permissões continuam usando `GET /usuarios/funcionarios` e `PATCH /usuarios/funcionarios/{id}/permissoes`, protegidos por ADMIN na API. Os estados de carregamento, lista vazia, erro, nova tentativa e confirmação usam respostas reais do cliente HTTP. Ajustes das permissões precisam ser salvos para persistirem. A tabela se reorganiza em cartões acessíveis em telas pequenas.

A interface não exibe totais de usuários, administradores, presença online, acesso recente, exportações ou histórico de alterações: a API atual não oferece esses dados. O painel não altera o cadastro público, os papéis, as permissões existentes ou as regras de auditoria.

**Arquivos principais:** `apps/web/src/admin/AdminPage.tsx` e `admin.css`, extração da página de `apps/web/src/App.tsx` e remoção dos estilos antigos de administração em `index.css`. Nenhuma mudança de backend ou de contrato foi necessária.

**Verificações:** typecheck, lint, formatação e build do frontend. A conferência visual em Chromium utiliza respostas HTTP controladas somente para preencher a lista da captura; ela não envia cadastro nem atualiza permissões, portanto não confirma persistência. As capturas usam nomes de funcionários fictícios. Os clientes seguem apontando para os endpoints financeiros existentes. O código aplica autorização no frontend e o servidor mantém a autoridade ADMIN; não foi repetida nesta etapa uma operação autenticada contra a API e banco de desenvolvimento.

As capturas de desktop e celular usam dados fictícios servidos apenas para conferência visual; foram mostradas ao autor durante a revisão desta etapa.

## Sexta entrega: módulo Comercial

**Objetivo e resultado:** `/comercial` mantém cadastro, edição, situação, filtros e associação de títulos antigos à API real, com o mesmo padrão de cabeçalho, cartões, cores e tipografia das telas autenticadas. O cadastro continua permitindo que um contato seja cliente e fornecedor ao mesmo tempo.

**Comportamento:** a listagem e os vínculos continuam usando os endpoints existentes de contatos. A API aplica as permissões financeiras do funcionário e impede remover papéis ainda usados por títulos vinculados. A associação histórica registra o contato escolhido sem substituir a descrição/nome original do título. Erros de consulta permitem nova tentativa; o botão de cadastro aguarda permissões carregadas e fica indisponível sem acesso. As tabelas de contatos e títulos sem vínculo se reorganizam em cartões em telas estreitas.

**Arquivos principais:** `apps/web/src/contatos/ComercialPage.tsx` e o novo `apps/web/src/contatos/comercial.css`; remoção dos estilos específicos antigos de `apps/web/src/index.css`. Não foi necessária alteração no backend nem nos contratos.

**Verificações:** typecheck, lint do módulo, formatação, `git diff --check`, build do frontend e conferência no Chromium em desktop e celular. A largura móvel de 390 px não apresentou rolagem horizontal, e o console não registrou erros. A conferência visual usou respostas GET controladas; endpoints de cadastro, edição, situação e associação recusaram escrita. Portanto, a verificação visual não confirma persistência em banco real. As capturas foram exibidas ao autor durante a revisão, sem serem guardadas como arquivos no repositório. Nenhum teste automatizado foi executado nesta entrega.

## Sétima entrega: listagem e detalhes de títulos

**Objetivo e resultado:** `/despesas` e `/recebimentos` passam a usar o cabeçalho e os cartões do restante do aplicativo. Os dados permanecem ligados às consultas existentes, com filtros por pessoa, status, categoria e vencimento, paginação, saldos em aberto, status e ações por título. A tabela se converte em cartões no celular, mantendo cabeçalhos semânticos para leitores de tela.

**Detalhes e operações:** o painel mantém parcelas, histórico e liquidações retornados pela API. Pagamentos e recebimentos parciais continuam usando as operações atuais e exibem os valores atualizados após a confirmação da API. Cancelamento segue restrito a ADMIN; edição e liquidação continuam disponíveis segundo os estados e permissões já implementados. Uma resposta 403 informa a falta de acesso. O formulário existente de criação/edição não foi reformulado nesta etapa.

**Arquivos principais:** `apps/web/src/titulos/TitulosPage.tsx` e o novo `apps/web/src/titulos/titulos.css`. Não houve mudança nos contratos nem no backend.

**Verificações:** typecheck, lint, formatação, `git diff --check` e build do frontend aprovados. O build mantém avisos de diretivas `use client` da dependência React Router. Não executei testes automatizados. Preparei uma API local temporária só de leitura com dados fictícios, que recusa métodos de escrita, mas a sessão não disponibilizou um navegador para conferir ou capturar o resultado. A prévia local foi iniciada, sem confirmação de que tenha sido aberta ou visualizada. Não foi conectada uma conta real nem confirmada persistência em banco.

## Oitava entrega: formulários de criação e edição de títulos

**Objetivo e resultado:** os formulários de `/despesas` e `/recebimentos` agora agrupam descrição e contato, valores e datas, parcelamento e observações em uma composição responsiva no padrão visual já aprovado. O cabeçalho identifica se a pessoa está cadastrando uma despesa, um recebimento ou editando um registro.

**Comportamento preservado:** contatos ativos são consultados pela API e precisam ser selecionados na criação; categorias continuam vindo da API. Os formulários mantêm as mesmas validações e chamadas `POST`/`PATCH`. Títulos com liquidação preservam o histórico, deixando valor e vencimento bloqueados e mostrando o motivo; data de lançamento e quantidade de parcelas continuam somente leitura na edição.

**Arquivos principais:** `apps/web/src/titulos/TitulosPage.tsx` e `apps/web/src/titulos/titulos.css`. Não houve mudança de backend ou de contrato.

**Verificações:** typecheck, lint do módulo, formatação, `git diff --check` e build de produção do frontend aprovados. O build mantém os avisos conhecidos de diretivas `use client` da dependência React Router. Não executei testes automatizados. Não havia navegador conectado nesta sessão para conferir a composição renderizada ou capturar prints; a responsividade foi ajustada pelas regras CSS, mas não conferida visualmente em Chromium.

**Limites:** não foram enviadas operações contra uma conta real ou banco de produção; criação, edição e persistência não foram exercitadas nesta etapa. Os dados e validações continuam conectados às operações existentes.

## Nona entrega: Caixa automático

**Objetivo e resultado:** a tela do Caixa agora usa o mesmo cabeçalho, cartões, filtros e tipografia adotados nas demais páginas financeiras. O resumo destaca saldo atual, saldo inicial, entradas e saídas; em telas estreitas, cada movimento é apresentado como cartão rotulado, sem depender de rolagem horizontal da tabela.

**Integração existente preservada:** o monorepo já tinha uma API para o Caixa Principal, com saldo de abertura informado pelo ADMIN, consultas reais de saldo e movimentos, filtros, paginação e registro de devoluções reais de liquidações de títulos cancelados. Pagamentos e recebimentos criam o movimento correspondente dentro da mesma transação financeira; a tela mostra os valores consultados da API. O acesso permanece exclusivo para ADMIN.

**Proteção contra repetição:** as tentativas de pagamento e baixa agora aceitam uma chave UUID opcional. A interface envia a mesma chave em uma repetição sem alterações dos dados; a API reconhece a tentativa já registrada e devolve o estado atual do título sem criar outro pagamento, baixa ou movimento. Reutilizar a chave com valor, data ou usuário diferentes retorna conflito. A unicidade é limitada ao título e as chamadas antigas sem chave continuam compatíveis. A migration adiciona colunas opcionais e índices únicos; não altera registros existentes.

**Arquivos desta entrega:** `apps/web/src/caixa/CaixaPage.tsx`, novo `apps/web/src/caixa/caixa.css`, componentes do domínio de liquidação de despesas/recebimentos, serviços e rotas correspondentes, `apps/web/src/titulos/TitulosPage.tsx`, cliente e testes de API financeira, schema Prisma, migration `20261103120000_liquidacao_idempotente`, validações e este plano.

**Verificações:** typecheck, lint, formatação, `git diff --check`, build de produção e testes de rota, serviço, liquidação e clientes financeiros. Os testes de serviço usam um segredo transitório exclusivo de teste; nenhum segredo do projeto foi lido ou alterado. Nenhum teste acessou PostgreSQL.

**Limites:** esta sessão não disponibilizou navegador, então não gerei capturas nem conferi a tela renderizada em Chromium. A API continua com um único Caixa Principal e acesso exclusivo para ADMIN; não adicionei caixas múltiplos, seleção na baixa, transferências ou lançamentos avulsos. A abertura usa o saldo informado e não importa liquidações anteriores. A migration foi validada pelo schema Prisma, mas não aplicada a um banco nesta sessão. Nenhuma operação foi enviada contra o banco operacional.

## Próxima etapa para revisão: decisões para ampliar o Caixa

- **Objetivo:** definir o modelo e as regras financeiras necessárias antes de alterar o fluxo atualmente funcional do Caixa Principal.
- **Áreas afetadas:** cadastro e consulta de caixas; saldo de abertura; seleção do caixa ao liquidar títulos; autorização para ADMIN e FUNCIONARIO; transferências; liquidações históricas; eventuais lançamentos avulsos e estornos.
- **Backend/frontend previstos, conforme as decisões:** se permanecer um único caixa, manter o destino automático atual e terminar apenas os ajustes de integração que forem identificados. Se forem autorizados vários caixas, propor antes a migration, os endpoints, a seleção do caixa na baixa e a apresentação de saldos/históricos por caixa.
- **Decisões pendentes do autor:** manter somente o Caixa Principal ou permitir vários caixas; quem pode consultar/configurar caixas e fazer baixas; como reconciliar liquidações anteriores sem vínculo de caixa; se transferências e lançamentos avulsos fazem parte do escopo; e em quais condições uma devolução comprovada deve gerar estorno. Não presumir saldos nem estornos passados.
- **Verificações necessárias:** validar permissões na API, atomicidade e repetição de liquidações, cálculo de saldos, preservação dos históricos e responsividade. Qualquer mudança de schema deve ter migration e testes de regressão. A entrega permanece independente do Chatbot.
- **Entrega:** depois da revisão das regras, apresentar um plano fechado da alteração e aguardar autorização para implementar. Manter commits locais com identidade Shishura; push exige aprovação separada.
