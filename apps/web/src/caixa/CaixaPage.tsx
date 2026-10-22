import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useSession } from '../auth/session-context'
import {
  CaixaApiError,
  consultarCaixa,
  estornarMovimentacao,
  informarSaldoInicial,
  listarMovimentacoes,
} from './caixa-api'
import type { CaixaResumo, FiltrosMovimentosCaixa, MovimentoCaixa, TipoMovimentacao } from './caixa-api'

const pageSize = 20

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(data: string) {
  return new Date(data).toLocaleString('pt-BR')
}

export function CaixaPage() {
  const { user } = useSession()
  const [caixa, setCaixa] = useState<CaixaResumo | null>(null)
  const [filtros, setFiltros] = useState<FiltrosMovimentosCaixa>({})
  const [tipoFiltro, setTipoFiltro] = useState<'' | TipoMovimentacao>('')
  const [inicioFiltro, setInicioFiltro] = useState('')
  const [fimFiltro, setFimFiltro] = useState('')
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [saldoInicial, setSaldoInicial] = useState('0')
  const [salvandoAbertura, setSalvandoAbertura] = useState(false)
  const [estornoAbertoId, setEstornoAbertoId] = useState<string | null>(null)
  const [valorEstorno, setValorEstorno] = useState('')
  const [estornando, setEstornando] = useState(false)
  const [atualizacao, setAtualizacao] = useState(0)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const [resumo, lista] = await Promise.all([
        consultarCaixa(),
        listarMovimentacoes({ ...filtros, page: pagina, pageSize }),
      ])
      setCaixa(resumo)
      setSaldoInicial(resumo ? resumo.saldoInicial.toFixed(2) : '0')
      setMovimentos(lista.items)
      setTotal(lista.total)
    } catch (error) {
      setErro(error instanceof CaixaApiError ? error.message : 'Não foi possível carregar o Caixa.')
      setCaixa(null)
      setMovimentos([])
      setTotal(0)
    } finally {
      setCarregando(false)
    }
  }, [atualizacao, filtros, pagina])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function abrirCaixa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    const valor = Number(saldoInicial)
    if (!Number.isFinite(valor) || valor < 0) {
      setErro('Informe um saldo inicial igual ou maior que zero.')
      return
    }
    setSalvandoAbertura(true)
    try {
      const resumo = await informarSaldoInicial(valor)
      setCaixa(resumo)
      setSaldoInicial(resumo ? resumo.saldoInicial.toFixed(2) : '0')
      setAtualizacao((version) => version + 1)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível configurar o Caixa.')
    } finally {
      setSalvandoAbertura(false)
    }
  }

  function aplicarFiltros(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPagina(1)
    setFiltros({
      tipo: tipoFiltro || undefined,
      dataInicio: inicioFiltro || undefined,
      dataFim: fimFiltro || undefined,
    })
  }

  function limparFiltros() {
    setTipoFiltro('')
    setInicioFiltro('')
    setFimFiltro('')
    setPagina(1)
    setFiltros({})
  }

  async function confirmarEstorno(event: FormEvent<HTMLFormElement>, movimento: MovimentoCaixa) {
    event.preventDefault()
    const valor = Number(valorEstorno)
    if (!Number.isFinite(valor) || valor <= 0 || valor > movimento.saldoEstornavel) {
      setErro(`Informe um valor positivo de até ${formatarMoeda(movimento.saldoEstornavel)}.`)
      return
    }
    if (
      !window.confirm(
        `Confirma que a devolução de ${formatarMoeda(valor)} já ocorreu e deve ser registrada no Caixa?`
      )
    ) {
      return
    }
    setEstornando(true)
    setErro('')
    try {
      await estornarMovimentacao(movimento.id, valor)
      setEstornoAbertoId(null)
      setValorEstorno('')
      setAtualizacao((version) => version + 1)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível registrar o estorno.')
    } finally {
      setEstornando(false)
    }
  }

  if (user?.role !== 'ADMIN') {
    return (
      <section className="welcome-page finance-page">
        <p className="eyebrow">CAIXA</p>
        <h1>Acesso não permitido</h1>
        <p className="finance-denied-copy">
          O saldo e o histórico do Caixa estão disponíveis somente para ADMIN.
        </p>
        <Link className="text-link" to="/">
          Voltar para a visão geral
        </Link>
      </section>
    )
  }

  const podeCorrigirSaldo = caixa !== null && caixa.quantidadeMovimentacoes === 0

  return (
    <section className="welcome-page finance-page cash-page" aria-labelledby="cash-title">
      <div className="finance-page-heading">
        <div>
          <p className="eyebrow">FINANCEIRO</p>
          <h1 id="cash-title">Controle de Caixa</h1>
          <p>Pagamentos e recebimentos liquidados atualizam o Caixa Principal automaticamente.</p>
        </div>
      </div>

      {erro && (
        <div className="finance-error-block" role="alert">
          <p>{erro}</p>
          <button className="button button-secondary" onClick={() => void carregar()} type="button">
            Tentar novamente
          </button>
        </div>
      )}

      {!carregando && !erro && (!caixa || podeCorrigirSaldo) && (
        <section className="finance-card cash-opening-card" aria-labelledby="cash-opening-title">
          <div className="finance-section-heading">
            <div>
              <h2 id="cash-opening-title">
                {caixa ? 'Corrigir saldo inicial' : 'Configurar Caixa Principal'}
              </h2>
              <p>
                Informe o saldo atual consolidado em dinheiro e contas bancárias. Pagamentos anteriores não
                serão importados para o histórico.
              </p>
            </div>
          </div>
          <form className="cash-opening-form" onSubmit={(event) => void abrirCaixa(event)}>
            <label className="field-label" htmlFor="cash-opening-balance">
              Saldo inicial atual (R$)
              <input
                id="cash-opening-balance"
                min="0"
                onChange={(event) => setSaldoInicial(event.target.value)}
                required
                step="0.01"
                type="number"
                value={saldoInicial}
              />
            </label>
            <button className="button button-primary" disabled={salvandoAbertura} type="submit">
              {salvandoAbertura ? 'Salvando…' : caixa ? 'Salvar saldo inicial' : 'Abrir Caixa Principal'}
            </button>
          </form>
        </section>
      )}

      {caixa && (
        <>
          <section className="cash-summary-grid" aria-label="Resumo do Caixa Principal">
            <article className="cash-summary-card cash-summary-current">
              <span>Saldo atual</span>
              <strong>{formatarMoeda(caixa.saldoAtual)}</strong>
              <small>Saldo inicial + entradas − saídas</small>
            </article>
            <article className="cash-summary-card">
              <span>Saldo inicial</span>
              <strong>{formatarMoeda(caixa.saldoInicial)}</strong>
              <small>Informado na abertura em {formatarData(caixa.iniciadoEm)}</small>
            </article>
            <article className="cash-summary-card">
              <span>Entradas</span>
              <strong>{formatarMoeda(caixa.totalEntradas)}</strong>
              <small>Baixas e estornos recebidos</small>
            </article>
            <article className="cash-summary-card">
              <span>Saídas</span>
              <strong>{formatarMoeda(caixa.totalSaidas)}</strong>
              <small>Pagamentos e devoluções</small>
            </article>
          </section>

          <section className="finance-card cash-movement-card" aria-labelledby="cash-movements-title">
            <div className="finance-section-heading">
              <div>
                <h2 id="cash-movements-title">Movimentações</h2>
                <p>{total} registros. O histórico inclui movimentos de títulos depois cancelados.</p>
              </div>
            </div>

            <form className="finance-filters cash-filters" onSubmit={(event) => aplicarFiltros(event)}>
              <label className="field-label" htmlFor="cash-filter-type">
                Tipo
                <select
                  id="cash-filter-type"
                  onChange={(event) => setTipoFiltro(event.target.value as '' | TipoMovimentacao)}
                  value={tipoFiltro}
                >
                  <option value="">Todos</option>
                  <option value="ENTRADA">Entradas</option>
                  <option value="SAIDA">Saídas</option>
                </select>
              </label>
              <label className="field-label" htmlFor="cash-filter-start">
                Data inicial
                <input
                  id="cash-filter-start"
                  onChange={(event) => setInicioFiltro(event.target.value)}
                  type="date"
                  value={inicioFiltro}
                />
              </label>
              <label className="field-label" htmlFor="cash-filter-end">
                Data final
                <input
                  id="cash-filter-end"
                  onChange={(event) => setFimFiltro(event.target.value)}
                  type="date"
                  value={fimFiltro}
                />
              </label>
              <div className="finance-filter-actions">
                <button className="button button-secondary" onClick={limparFiltros} type="button">
                  Limpar
                </button>
                <button className="button button-primary" type="submit">
                  Buscar
                </button>
              </div>
            </form>

            {carregando ? (
              <p className="finance-loading" role="status">
                Carregando movimentações…
              </p>
            ) : movimentos.length === 0 ? (
              <p className="finance-empty">Nenhuma movimentação corresponde aos filtros.</p>
            ) : (
              <div className="finance-table-wrap cash-table-wrap">
                <table className="finance-table cash-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Movimento</th>
                      <th>Título</th>
                      <th>Cliente/fornecedor</th>
                      <th>Valor</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map((movimento) => (
                      <tr key={movimento.id}>
                        <td>{formatarData(movimento.data)}</td>
                        <td>
                          <span className={`cash-direction cash-direction-${movimento.tipo.toLowerCase()}`}>
                            {movimento.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}
                          </span>
                          {movimento.origem === 'ESTORNO' && <small className="cash-origin">Estorno</small>}
                        </td>
                        <td className="finance-description-cell">
                          <strong>{movimento.titulo?.descricao ?? movimento.descricao}</strong>
                          {movimento.titulo?.status === 'CANCELADO' && (
                            <span>Título cancelado; movimento preservado</span>
                          )}
                        </td>
                        <td>{movimento.titulo?.pessoa ?? '—'}</td>
                        <td className={movimento.tipo === 'ENTRADA' ? 'cash-amount-in' : 'cash-amount-out'}>
                          {movimento.tipo === 'ENTRADA' ? '+' : '−'} {formatarMoeda(movimento.valor)}
                        </td>
                        <td>
                          {movimento.podeEstornar ? (
                            estornoAbertoId === movimento.id ? (
                              <form
                                className="cash-refund-form"
                                onSubmit={(event) => void confirmarEstorno(event, movimento)}
                              >
                                <label className="field-label" htmlFor={`refund-${movimento.id}`}>
                                  Valor devolvido (até {formatarMoeda(movimento.saldoEstornavel)})
                                  <input
                                    autoFocus
                                    id={`refund-${movimento.id}`}
                                    max={movimento.saldoEstornavel}
                                    min="0.01"
                                    onChange={(event) => setValorEstorno(event.target.value)}
                                    required
                                    step="0.01"
                                    type="number"
                                    value={valorEstorno}
                                  />
                                </label>
                                <button className="button button-primary" disabled={estornando} type="submit">
                                  {estornando ? 'Registrando…' : 'Confirmar devolução'}
                                </button>
                                <button
                                  className="button button-secondary"
                                  disabled={estornando}
                                  onClick={() => setEstornoAbertoId(null)}
                                  type="button"
                                >
                                  Voltar
                                </button>
                              </form>
                            ) : (
                              <button
                                className="text-button cash-refund-button"
                                disabled={estornando}
                                onClick={() => {
                                  setEstornoAbertoId(movimento.id)
                                  setValorEstorno(movimento.saldoEstornavel.toFixed(2))
                                  setErro('')
                                }}
                                type="button"
                              >
                                Registrar devolução
                              </button>
                            )
                          ) : movimento.origem === 'ESTORNO' ? (
                            <span className="cash-origin">Estorno registrado</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="finance-pagination">
              <span>
                Página {pagina} de {Math.max(1, Math.ceil(total / pageSize))}
              </span>
              <div>
                <button
                  className="button button-secondary"
                  disabled={pagina <= 1 || carregando}
                  onClick={() => setPagina((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="button button-secondary"
                  disabled={pagina >= Math.max(1, Math.ceil(total / pageSize)) || carregando}
                  onClick={() =>
                    setPagina((current) => Math.min(Math.max(1, Math.ceil(total / pageSize)), current + 1))
                  }
                  type="button"
                >
                  Próxima
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  )
}
