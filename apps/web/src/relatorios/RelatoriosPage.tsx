import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { canAccessAdmin } from '../auth/protected-route'
import { useSession } from '../auth/session-context'
import { formatarDataPtBr, formatarMoeda, periodoDoMesAtual } from '../shared/formatters'
import { baixarRelatorioCsv, consultarRelatorio, RelatoriosApiError } from './relatorios-api'
import type { FiltroRelatorio, ResumoRelatorio, TipoRelatorio } from './relatorios-api'

function rotuloStatus(status: string) {
  return status === 'PENDENTE'
    ? 'Pendente'
    : status === 'PARCIAL'
      ? 'Parcial'
      : status === 'PAGO'
        ? 'Pago'
        : 'Cancelado'
}

export function RelatoriosPage() {
  const { user } = useSession()
  const [periodoInicial] = useState(periodoDoMesAtual)
  const [tipo, setTipo] = useState<TipoRelatorio>('PAGAR')
  const [inicio, setInicio] = useState(periodoInicial.dataInicio)
  const [fim, setFim] = useState(periodoInicial.dataFim)
  const [periodoAplicado, setPeriodoAplicado] = useState<FiltroRelatorio>(periodoInicial)
  const [relatorio, setRelatorio] = useState<ResumoRelatorio | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [baixandoCsv, setBaixandoCsv] = useState(false)
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setRelatorio(await consultarRelatorio(tipo, periodoAplicado))
    } catch (caught) {
      setRelatorio(null)
      setErro(
        caught instanceof RelatoriosApiError ? caught.message : 'Não foi possível carregar o relatório.'
      )
    } finally {
      setCarregando(false)
    }
  }, [periodoAplicado, tentativa, tipo])

  useEffect(() => {
    if (canAccessAdmin(user?.role)) void carregar()
  }, [carregar, user?.role])

  if (!canAccessAdmin(user?.role)) {
    return (
      <section className="welcome-page" role="alert">
        <p className="eyebrow">ACESSO RESTRITO</p>
        <h1>Área exclusiva para ADMIN</h1>
        <p>Os relatórios financeiros estão disponíveis somente para a administração.</p>
        <Link className="text-link" to="/">
          Voltar para a visão geral
        </Link>
      </section>
    )
  }

  function aplicarPeriodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inicio > fim) {
      setErro('A data final deve ser igual ou posterior à data inicial.')
      return
    }
    setPeriodoAplicado({ dataInicio: inicio, dataFim: fim })
  }

  async function exportarCsv() {
    setErro('')
    setBaixandoCsv(true)
    try {
      const conteudo = await baixarRelatorioCsv(tipo, periodoAplicado)
      const arquivo = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(arquivo)
      const link = document.createElement('a')
      link.href = url
      link.download = `contas-a-${tipo === 'PAGAR' ? 'pagar' : 'receber'}-${periodoAplicado.dataInicio}-${periodoAplicado.dataFim}.csv`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (caught) {
      setErro(caught instanceof Error ? caught.message : 'Não foi possível baixar o CSV.')
    } finally {
      setBaixandoCsv(false)
    }
  }

  const nomePessoa = tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente'
  const nomeLiquidado = tipo === 'PAGAR' ? 'Pago' : 'Recebido'

  return (
    <section className="welcome-page reports-page" aria-labelledby="reports-title">
      <div className="welcome-heading">
        <div>
          <p className="eyebrow">RELATÓRIOS · ADMIN</p>
          <h1 id="reports-title">Relatórios financeiros</h1>
          <p>Consulte títulos ativos por vencimento e exporte os mesmos dados em CSV.</p>
        </div>
      </div>

      <div className="reports-tabs" aria-label="Tipo de relatório">
        <button
          aria-pressed={tipo === 'PAGAR'}
          className={`reports-tab${tipo === 'PAGAR' ? ' reports-tab-active' : ''}`}
          onClick={() => setTipo('PAGAR')}
          type="button"
        >
          Contas a pagar
        </button>
        <button
          aria-pressed={tipo === 'RECEBER'}
          className={`reports-tab${tipo === 'RECEBER' ? ' reports-tab-active' : ''}`}
          onClick={() => setTipo('RECEBER')}
          type="button"
        >
          Contas a receber
        </button>
      </div>

      <form className="finance-filters reports-filters" onSubmit={aplicarPeriodo}>
        <label className="field-label" htmlFor="reports-start">
          Vencimento a partir de
          <input
            id="reports-start"
            onChange={(event) => setInicio(event.target.value)}
            required
            type="date"
            value={inicio}
          />
        </label>
        <label className="field-label" htmlFor="reports-end">
          Vencimento até
          <input
            id="reports-end"
            onChange={(event) => setFim(event.target.value)}
            required
            type="date"
            value={fim}
          />
        </label>
        <div className="finance-filter-actions">
          <button className="button button-primary" disabled={carregando} type="submit">
            Aplicar período
          </button>
        </div>
      </form>

      {erro && (
        <div className="finance-error-block reports-error" role="alert">
          <p>{erro}</p>
          {relatorio === null && (
            <button
              className="button button-secondary"
              onClick={() => setTentativa((n) => n + 1)}
              type="button"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {carregando ? (
        <p className="finance-loading" role="status">
          Carregando relatório…
        </p>
      ) : relatorio ? (
        <>
          <div className="reports-summary-heading">
            <div>
              <h2>{tipo === 'PAGAR' ? 'Resumo de contas a pagar' : 'Resumo de contas a receber'}</h2>
              <p>
                {relatorio.itens.length} {relatorio.itens.length === 1 ? 'título ativo' : 'títulos ativos'} no
                período. Títulos cancelados não aparecem nem entram nos totais.
              </p>
            </div>
            <button
              className="button button-secondary"
              disabled={baixandoCsv}
              onClick={() => void exportarCsv()}
              type="button"
            >
              {baixandoCsv ? 'Preparando CSV…' : 'Baixar CSV'}
            </button>
          </div>

          <section className="dashboard-metrics-grid reports-metrics" aria-label="Totais do relatório">
            <article className="dashboard-metric-card">
              <span>{tipo === 'PAGAR' ? 'Total a pagar' : 'Total a receber'}</span>
              <strong>{formatarMoeda(relatorio.total)}</strong>
              <small>Valor dos títulos ativos com vencimento no período</small>
            </article>
            <article className="dashboard-metric-card">
              <span>{nomeLiquidado}</span>
              <strong>{formatarMoeda(relatorio.liquidado)}</strong>
              <small>Valor liquidado nos títulos do período</small>
            </article>
            <article className="dashboard-metric-card">
              <span>Pendente</span>
              <strong>{formatarMoeda(relatorio.pendente)}</strong>
              <small>Saldo em aberto dos títulos do período</small>
            </article>
          </section>

          {relatorio.itens.length === 0 ? (
            <section className="finance-card reports-empty">
              <p>Nenhum título ativo encontrado com vencimento neste período.</p>
            </section>
          ) : (
            <section className="finance-card reports-list-card" aria-label="Itens do relatório">
              <div className="finance-table-wrap">
                <table className="finance-table reports-table">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>{nomePessoa}</th>
                      <th>Categoria</th>
                      <th>Valor total</th>
                      <th>{nomeLiquidado}</th>
                      <th>Pendente</th>
                      <th>Vencimento</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.itens.map((item) => (
                      <tr key={item.id}>
                        <td className="finance-description-cell">
                          <strong>{item.descricao}</strong>
                          <span>{item.id}</span>
                        </td>
                        <td>{item.contraparte}</td>
                        <td>{item.categoria ?? '—'}</td>
                        <td>{formatarMoeda(item.valor)}</td>
                        <td>{formatarMoeda(item.liquidado)}</td>
                        <td>{formatarMoeda(Math.max(0, item.valor - item.liquidado))}</td>
                        <td>{formatarDataPtBr(item.dataVencimento)}</td>
                        <td>
                          <span className={`finance-status finance-status-${item.status.toLowerCase()}`}>
                            {rotuloStatus(item.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : null}
    </section>
  )
}
