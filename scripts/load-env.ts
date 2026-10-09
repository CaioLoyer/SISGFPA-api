import { existsSync, readFileSync } from 'node:fs'

// Carrega variáveis dos .env do projeto (sem sobrescrever as já definidas no shell).
for (const file of ['.env', 'apps/api/.env', 'packages/database/.env']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || line.trim().startsWith('#')) continue
    process.env[m[1]!] ??= m[2]!.replace(/^(['"])(.*)\1$/, '$2')
  }
}

for (const name of ['DATABASE_URL', 'BETTER_AUTH_SECRET']) {
  if (!process.env[name]) {
    console.error(`Variável ${name} não definida. Configure apps/api/.env (veja .env.example).`)
    process.exit(1)
  }
}
