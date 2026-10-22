export interface PeriodoData {
  dataInicio: string
  dataFim: string
}

export function periodoDoMesAtual(): PeriodoData {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  const data = (dia: number) => `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return { dataInicio: data(1), dataFim: data(new Date(ano, mes + 1, 0).getDate()) }
}

export function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarDataPtBr(data: string, estilo: 'short' | 'medium' = 'short') {
  const valor = data.includes('T') ? data : `${data}T00:00:00.000Z`
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: estilo, timeZone: 'UTC' }).format(new Date(valor))
}
