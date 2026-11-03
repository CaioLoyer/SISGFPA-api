import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DashboardMetric, DashboardOverview } from '@sisgfpa/types'

import { PageHeader } from '../shared/PageHeader'
import { formatarMoeda, periodoDoMesAtual } from '../shared/formatters'
import { CategoryChart, MonthlyChart } from './DashboardCharts'
import { consultarVisaoGeral } from './dashboard-api'
import './dashboard.css'

const monthTitle = (mes: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${mes}-01T00:00:00Z`)
  )

function MetricCard({
  title,
  metric,
  expense = false,
  hint,
}: {
  title: string
  metric: DashboardMetric
  expense?: boolean
  hint: string
}) {
  const delta = metric.variacaoPercentual
  const favorable = delta !== null && (expense ? delta <= 0 : delta >= 0)
  return (
    <article className={`overview-metric${expense ? ' overview-metric-expense' : ''}`}>
      <h2>{title}</h2>
      <strong>{metric.valor === null ? '—' : formatarMoeda(metric.valor)}</strong>
      {delta !== null ? (
        <span
          className={`overview-change ${favorable ? 'overview-change-good' : 'overview-change-bad'}`}
          title="Comparação com o mês anterior"
        >
          {delta > 0 ? '+' : ''}
          {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(delta)}%{' '}
          {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}
          <span className="overview-screen-reader"> em relação ao mês anterior</span>
        </span>
      ) : (
        <span className="overview-metric-hint">{hint}</span>
      )}
    </article>
  )
}

export function DashboardPage() {
  const [mes, setMes] = useState(() => periodoDoMesAtual().dataInicio.slice(0, 7))
  const [snapshot, setData] = useState<DashboardOverview | null>(null)
  const data = snapshot?.mes === mes ? snapshot : null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [updatedAt, setUpdatedAt] = useState('')

  useEffect(() => {
    let active = true
    let controller: AbortController | undefined
    setData((current) => (current?.mes === mes ? current : null))
    setError('')
    async function load() {
      controller?.abort()
      const request = new AbortController()
      controller = request
      setLoading(true)
      try {
        const overview = await consultarVisaoGeral(mes, request.signal)
        if (active && !request.signal.aborted) {
          setData(overview)
          setError('')
          setUpdatedAt(
            new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())
          )
        }
      } catch (caught) {
        if (active && !request.signal.aborted) {
          setData(null)
          setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a dashboard.')
        }
      } finally {
        if (active && !request.signal.aborted) setLoading(false)
      }
    }
    void load()
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const timer = window.setInterval(refreshVisible, 60_000)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      active = false
      controller?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [mes, version])

  const permitted = data && (data.permissoes.despesas || data.permissoes.recebimentos)
  const partial = data && data.permissoes.despesas !== data.permissoes.recebimentos
  const hint = data?.caixaConfigurado === false ? 'Caixa não configurado' : 'Sem base no mês anterior'

  return (
    <section className="overview-page">
      <PageHeader title="Dashboard Financeiro" description={`Visão geral do desempenho — ${monthTitle(mes)}`}>
        <label className="overview-month">
          <span className="overview-screen-reader">Mês da dashboard</span>
          <input
            aria-label="Mês da dashboard"
            type="month"
            min="1900-01"
            max="9999-12"
            value={mes}
            onChange={(event) => {
              if (/^(?:19|[2-9]\d)\d{2}-(?:0[1-9]|1[0-2])$/.test(event.target.value))
                setMes(event.target.value)
            }}
          />
        </label>
      </PageHeader>
      <div className="overview-content" aria-busy={loading}>
        {loading && !data && (
          <div className="overview-panel overview-notice" role="status">
            Carregando informações financeiras…
          </div>
        )}
        {error && (
          <div className="overview-panel overview-notice" role="alert">
            <h2>Não foi possível atualizar a dashboard</h2>
            <p>{error}</p>
            <button type="button" onClick={() => setVersion((value) => value + 1)}>
              Tentar novamente
            </button>
            <Link to="/login">Ir para o login</Link>
          </div>
        )}
        {data && !permitted && (
          <div className="overview-panel overview-notice">
            <h2>Bem-vindo à plataforma</h2>
            <p>
              Sua conta não possui acesso aos módulos financeiros. Solicite à administração as permissões
              necessárias.
            </p>
            <Link to="/perfil">Acessar meu perfil →</Link>
          </div>
        )}
        {data && permitted && (
          <>
            {partial && (
              <p className="overview-scope" role="note">
                Visão limitada às {data.permissoes.despesas ? 'contas a pagar' : 'contas a receber'}. Os
                indicadores e gráficos representam somente as movimentações desse módulo.
              </p>
            )}
            {data.caixaConfigurado === false && (
              <p className="overview-scope">
                O Caixa Principal ainda não foi configurado. As pendências dos títulos estão disponíveis
                abaixo.
                {data.permissoes.caixa && (
                  <>
                    {' '}
                    <Link to="/caixa">Configurar caixa →</Link>
                  </>
                )}
              </p>
            )}
            <div className="overview-metrics">
              <MetricCard title="Entradas" metric={data.indicadores.entradas} hint={hint} />
              <MetricCard title="Saídas" metric={data.indicadores.saidas} expense hint={hint} />
              <MetricCard title="Resultado do caixa" metric={data.indicadores.resultado} hint={hint} />
              <MetricCard
                title="Ticket médio recebido"
                metric={data.indicadores.ticketMedio}
                hint={
                  !data.permissoes.recebimentos
                    ? 'Sem permissão de recebimentos'
                    : data.caixaConfigurado === false
                      ? hint
                      : data.indicadores.ticketMedio.valor === null
                        ? 'Nenhuma baixa recebida no mês'
                        : 'Sem base no mês anterior'
                }
              />
            </div>
            {data.caixaConfigurado && (
              <>
                <div className="overview-charts">
                  <MonthlyChart points={data.serieMensal} entryLabel="Entradas" exitLabel="Saídas" />
                  <CategoryChart title="Saídas por categoria" points={data.saidasPorCategoria} />
                </div>
                <section
                  className="overview-panel overview-transactions"
                  aria-labelledby="overview-transactions-title"
                >
                  <div className="overview-transactions-heading">
                    <h2 id="overview-transactions-title">Últimas movimentações</h2>
                    {data.permissoes.caixa && <Link to="/caixa">Ver caixa →</Link>}
                  </div>
                  {data.ultimasMovimentacoes.length ? (
                    <div
                      className="overview-table-scroll"
                      tabIndex={0}
                      role="region"
                      aria-label="Últimas movimentações do mês"
                    >
                      <table>
                        <caption className="overview-screen-reader">
                          Últimas cinco movimentações de {monthTitle(mes)}, incluindo estornos
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Data</th>
                            <th scope="col">Descrição</th>
                            <th scope="col">Categoria</th>
                            <th scope="col" className="overview-money">
                              Valor
                            </th>
                            <th scope="col">Situação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.ultimasMovimentacoes.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <time dateTime={item.data}>
                                  {new Intl.DateTimeFormat('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    timeZone: 'UTC',
                                  }).format(new Date(item.data))}
                                </time>
                              </td>
                              <td>
                                {item.tipoTitulo ? (
                                  <Link to={item.tipoTitulo === 'DESPESA' ? '/despesas' : '/recebimentos'}>
                                    {item.descricao}
                                  </Link>
                                ) : (
                                  item.descricao
                                )}
                              </td>
                              <td>{item.categoria ?? 'Sem categoria'}</td>
                              <td
                                className={`overview-money ${item.tipo === 'ENTRADA' ? 'overview-positive' : 'overview-negative'}`}
                              >
                                {item.tipo === 'ENTRADA' ? '+' : '−'} {formatarMoeda(item.valor)}
                              </td>
                              <td>
                                <span
                                  className={`overview-status${item.origem === 'ESTORNO' ? ' overview-status-reversal' : ''}`}
                                >
                                  {item.origem === 'ESTORNO' ? 'Estorno' : 'Confirmado'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="overview-empty">Nenhuma movimentação registrada neste mês.</p>
                  )}
                </section>
              </>
            )}
            <section className="overview-balances" aria-label="Saldos e pendências">
              {data.permissoes.caixa && (
                <Link to="/caixa">
                  <span>Saldo atual em caixa</span>
                  <strong>
                    {data.resumo.saldoAtual === null ? '—' : formatarMoeda(data.resumo.saldoAtual)}
                  </strong>
                  <small>Consolidado de todas as movimentações</small>
                </Link>
              )}
              {data.permissoes.recebimentos && (
                <Link to="/recebimentos">
                  <span>A receber</span>
                  <strong>{data.resumo.aReceber === null ? '—' : formatarMoeda(data.resumo.aReceber)}</strong>
                  <small>Títulos com vencimento no mês</small>
                </Link>
              )}
              {data.permissoes.despesas && (
                <Link to="/despesas">
                  <span>A pagar</span>
                  <strong>{data.resumo.aPagar === null ? '—' : formatarMoeda(data.resumo.aPagar)}</strong>
                  <small>Títulos com vencimento no mês</small>
                </Link>
              )}
            </section>
            <p className="overview-explanation">
              Entradas e saídas incluem estornos e seguem a data efetiva da movimentação (UTC). O ticket médio
              considera cada baixa recebida, inclusive parcial, e exclui estornos.
            </p>
          </>
        )}
        {data && (
          <div className="overview-refresh">
            <span>Atualizado às {updatedAt} · atualização a cada minuto</span>
            <button type="button" disabled={loading} onClick={() => setVersion((value) => value + 1)}>
              {loading ? 'Atualizando…' : 'Atualizar agora'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
