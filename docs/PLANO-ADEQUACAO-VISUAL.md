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
| 4       | Administração/cadastro de funcionário         | Reorganizar cadastro e permissões existentes na linguagem do exemplo. Não exibir presença, administradores adicionais ou auditoria global sem dados reais.                                         |
| 5       | Clientes e fornecedores                       | Aplicar filtros, formulário em seções e tabela, preservando contatos com ambos os papéis, edição, inativação e associação de títulos antigos.                                                      |
| 6       | Gerenciamento de títulos                      | Aplicar a apresentação de filtros, tabela, ações, status e paginação às listagens reais. Manter despesas e recebimentos acessíveis e suas permissões.                                              |
| 7       | Lançamento/edição de títulos                  | Aplicar a composição do formulário aos campos suportados pela API. Não inventar número comercial, meta mensal ou alteração de status sem operação financeira.                                      |
| 8       | Caixa                                         | Aplicar cores, campos e cartões aos saldos, abertura, movimentos e estornos existentes. Lançamentos avulsos e transferências do protótipo não fazem parte do fluxo aprovado.                       |
| 9       | Dashboard                                     | Usar a composição visual com indicadores e valores reais disponíveis. Não rotular total de títulos como receita efetiva ou lucro; não preencher gráficos com números fixos.                        |
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

## Próxima etapa para revisão: estrutura autenticada e início do funcionário

- **Objetivo:** reproduzir a estrutura visual de `src/App.tsx` do exemplo, mantendo a navegação e a sessão reais.
- **Telas/operações afetadas:** estrutura compartilhada das páginas autenticadas, menu lateral, cabeçalhos, identificação do usuário, logout e início do funcionário. O conteúdo interno dos módulos seguirá suas próprias entregas.
- **Frontend:** marca com ícone de usuário, menu verde de 224 px no desktop, agrupamento Financeiro com as rotas existentes de despesas, recebimentos e caixa, perfil real na base e menu adaptado para celular. Ajustar o início do funcionário ao mesmo padrão sem exibir métricas exclusivas de ADMIN.
- **Backend:** nenhuma mudança prevista; preservar as regras atuais, a validação de acesso na API e a independência do serviço de Chatbot.
- **Decisões pendentes:** revisão e autorização desta etapa. Não criar permissões, indicadores ou operações financeiras adicionais por causa do protótipo.
- **Verificações:** navegação por teclado, expansão do menu, rotas atuais e acesso direto, sessão expirada, logout, ADMIN/FUNCIONARIO e largura reduzida. Executar testes pertinentes, typecheck, lint, formatação e build, registrando quando a conferência de acesso usar respostas controladas.
- **Entrega:** capturas em desktop/celular, arquivos, limitações e commit local com mensagem simples em português. A aprovação de push continuará separada.
