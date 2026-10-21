import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { PapelContato, TipoPessoa } from '@sisgfpa/types'

import {
  alterarSituacaoContato,
  atualizarContato,
  criarContato,
  listarContatos,
  listarTitulosSemContato,
  sugerirContatos,
  vincularTitulos,
} from './contatos-api'
import type {
  Contato,
  ContatoInput,
  SituacaoContato,
  TipoTituloContato,
  TituloSemContato,
} from './contatos-api'

type FiltroPapel = PapelContato | 'TODOS'
type FiltroSituacao = SituacaoContato
type AbaComercial = 'CADASTROS' | 'VINCULOS'

interface FormularioContato {
  nome: string
  documento: string
  tipoPessoa: TipoPessoa
  papeis: PapelContato[]
  telefone: string
  cidade: string
  uf: string
}

const formularioVazio: FormularioContato = {
  nome: '',
  documento: '',
  tipoPessoa: 'FISICA',
  papeis: [],
  telefone: '',
  cidade: '',
  uf: '',
}

const tipoTituloInicial: TipoTituloContato = 'DESPESA'
const tamanhoPagina = 20

function nomePapel(papel: PapelContato): string {
  return papel === 'CLIENTE' ? 'Cliente' : 'Fornecedor'
}

function nomeTipoPessoa(tipo: TipoPessoa): string {
  return tipo === 'FISICA' ? 'Pessoa física' : 'Pessoa jurídica'
}

function nomeTipoTitulo(tipo: TipoTituloContato): string {
  return tipo === 'DESPESA' ? 'Fornecedores em contas a pagar' : 'Clientes em contas a receber'
}

function formatarData(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
}

function formatarMoeda(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function textoErro(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function ComercialPage() {
  const [aba, setAba] = useState<AbaComercial>('CADASTROS')
  const [papeisPermitidos, setPapeisPermitidos] = useState<PapelContato[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [totalContatos, setTotalContatos] = useState(0)
  const [filtroPapel, setFiltroPapel] = useState<FiltroPapel>('TODOS')
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>('ATIVOS')
  const [buscaRascunho, setBuscaRascunho] = useState('')
  const [buscaContatos, setBuscaContatos] = useState('')
  const [paginaContatos, setPaginaContatos] = useState(1)
  const [carregandoContatos, setCarregandoContatos] = useState(true)
  const [erroContatos, setErroContatos] = useState('')
  const [formulario, setFormulario] = useState<FormularioContato>(formularioVazio)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erroFormulario, setErroFormulario] = useState('')
  const [tipoTitulo, setTipoTitulo] = useState<TipoTituloContato>(tipoTituloInicial)
  const [buscaAntigaRascunho, setBuscaAntigaRascunho] = useState('')
  const [buscaAntiga, setBuscaAntiga] = useState('')
  const [titulosAntigos, setTitulosAntigos] = useState<TituloSemContato[]>([])
  const [totalTitulosAntigos, setTotalTitulosAntigos] = useState(0)
  const [paginaTitulos, setPaginaTitulos] = useState(1)
  const [carregandoTitulos, setCarregandoTitulos] = useState(false)
  const [erroTitulos, setErroTitulos] = useState('')
  const [titulosSelecionados, setTitulosSelecionados] = useState<Set<string>>(new Set())
  const [sugestoesPorTitulo, setSugestoesPorTitulo] = useState<Record<string, Contato[]>>({})
  const [contatoPorTitulo, setContatoPorTitulo] = useState<Record<string, string>>({})
  const [carregandoSugestoes, setCarregandoSugestoes] = useState<string | null>(null)
  const [buscaContatoLote, setBuscaContatoLote] = useState('')
  const [sugestoesLote, setSugestoesLote] = useState<Contato[]>([])
  const [contatoLoteId, setContatoLoteId] = useState('')
  const [carregandoLote, setCarregandoLote] = useState(false)
  const [salvandoVinculos, setSalvandoVinculos] = useState(false)

  const papeisDoTipoSelecionado: PapelContato[] = tipoTitulo === 'DESPESA' ? ['FORNECEDOR'] : ['CLIENTE']
  const papelDisponivelParaVinculo = papeisPermitidos.includes(papeisDoTipoSelecionado[0]!)
  const paginasContatos = Math.max(1, Math.ceil(totalContatos / tamanhoPagina))
  const paginasTitulosAntigos = Math.max(1, Math.ceil(totalTitulosAntigos / tamanhoPagina))
  const todosDaPaginaSelecionados =
    titulosAntigos.length > 0 && titulosAntigos.every((titulo) => titulosSelecionados.has(titulo.id))

  const carregarContatos = useCallback(async () => {
    setCarregandoContatos(true)
    setErroContatos('')
    try {
      const lista = await listarContatos({
        papel: filtroPapel === 'TODOS' ? undefined : filtroPapel,
        busca: buscaContatos || undefined,
        situacao: filtroSituacao,
        page: paginaContatos,
        pageSize: tamanhoPagina,
      })
      setContatos(lista.items)
      setTotalContatos(lista.total)
      setPapeisPermitidos(lista.papeisPermitidos)
    } catch (error) {
      setErroContatos(textoErro(error, 'Não foi possível carregar os contatos.'))
      setContatos([])
      setTotalContatos(0)
    } finally {
      setCarregandoContatos(false)
    }
  }, [buscaContatos, filtroPapel, filtroSituacao, paginaContatos])

  const carregarTitulosAntigos = useCallback(async () => {
    if (!papelDisponivelParaVinculo) {
      setTitulosAntigos([])
      setTotalTitulosAntigos(0)
      setErroTitulos('Seu usuário não tem permissão para associar este tipo de título.')
      return
    }
    setCarregandoTitulos(true)
    setErroTitulos('')
    try {
      const result = await listarTitulosSemContato({
        tipo: tipoTitulo,
        busca: buscaAntiga || undefined,
        page: paginaTitulos,
        pageSize: tamanhoPagina,
      })
      setTitulosAntigos(result.items)
      setTotalTitulosAntigos(result.total)
    } catch (error) {
      setErroTitulos(textoErro(error, 'Não foi possível carregar os títulos sem contato.'))
      setTitulosAntigos([])
      setTotalTitulosAntigos(0)
    } finally {
      setCarregandoTitulos(false)
    }
  }, [buscaAntiga, paginaTitulos, papelDisponivelParaVinculo, tipoTitulo])

  useEffect(() => {
    void carregarContatos()
  }, [carregarContatos])

  useEffect(() => {
    if (papeisPermitidos.length === 1) {
      setTipoTitulo(papeisPermitidos[0] === 'FORNECEDOR' ? 'DESPESA' : 'RECEBIMENTO')
    }
  }, [papeisPermitidos])

  useEffect(() => {
    if (aba === 'VINCULOS') void carregarTitulosAntigos()
  }, [aba, carregarTitulosAntigos])

  const papeisDoFormulario = useMemo(
    () => formulario.papeis.filter((papel) => papeisPermitidos.includes(papel)),
    [formulario.papeis, papeisPermitidos]
  )

  function iniciarEdicao(contato: Contato) {
    setEditandoId(contato.id)
    setFormulario({
      nome: contato.nome,
      documento: contato.documento,
      tipoPessoa: contato.tipoPessoa,
      papeis: contato.papeis,
      telefone: contato.telefone,
      cidade: contato.cidade ?? '',
      uf: contato.uf ?? '',
    })
    setErroFormulario('')
    setMensagem('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function descartarEdicao() {
    setEditandoId(null)
    setFormulario({ ...formularioVazio, papeis: papeisPermitidos })
    setErroFormulario('')
  }

  function alternarPapel(papel: PapelContato) {
    setFormulario((atual) => ({
      ...atual,
      papeis: atual.papeis.includes(papel)
        ? atual.papeis.filter((item) => item !== papel)
        : [...atual.papeis, papel],
    }))
  }

  async function salvarContato(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErroFormulario('')
    setMensagem('')
    if (papeisDoFormulario.length === 0) {
      setErroFormulario('Selecione se este cadastro é cliente, fornecedor ou ambos.')
      return
    }
    const input: ContatoInput = {
      nome: formulario.nome.trim(),
      documento: formulario.documento,
      tipoPessoa: formulario.tipoPessoa,
      papeis: papeisDoFormulario,
      telefone: formulario.telefone.trim(),
      cidade: formulario.cidade.trim() || null,
      uf: formulario.uf.trim().toUpperCase() || null,
    }
    setSalvando(true)
    try {
      if (editandoId) {
        await atualizarContato(editandoId, input)
        setMensagem('Cadastro atualizado. Os títulos vinculados continuam no histórico.')
      } else {
        await criarContato(input)
        setMensagem('Cadastro criado com sucesso.')
      }
      setEditandoId(null)
      setFormulario({ ...formularioVazio, papeis: papeisPermitidos })
      await carregarContatos()
    } catch (error) {
      setErroFormulario(textoErro(error, 'Não foi possível salvar o contato.'))
    } finally {
      setSalvando(false)
    }
  }

  async function alterarSituacao(contato: Contato) {
    setErroContatos('')
    setMensagem('')
    try {
      await alterarSituacaoContato(contato.id, !contato.ativo)
      setMensagem(contato.ativo ? 'Contato inativado e preservado no histórico.' : 'Contato reativado.')
      await carregarContatos()
    } catch (error) {
      setErroContatos(textoErro(error, 'Não foi possível alterar a situação do contato.'))
    }
  }

  function selecionarTitulo(id: string, selecionado: boolean) {
    setTitulosSelecionados((atual) => {
      const proximo = new Set(atual)
      if (selecionado) proximo.add(id)
      else proximo.delete(id)
      return proximo
    })
  }

  function selecionarPagina(selecionado: boolean) {
    setTitulosSelecionados((atual) => {
      const proximo = new Set(atual)
      for (const titulo of titulosAntigos) {
        if (selecionado) proximo.add(titulo.id)
        else proximo.delete(titulo.id)
      }
      return proximo
    })
  }

  async function selecionarTodosResultados() {
    if (!buscaAntiga.trim()) {
      setErroTitulos('Informe um nome para buscar antes de selecionar todos os resultados.')
      return
    }
    setErroTitulos('')
    setCarregandoTitulos(true)
    try {
      const pageSize = 100
      const primeira = await listarTitulosSemContato({
        tipo: tipoTitulo,
        busca: buscaAntiga,
        page: 1,
        pageSize,
      })
      const ids = primeira.items.map((item) => item.id)
      for (let page = 2; page <= Math.ceil(primeira.total / pageSize); page += 1) {
        const result = await listarTitulosSemContato({ tipo: tipoTitulo, busca: buscaAntiga, page, pageSize })
        ids.push(...result.items.map((item) => item.id))
      }
      setTitulosSelecionados((atual) => new Set([...atual, ...ids]))
      setMensagem(`${ids.length} títulos da busca selecionados. Escolha um contato para associá-los.`)
    } catch (error) {
      setErroTitulos(textoErro(error, 'Não foi possível selecionar todos os resultados.'))
    } finally {
      setCarregandoTitulos(false)
    }
  }

  async function buscarSugestoes(titulo: TituloSemContato) {
    setCarregandoSugestoes(titulo.id)
    setErroTitulos('')
    try {
      const papel: PapelContato = tipoTitulo === 'DESPESA' ? 'FORNECEDOR' : 'CLIENTE'
      const sugestoes = await sugerirContatos(papel, titulo.nomeOriginal)
      setSugestoesPorTitulo((atual) => ({ ...atual, [titulo.id]: sugestoes }))
    } catch (error) {
      setErroTitulos(textoErro(error, 'Não foi possível buscar contatos parecidos.'))
    } finally {
      setCarregandoSugestoes(null)
    }
  }

  async function buscarSugestoesEmLote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nome =
      buscaContatoLote.trim() || titulosAntigos.find((item) => titulosSelecionados.has(item.id))?.nomeOriginal
    if (!nome) {
      setErroTitulos('Digite um nome ou selecione um título para buscar contatos parecidos.')
      return
    }
    setCarregandoLote(true)
    setErroTitulos('')
    try {
      const papel: PapelContato = tipoTitulo === 'DESPESA' ? 'FORNECEDOR' : 'CLIENTE'
      setSugestoesLote(await sugerirContatos(papel, nome))
      setContatoLoteId('')
    } catch (error) {
      setErroTitulos(textoErro(error, 'Não foi possível buscar contatos parecidos.'))
    } finally {
      setCarregandoLote(false)
    }
  }

  function aplicarContatoEmLote() {
    if (!contatoLoteId || titulosSelecionados.size === 0) return
    setContatoPorTitulo((atual) => {
      const proximo = { ...atual }
      for (const id of titulosSelecionados) proximo[id] = contatoLoteId
      return proximo
    })
  }

  async function salvarVinculos() {
    const ids = [...titulosSelecionados]
    if (ids.length === 0) {
      setErroTitulos('Selecione ao menos um título para associar.')
      return
    }
    const semContato = ids.filter((id) => !contatoPorTitulo[id])
    if (semContato.length > 0) {
      setErroTitulos(`Escolha um contato para os ${semContato.length} título(s) selecionado(s).`)
      return
    }
    setSalvandoVinculos(true)
    setErroTitulos('')
    let totalVinculado = 0
    const idsVinculados: string[] = []
    try {
      for (let start = 0; start < ids.length; start += 100) {
        const lote = ids.slice(start, start + 100)
        const itens = lote.map((tituloId) => ({
          tituloId,
          contatoId: contatoPorTitulo[tituloId]!,
        }))
        totalVinculado += await vincularTitulos(tipoTitulo, itens)
        idsVinculados.push(...lote)
      }
      setTitulosSelecionados(new Set())
      setContatoPorTitulo({})
      setSugestoesPorTitulo({})
      setMensagem(`${totalVinculado} título(s) associado(s). Os nomes originais foram preservados.`)
      await carregarTitulosAntigos()
    } catch (error) {
      const parcial = totalVinculado ? `${totalVinculado} título(s) já foram associados. ` : ''
      setTitulosSelecionados((atual) => new Set([...atual].filter((id) => !idsVinculados.includes(id))))
      setContatoPorTitulo((atual) =>
        Object.fromEntries(Object.entries(atual).filter(([id]) => !idsVinculados.includes(id)))
      )
      setErroTitulos(`${parcial}${textoErro(error, 'Não foi possível concluir os vínculos restantes.')}`)
      await carregarTitulosAntigos()
    } finally {
      setSalvandoVinculos(false)
    }
  }

  return (
    <section className="welcome-page commercial-page">
      <div className="welcome-heading commercial-heading">
        <div>
          <p className="eyebrow">MÓDULO COMERCIAL</p>
          <h1>Clientes e fornecedores</h1>
          <p>Cadastre contatos, filtre por atuação e associe registros antigos aos títulos.</p>
        </div>
      </div>

      <div className="commercial-tabs" role="tablist" aria-label="Operações comerciais">
        <button
          aria-selected={aba === 'CADASTROS'}
          className={aba === 'CADASTROS' ? 'commercial-tab commercial-tab-active' : 'commercial-tab'}
          onClick={() => setAba('CADASTROS')}
          role="tab"
          type="button"
        >
          Cadastro de contatos
        </button>
        <button
          aria-selected={aba === 'VINCULOS'}
          className={aba === 'VINCULOS' ? 'commercial-tab commercial-tab-active' : 'commercial-tab'}
          onClick={() => setAba('VINCULOS')}
          role="tab"
          type="button"
        >
          Associar títulos antigos
        </button>
      </div>

      {mensagem && (
        <p className="commercial-success" role="status">
          {mensagem}
        </p>
      )}

      {aba === 'CADASTROS' ? (
        <>
          <section className="commercial-card" aria-labelledby="contact-form-title">
            <div className="commercial-card-heading">
              <div>
                <h2 id="contact-form-title">{editandoId ? 'Editar contato' : 'Novo cadastro'}</h2>
                <p>Um contato pode atuar como cliente, fornecedor ou nos dois papéis.</p>
              </div>
              {editandoId && (
                <button className="button button-secondary" onClick={descartarEdicao} type="button">
                  Cancelar edição
                </button>
              )}
            </div>
            <form className="commercial-form" onSubmit={(event) => void salvarContato(event)}>
              <fieldset className="commercial-role-fieldset">
                <legend>Atuação *</legend>
                <div className="commercial-role-options">
                  {papeisPermitidos.map((papel) => (
                    <label className="commercial-checkbox" key={papel}>
                      <input
                        checked={formulario.papeis.includes(papel)}
                        onChange={() => alternarPapel(papel)}
                        type="checkbox"
                      />
                      <span>{nomePapel(papel)}</span>
                    </label>
                  ))}
                  {papeisPermitidos.length === 0 && (
                    <span className="commercial-muted">Carregando permissões…</span>
                  )}
                </div>
              </fieldset>

              <div className="commercial-form-grid">
                <label className="field-label commercial-field-wide">
                  Nome / Razão social *
                  <input
                    autoComplete="organization"
                    maxLength={160}
                    onChange={(event) => setFormulario({ ...formulario, nome: event.target.value })}
                    required
                    value={formulario.nome}
                  />
                </label>
                <label className="field-label">
                  Tipo de pessoa *
                  <select
                    onChange={(event) =>
                      setFormulario({ ...formulario, tipoPessoa: event.target.value as TipoPessoa })
                    }
                    value={formulario.tipoPessoa}
                  >
                    <option value="FISICA">Pessoa física</option>
                    <option value="JURIDICA">Pessoa jurídica</option>
                  </select>
                </label>
                <label className="field-label">
                  {formulario.tipoPessoa === 'FISICA' ? 'CPF *' : 'CNPJ *'}
                  <input
                    autoComplete="off"
                    inputMode="numeric"
                    onChange={(event) => setFormulario({ ...formulario, documento: event.target.value })}
                    placeholder={formulario.tipoPessoa === 'FISICA' ? '000.000.000-00' : '00.000.000/0000-00'}
                    required
                    value={formulario.documento}
                  />
                </label>
                <label className="field-label">
                  Telefone *
                  <input
                    autoComplete="tel"
                    onChange={(event) => setFormulario({ ...formulario, telefone: event.target.value })}
                    placeholder="(00) 00000-0000"
                    required
                    value={formulario.telefone}
                  />
                </label>
                <label className="field-label">
                  Cidade
                  <input
                    autoComplete="address-level2"
                    maxLength={100}
                    onChange={(event) => setFormulario({ ...formulario, cidade: event.target.value })}
                    value={formulario.cidade}
                  />
                </label>
                <label className="field-label commercial-field-uf">
                  UF
                  <input
                    autoComplete="address-level1"
                    maxLength={2}
                    onChange={(event) => setFormulario({ ...formulario, uf: event.target.value })}
                    value={formulario.uf}
                  />
                </label>
              </div>

              {erroFormulario && (
                <p className="form-error" role="alert">
                  {erroFormulario}
                </p>
              )}
              <div className="commercial-form-actions">
                <button className="button button-primary" disabled={salvando} type="submit">
                  {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Salvar cadastro'}
                </button>
              </div>
            </form>
          </section>

          <section className="commercial-card commercial-list-card" aria-labelledby="contacts-list-title">
            <div className="commercial-card-heading">
              <div>
                <h2 id="contacts-list-title">Contatos cadastrados</h2>
                <p>{totalContatos} registro(s) encontrados</p>
              </div>
            </div>
            <form
              className="commercial-filters"
              onSubmit={(event) => {
                event.preventDefault()
                setBuscaContatos(buscaRascunho.trim())
                setPaginaContatos(1)
              }}
            >
              <label className="field-label">
                Buscar por código, nome ou documento
                <input
                  onChange={(event) => setBuscaRascunho(event.target.value)}
                  placeholder="Digite para buscar"
                  value={buscaRascunho}
                />
              </label>
              <label className="field-label">
                Atuação
                <select
                  onChange={(event) => {
                    setFiltroPapel(event.target.value as FiltroPapel)
                    setPaginaContatos(1)
                  }}
                  value={filtroPapel}
                >
                  <option value="TODOS">Todas as minhas atuações</option>
                  {papeisPermitidos.map((papel) => (
                    <option key={papel} value={papel}>
                      {nomePapel(papel)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Situação
                <select
                  onChange={(event) => {
                    setFiltroSituacao(event.target.value as FiltroSituacao)
                    setPaginaContatos(1)
                  }}
                  value={filtroSituacao}
                >
                  <option value="ATIVOS">Ativos</option>
                  <option value="INATIVOS">Inativos</option>
                  <option value="TODOS">Todos</option>
                </select>
              </label>
              <button className="button button-secondary" type="submit">
                Buscar
              </button>
            </form>

            {erroContatos && (
              <p className="form-error" role="alert">
                {erroContatos}
              </p>
            )}
            {carregandoContatos ? (
              <p className="commercial-empty" role="status">
                Carregando contatos…
              </p>
            ) : contatos.length === 0 ? (
              <p className="commercial-empty">Nenhum contato corresponde aos filtros.</p>
            ) : (
              <div className="commercial-table-wrap">
                <table className="commercial-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nome / Razão social</th>
                      <th>Atuação</th>
                      <th>Pessoa</th>
                      <th>CPF / CNPJ</th>
                      <th>Telefone</th>
                      <th>Cidade / UF</th>
                      <th>Situação e ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contatos.map((contato) => (
                      <tr key={contato.id}>
                        <td>{String(contato.codigo).padStart(5, '0')}</td>
                        <td className="commercial-name-cell">
                          <strong>{contato.nome}</strong>
                        </td>
                        <td>
                          <div className="commercial-badges">
                            {contato.papeis.map((papel) => (
                              <span className="commercial-badge" key={papel}>
                                {nomePapel(papel)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>{nomeTipoPessoa(contato.tipoPessoa)}</td>
                        <td>{contato.documento}</td>
                        <td>{contato.telefone}</td>
                        <td>{[contato.cidade, contato.uf].filter(Boolean).join(' / ') || '—'}</td>
                        <td>
                          <div className="commercial-row-actions">
                            <span
                              className={
                                contato.ativo
                                  ? 'commercial-status'
                                  : 'commercial-status commercial-status-inactive'
                              }
                            >
                              {contato.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                            <button
                              className="text-button"
                              onClick={() => iniciarEdicao(contato)}
                              type="button"
                            >
                              Editar
                            </button>
                            <button
                              className="text-button"
                              onClick={() => void alterarSituacao(contato)}
                              type="button"
                            >
                              {contato.ativo ? 'Inativar' : 'Reativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="commercial-pagination">
              <span>
                Página {paginaContatos} de {paginasContatos}
              </span>
              <div>
                <button
                  className="button button-secondary"
                  disabled={paginaContatos <= 1 || carregandoContatos}
                  onClick={() => setPaginaContatos((page) => page - 1)}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="button button-secondary"
                  disabled={paginaContatos >= paginasContatos || carregandoContatos}
                  onClick={() => setPaginaContatos((page) => page + 1)}
                  type="button"
                >
                  Próxima
                </button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="commercial-card" aria-labelledby="legacy-links-title">
          <div className="commercial-card-heading">
            <div>
              <h2 id="legacy-links-title">Associar títulos antigos</h2>
              <p>
                Os títulos continuam com o nome original; esta associação registra apenas o contato escolhido.
              </p>
            </div>
          </div>

          <div className="commercial-link-type" role="group" aria-label="Tipo de título">
            {(['DESPESA', 'RECEBIMENTO'] as const).map((tipo) => {
              const papel: PapelContato = tipo === 'DESPESA' ? 'FORNECEDOR' : 'CLIENTE'
              if (!papeisPermitidos.includes(papel)) return null
              return (
                <button
                  className={tipoTitulo === tipo ? 'commercial-tab commercial-tab-active' : 'commercial-tab'}
                  key={tipo}
                  onClick={() => {
                    setTipoTitulo(tipo)
                    setPaginaTitulos(1)
                    setTitulosSelecionados(new Set())
                    setContatoPorTitulo({})
                  }}
                  type="button"
                >
                  {nomeTipoTitulo(tipo)}
                </button>
              )
            })}
          </div>

          <form
            className="commercial-filters commercial-link-search"
            onSubmit={(event) => {
              event.preventDefault()
              setBuscaAntiga(buscaAntigaRascunho.trim())
              setPaginaTitulos(1)
              setTitulosSelecionados(new Set())
              setContatoPorTitulo({})
              setSugestoesPorTitulo({})
            }}
          >
            <label className="field-label">
              Buscar pelo nome gravado no título
              <input
                onChange={(event) => setBuscaAntigaRascunho(event.target.value)}
                placeholder="Ex.: Papelaria ABC"
                value={buscaAntigaRascunho}
              />
            </label>
            <button className="button button-secondary" type="submit">
              Buscar títulos
            </button>
            <button className="text-button" onClick={() => void selecionarTodosResultados()} type="button">
              Selecionar todos os resultados da busca
            </button>
          </form>

          <div className="commercial-bulk-bar">
            <form className="commercial-bulk-search" onSubmit={(event) => void buscarSugestoesEmLote(event)}>
              <label className="field-label">
                Contato parecido para os títulos selecionados
                <input
                  onChange={(event) => setBuscaContatoLote(event.target.value)}
                  placeholder="Buscar nome de cliente ou fornecedor"
                  value={buscaContatoLote}
                />
              </label>
              <button className="button button-secondary" disabled={carregandoLote} type="submit">
                {carregandoLote ? 'Buscando…' : 'Sugerir contatos'}
              </button>
            </form>
            <div className="commercial-bulk-assign">
              <label className="field-label">
                Aplicar aos {titulosSelecionados.size} selecionado(s)
                <select onChange={(event) => setContatoLoteId(event.target.value)} value={contatoLoteId}>
                  <option value="">Selecione um contato</option>
                  {sugestoesLote.map((contato) => (
                    <option key={contato.id} value={contato.id}>
                      {contato.nome} · {contato.documento}
                      {contato.ativo ? '' : ' · Inativo'}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button-secondary"
                disabled={!contatoLoteId || titulosSelecionados.size === 0}
                onClick={aplicarContatoEmLote}
                type="button"
              >
                Aplicar contato
              </button>
            </div>
          </div>

          {erroTitulos && (
            <p className="form-error" role="alert">
              {erroTitulos}
            </p>
          )}
          <div className="commercial-link-heading">
            <label className="commercial-checkbox">
              <input
                checked={todosDaPaginaSelecionados}
                onChange={(event) => selecionarPagina(event.target.checked)}
                type="checkbox"
              />
              <span>Selecionar todos desta página</span>
            </label>
            <span>{totalTitulosAntigos} título(s) sem contato vinculado</span>
          </div>

          {carregandoTitulos ? (
            <p className="commercial-empty" role="status">
              Carregando títulos…
            </p>
          ) : titulosAntigos.length === 0 ? (
            <p className="commercial-empty">Não há títulos sem contato para esta busca.</p>
          ) : (
            <div className="commercial-table-wrap">
              <table className="commercial-table commercial-link-table">
                <thead>
                  <tr>
                    <th aria-label="Selecionar" />
                    <th>Nome original</th>
                    <th>Título</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Contato associado</th>
                  </tr>
                </thead>
                <tbody>
                  {titulosAntigos.map((titulo) => (
                    <tr key={titulo.id}>
                      <td>
                        <input
                          aria-label={`Selecionar título ${titulo.descricao}`}
                          checked={titulosSelecionados.has(titulo.id)}
                          onChange={(event) => selecionarTitulo(titulo.id, event.target.checked)}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <strong>{titulo.nomeOriginal}</strong>
                      </td>
                      <td>{titulo.descricao}</td>
                      <td>{formatarMoeda(titulo.valor)}</td>
                      <td>{formatarData(titulo.dataVencimento)}</td>
                      <td>
                        <div className="commercial-suggestion-control">
                          <button
                            className="text-button"
                            disabled={carregandoSugestoes === titulo.id}
                            onClick={() => void buscarSugestoes(titulo)}
                            type="button"
                          >
                            {carregandoSugestoes === titulo.id ? 'Buscando…' : 'Sugerir parecidos'}
                          </button>
                          <select
                            aria-label={`Contato para ${titulo.descricao}`}
                            onChange={(event) =>
                              setContatoPorTitulo((atual) => ({ ...atual, [titulo.id]: event.target.value }))
                            }
                            value={contatoPorTitulo[titulo.id] ?? ''}
                          >
                            <option value="">Selecione</option>
                            {(sugestoesPorTitulo[titulo.id] ?? []).map((contato) => (
                              <option key={contato.id} value={contato.id}>
                                {contato.nome} · {contato.documento}
                                {contato.ativo ? '' : ' · Inativo'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="commercial-pagination">
            <span>
              Página {paginaTitulos} de {paginasTitulosAntigos}
            </span>
            <div>
              <button
                className="button button-secondary"
                disabled={paginaTitulos <= 1 || carregandoTitulos}
                onClick={() => setPaginaTitulos((page) => page - 1)}
                type="button"
              >
                Anterior
              </button>
              <button
                className="button button-secondary"
                disabled={paginaTitulos >= paginasTitulosAntigos || carregandoTitulos}
                onClick={() => setPaginaTitulos((page) => page + 1)}
                type="button"
              >
                Próxima
              </button>
            </div>
          </div>
          <div className="commercial-form-actions">
            <button
              className="button button-primary"
              disabled={salvandoVinculos || titulosSelecionados.size === 0}
              onClick={() => void salvarVinculos()}
              type="button"
            >
              {salvandoVinculos ? 'Associando…' : `Associar ${titulosSelecionados.size} título(s)`}
            </button>
          </div>
        </section>
      )}
    </section>
  )
}
