// Tipos e constantes compartilhados entre API Financeira, Chatbot (e futuro frontend).
// Não depende de nenhuma biblioteca.

export const ROLES = ['ADMIN', 'FUNCIONARIO'] as const
export type Role = (typeof ROLES)[number]

export const STATUS_TITULO = ['PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO'] as const
export type StatusTitulo = (typeof STATUS_TITULO)[number]

export const TIPOS_CATEGORIA = ['DESPESA', 'RECEBIMENTO'] as const
export type TipoCategoria = (typeof TIPOS_CATEGORIA)[number]

// Categorias do contexto da papelaria (fonte única; usadas no seed e no classificador do Chatbot).
export const CATEGORIAS_DESPESA = [
  'Mercadorias',
  'Despesas Operacionais',
  'Material de Escritório',
  'Manutenção',
  'Outros',
] as const

export const CATEGORIAS_RECEBIMENTO = ['Vendas', 'Outros recebimentos'] as const

export type CategoriaDespesaNome = (typeof CATEGORIAS_DESPESA)[number]
export type CategoriaRecebimentoNome = (typeof CATEGORIAS_RECEBIMENTO)[number]

export const INTENCOES_CHAT = [
  'CRIAR_DESPESA',
  'CRIAR_RECEBIMENTO',
  'REGISTRAR_PAGAMENTO',
  'REGISTRAR_BAIXA',
  'CANCELAR_DESPESA',
  'CANCELAR_RECEBIMENTO',
  'DESCONHECIDA',
] as const
export type IntencaoChat = (typeof INTENCOES_CHAT)[number]

// Dados de demonstração: ids fixos criados por `pnpm db:seed:demo`, usados como exemplos
// na documentação (Scalar) para que "Execute" funcione sem preencher nada manualmente.
export const EXEMPLOS = {
  // Categorias de demonstração (ids fixados por `pnpm db:seed:demo`)
  categoriaDespesaId: 'c0000000-0000-4000-8000-000000000001', // Mercadorias
  categoriaRecebimentoId: 'c0000000-0000-4000-8000-000000000002', // Vendas
  despesaId: 'd0000000-0000-4000-8000-000000000001',
  recebimentoId: 'd0000000-0000-4000-8000-000000000002',
  chatId: 'd0000000-0000-4000-8000-000000000003',
  mensagemConfirmarId: 'd0000000-0000-4000-8000-0000000000a1',
  mensagemDescartarId: 'd0000000-0000-4000-8000-0000000000a2',
  admin: { name: 'Administrador Demo', email: 'admin@sisgfpa.dev', password: 'senha12345' },
  funcionario: { name: 'Funcionário Demo', email: 'funcionario@sisgfpa.dev', password: 'senha12345' },
} as const
