import { createApp } from '@sisgfpa/http'

import { env } from './config/env.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { categoriasRoutes } from './modules/categorias/categorias.routes.js'
import { despesasRoutes } from './modules/despesas/despesas.routes.js'
import { recebimentosRoutes } from './modules/recebimentos/recebimentos.routes.js'
import { relatoriosRoutes } from './modules/relatorios/relatorios.routes.js'
import { usuariosRoutes } from './modules/usuarios/usuarios.routes.js'

/** Monta a API Financeira. Separado de server.ts para poder ser usado em testes (`app.inject`). */
export async function buildApp() {
  const app = await createApp({
    title: 'SISGFPA API',
    description:
      'API REST do Sistema de Gerenciamento Financeiro para Papelarias - Módulo Financeiro (autoridade do domínio financeiro)',
    serverUrl: `http://localhost:${env.PORT}`,
    trustedOrigins: env.TRUSTED_ORIGINS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    logger: env.NODE_ENV !== 'test',
  })

  await app.register(authRoutes)
  await app.register(despesasRoutes, { prefix: '/despesas' })
  await app.register(recebimentosRoutes, { prefix: '/recebimentos' })
  await app.register(relatoriosRoutes, { prefix: '/relatorios' })
  await app.register(categoriasRoutes, { prefix: '/categorias' })
  await app.register(usuariosRoutes, { prefix: '/usuarios' })

  return app
}
