import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { canAccessAdmin } from '../auth/protected-route'
import { useSession } from '../auth/session-context'
import { formatarDataPtBr, formatarMoeda, periodoDoMesAtual } from '../shared/formatters'
import { DashboardApiError, consultarResumoDashboard } from './dashboard-api'
import type { FiltroDashboard, ResumoDashboard } from './dashboard-api'

function formatarPeriodo(periodo: FiltroDashboard) {
  const inicio = formatarDataPtBr(periodo.dataInicio, 'medium')
  const fim = formatarDataPtBr(periodo.dataFim, 'medium')
  return `${inicio} a ${fim}`
}

function MetricCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <article className="dashboard-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{description}</small>
    </article>
  )
}

export function DashboardPage() {
  const { user } = useSession()
  const [periodoInicial] = useState(periodoDoMesAtual)
  const [inicio, setInicio] = useState(periodoInicial.dataInicio)
  const [fim, setFim] = useState(periodoInicial.dataFim)
  const [periodoAplicado, setPeriodoAplicado] = useState<FiltroDashboard>(periodoInicial)
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setResumo(await consultarResumoDashboard(periodoAplicado))
    } catch (caught) {
      setErro(caught instanceof DashboardApiError ? caught.message : 'Não foi possível carregar o resumo.')
      setResumo(null)
    } finally {
      setCarregando(false)
    }
  }, [periodoAplicado, tentativa])

  useEffect(() => {
    if (canAccessAdmin(user?.role)) void carregar()
  }, [carregar, user?.role])

  if (!canAccessAdmin(user?.role)) {
    return (
      <section className="welcome-page" role="alert">
        <p className="eyebrow">ACESSO RESTRITO</p>
        <h1>Área exclusiva para ADMIN</h1>
        <p>O resumo financeiro está disponível somente para a administração.</p>
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

  return (
    <section className="welcome-page dashboard-page" aria-labelledby="dashboard-title">
      <div className="welcome-heading">
        <div>
          <p className="eyebrow">VISÃO GERAL · ADMIN</p>
          <h1 id="dashboard-title">Olá, {user?.name}</h1>
          <p>Resumo financeiro do período selecionado.</p>
        </div>
      </div>

      <form className="finance-filters dashboard-filters" onSubmit={aplicarPeriodo}>
        <label className="field-label" htmlFor="dashboard-start">
          Período inicial
          <input
            id="dashboard-start"
            onChange={(event) => setInicio(event.target.value)}
            required
            type="date"
            value={inicio}
          />
        </label>
        <label className="field-label" htmlFor="dashboard-end">
          Período final
          <input
            id="dashboard-end"
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
        <div className="finance-error-block dashboard-error" role="alert">
          <p>{erro}</p>
          {resumo === null && (
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

      <div className="dashboard-heading-row">
        <div>
          <h2>Contas com vencimento no período</h2>
          <p>Considera a data de vencimento do título; títulos cancelados ficam fora.</p>
        </div>
        {resumo && <span className="dashboard-period">{formatarPeriodo(resumo.periodo)}</span>}
      </div>

      {carregando ? (
        <p className="finance-loading" role="status">
          Carregando indicadores financeiros…
        </p>
      ) : resumo ? (
        <>
          <section className="dashboard-group" aria-labelledby="dashboard-payable-title">
            <h3 id="dashboard-payable-title">Contas a pagar</h3>
            <div className="dashboard-metrics-grid">
              <MetricCard
                label="Total dos títulos"
                value={formatarMoeda(resumo.contasAPagar.total)}
                description="Títulos ativos com vencimento no período"
              />
              <MetricCard
                label="Liquidado"
                value={formatarMoeda(resumo.contasAPagar.pago)}
                description="Liquidado nos títulos com vencimento no período"
              />
              <MetricCard
                label="Pendente"
                value={formatarMoeda(resumo.contasAPagar.pendente)}
                description="Saldo aberto dos títulos do período"
              />
            </div>
          </section>

          <section className="dashboard-group" aria-labelledby="dashboard-receivable-title">
            <h3 id="dashboard-receivable-title">Contas a receber</h3>
            <div className="dashboard-metrics-grid">
              <MetricCard
                label="Total dos títulos"
                value={formatarMoeda(resumo.contasAReceber.total)}
                description="Títulos ativos com vencimento no período"
              />
              <MetricCard
                label="Recebido"
                value={formatarMoeda(resumo.contasAReceber.recebido)}
                description="Recebido nos títulos com vencimento no período"
              />
              <MetricCard
                label="Pendente"
                value={formatarMoeda(resumo.contasAReceber.pendente)}
                description="Saldo aberto dos títulos do período"
              />
            </div>
          </section>

          <section className="dashboard-group" aria-labelledby="dashboard-cash-title">
            <div className="dashboard-heading-row">
              <div>
                <h3 id="dashboard-cash-title">Movimentações do Caixa Principal</h3>
                <p>Considera a data efetiva de pagamentos, recebimentos e estornos.</p>
              </div>
              <Link className="text-link" to="/caixa">
                Abrir caixa
              </Link>
            </div>
            {resumo.caixa.configurado ? (
              <div className="dashboard-metrics-grid">
                <MetricCard
                  label="Entradas"
                  value={formatarMoeda(resumo.caixa.entradas)}
                  description="Movimentos de entrada no período"
                />
                <MetricCard
                  label="Saídas"
                  value={formatarMoeda(resumo.caixa.saidas)}
                  description="Movimentos de saída no período"
                />
                <MetricCard
                  label="Saldo líquido"
                  value={formatarMoeda(resumo.caixa.saldoLiquido)}
                  description="Entradas menos saídas no período"
                />
              </div>
            ) : (
              <p className="dashboard-unconfigured">
                O Caixa Principal ainda não foi configurado.{' '}
                <Link className="text-link" to="/caixa">
                  Informar saldo inicial
                </Link>
              </p>
            )}
          </section>
        </>
      ) : null}
    </section>
  )
}
