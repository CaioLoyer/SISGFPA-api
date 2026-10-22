import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { listarContatos } from '../contatos/contatos-api'
import type { Contato } from '../contatos/contatos-api'
import { useSession } from '../auth/session-context'
import {
  atualizarTitulo,
  buscarTitulo,
  cancelarTitulo,
  criarTitulo,
  FinanceiroApiError,
  listarCategorias,
  listarTitulos,
} from './financeiro-api'
import type {
  CategoriaFinanceira,
  DetalheTituloFinanceiro,
  EntradaTituloFinanceiro,
  FinanceiroTipo,
  FiltrosTitulos,
  StatusTitulo,
  TituloFinanceiro,
} from './financeiro-api'

const pageSize = 20
const statusOptions: Array<{ value: StatusTitulo; label: string }> = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'PARCIAL', label: 'Parcial' },
  { value: 'PAGO', label: 'Pago' },
  { value: 'CANCELADO', label: 'Cancelado' },
]

interface FiltrosFormulario {
  pessoa: string
  status: '' | StatusTitulo
  categoriaId: string
  dataInicio: string
  dataFim: string
}

interface FormularioTitulo {
  descricao: string
  pessoa: string
  contatoId: string | null
  valor: string
  dataLancamento: string
  dataVencimento: string
  parcelas: string
  categoriaId: string
  observacoes: string
}

function dataHoje() {
  const hoje = new Date()
  const local = new Date(hoje.getTime() - hoje.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function formularioInicial(): FormularioTitulo {
  return {
    descricao: '',
    pessoa: '',
    contatoId: null,
    valor: '',
    dataLancamento: dataHoje(),
    dataVencimento: '',
    parcelas: '1',
    categoriaId: '',
    observacoes: '',
  }
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(valor: string) {
  if (!valor) return '—'
  const [ano, mes, dia] = valor.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

function nomeStatus(status: StatusTitulo) {
  return statusOptions.find((item) => item.value === status)?.label ?? status
}

function nomeAcao(acao: string) {
  const nomes: Record<string, string> = {
    CRIADO: 'Título criado',
    ATUALIZADO: 'Título atualizado',
    PAGAMENTO_REGISTRADO: 'Pagamento registrado',
    BAIXA_REGISTRADA: 'Recebimento registrado',
    CANCELADO: 'Título cancelado',
  }
  return nomes[acao] ?? acao.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')
}

function rotuloTipo(tipo: FinanceiroTipo) {
  return tipo === 'DESPESA' ? 'despesa' : 'recebimento'
}

function rotuloPessoa(tipo: FinanceiroTipo) {
  return tipo === 'DESPESA' ? 'Fornecedor' : 'Cliente'
}

function dadosFiltro(filtros: FiltrosFormulario): FiltrosTitulos {
  return {
    pessoa: filtros.pessoa.trim() || undefined,
    status: filtros.status || undefined,
    categoriaId: filtros.categoriaId || undefined,
    dataInicio: filtros.dataInicio || undefined,
    dataFim: filtros.dataFim || undefined,
  }
}

function dataDeFormulario(titulo: TituloFinanceiro): FormularioTitulo {
  return {
    descricao: titulo.descricao,
    pessoa: titulo.pessoa,
    contatoId: titulo.contatoId,
    valor: String(titulo.valor),
    dataLancamento: titulo.dataLancamento,
    dataVencimento: titulo.dataVencimento,
    parcelas: String(titulo.numeroParcelas),
    categoriaId: titulo.categoria?.id ?? '',
    observacoes: titulo.observacoes ?? '',
  }
}

function normalizarErro(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function TitulosPage({ tipo }: { tipo: FinanceiroTipo }) {
  const { user } = useSession()
  const [titulos, setTitulos] = useState<TituloFinanceiro[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [recarregarLista, setRecarregarLista] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState<FinanceiroApiError | null>(null)
  const [filtros, setFiltros] = useState<FiltrosFormulario>({
    pessoa: '',
    status: '',
    categoriaId: '',
    dataInicio: '',
    dataFim: '',
  })
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosTitulos>({})
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([])
  const [erroCategorias, setErroCategorias] = useState('')
  const [formulario, setFormulario] = useState<FormularioTitulo>(formularioInicial)
  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState<TituloFinanceiro | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroFormulario, setErroFormulario] = useState('')
  const [erroAcao, setErroAcao] = useState('')
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [contatosSugeridos, setContatosSugeridos] = useState<Contato[]>([])
  const [erroBuscaContato, setErroBuscaContato] = useState('')
  const [contatoEmFoco, setContatoEmFoco] = useState(false)
  const [tituloSelecionadoId, setTituloSelecionadoId] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<DetalheTituloFinanceiro | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const [erroDetalhe, setErroDetalhe] = useState('')
  const [recarregarDetalhe, setRecarregarDetalhe] = useState(0)

  const tituloDeDespesa = tipo === 'DESPESA'
  const tituloPagina = tituloDeDespesa ? 'Contas a pagar' : 'Contas a receber'
  const subtitulo = tituloDeDespesa
    ? 'Consulte e cadastre despesas da empresa.'
    : 'Consulte e cadastre valores a receber.'
  const pessoaLabel = rotuloPessoa(tipo)
  const paginaFinal = Math.max(1, Math.ceil(total / pageSize))
  const valorLiquidadoLabel = tituloDeDespesa ? 'Pago' : 'Recebido'
  const valorEmAbertoLabel = tituloDeDespesa ? 'Em aberto' : 'A receber'

  const carregarTitulos = useCallback(async () => {
    setCarregando(true)
    setErroLista(null)
    try {
      const resultado = await listarTitulos(tipo, {
        ...filtrosAplicados,
        page: pagina,
        pageSize,
      })
      setTitulos(resultado.items)
      setTotal(resultado.total)
    } catch (error) {
      setErroLista(
        error instanceof FinanceiroApiError
          ? error
          : new FinanceiroApiError(normalizarErro(error, 'Não foi possível carregar os títulos.'))
      )
      setTitulos([])
      setTotal(0)
    } finally {
      setCarregando(false)
    }
  }, [filtrosAplicados, pagina, recarregarLista, tipo])

  useEffect(() => {
    void carregarTitulos()
  }, [carregarTitulos])

  useEffect(() => {
    let ativo = true
    setErroCategorias('')
    void listarCategorias(tipo)
      .then((resultado) => {
        if (ativo) setCategorias(resultado)
      })
      .catch((error: unknown) => {
        if (ativo) setErroCategorias(normalizarErro(error, 'Não foi possível carregar as categorias.'))
      })
    return () => {
      ativo = false
    }
  }, [tipo])

  useEffect(() => {
    if (!formAberto || formulario.contatoId || formulario.pessoa.trim().length < 2) {
      setContatosSugeridos([])
      setErroBuscaContato('')
      return
    }

    let ativo = true
    const consulta = setTimeout(() => {
      setErroBuscaContato('')
      void listarContatos({
        papel: tituloDeDespesa ? 'FORNECEDOR' : 'CLIENTE',
        busca: formulario.pessoa.trim(),
        situacao: 'ATIVOS',
        page: 1,
        pageSize: 10,
      })
        .then((resultado) => {
          if (ativo) setContatosSugeridos(resultado.items)
        })
        .catch((error: unknown) => {
          if (ativo) {
            setContatosSugeridos([])
            setErroBuscaContato(normalizarErro(error, 'Não foi possível buscar contatos.'))
          }
        })
    }, 250)

    return () => {
      ativo = false
      clearTimeout(consulta)
    }
  }, [formAberto, formulario.contatoId, formulario.pessoa, tituloDeDespesa])

  useEffect(() => {
    if (!tituloSelecionadoId) {
      setDetalhe(null)
      setErroDetalhe('')
      return
    }
    let ativo = true
    setCarregandoDetalhe(true)
    setErroDetalhe('')
    void buscarTitulo(tipo, tituloSelecionadoId)
      .then((resultado) => {
        if (ativo) setDetalhe(resultado)
      })
      .catch((error: unknown) => {
        if (ativo) {
          setDetalhe(null)
          setErroDetalhe(normalizarErro(error, 'Não foi possível carregar os detalhes do título.'))
        }
      })
      .finally(() => {
        if (ativo) setCarregandoDetalhe(false)
      })
    return () => {
      ativo = false
    }
  }, [recarregarDetalhe, tipo, tituloSelecionadoId])

  function aplicarFiltros(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPagina(1)
    setFiltrosAplicados(dadosFiltro(filtros))
  }

  function limparFiltros() {
    const vazios: FiltrosFormulario = {
      pessoa: '',
      status: '',
      categoriaId: '',
      dataInicio: '',
      dataFim: '',
    }
    setFiltros(vazios)
    setPagina(1)
    setFiltrosAplicados({})
  }

  function iniciarNovoTitulo() {
    setEditando(null)
    setFormulario(formularioInicial())
    setErroFormulario('')
    setErroAcao('')
    setMensagem('')
    setFormAberto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function iniciarEdicao(titulo: TituloFinanceiro) {
    setEditando(titulo)
    setFormulario(dataDeFormulario(titulo))
    setErroFormulario('')
    setErroAcao('')
    setMensagem('')
    setFormAberto(true)
    setContatosSugeridos([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function fecharFormulario() {
    setFormAberto(false)
    setEditando(null)
    setFormulario(formularioInicial())
    setErroFormulario('')
    setContatosSugeridos([])
    setContatoEmFoco(false)
  }

  function atualizarCampo<K extends keyof FormularioTitulo>(campo: K, valor: FormularioTitulo[K]) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }))
  }

  function selecionarContato(contato: Contato) {
    setFormulario((atual) => ({ ...atual, pessoa: contato.nome, contatoId: contato.id }))
    setContatosSugeridos([])
    setContatoEmFoco(false)
  }

  async function salvarTitulo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErroFormulario('')
    setMensagem('')
    if (!formulario.descricao.trim() || !formulario.pessoa.trim()) {
      setErroFormulario('Informe a descrição e o nome do cliente ou fornecedor.')
      return
    }
    if (!editando && !formulario.contatoId) {
      setErroFormulario(
        `Selecione um cadastro ativo de ${pessoaLabel.toLocaleLowerCase('pt-BR')} para vincular ao título.`
      )
      return
    }
    const valor = Number(formulario.valor)
    const parcelas = Number(formulario.parcelas)
    if (!Number.isFinite(valor) || valor <= 0) {
      setErroFormulario('Informe um valor maior que zero.')
      return
    }
    if (!editando && (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 120)) {
      setErroFormulario('Informe de 1 a 120 parcelas.')
      return
    }

    const entrada: EntradaTituloFinanceiro = {
      descricao: formulario.descricao.trim(),
      pessoa: formulario.pessoa.trim(),
      contatoId: formulario.contatoId,
      valor,
      dataLancamento: formulario.dataLancamento,
      dataVencimento: formulario.dataVencimento,
      parcelas,
      categoriaId: formulario.categoriaId || null,
      observacoes: formulario.observacoes.trim(),
    }

    setSalvando(true)
    try {
      if (editando) {
        await atualizarTitulo(tipo, editando.id, entrada)
        setMensagem('Título atualizado. O histórico de alterações foi preservado.')
      } else {
        await criarTitulo(tipo, entrada)
        setMensagem('Título cadastrado com sucesso.')
      }
      fecharFormulario()
      setPagina(1)
      setRecarregarLista((versao) => versao + 1)
      if (tituloSelecionadoId && tituloSelecionadoId === editando?.id) {
        setRecarregarDetalhe((versao) => versao + 1)
      }
    } catch (error) {
      setErroFormulario(normalizarErro(error, `Não foi possível salvar o ${rotuloTipo(tipo)}.`))
    } finally {
      setSalvando(false)
    }
  }

  function abrirDetalhes(titulo: TituloFinanceiro) {
    setTituloSelecionadoId(titulo.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function cancelar(titulo: TituloFinanceiro) {
    const valorJaLiquidado =
      titulo.valorLiquidado > 0
        ? `\n\nO valor já ${tituloDeDespesa ? 'pago' : 'recebido'} (${formatarMoeda(titulo.valorLiquidado)}) será preservado no histórico.`
        : ''
    if (
      !window.confirm(
        `Deseja cancelar o título “${titulo.descricao}”? O registro será preservado no histórico.${valorJaLiquidado}`
      )
    ) {
      return
    }

    setErroAcao('')
    setMensagem('')
    setCancelandoId(titulo.id)
    try {
      await cancelarTitulo(tipo, titulo.id)
      setMensagem('Título cancelado. O registro e o histórico foram preservados.')
      setRecarregarLista((versao) => versao + 1)
      if (tituloSelecionadoId === titulo.id) setRecarregarDetalhe((versao) => versao + 1)
    } catch (error) {
      setErroAcao(normalizarErro(error, 'Não foi possível cancelar o título.'))
    } finally {
      setCancelandoId(null)
    }
  }

  if (erroLista?.status === 403) {
    return (
      <section className="welcome-page finance-page" aria-labelledby="finance-denied-title">
        <p className="eyebrow">{tituloPagina.toLocaleUpperCase('pt-BR')}</p>
        <h1 id="finance-denied-title">Acesso não permitido</h1>
        <p className="finance-denied-copy">{erroLista.message}</p>
        <Link className="text-link" to="/">
          Voltar para a visão geral
        </Link>
      </section>
    )
  }

  return (
    <section className="welcome-page finance-page" aria-labelledby="finance-title">
      <div className="finance-page-heading">
        <div>
          <p className="eyebrow">FINANCEIRO</p>
          <h1 id="finance-title">{tituloPagina}</h1>
          <p>{subtitulo}</p>
        </div>
        <button className="button button-primary" onClick={iniciarNovoTitulo} type="button">
          + Novo título
        </button>
      </div>

      {mensagem && (
        <p className="commercial-success" role="status">
          {mensagem}
        </p>
      )}
      {erroAcao && (
        <p className="form-error" role="alert">
          {erroAcao}
        </p>
      )}

      {formAberto && (
        <section className="finance-card finance-form-card" aria-labelledby="finance-form-title">
          <div className="finance-form-heading">
            <div>
              <h2 id="finance-form-title">{editando ? 'Editar título' : 'Novo título'}</h2>
              <p>
                {editando
                  ? 'Atualize os dados permitidos sem apagar o histórico.'
                  : `Cadastre ${rotuloTipo(tipo)} com vencimento e parcelamento.`}
              </p>
            </div>
          </div>

          {erroCategorias && (
            <p className="form-error" role="alert">
              {erroCategorias}
            </p>
          )}
          {erroFormulario && (
            <p className="form-error" role="alert">
              {erroFormulario}
            </p>
          )}

          <form className="finance-form" onSubmit={(event) => void salvarTitulo(event)}>
            <label className="field-label" htmlFor="finance-description">
              Descrição *
              <input
                autoComplete="off"
                id="finance-description"
                onChange={(event) => atualizarCampo('descricao', event.target.value)}
                required
                value={formulario.descricao}
              />
            </label>

            <div className="finance-contact-field">
              <label className="field-label" htmlFor="finance-person">
                {pessoaLabel} *
                <input
                  autoComplete="off"
                  id="finance-person"
                  onBlur={() => window.setTimeout(() => setContatoEmFoco(false), 120)}
                  onChange={(event) => {
                    atualizarCampo('pessoa', event.target.value)
                    atualizarCampo('contatoId', null)
                  }}
                  onFocus={() => setContatoEmFoco(true)}
                  placeholder={`Digite para buscar ${pessoaLabel.toLocaleLowerCase('pt-BR')} cadastrado`}
                  required
                  value={formulario.pessoa}
                />
              </label>
              {contatoEmFoco && contatosSugeridos.length > 0 && !formulario.contatoId && (
                <ul
                  className="finance-contact-suggestions"
                  aria-label={`Sugestões de ${pessoaLabel.toLowerCase()}`}
                >
                  {contatosSugeridos.map((contato) => (
                    <li key={contato.id}>
                      <button onMouseDown={() => selecionarContato(contato)} type="button">
                        <strong>{contato.nome}</strong>
                        <span>{contato.tipoPessoa === 'FISICA' ? 'Pessoa física' : 'Pessoa jurídica'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {erroBuscaContato && <span className="finance-field-hint">{erroBuscaContato}</span>}
              {formulario.contatoId && (
                <span className="finance-field-hint">Contato comercial vinculado.</span>
              )}
              {!formulario.contatoId && !editando && (
                <span className="finance-field-hint">
                  Se o cadastro ainda não existir, crie-o em{' '}
                  <Link className="text-link" to="/comercial">
                    Comercial
                  </Link>
                  .
                </span>
              )}
            </div>

            <label className="field-label" htmlFor="finance-value">
              Valor total *
              <input
                disabled={Boolean(editando && editando.valorLiquidado > 0)}
                id="finance-value"
                inputMode="decimal"
                min="0.01"
                onChange={(event) => atualizarCampo('valor', event.target.value)}
                required
                step="0.01"
                type="number"
                value={formulario.valor}
              />
            </label>

            <label className="field-label" htmlFor="finance-due-date">
              Vencimento da primeira parcela *
              <input
                disabled={Boolean(editando && editando.valorLiquidado > 0)}
                id="finance-due-date"
                onChange={(event) => atualizarCampo('dataVencimento', event.target.value)}
                required
                type="date"
                value={formulario.dataVencimento}
              />
            </label>

            {!editando ? (
              <>
                <label className="field-label" htmlFor="finance-entry-date">
                  Data de lançamento *
                  <input
                    id="finance-entry-date"
                    onChange={(event) => atualizarCampo('dataLancamento', event.target.value)}
                    required
                    type="date"
                    value={formulario.dataLancamento}
                  />
                </label>
                <label className="field-label" htmlFor="finance-installments">
                  Número de parcelas *
                  <input
                    id="finance-installments"
                    max="120"
                    min="1"
                    onChange={(event) => atualizarCampo('parcelas', event.target.value)}
                    required
                    type="number"
                    value={formulario.parcelas}
                  />
                </label>
              </>
            ) : (
              <div className="finance-readonly-field">
                <span>Data de lançamento</span>
                <strong>{formatarData(editando.dataLancamento)}</strong>
              </div>
            )}

            <label className="field-label" htmlFor="finance-category">
              Categoria
              <select
                id="finance-category"
                onChange={(event) => atualizarCampo('categoriaId', event.target.value)}
                value={formulario.categoriaId}
              >
                <option value="">Sem categoria</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </label>

            {editando && (
              <div className="finance-readonly-field">
                <span>Parcelas</span>
                <strong>{editando.numeroParcelas}</strong>
              </div>
            )}

            {editando && editando.valorLiquidado > 0 && (
              <p className="finance-form-note">
                Este título já tem {valorLiquidadoLabel.toLocaleLowerCase('pt-BR')} registrado. O valor e o
                vencimento ficam bloqueados para preservar as parcelas liquidadas.
              </p>
            )}

            <label className="field-label finance-notes-field" htmlFor="finance-notes">
              Observações
              <textarea
                id="finance-notes"
                maxLength={500}
                onChange={(event) => atualizarCampo('observacoes', event.target.value)}
                rows={4}
                value={formulario.observacoes}
              />
              <span className="finance-field-hint">{formulario.observacoes.length} / 500 caracteres</span>
            </label>

            <div className="finance-form-actions">
              <button
                className="button button-secondary"
                disabled={salvando}
                onClick={fecharFormulario}
                type="button"
              >
                Descartar
              </button>
              <button className="button button-primary" disabled={salvando} type="submit">
                {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar título'}
              </button>
            </div>
          </form>
        </section>
      )}

      {tituloSelecionadoId && (
        <DetalheTitulo
          detalhe={detalhe}
          erro={erroDetalhe}
          carregando={carregandoDetalhe}
          onClose={() => setTituloSelecionadoId(null)}
          tipo={tipo}
        />
      )}

      <section className="finance-card" aria-labelledby="finance-filters-title">
        <div className="finance-section-heading">
          <div>
            <h2 id="finance-filters-title">Filtros de pesquisa</h2>
            <p>O período considera o vencimento informado para o título.</p>
          </div>
        </div>
        <form className="finance-filters" onSubmit={aplicarFiltros}>
          <label className="field-label" htmlFor="finance-filter-person">
            {pessoaLabel}
            <input
              id="finance-filter-person"
              onChange={(event) => setFiltros((atual) => ({ ...atual, pessoa: event.target.value }))}
              placeholder={`Buscar ${pessoaLabel.toLocaleLowerCase('pt-BR')}`}
              value={filtros.pessoa}
            />
          </label>
          <label className="field-label" htmlFor="finance-filter-status">
            Status
            <select
              id="finance-filter-status"
              onChange={(event) =>
                setFiltros((atual) => ({
                  ...atual,
                  status: event.target.value as FiltrosFormulario['status'],
                }))
              }
              value={filtros.status}
            >
              <option value="">Todos</option>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label" htmlFor="finance-filter-category">
            Categoria
            <select
              id="finance-filter-category"
              onChange={(event) => setFiltros((atual) => ({ ...atual, categoriaId: event.target.value }))}
              value={filtros.categoriaId}
            >
              <option value="">Todas</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label" htmlFor="finance-filter-start">
            Vencimento a partir de
            <input
              id="finance-filter-start"
              onChange={(event) => setFiltros((atual) => ({ ...atual, dataInicio: event.target.value }))}
              type="date"
              value={filtros.dataInicio}
            />
          </label>
          <label className="field-label" htmlFor="finance-filter-end">
            Vencimento até
            <input
              id="finance-filter-end"
              onChange={(event) => setFiltros((atual) => ({ ...atual, dataFim: event.target.value }))}
              type="date"
              value={filtros.dataFim}
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
      </section>

      <section className="finance-card finance-list-card" aria-labelledby="finance-list-title">
        <div className="finance-section-heading finance-list-heading">
          <div>
            <h2 id="finance-list-title">Títulos</h2>
            <p>
              {total} {total === 1 ? 'registro encontrado' : 'registros encontrados'}
            </p>
          </div>
          <span className="finance-list-subtitle">Títulos pagos e cancelados não têm saldo em aberto.</span>
        </div>

        {erroLista && (
          <div className="finance-error-block" role="alert">
            <p>{erroLista.message}</p>
            {erroLista.status === 401 && (
              <Link className="text-link" to="/login">
                Entrar novamente
              </Link>
            )}
            <button className="button button-secondary" onClick={() => void carregarTitulos()} type="button">
              Tentar novamente
            </button>
          </div>
        )}

        {carregando ? (
          <p className="finance-loading" role="status">
            Carregando títulos…
          </p>
        ) : !erroLista && titulos.length === 0 ? (
          <p className="finance-empty">Nenhum título corresponde aos filtros.</p>
        ) : !erroLista ? (
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>{pessoaLabel}</th>
                  <th>Categoria</th>
                  <th>Valor total</th>
                  <th>{valorEmAbertoLabel}</th>
                  <th>Parcelas</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {titulos.map((titulo) => {
                  const valorEmAberto =
                    titulo.status === 'CANCELADO' || titulo.status === 'PAGO'
                      ? 0
                      : Math.max(0, titulo.valor - titulo.valorLiquidado)
                  const editavel = titulo.status !== 'PAGO' && titulo.status !== 'CANCELADO'
                  return (
                    <tr key={titulo.id}>
                      <td className="finance-description-cell">
                        <strong>{titulo.descricao}</strong>
                        <span>{titulo.id}</span>
                      </td>
                      <td>{titulo.pessoa}</td>
                      <td>{titulo.categoria?.nome ?? '—'}</td>
                      <td>{formatarMoeda(titulo.valor)}</td>
                      <td>{formatarMoeda(valorEmAberto)}</td>
                      <td>{titulo.numeroParcelas}</td>
                      <td>{formatarData(titulo.dataVencimento)}</td>
                      <td>
                        <span className={`finance-status finance-status-${titulo.status.toLowerCase()}`}>
                          {nomeStatus(titulo.status)}
                        </span>
                      </td>
                      <td>
                        <div className="finance-row-actions">
                          <button className="text-button" onClick={() => abrirDetalhes(titulo)} type="button">
                            Detalhes
                          </button>
                          <button
                            className="text-button"
                            disabled={!editavel}
                            onClick={() => iniciarEdicao(titulo)}
                            type="button"
                          >
                            Editar
                          </button>
                          {user?.role === 'ADMIN' && editavel && (
                            <button
                              className="text-button finance-cancel-button"
                              disabled={cancelandoId === titulo.id}
                              onClick={() => void cancelar(titulo)}
                              type="button"
                            >
                              {cancelandoId === titulo.id ? 'Cancelando…' : 'Cancelar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="finance-pagination">
          <span>
            Página {pagina} de {paginaFinal}
          </span>
          <div>
            <button
              className="button button-secondary"
              disabled={pagina <= 1 || carregando}
              onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              type="button"
            >
              Anterior
            </button>
            <button
              className="button button-secondary"
              disabled={pagina >= paginaFinal || carregando}
              onClick={() => setPagina((atual) => Math.min(paginaFinal, atual + 1))}
              type="button"
            >
              Próxima
            </button>
          </div>
        </div>
      </section>
    </section>
  )
}

function DetalheTitulo({
  detalhe,
  erro,
  carregando,
  onClose,
  tipo,
}: {
  detalhe: DetalheTituloFinanceiro | null
  erro: string
  carregando: boolean
  onClose: () => void
  tipo: FinanceiroTipo
}) {
  const liquidacaoNome = tipo === 'DESPESA' ? 'Pagamentos' : 'Recebimentos'
  const valorEmAberto = detalhe
    ? detalhe.status === 'PAGO' || detalhe.status === 'CANCELADO'
      ? 0
      : Math.max(0, detalhe.valor - detalhe.valorLiquidado)
    : 0
  return (
    <section className="finance-card finance-detail-card" aria-labelledby="finance-detail-title">
      <div className="finance-section-heading">
        <div>
          <h2 id="finance-detail-title">Detalhes do título</h2>
          <p>Parcelas e eventos registrados pela API.</p>
        </div>
        <button className="button button-secondary" onClick={onClose} type="button">
          Fechar
        </button>
      </div>

      {carregando && (
        <p className="finance-loading" role="status">
          Carregando detalhes…
        </p>
      )}
      {erro && (
        <p className="form-error" role="alert">
          {erro}
        </p>
      )}
      {detalhe && !carregando && (
        <>
          <div className="finance-detail-summary">
            <div>
              <span>Descrição</span>
              <strong>{detalhe.descricao}</strong>
            </div>
            <div>
              <span>{rotuloPessoa(tipo)}</span>
              <strong>{detalhe.pessoa}</strong>
            </div>
            <div>
              <span>Valor total</span>
              <strong>{formatarMoeda(detalhe.valor)}</strong>
            </div>
            <div>
              <span>{tipo === 'DESPESA' ? 'Pago' : 'Recebido'}</span>
              <strong>{formatarMoeda(detalhe.valorLiquidado)}</strong>
            </div>
            <div>
              <span>{tipo === 'DESPESA' ? 'Em aberto' : 'A receber'}</span>
              <strong>{formatarMoeda(valorEmAberto)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{nomeStatus(detalhe.status)}</strong>
            </div>
            <div>
              <span>Data de lançamento</span>
              <strong>{formatarData(detalhe.dataLancamento)}</strong>
            </div>
            <div>
              <span>Vencimento da primeira parcela</span>
              <strong>{formatarData(detalhe.dataVencimento)}</strong>
            </div>
            {detalhe.observacoes && (
              <div className="finance-detail-notes">
                <span>Observações</span>
                <strong>{detalhe.observacoes}</strong>
              </div>
            )}
          </div>

          <div className="finance-detail-grid">
            <section>
              <h3>Parcelas</h3>
              {detalhe.parcelas.length === 0 ? (
                <p className="finance-empty">Nenhuma parcela disponível.</p>
              ) : (
                <ul className="finance-detail-list">
                  {detalhe.parcelas.map((parcela) => (
                    <li key={parcela.id}>
                      <div>
                        <strong>Parcela {parcela.numero}</strong>
                        <span>Vence em {formatarData(parcela.dataVencimento)}</span>
                      </div>
                      <div>
                        <strong>{formatarMoeda(parcela.valor)}</strong>
                        <span>{nomeStatus(parcela.status)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3>{liquidacaoNome}</h3>
              {detalhe.liquidacoes.length === 0 ? (
                <p className="finance-empty">
                  Nenhum {tipo === 'DESPESA' ? 'pagamento' : 'recebimento'} registrado.
                </p>
              ) : (
                <ul className="finance-detail-list">
                  {detalhe.liquidacoes.map((liquidacao) => (
                    <li key={liquidacao.id}>
                      <div>
                        <strong>{formatarMoeda(liquidacao.valor)}</strong>
                        <span>{formatarData(liquidacao.data)}</span>
                      </div>
                      <span>Usuário {liquidacao.registradoPorId}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="finance-history-section">
            <h3>Histórico</h3>
            {detalhe.historico.length === 0 ? (
              <p className="finance-empty">Nenhum evento registrado.</p>
            ) : (
              <ul className="finance-history-list">
                {detalhe.historico.map((evento) => (
                  <li key={evento.id}>
                    <div>
                      <strong>{nomeAcao(evento.acao)}</strong>
                      <span>{evento.detalhes ?? `Usuário ${evento.alteradoPorId}`}</span>
                    </div>
                    <time dateTime={evento.createdAt}>
                      {new Date(evento.createdAt).toLocaleString('pt-BR')}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}
