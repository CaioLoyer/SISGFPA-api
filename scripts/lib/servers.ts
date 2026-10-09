import { type ChildProcess, spawn } from 'node:child_process'

export const API = 'http://localhost:8080'
export const BOT = 'http://localhost:3001'

const children: ChildProcess[] = []

function start(cwd: string, env: Record<string, string>) {
  const child = spawn('pnpm', ['exec', 'tsx', 'src/server.ts'], {
    cwd,
    env: { ...process.env, ...env, NODE_ENV: 'test', RATE_LIMIT_MAX: '5000' },
    stdio: 'ignore',
    detached: true,
  })
  children.push(child)
}

async function waitFor(url: string) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timeout aguardando ${url}`)
}

/** Sobe API (8080) e Chatbot (3001) como processos filhos e espera ficarem prontos. */
export async function startServers() {
  start('apps/api', { PORT: '8080' })
  start('apps/chatbot', { CHATBOT_PORT: '3001', FINANCIAL_API_URL: API })
  await waitFor(`${API}/swagger.json`)
  await waitFor(`${BOT}/swagger.json`)
}

export function stopServers() {
  for (const child of children) {
    if (!child.pid) continue
    try {
      process.kill(-child.pid)
    } catch {
      // já encerrado
    }
  }
}
