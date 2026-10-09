import { startServer } from '@sisgfpa/http'

import { buildApp } from './app.js'
import { env } from './config/env.js'

const app = await buildApp()
await startServer(app, env.PORT)
app.log.info(`API Financeira em http://localhost:${env.PORT} (documentação em /docs)`)
