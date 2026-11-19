export const NAVIGATION_TOPIC_IDS = [
  'commercial',
  'expenses',
  'receipts',
  'cash',
  'reports',
  'administration',
  'profile',
] as const

export type NavigationTopicId = (typeof NAVIGATION_TOPIC_IDS)[number]

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')

const TOPICO_COMERCIAL = /\b(comercial|contatos?|clientes?|fornecedor(?:es)?)\b/
const TOPICO_DESPESAS = /\b(contas? a pagar|despesas?|pagamentos?|pagar)\b/
const TOPICO_RECEBIMENTOS = /\b(contas? a receber|recebimentos?|receber|cobrancas?|clientes? que devem)\b/

/** Reconhece somente pedidos de navegação; operações financeiras são tratadas pelo planner. */
export function classificarIntencoesDeNavegacao(texto: string): NavigationTopicId[] {
  const normalizado = normalizar(texto)
  const pedeNavegacao =
    /\b(quero|gostaria|preciso|onde|me leva|me leve|abrir|acessar|consultar|ver|mostrar|ir para)\b/.test(
      normalizado
    ) || /\b(cadastrar|adicionar|novo|nova|cadastro)\b/.test(normalizado)

  if (!pedeNavegacao) return []

  if (/\b(relatorios?|exportar)\b/.test(normalizado)) return ['reports']

  const topicos: NavigationTopicId[] = []

  if (
    TOPICO_COMERCIAL.test(normalizado) &&
    (/\b(cadastrar|adicionar|novo|nova|cadastro|contatos?|comercial)\b/.test(normalizado) ||
      /\b(clientes?|fornecedor(?:es)?)\b/.test(normalizado))
  ) {
    topicos.push('commercial')
  }

  if (TOPICO_DESPESAS.test(normalizado)) topicos.push('expenses')
  if (TOPICO_RECEBIMENTOS.test(normalizado)) topicos.push('receipts')

  if (/\b(financeiro|financeira|titulos?)\b/.test(normalizado) && topicos.length === 0) {
    topicos.push('expenses', 'receipts')
  }

  if (/\b(caixa|saldo|movimentacoes?|extrato)\b/.test(normalizado)) topicos.push('cash')
  if (/\b(administracao|funcionarios?|permissoes)\b/.test(normalizado)) topicos.push('administration')
  if (/\b(perfil|minha conta|meus dados|senha)\b/.test(normalizado)) topicos.push('profile')

  return [...new Set(topicos)]
}
