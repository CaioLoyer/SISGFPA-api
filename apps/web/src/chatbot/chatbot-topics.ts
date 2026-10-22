import type { Role } from '@sisgfpa/types'

export interface ChatbotTopic {
  id: string
  title: string
  description: string
  to: string
  icon: string
  adminOnly?: boolean
}

const topics: ChatbotTopic[] = [
  {
    id: 'commercial',
    title: 'Clientes e fornecedores',
    description: 'Consultar contatos e vínculos comerciais.',
    to: '/comercial',
    icon: '◉',
  },
  {
    id: 'expenses',
    title: 'Contas a pagar',
    description: 'Consultar despesas, lançar e registrar pagamentos.',
    to: '/despesas',
    icon: '−',
  },
  {
    id: 'receipts',
    title: 'Contas a receber',
    description: 'Consultar recebimentos e registrar baixas.',
    to: '/recebimentos',
    icon: '+',
  },
  {
    id: 'cash',
    title: 'Caixa',
    description: 'Consultar saldo e movimentações do Caixa Principal.',
    to: '/caixa',
    icon: '◈',
    adminOnly: true,
  },
  {
    id: 'reports',
    title: 'Relatórios',
    description: 'Consultar e exportar relatórios financeiros.',
    to: '/relatorios',
    icon: '▤',
    adminOnly: true,
  },
  {
    id: 'administration',
    title: 'Administração',
    description: 'Gerenciar funcionários e permissões.',
    to: '/admin',
    icon: '⚙',
    adminOnly: true,
  },
  {
    id: 'profile',
    title: 'Meu perfil',
    description: 'Consultar seus dados e alterar a senha.',
    to: '/perfil',
    icon: '◎',
  },
]

export function getChatbotTopics(role: Role | undefined): ChatbotTopic[] {
  return topics.filter((topic) => !topic.adminOnly || role === 'ADMIN')
}
