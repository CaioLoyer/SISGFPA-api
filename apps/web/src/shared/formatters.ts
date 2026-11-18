export interface PeriodoData {
  dataInicio: string
  dataFim: string
}

export function periodoDoMesAtual(): PeriodoData {
  const hoje = new Date(`${financialDateTime().slice(0, 10)}T00:00:00.000Z`)
  const ano = hoje.getUTCFullYear()
  const mes = hoje.getUTCMonth()
  const data = (dia: number) => `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return { dataInicio: data(1), dataFim: data(new Date(ano, mes + 1, 0).getDate()) }
}

export function formatarInstante(data: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: FINANCIAL_TIME_ZONE,
  }).format(new Date(data))
}

export function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarDataPtBr(data: string, estilo: 'short' | 'medium' = 'short') {
  const valor = data.includes('T') ? data : `${data}T00:00:00.000Z`
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: estilo, timeZone: 'UTC' }).format(new Date(valor))
}
import { FINANCIAL_TIME_ZONE, financialDateTime } from '@sisgfpa/types'
