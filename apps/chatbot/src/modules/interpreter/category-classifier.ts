import type { CategoriaDespesaNome, CategoriaRecebimentoNome } from '@sisgfpa/types'

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Ordem importa: as regras mais específicas vêm antes ("papel a4" é escritório, não mercadoria).
const REGRAS_DESPESA: Array<{ categoria: CategoriaDespesaNome; palavras: string[] }> = [
  {
    categoria: 'Material de Escritório',
    palavras: ['impressora', 'papel a4', 'toner', 'grampeador', 'material de escritorio', 'escritorio'],
  },
  { categoria: 'Manutenção', palavras: ['manutencao', 'conserto', 'reparo', 'equipamento'] },
  {
    categoria: 'Despesas Operacionais',
    palavras: ['aluguel', 'energia', 'luz', 'agua', 'internet', 'telefone', 'condominio'],
  },
  {
    categoria: 'Mercadorias',
    palavras: [
      'caderno',
      'caneta',
      'lapis',
      'papel',
      'borracha',
      'cartolina',
      'material escolar',
      'estoque',
      'mercadoria',
      'produto',
    ],
  },
]

const contem = (norm: string, palavra: string) => new RegExp(`\\b${palavra}(?:s|es)?\\b`).test(norm)

/** Classifica a despesa em uma das categorias da papelaria (nomes iguais aos do seed da API). */
export function classificarDespesa(texto: string): CategoriaDespesaNome {
  const norm = normalize(texto)
  for (const regra of REGRAS_DESPESA) {
    if (regra.palavras.some((p) => contem(norm, p))) return regra.categoria
  }
  return 'Outros'
}

export function classificarRecebimento(texto: string): CategoriaRecebimentoNome {
  const norm = normalize(texto)
  if (/\b(venda|vendemos|vendi|cliente|compra|material|pagou)\w*\b/.test(norm)) return 'Vendas'
  return 'Outros recebimentos'
}
