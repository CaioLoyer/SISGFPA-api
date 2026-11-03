export interface DashboardPermissions {
  despesas: boolean
  recebimentos: boolean
  caixa: boolean
  relatorios: boolean
}

export interface DashboardMetric {
  valor: number | null
  variacaoPercentual: number | null
}

export interface DashboardOverview {
  mes: string
  permissoes: DashboardPermissions
  caixaConfigurado: boolean | null
  indicadores: {
    entradas: DashboardMetric
    saidas: DashboardMetric
    resultado: DashboardMetric
    ticketMedio: DashboardMetric
  }
  serieMensal: { mes: string; entradas: number; saidas: number }[]
  saidasPorCategoria: { nome: string; valor: number }[]
  ultimasMovimentacoes: {
    id: string
    data: string
    descricao: string
    categoria: string | null
    valor: number
    tipo: 'ENTRADA' | 'SAIDA'
    origem: 'LIQUIDACAO' | 'ESTORNO'
    tituloId: string | null
    tipoTitulo: 'DESPESA' | 'RECEBIMENTO' | null
  }[]
  resumo: {
    saldoAtual: number | null
    aPagar: number | null
    aReceber: number | null
  }
}
