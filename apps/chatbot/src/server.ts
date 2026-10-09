import { startServer } from '@sisgfpa/http'

import { buildApp } from './app.js'
import { env } from './config/env.js'

const app = await buildApp()
await startServer(app, env.CHATBOT_PORT)
app.log.info(`Chatbot em http://localhost:${env.CHATBOT_PORT} (documentação em /docs)`)
