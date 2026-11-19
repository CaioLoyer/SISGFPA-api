import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useSession } from '../auth/session-context'
import {
  buscarConversa,
  ChatbotApiError,
  confirmarOperacao,
  criarConversa,
  descartarOperacao,
  excluirConversa,
  enviarMensagem,
  listarConversas,
} from './chatbot-api'
import type { ChatMessage, ChatSummary } from './chatbot-api'
import { getChatbotTopics } from './chatbot-topics'
import { PageHeader } from '../shared/PageHeader'
import './chatbot.css'

function horaDaMensagem(createdAt: string) {
  const data = new Date(createdAt)
  return Number.isNaN(data.getTime())
    ? ''
    : data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function mensagemErro(error: unknown) {
  return error instanceof ChatbotApiError
    ? error.message
    : 'Não foi possível concluir a solicitação no Chatbot.'
}

export function ChatbotPage() {
  const { user, permissions } = useSession()
  const topics = useMemo(() => getChatbotTopics(permissions), [permissions])
  const [conversas, setConversas] = useState<ChatSummary[]>([])
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<ChatMessage[]>([])
  const [rascunho, setRascunho] = useState('')
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [carregandoConversa, setCarregandoConversa] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [acaoPendenteId, setAcaoPendenteId] = useState<string | null>(null)
  const [conversaParaExcluir, setConversaParaExcluir] = useState<ChatSummary | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [erroExclusao, setErroExclusao] = useState('')
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const fimDaConversa = useRef<HTMLDivElement>(null)
  const dialogoExclusaoRef = useRef<HTMLElement>(null)

  const conversaAtiva = conversas.find((conversa) => conversa.id === conversaId) ?? null

  useEffect(() => {
    let ativa = true

    async function carregar() {
      setCarregandoLista(true)
      setErro('')
      try {
        const lista = await listarConversas()
        if (!ativa) return
        setConversas(lista)

        const recente = lista[0]
        if (!recente) {
          setConversaId(null)
          setMensagens([])
          return
        }

        setCarregandoConversa(true)
        const completa = await buscarConversa(recente.id)
        if (!ativa) return
        setConversaId(completa.id)
        setMensagens(completa.messages)
      } catch (error) {
        if (ativa) setErro(mensagemErro(error))
      } finally {
        if (ativa) {
          setCarregandoLista(false)
          setCarregandoConversa(false)
        }
      }
    }

    void carregar()
    return () => {
      ativa = false
    }
  }, [tentativa])

  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens.length])

  useEffect(() => {
    if (conversaParaExcluir) dialogoExclusaoRef.current?.focus()
  }, [conversaParaExcluir])

  const abrirConversa = useCallback(async (id: string) => {
    setCarregandoConversa(true)
    setErro('')
    try {
      const conversa = await buscarConversa(id)
      setConversaId(conversa.id)
      setMensagens(conversa.messages)
    } catch (error) {
      setErro(mensagemErro(error))
    } finally {
      setCarregandoConversa(false)
    }
  }, [])

  async function iniciarConversa() {
    setErro('')
    setCarregandoConversa(true)
    try {
      const conversa = await criarConversa()
      setConversas((atuais) => [conversa, ...atuais.filter((item) => item.id !== conversa.id)])
      setConversaId(conversa.id)
      setMensagens([])
    } catch (error) {
      setErro(mensagemErro(error))
    } finally {
      setCarregandoConversa(false)
    }
  }

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = rascunho.trim()
    if (!content || enviando || acaoPendenteId) return

    setEnviando(true)
    setErro('')
    try {
      let id = conversaId
      if (!id) {
        const nova = await criarConversa()
        id = nova.id
        setConversaId(nova.id)
        setConversas((atuais) => [nova, ...atuais.filter((item) => item.id !== nova.id)])
      }

      const resultado = await enviarMensagem(id, content)
      setRascunho('')
      setMensagens((atuais) => [...atuais, resultado.userMessage, resultado.assistantMessage])
      setConversas((atuais) => {
        return [resultado.chat, ...atuais.filter((item) => item.id !== resultado.chat.id)]
      })
    } catch (error) {
      setErro(mensagemErro(error))
    } finally {
      setEnviando(false)
    }
  }

  async function resolverOperacao(messageId: string, confirmar: boolean) {
    if (!conversaId || acaoPendenteId) return
    const idDaConversa = conversaId
    setAcaoPendenteId(messageId)
    setErro('')
    try {
      const resultado = confirmar
        ? await confirmarOperacao(idDaConversa, messageId)
        : await descartarOperacao(idDaConversa, messageId)
      setMensagens((atuais) => [
        ...atuais.map((mensagem) =>
          mensagem.id === resultado.userMessage.id ? resultado.userMessage : mensagem
        ),
        resultado.assistantMessage,
      ])
    } catch (error) {
      setErro(mensagemErro(error))
    } finally {
      setAcaoPendenteId(null)
    }
  }

  async function confirmarExclusao() {
    if (!conversaParaExcluir || excluindo) return
    const alvo = conversaParaExcluir
    setExcluindo(true)
    setErroExclusao('')
    try {
      await excluirConversa(alvo.id)
      const restantes = conversas.filter((conversa) => conversa.id !== alvo.id)
      setConversas(restantes)
      setConversaParaExcluir(null)

      if (conversaId === alvo.id) {
        setConversaId(null)
        setMensagens([])
        if (restantes[0]) await abrirConversa(restantes[0].id)
      }
    } catch (error) {
      setErroExclusao(mensagemErro(error))
    } finally {
      setExcluindo(false)
    }
  }

  const podeTrocarConversa = !enviando && !acaoPendenteId

  return (
    <section className="chatbot-page" aria-label="Chatbot">
      <PageHeader
        title="Como posso ajudar?"
        description="Acesse um módulo ou descreva uma operação para começar."
      >
        <span className="chatbot-mode-pill">Fluxo guiado · confirmação antes de gravar</span>
      </PageHeader>

      <div className="chatbot-content">
        {erro && (
          <div className="chatbot-error" role="alert">
            <p>{erro}</p>
            <button
              className="button button-secondary"
              onClick={() => setTentativa((valor) => valor + 1)}
              type="button"
            >
              Tentar novamente
            </button>
          </div>
        )}

        <div className="chatbot-layout">
          <section className="chatbot-conversation" aria-label="Conversa com o assistente">
            <header className="chatbot-conversation-heading">
              <div>
                <span className="chatbot-overline">CONVERSA ATUAL</span>
                <h2>{conversaAtiva?.title ?? 'Nova conversa'}</h2>
                <p>As operações só são enviadas à API depois da sua confirmação.</p>
              </div>
              <span className="chatbot-confirmation-badge">Revisão manual</span>
            </header>

            <div
              aria-busy={carregandoConversa}
              aria-live="polite"
              aria-relevant="additions text"
              className="chatbot-transcript"
            >
              {carregandoConversa ? (
                <p className="chatbot-muted chatbot-loading" role="status">
                  Carregando mensagens…
                </p>
              ) : mensagens.length === 0 ? (
                <div className="chatbot-welcome-message">
                  <div className="chatbot-message-bubble chatbot-assistant-bubble">
                    <p>
                      Olá, {user?.name}. Posso encaminhar você para um módulo ou ajudar a preparar uma
                      operação financeira.
                    </p>
                    <p>
                      Escolha um tópico ou escreva uma mensagem. Antes de gravar, você poderá revisar e
                      confirmar.
                    </p>
                  </div>
                  <h3>Para onde deseja ir?</h3>
                  <div className="chatbot-topic-grid">
                    {topics.map((topic) => (
                      <Link className="chatbot-topic-card" key={topic.id} to={topic.to}>
                        <span aria-hidden="true">{topic.icon}</span>
                        <strong>{topic.title}</strong>
                        <small>{topic.description}</small>
                        <span className="chatbot-topic-open">Abrir módulo →</span>
                      </Link>
                    ))}
                  </div>
                  <p className="chatbot-examples">
                    Exemplos: “Compramos materiais do fornecedor ABC por R$ 250” ou “Cliente Maria pagou R$
                    80”.
                  </p>
                </div>
              ) : (
                <div className="chatbot-message-list">
                  {mensagens.map((mensagem, indice) => {
                    const anterior = mensagens[indice - 1]
                    const pendenciaAnterior =
                      mensagem.papel === 'ASSISTENTE' &&
                      anterior?.papel === 'USUARIO' &&
                      anterior.status === 'PENDENTE_CONFIRMACAO'
                        ? anterior
                        : null

                    return (
                      <div
                        className={`chatbot-message-row chatbot-message-row-${mensagem.papel.toLowerCase()}`}
                        key={mensagem.id}
                      >
                        <article
                          className={`chatbot-message-bubble ${mensagem.papel === 'USUARIO' ? 'chatbot-user-bubble' : 'chatbot-assistant-bubble'}`}
                        >
                          <p>{mensagem.content}</p>
                          <time dateTime={mensagem.createdAt}>{horaDaMensagem(mensagem.createdAt)}</time>
                        </article>
                        {mensagem.status === 'PROCESSANDO' && (
                          <p className="chatbot-message-state" role="status">
                            Operação em processamento. Aguarde antes de excluir esta conversa.
                          </p>
                        )}
                        {pendenciaAnterior && (
                          <div className="chatbot-confirmation-controls">
                            <p>Revise o resumo acima antes de enviar a operação.</p>
                            <div>
                              <button
                                className="button button-primary"
                                disabled={acaoPendenteId === pendenciaAnterior.id}
                                onClick={() => void resolverOperacao(pendenciaAnterior.id, true)}
                                type="button"
                              >
                                {acaoPendenteId === pendenciaAnterior.id
                                  ? 'Processando…'
                                  : 'Confirmar operação'}
                              </button>
                              <button
                                className="button button-secondary"
                                disabled={acaoPendenteId === pendenciaAnterior.id}
                                onClick={() => void resolverOperacao(pendenciaAnterior.id, false)}
                                type="button"
                              >
                                Descartar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div ref={fimDaConversa} />
                </div>
              )}
            </div>

            <form className="chatbot-composer" onSubmit={(event) => void enviar(event)}>
              <label className="field-label" htmlFor="chatbot-message">
                Mensagem
                <textarea
                  id="chatbot-message"
                  maxLength={1000}
                  onChange={(event) => setRascunho(event.target.value)}
                  placeholder="Escreva o que deseja fazer…"
                  rows={2}
                  value={rascunho}
                />
              </label>
              <div className="chatbot-composer-footer">
                <small>Até 1.000 caracteres. A API Financeira valida suas permissões.</small>
                <button
                  className="button button-primary"
                  disabled={!rascunho.trim() || enviando || Boolean(acaoPendenteId) || carregandoConversa}
                  type="submit"
                >
                  {enviando ? 'Enviando…' : 'Enviar mensagem'}
                </button>
              </div>
            </form>
          </section>

          <aside className="chatbot-sidebar" aria-label="Conversas e tópicos">
            <div className="chatbot-sidebar-heading">
              <div>
                <span className="chatbot-overline">SEU HISTÓRICO</span>
                <h2>Conversas</h2>
              </div>
              <button
                className="button button-secondary chatbot-new-button"
                disabled={
                  carregandoLista || carregandoConversa || !podeTrocarConversa || Boolean(conversaParaExcluir)
                }
                onClick={() => void iniciarConversa()}
                type="button"
              >
                <span aria-hidden="true">+</span> Nova
              </button>
            </div>
            {carregandoLista ? (
              <p className="chatbot-muted" role="status">
                Carregando conversas…
              </p>
            ) : conversas.length === 0 ? (
              <p className="chatbot-muted chatbot-empty-list">Suas conversas aparecerão aqui.</p>
            ) : (
              <ul className="chatbot-conversation-list">
                {conversas.map((conversa) => (
                  <li className="chatbot-conversation-item" key={conversa.id}>
                    <button
                      aria-current={conversa.id === conversaId ? 'page' : undefined}
                      aria-label={`Abrir conversa: ${conversa.title}`}
                      className={`chatbot-conversation-button${conversa.id === conversaId ? ' chatbot-conversation-active' : ''}`}
                      disabled={!podeTrocarConversa || carregandoConversa}
                      onClick={() => void abrirConversa(conversa.id)}
                      type="button"
                    >
                      <strong>{conversa.title}</strong>
                      <span>{new Date(conversa.updatedAt).toLocaleDateString('pt-BR')}</span>
                    </button>
                    <button
                      aria-label={`Excluir conversa: ${conversa.title}`}
                      className="chatbot-conversation-delete"
                      disabled={
                        !podeTrocarConversa || carregandoConversa || Boolean(conversaParaExcluir) || excluindo
                      }
                      onClick={() => {
                        setErroExclusao('')
                        setConversaParaExcluir(conversa)
                      }}
                      title="Excluir conversa"
                      type="button"
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20">
                        <path d="M4.5 6h11M8 6V4.5h4V6m2.5 0-.7 10h-7.6L5.5 6m3 3v4m3-4v4" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="chatbot-topics-heading">
              <span className="chatbot-overline">NAVEGAÇÃO RÁPIDA</span>
              <h2>Módulos</h2>
              <p>Abra uma área da plataforma.</p>
            </div>
            <nav className="chatbot-topic-list" aria-label="Abrir módulos">
              {topics.map((topic) => (
                <Link className="chatbot-topic-link" key={topic.id} to={topic.to}>
                  <span aria-hidden="true">{topic.icon}</span>
                  {topic.title}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      </div>

      {conversaParaExcluir && (
        <div
          className="chatbot-delete-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !excluindo) setConversaParaExcluir(null)
          }}
        >
          <section
            aria-describedby="chatbot-delete-description"
            aria-labelledby="chatbot-delete-title"
            aria-modal="true"
            className="chatbot-delete-dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !excluindo) setConversaParaExcluir(null)
            }}
            ref={dialogoExclusaoRef}
            role="dialog"
            tabIndex={-1}
          >
            <header className="chatbot-delete-dialog-heading">
              <div>
                <span className="chatbot-overline">SEU HISTÓRICO</span>
                <h2 id="chatbot-delete-title">Excluir conversa?</h2>
              </div>
              <button
                aria-label="Fechar"
                className="chatbot-delete-dialog-close"
                disabled={excluindo}
                onClick={() => setConversaParaExcluir(null)}
                type="button"
              >
                ×
              </button>
            </header>
            <p className="chatbot-delete-dialog-description" id="chatbot-delete-description">
              “{conversaParaExcluir.title}” será ocultada do seu histórico e propostas ainda não confirmadas
              serão descartadas. Se uma operação estiver em processamento, a exclusão será recusada até ela
              terminar. Registros financeiros já executados permanecerão no sistema.
            </p>
            {erroExclusao && (
              <p className="chatbot-delete-error" role="alert">
                {erroExclusao}
              </p>
            )}
            <div className="chatbot-delete-dialog-actions">
              <button
                className="button button-secondary"
                disabled={excluindo}
                onClick={() => setConversaParaExcluir(null)}
                type="button"
              >
                Manter conversa
              </button>
              <button
                className="button chatbot-delete-confirm"
                disabled={excluindo}
                onClick={() => void confirmarExclusao()}
                type="button"
              >
                {excluindo ? 'Excluindo…' : 'Excluir conversa'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
