import { createApp } from '@sisgfpa/http'

import { env } from './config/env.js'
import { chatRoutes } from './modules/chat/chat.routes.js'

/** Monta o Chatbot. Separado de server.ts para poder ser usado em testes (`app.inject`). */
export async function buildApp() {
  const app = await createApp({
    title: 'SISGFPA Chatbot',
    description:
      'Interface conversacional do SISGFPA: interpreta mensagens da papelaria e delega a execução à API Financeira. Faça login na API Financeira (POST /api/auth/sign-in/email, porta 8080): o cookie de sessão vale para o Chatbot (mesmo host). Rode `pnpm db:seed:demo` para ter conversa e mensagens de exemplo.',
    serverUrl: `http://localhost:${env.CHATBOT_PORT}`,
    trustedOrigins: env.TRUSTED_ORIGINS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    logger: env.NODE_ENV !== 'test',
  })

  await app.register(chatRoutes, { prefix: '/chats' })

  return app
}
