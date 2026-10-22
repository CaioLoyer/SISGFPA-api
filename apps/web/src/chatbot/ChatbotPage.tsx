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
  enviarMensagem,
  listarConversas,
} from './chatbot-api'
import type { ChatMessage, ChatSummary } from './chatbot-api'
import { getChatbotTopics } from './chatbot-topics'

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
  const { user } = useSession()
  const topics = useMemo(() => getChatbotTopics(user?.role), [user?.role])
  const [conversas, setConversas] = useState<ChatSummary[]>([])
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<ChatMessage[]>([])
  const [rascunho, setRascunho] = useState('')
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [carregandoConversa, setCarregandoConversa] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [acaoPendenteId, setAcaoPendenteId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const fimDaConversa = useRef<HTMLDivElement>(null)

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
      const conversa = await criarConversa('Nova conversa')
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
        const nova = await criarConversa(content.slice(0, 80))
        id = nova.id
        setConversaId(nova.id)
        setConversas((atuais) => [nova, ...atuais.filter((item) => item.id !== nova.id)])
      }

      const resultado = await enviarMensagem(id, content)
      setRascunho('')
      setMensagens((atuais) => [...atuais, resultado.userMessage, resultado.assistantMessage])
      setConversas((atuais) => {
        const encontrada = atuais.find((item) => item.id === id)
        if (!encontrada) return atuais
        const atualizada = { ...encontrada, updatedAt: new Date().toISOString() }
        return [atualizada, ...atuais.filter((item) => item.id !== id)]
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

  const podeTrocarConversa = !enviando && !acaoPendenteId

  return (
    <section className="welcome-page chatbot-page" aria-labelledby="chatbot-title">
      <div className="welcome-heading chatbot-page-heading">
        <div>
          <p className="eyebrow">ASSISTENTE GUIADO</p>
          <h1 id="chatbot-title">Como posso ajudar?</h1>
          <p>Escolha um módulo para abrir ou descreva uma operação financeira em uma mensagem.</p>
        </div>
        <span className="chatbot-mode-pill">Fluxo por tópicos · sem IA</span>
      </div>

      {erro && (
        <div className="finance-error-block chatbot-error" role="alert">
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
        <aside className="finance-card chatbot-sidebar" aria-label="Conversas e tópicos">
          <div className="chatbot-sidebar-heading">
            <h2>Conversas</h2>
            <button
              className="button button-secondary chatbot-new-button"
              disabled={carregandoLista || carregandoConversa || !podeTrocarConversa}
              onClick={() => void iniciarConversa()}
              type="button"
            >
              + Nova
            </button>
          </div>
          {carregandoLista ? (
            <p className="chatbot-muted" role="status">
              Carregando conversas…
            </p>
          ) : conversas.length === 0 ? (
            <p className="chatbot-muted">Suas conversas aparecerão aqui.</p>
          ) : (
            <ul className="chatbot-conversation-list">
              {conversas.map((conversa) => (
                <li key={conversa.id}>
                  <button
                    aria-current={conversa.id === conversaId ? 'page' : undefined}
                    className={`chatbot-conversation-button${conversa.id === conversaId ? ' chatbot-conversation-active' : ''}`}
                    disabled={!podeTrocarConversa || carregandoConversa}
                    onClick={() => void abrirConversa(conversa.id)}
                    type="button"
                  >
                    <strong>{conversa.title}</strong>
                    <span>{new Date(conversa.updatedAt).toLocaleDateString('pt-BR')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="chatbot-topics-heading">
            <h2>Tópicos</h2>
            <p>Escolha para abrir um módulo.</p>
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

        <section className="finance-card chatbot-conversation" aria-label="Conversa com o assistente">
          <header className="chatbot-conversation-heading">
            <div>
              <h2>{conversaAtiva?.title ?? 'Nova conversa'}</h2>
              <p>As operações só são enviadas à API depois da sua confirmação.</p>
            </div>
            <span className="chatbot-online-indicator">Atendimento guiado</span>
          </header>

          <div className="chatbot-transcript" aria-live="polite" aria-relevant="additions text">
            {carregandoConversa ? (
              <p className="chatbot-muted" role="status">
                Carregando mensagens…
              </p>
            ) : mensagens.length === 0 ? (
              <div className="chatbot-welcome-message">
                <div className="chatbot-message-bubble chatbot-assistant-bubble">
                  <p>
                    Olá, {user?.name}. Posso encaminhar você para um módulo ou ajudar a preparar uma operação
                    financeira.
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
                  Exemplos: “Compramos materiais do fornecedor ABC por R$ 250” ou “Cliente Maria pagou R$ 80”.
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
      </div>
    </section>
  )
}
