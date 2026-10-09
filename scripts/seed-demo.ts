/**
 * Dados de demonstração para a documentação (Scalar): usuários ADMIN/FUNCIONARIO e títulos/conversa
 * com IDs fixos (ver EXEMPLOS em @sisgfpa/types). Idempotente: cada execução RESTAURA o estado inicial
 * desses registros de demonstração. Não roda em produção.
 *
 * Uso: pnpm build && pnpm db:seed && pnpm db:seed:demo
 */
import './load-env.js'

import { pathToFileURL } from 'node:url'

import { CATEGORIAS_DESPESA, CATEGORIAS_RECEBIMENTO, EXEMPLOS } from '../packages/types/dist/index.js'

type Usuario = { name: string; email: string; password: string }

export async function seedDemo() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-demo não pode rodar em produção (cria usuários com senha conhecida).')
  }

  const { auth } = await import('../packages/auth/dist/index.js')
  const { prisma } = await import('../packages/database/dist/index.js')

  // Categorias (idempotente; o mesmo que `pnpm db:seed`).
  for (const nome of CATEGORIAS_DESPESA) {
    await prisma.categoria.upsert({
      where: { nome_tipo: { nome, tipo: 'DESPESA' } },
      update: {},
      create: { nome, tipo: 'DESPESA' },
    })
  }
  for (const nome of CATEGORIAS_RECEBIMENTO) {
    await prisma.categoria.upsert({
      where: { nome_tipo: { nome, tipo: 'RECEBIMENTO' } },
      update: {},
      create: { nome, tipo: 'RECEBIMENTO' },
    })
  }

  // Fixa os ids das categorias usadas nos exemplos (a troca de PK propaga para títulos via ON UPDATE CASCADE).
  for (const [nome, tipo, id] of [
    ['Mercadorias', 'DESPESA', EXEMPLOS.categoriaDespesaId],
    ['Vendas', 'RECEBIMENTO', EXEMPLOS.categoriaRecebimentoId],
  ] as const) {
    const atual = await prisma.categoria.findUniqueOrThrow({ where: { nome_tipo: { nome, tipo } } })
    if (atual.id !== id) await prisma.categoria.update({ where: { id: atual.id }, data: { id } })
  }

  async function garantirUsuario(u: Usuario, role: 'ADMIN' | 'FUNCIONARIO') {
    let user = await prisma.user.findUnique({ where: { email: u.email } })
    if (!user) {
      await auth.api.signUpEmail({ body: { name: u.name, email: u.email, password: u.password } })
      user = await prisma.user.findUniqueOrThrow({ where: { email: u.email } })
    }
    if (user.role !== role) user = await prisma.user.update({ where: { id: user.id }, data: { role } })
    return user
  }

  const admin = await garantirUsuario(EXEMPLOS.admin, 'ADMIN')
  await garantirUsuario(EXEMPLOS.funcionario, 'FUNCIONARIO')

  // Restaura os registros de demonstração (apenas os de ID fixo).
  await prisma.chat.deleteMany({ where: { id: EXEMPLOS.chatId } }) // mensagens caem em cascata
  await prisma.despesaPagamento.deleteMany({ where: { despesaId: EXEMPLOS.despesaId } })
  await prisma.despesaHistorico.deleteMany({ where: { despesaId: EXEMPLOS.despesaId } })
  await prisma.despesaParcela.deleteMany({ where: { despesaId: EXEMPLOS.despesaId } })
  await prisma.despesa.deleteMany({ where: { id: EXEMPLOS.despesaId } })
  await prisma.recebimentoBaixa.deleteMany({ where: { recebimentoId: EXEMPLOS.recebimentoId } })
  await prisma.recebimentoHistorico.deleteMany({ where: { recebimentoId: EXEMPLOS.recebimentoId } })
  await prisma.recebimentoParcela.deleteMany({ where: { recebimentoId: EXEMPLOS.recebimentoId } })
  await prisma.recebimento.deleteMany({ where: { id: EXEMPLOS.recebimentoId } })

  const mercadorias = await prisma.categoria.findUniqueOrThrow({
    where: { nome_tipo: { nome: 'Mercadorias', tipo: 'DESPESA' } },
  })
  const vendas = await prisma.categoria.findUniqueOrThrow({
    where: { nome_tipo: { nome: 'Vendas', tipo: 'RECEBIMENTO' } },
  })

  const vencimentos = ['2026-10-30', '2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28']
  await prisma.despesa.create({
    data: {
      id: EXEMPLOS.despesaId,
      descricao: 'Compra de cadernos',
      fornecedor: 'Distribuidora Escolar ABC',
      valor: 2500,
      dataLancamento: new Date('2026-09-30'),
      dataVencimento: new Date('2026-10-30'),
      numeroParcelas: 5,
      observacoes: 'Despesa de demonstração',
      categoriaId: mercadorias.id,
      criadoPorId: admin.id,
      parcelas: {
        create: vencimentos.map((v, i) => ({ numero: i + 1, valor: 500, dataVencimento: new Date(v) })),
      },
      historico: { create: { acao: 'CRIADO', statusNovo: 'PENDENTE', alteradoPorId: admin.id } },
    },
  })

  await prisma.recebimento.create({
    data: {
      id: EXEMPLOS.recebimentoId,
      descricao: 'Venda de material escolar',
      cliente: 'Maria da Silva',
      valor: 350,
      dataLancamento: new Date('2026-09-30'),
      dataVencimento: new Date('2026-10-15'),
      numeroParcelas: 1,
      observacoes: 'Recebimento de demonstração',
      categoriaId: vendas.id,
      criadoPorId: admin.id,
      parcelas: { create: { numero: 1, valor: 350, dataVencimento: new Date('2026-10-15') } },
      historico: { create: { acao: 'CRIADO', statusNovo: 'PENDENTE', alteradoPorId: admin.id } },
    },
  })

  // Conversa de demonstração com duas operações pendentes de confirmação (uma para confirmar, outra para descartar).
  const plano = {
    tipo: 'CRIAR_DESPESA',
    body: {
      descricao: 'Compra de cadernos',
      fornecedor: 'Distribuidora Escolar ABC',
      valor: 2500,
      dataVencimento: '2026-10-30',
      dataLancamento: '2026-09-30',
      parcelas: 5,
      observacoes: 'Quantidade: 500 cadernos',
      liquidarNoAto: false,
    },
    categoria: 'Mercadorias',
  }
  const content = 'Compramos 500 cadernos do fornecedor Distribuidora Escolar ABC por R$ 2500 em 5 parcelas'
  const pendente = (id: string) => ({
    id,
    userId: admin.id,
    papel: 'USUARIO' as const,
    content,
    intent: 'CRIAR_DESPESA' as const,
    status: 'PENDENTE_CONFIRMACAO' as const,
    parsedData: { textoBase: content, plano },
  })
  await prisma.chat.create({
    data: {
      id: EXEMPLOS.chatId,
      userId: admin.id,
      title: 'Conversa de demonstração',
      messages: { create: [pendente(EXEMPLOS.mensagemConfirmarId), pendente(EXEMPLOS.mensagemDescartarId)] },
    },
  })

  return { admin: EXEMPLOS.admin.email, funcionario: EXEMPLOS.funcionario.email }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDemo()
    .then(async (r) => {
      console.log(
        `Demo pronta. Login: ${r.admin} / ${EXEMPLOS.admin.password} (ADMIN) e ${r.funcionario} / ${EXEMPLOS.funcionario.password}`
      )
      const { prisma } = await import('../packages/database/dist/index.js')
      await prisma.$disconnect()
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
