import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { canAccessAdmin } from '../auth/protected-route'
import { useSession } from '../auth/session-context'
import { Icon } from '../shared/Icon'
import { PageHeader } from '../shared/PageHeader'
import { formatarDataPtBr, formatarMoeda, periodoDoMesAtual } from '../shared/formatters'
import { baixarRelatorioCsv, consultarRelatorio, RelatoriosApiError } from './relatorios-api'
import type { FiltroRelatorio, ResumoRelatorio, TipoRelatorio } from './relatorios-api'
import './relatorios.css'

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
  const admin = canAccessAdmin(user?.role)
  const [periodoInicial] = useState(periodoDoMesAtual)
  const [tipo, setTipo] = useState<TipoRelatorio>('PAGAR')
  const [inicio, setInicio] = useState(periodoInicial.dataInicio)
  const [fim, setFim] = useState(periodoInicial.dataFim)
  const [periodoAplicado, setPeriodoAplicado] = useState<Required<FiltroRelatorio>>(periodoInicial)
  const [relatorio, setRelatorio] = useState<ResumoRelatorio | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [baixandoCsv, setBaixandoCsv] = useState(false)
  const [erro, setErro] = useState('')
  const [falhaConsulta, setFalhaConsulta] = useState(false)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!admin) return
    let ativo = true
    setCarregando(true)
    setErro('')
    setFalhaConsulta(false)
    setRelatorio(null)

    async function carregar() {
      try {
        const resultado = await consultarRelatorio(tipo, periodoAplicado)
        if (ativo) setRelatorio(resultado)
      } catch (caught) {
        if (ativo) {
          setFalhaConsulta(true)
          setErro(
            caught instanceof RelatoriosApiError ? caught.message : 'Não foi possível carregar o relatório.'
          )
        }
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    void carregar()
    return () => {
      ativo = false
    }
  }, [admin, periodoAplicado, tentativa, tipo])

  if (!admin) {
    return (
      <section className="reports-page" aria-label="Relatórios financeiros">
        <PageHeader
          title="Relatórios financeiros"
          description="Contas a pagar e a receber por vencimento, com exportação CSV."
        />
        <div className="reports-content">
          <section className="reports-access-denied" role="alert">
            <h2>Acesso não permitido</h2>
            <p>Os relatórios financeiros estão disponíveis somente para ADMIN.</p>
            <Link className="text-link" to="/dashboard">
              Voltar para a visão geral
            </Link>
          </section>
        </div>
      </section>
    )
  }

  function aplicarPeriodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setFalhaConsulta(false)
    if (inicio > fim) {
      setErro('A data final deve ser igual ou posterior à data inicial.')
      return
    }
    setCarregando(true)
    setPeriodoAplicado({ dataInicio: inicio, dataFim: fim })
  }

  function selecionarTipo(novoTipo: TipoRelatorio) {
    if (novoTipo === tipo) return
    setCarregando(true)
    setErro('')
    setFalhaConsulta(false)
    setTipo(novoTipo)
  }

  async function exportarCsv() {
    setErro('')
    setFalhaConsulta(false)
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
  const periodoLabel = `${formatarDataPtBr(periodoAplicado.dataInicio)} a ${formatarDataPtBr(periodoAplicado.dataFim)}`

  return (
    <section className="reports-page" aria-label="Relatórios financeiros">
      <PageHeader
        title="Relatórios financeiros"
        description="Contas a pagar e a receber por vencimento, com exportação CSV."
      />

      <div className="reports-content" aria-busy={carregando}>
        <section className="finance-card reports-controls" aria-label="Filtros do relatório">
          <div className="reports-section-heading">
            <span className="reports-heading-icon">
              <Icon name="paperclip" />
            </span>
            <div>
              <h2>Consulta de títulos</h2>
              <p>O período usa o vencimento do título, que corresponde à primeira parcela.</p>
            </div>
          </div>

          <div className="reports-tabs" role="group" aria-label="Tipo de relatório">
            <button
              aria-pressed={tipo === 'PAGAR'}
              className={`reports-tab${tipo === 'PAGAR' ? ' reports-tab-active' : ''}`}
              disabled={carregando}
              onClick={() => selecionarTipo('PAGAR')}
              type="button"
            >
              Contas a pagar
            </button>
            <button
              aria-pressed={tipo === 'RECEBER'}
              className={`reports-tab${tipo === 'RECEBER' ? ' reports-tab-active' : ''}`}
              disabled={carregando}
              onClick={() => selecionarTipo('RECEBER')}
              type="button"
            >
              Contas a receber
            </button>
          </div>

          <form className="reports-filters" onSubmit={aplicarPeriodo}>
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
            <button className="button button-primary reports-apply" disabled={carregando} type="submit">
              {carregando ? 'Atualizando…' : 'Aplicar período'}
            </button>
          </form>
        </section>

        {erro && (
          <div className="finance-error-block reports-error" role="alert">
            <p>{erro}</p>
            {falhaConsulta && (
              <button
                className="button button-secondary"
                onClick={() => {
                  setCarregando(true)
                  setTentativa((current) => current + 1)
                }}
                type="button"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {carregando ? (
          <div className="reports-loading" role="status">
            <span className="reports-loading-mark" aria-hidden="true" />
            <span>Carregando relatório…</span>
          </div>
        ) : relatorio ? (
          <>
            <div className="reports-result-heading">
              <div>
                <h2>{tipo === 'PAGAR' ? 'Resumo de contas a pagar' : 'Resumo de contas a receber'}</h2>
                <p>
                  {relatorio.itens.length} {relatorio.itens.length === 1 ? 'título' : 'títulos'} com
                  vencimento entre {periodoLabel}. Títulos cancelados não entram nos resultados.
                </p>
              </div>
              <button
                className="button button-secondary reports-export"
                disabled={baixandoCsv}
                onClick={() => void exportarCsv()}
                type="button"
              >
                {baixandoCsv ? 'Preparando CSV…' : 'Baixar CSV'}
              </button>
            </div>

            <section className="reports-summary-grid" aria-label="Totais do relatório">
              <article className="reports-summary-card">
                <span>{tipo === 'PAGAR' ? 'Total a pagar' : 'Total a receber'}</span>
                <strong>{formatarMoeda(relatorio.total)}</strong>
                <small>Valor dos títulos não cancelados com vencimento no período</small>
              </article>
              <article className="reports-summary-card reports-summary-settled">
                <span>{nomeLiquidado}</span>
                <strong>{formatarMoeda(relatorio.liquidado)}</strong>
                <small>Valor liquidado nos títulos selecionados</small>
              </article>
              <article className="reports-summary-card reports-summary-pending">
                <span>Em aberto</span>
                <strong>{formatarMoeda(relatorio.pendente)}</strong>
                <small>Saldo pendente dos títulos selecionados</small>
              </article>
            </section>

            {relatorio.itens.length === 0 ? (
              <section className="finance-card reports-empty" aria-live="polite">
                <span className="reports-heading-icon" aria-hidden="true">
                  <Icon name="paperclip" />
                </span>
                <h2>Nenhum título neste período</h2>
                <p>Não há títulos não cancelados com vencimento entre {periodoLabel}.</p>
              </section>
            ) : (
              <section className="finance-card reports-list-card" aria-label="Títulos do relatório">
                <div className="reports-list-heading">
                  <div>
                    <h2>Títulos do período</h2>
                    <p>Valores registrados na API Financeira.</p>
                  </div>
                  <span className="reports-item-count">
                    {relatorio.itens.length} {relatorio.itens.length === 1 ? 'registro' : 'registros'}
                  </span>
                </div>
                <div className="reports-table-wrap">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Descrição</th>
                        <th>{nomePessoa}</th>
                        <th>Categoria</th>
                        <th>Valor total</th>
                        <th>{nomeLiquidado}</th>
                        <th>Em aberto</th>
                        <th>Vencimento</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.itens.map((item) => (
                        <tr key={item.id}>
                          <td className="reports-description" data-label="Descrição">
                            <strong>{item.descricao}</strong>
                          </td>
                          <td data-label={nomePessoa}>{item.contraparte}</td>
                          <td data-label="Categoria">{item.categoria ?? '—'}</td>
                          <td className="reports-amount" data-label="Valor total">
                            {formatarMoeda(item.valor)}
                          </td>
                          <td className="reports-amount" data-label={nomeLiquidado}>
                            {formatarMoeda(item.liquidado)}
                          </td>
                          <td className="reports-amount reports-amount-pending" data-label="Em aberto">
                            {formatarMoeda(Math.max(0, item.valor - item.liquidado))}
                          </td>
                          <td data-label="Vencimento">{formatarDataPtBr(item.dataVencimento)}</td>
                          <td data-label="Status">
                            <span className={`reports-status reports-status-${item.status.toLowerCase()}`}>
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
      </div>
    </section>
  )
}
