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

## Entrega atual: login

**Objetivo:** aplicar ao login a apresentação do novo código de exemplo, preservando o fluxo de autenticação existente.

**Alterações:** `apps/web/src/App.tsx`, novo estilo isolado `apps/web/src/auth/login.css` e carregamento da fonte Inter em `apps/web/index.html`. A documentação e as 13 referências complementares acompanham a entrega.

O login adota cartão branco, faixa verde, cadeado circular, título Mil Folhas, campos, botão, rodapé e cores do exemplo. Os estilos da página são isolados para não reorganizar as demais telas nesta entrega. O carregamento de Inter usa Google Fonts, como no protótipo; sem acesso ao serviço, o navegador usa a fonte de sistema.

O usuário informa e-mail e senha vazios inicialmente. O formulário mantém a chamada real de autenticação, redirecionamento seguro, erros e recuperação. O cadastro público continua fechado. Durante o envio, campos e botão ficam desabilitados, e submissões repetidas são ignoradas.

**Verificações já concluídas:** typecheck do frontend, 46 testes existentes em nove arquivos, lint do código alterado, formatação e build do frontend. O build concluiu com avisos de diretivas `use client` da dependência React Router. A conferência em Chromium passou em 1280×720, 320×568, 390×844 e 1280×400, sem rolagem horizontal ou erros JavaScript. A fonte Inter carregou corretamente. Foram conferidos campos obrigatórios, navegação por teclado, erro de credenciais, envio do e-mail/senha, redirecionamento para a origem, logout, indisponibilidade com nova tentativa e link de recuperação, usando respostas HTTP controladas. Capturas para revisão: [desktop](validacao-visual/login/desktop.png) e [celular](validacao-visual/login/mobile.png).

**Limitação de integração:** a API local em `127.0.0.1:8080` não estava em execução durante esta verificação. Cenários com respostas HTTP controladas servem para conferir a interface e o fluxo do navegador; não comprovam autenticação contra banco real.

## Planejamento da próxima tela: recuperação de acesso

- **Objetivo:** reproduzir e-mail, código e nova senha mantendo solicitação e redefinição reais.
- **Frontend:** estados explícitos, formulário e ícones no mesmo padrão do login, navegação entre passos, reenvio, validações, erros e apresentação móvel.
- **Backend:** nenhuma mudança prevista. SMTP segue configurado por ambiente. O código é validado pelo servidor junto da nova senha na redefinição; avançar após preenchê-lo não será apresentado como código verificado.
- **Regras:** manter validade, tentativas, uso único, senha mínima e revogação de sessões existentes. Se a apresentação exigir mudança de contrato, discutir antes da implementação afetada.
- **Verificações:** estados e responsividade no navegador, retorno/reenvio, erros do serviço, testes existentes, typecheck, lint, formatação e build. Distinguir cenário controlado de validação com SMTP e banco reais.
- **Entrega:** um novo commit local por tela alterada e nova solicitação de aprovação antes de push.
