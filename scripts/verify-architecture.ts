/**
 * Verificação estática das tecnologias e da arquitetura obrigatórias (sem banco, sem subir servidores).
 * Uso: pnpm verify:arch
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(p, 'utf8')
const pkg = (p: string) => JSON.parse(read(p)) as { dependencies?: Record<string, string> }

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'generated', '.git'].includes(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}
const sources = (dir: string) => walk(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✔' : '✘'} ${name}${!ok && detail ? `\n      ${detail}` : ''}`)
  if (!ok) failed++
}
const offenders = (files: string[], re: RegExp) =>
  files.filter((f) => re.test(read(f))).map((f) => f.replace(/\\/g, '/'))

const apps = ['apps/api', 'apps/chatbot']

console.log('\nFastify e HTTP')
const httpPkg = pkg('packages/http/package.json').dependencies ?? {}
const createAppTs = read('packages/http/src/create-app.ts')
check(
  'packages/http depende de fastify, swagger, scalar, cors e rate-limit',
  [
    'fastify',
    '@fastify/swagger',
    '@scalar/fastify-api-reference',
    '@fastify/cors',
    '@fastify/rate-limit',
  ].every((d) => Boolean(httpPkg[d]))
)
check(
  'instância criada com Fastify() em um único lugar (createApp)',
  /Fastify\(/.test(createAppTs) && apps.every((a) => !/Fastify\(/.test(read(`${a}/src/app.ts`)))
)
check(
  'validação Zod (fastify-type-provider-zod) configurada no createApp',
  /validatorCompiler/.test(createAppTs) && /serializerCompiler/.test(createAppTs)
)
check(
  'rate limit, CORS e Swagger/Scalar configurados no createApp',
  /fastifyRateLimit/.test(createAppTs) &&
    /fastifyCors/.test(createAppTs) &&
    /fastifySwagger/.test(createAppTs) &&
    /ScalarApiReference/.test(createAppTs)
)
check(
  'tratamento de erros central (setErrorHandler) no pacote http',
  /setErrorHandler/.test(read('packages/http/src/error-handler.ts'))
)
for (const app of apps) {
  const deps = pkg(`${app}/package.json`).dependencies ?? {}
  const appTs = read(`${app}/src/app.ts`)
  const serverTs = read(`${app}/src/server.ts`)
  const files = sources(`${app}/src`)
  check(`${app} usa Fastify (dependência + createApp)`, Boolean(deps.fastify) && /createApp\(/.test(appTs))
  check(
    `${app} separa app.ts (buildApp) de server.ts (listen)`,
    /export async function buildApp/.test(appTs) && /startServer\(/.test(serverTs) && !/listen\(/.test(appTs)
  )
  const bad = offenders(
    files,
    /from ['"](?:node:)?https?['"]|createServer\(|from ['"]express['"]|from ['"]@nestjs\//
  )
  check(`${app} não usa http nativo, Express ou NestJS`, bad.length === 0, bad.join(', '))
  check(`${app} registra rotas via app.register`, /app\.register\(\w*[Rr]outes/.test(appTs))
  check(
    `${app} lê process.env só em config/env.ts`,
    offenders(files, /process\.env/).every((f) => f.endsWith('config/env.ts')),
    offenders(files, /process\.env/).join(', ')
  )
  const trycatch = offenders(
    files.filter((f) => f.endsWith('.routes.ts')),
    /\bcatch\s*\(/
  )
  check(
    `${app} sem try/catch nas rotas (erros tratados centralmente)`,
    trycatch.length === 0,
    trycatch.join(', ')
  )
}

console.log('\nPersistência, banco e autenticação')
const schemaFiles = walk('.').filter((f) => f.endsWith('schema.prisma'))
check(
  'existe um único schema.prisma (packages/database)',
  schemaFiles.length === 1 &&
    schemaFiles[0]!.replace(/\\/g, '/') === 'packages/database/prisma/schema.prisma',
  schemaFiles.join(', ')
)
check(
  'provider do banco é PostgreSQL',
  /provider\s*=\s*"postgresql"/.test(read('packages/database/prisma/schema.prisma'))
)
check(
  'Prisma no pacote database',
  Boolean(pkg('packages/database/package.json').dependencies?.['@prisma/client'])
)
check('Better Auth no pacote auth', Boolean(pkg('packages/auth/package.json').dependencies?.['better-auth']))
check('Zod no pacote validation', Boolean(pkg('packages/validation/package.json').dependencies?.zod))
const betterAuthUsers = apps.filter((a) => sources(`${a}/src`).some((f) => /betterAuth\(/.test(read(f))))
check(
  'betterAuth() é instanciado só em packages/auth',
  betterAuthUsers.length === 0 && /betterAuth\(/.test(read('packages/auth/src/index.ts'))
)
check(
  'pnpm workspace com apps/* e packages/*',
  /apps\/\*/.test(read('pnpm-workspace.yaml')) && /packages\/\*/.test(read('pnpm-workspace.yaml'))
)

console.log('\nChatbot ↔ API Financeira (HTTP/REST)')
const botFiles = sources('apps/chatbot/src')
const finTables = offenders(
  botFiles,
  /prisma\.(despesa|despesaParcela|despesaPagamento|despesaHistorico|recebimento|recebimentoParcela|recebimentoBaixa|recebimentoHistorico|categoria)\b/
)
check('Chatbot não acessa tabelas financeiras via Prisma', finTables.length === 0, finTables.join(', '))
const prismaImports = offenders(botFiles, /from '@sisgfpa\/database'/)
check(
  'Prisma no Chatbot só nos services de chat/mensagem (Chat/Message)',
  prismaImports.every((f) => /modules\/chat\/(chat|message)\.service\.ts$/.test(f)),
  prismaImports.join(', ')
)
const botDeps = Object.keys(pkg('apps/chatbot/package.json').dependencies ?? {})
check(
  'Chatbot usa o cliente HTTP da API Financeira',
  /fetch/.test(read('apps/chatbot/src/modules/financial-api/financial-api-client.ts')) &&
    /FinancialApiClient/.test(read('apps/chatbot/src/modules/chat/message.service.ts'))
)
check(
  'packages/http não importa código das apps',
  offenders(sources('packages/http/src'), /apps\//).length === 0
)
check(
  'Chatbot não importa código da API (módulos independentes)',
  offenders(botFiles, /apps\/api|from 'api'/).length === 0
)
check(
  'API não importa código do Chatbot',
  offenders(sources('apps/api/src'), /apps\/chatbot|from 'chatbot'/).length === 0
)
check(
  'Chatbot não tem regras de parcelamento/pagamento próprias',
  !botFiles.some((f) => /gerarParcelas|distribuirNasParcelas|aplicarPagamento|aplicarBaixa/.test(read(f)))
)
check(
  'regras financeiras ficam na API (domain/)',
  /gerarParcelas/.test(read('apps/api/src/domain/parcelas.ts')) &&
    /aplicarPagamentoDespesa/.test(read('apps/api/src/domain/liquidacao.ts'))
)
check(
  'dependências do Chatbot não incluem IA generativa',
  !botDeps.some((d) => /^(ai|openai|@ai-sdk\/.*)$/.test(d))
)

console.log(failed === 0 ? '\nArquitetura OK' : `\n${failed} verificação(ões) falharam`)
process.exit(failed === 0 ? 0 : 1)
