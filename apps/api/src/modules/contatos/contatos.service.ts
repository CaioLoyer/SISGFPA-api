import {
  PapelContato as PapelContatoDb,
  prisma,
  TipoPessoaContato as TipoPessoaContatoDb,
} from '@sisgfpa/database'
import { BusinessRuleError, ConflictError, NotFoundError } from '@sisgfpa/http'
import type {
  ContatoDto,
  CreateContatoInput,
  ListContatosQuery,
  UpdateContatoInput,
} from '@sisgfpa/validation'
import type { PapelContato } from '@sisgfpa/types'

import type { ContatoPapelPermitido } from '../../authorization/financial-permissions.js'

type DbContato = Awaited<ReturnType<typeof prisma.contato.findUniqueOrThrow>>

function toContatoDto(contato: DbContato, papeisPermitidos: ContatoPapelPermitido[]): ContatoDto {
  return {
    id: contato.id,
    codigo: contato.codigo,
    nome: contato.nome,
    documento: contato.documento,
    tipoPessoa: contato.tipoPessoa,
    papeis: contato.papeis.filter((papel) => papeisPermitidos.includes(papel)),
    telefone: contato.telefone,
    cidade: contato.cidade,
    uf: contato.uf,
    ativo: contato.ativo,
    createdAt: contato.createdAt.toISOString(),
    updatedAt: contato.updatedAt.toISOString(),
  }
}

function validarPapeis(papeis: PapelContato[], permitidos: ContatoPapelPermitido[]) {
  if (papeis.length === 0 || papeis.some((papel) => !permitidos.includes(papel))) {
    throw new BusinessRuleError(
      'PAPEL_CONTATO_SEM_PERMISSAO',
      'Você não pode gerenciar um destes tipos de contato'
    )
  }
}

function validarDocumento(documento: string, tipoPessoa: 'FISICA' | 'JURIDICA') {
  const esperado = tipoPessoa === 'FISICA' ? 11 : 14
  if (documento.length !== esperado) {
    throw new BusinessRuleError(
      'DOCUMENTO_INVALIDO',
      tipoPessoa === 'FISICA' ? 'CPF deve ter 11 dígitos' : 'CNPJ deve ter 14 dígitos'
    )
  }
}

function normalizarBusca(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function similaridade(nome: string, termo: string) {
  const tokensNome = new Set(normalizarBusca(nome).split(' ').filter(Boolean))
  const tokensTermo = new Set(normalizarBusca(termo).split(' ').filter(Boolean))
  if (tokensNome.size === 0 || tokensTermo.size === 0) return 0
  const intersecao = [...tokensTermo].filter((token) => tokensNome.has(token)).length
  const jaccard = intersecao / new Set([...tokensNome, ...tokensTermo]).size
  const ambosContem =
    normalizarBusca(nome).includes(normalizarBusca(termo)) ||
    normalizarBusca(termo).includes(normalizarBusca(nome))
  return jaccard + (ambosContem ? 0.5 : 0)
}

function isDocumentoDuplicado(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

export async function listarContatos(query: ListContatosQuery, papeisPermitidos: ContatoPapelPermitido[]) {
  const papeis = query.papel ? [query.papel] : papeisPermitidos
  const busca = query.busca?.trim()
  const digitos = busca?.replace(/\D/g, '')
  const codigo = busca && /^\d{1,9}$/.test(busca) ? Number(busca) : undefined
  const where = {
    papeis: { hasSome: papeis as PapelContatoDb[] },
    ativo: query.situacao === 'TODOS' ? undefined : query.situacao === 'ATIVOS',
    OR: busca
      ? [
          { nome: { contains: busca, mode: 'insensitive' as const } },
          ...(digitos ? [{ documento: { contains: digitos } }] : []),
          ...(codigo ? [{ codigo }] : []),
        ]
      : undefined,
  }

  const [items, total] = await Promise.all([
    prisma.contato.findMany({
      where,
      orderBy: [{ nome: 'asc' }, { documento: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.contato.count({ where }),
  ])

  return {
    items: items.map((contato) => toContatoDto(contato, papeisPermitidos)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    papeisPermitidos,
  }
}

export async function criarContato(input: CreateContatoInput, papeisPermitidos: ContatoPapelPermitido[]) {
  validarPapeis(input.papeis, papeisPermitidos)
  validarDocumento(input.documento, input.tipoPessoa)
  try {
    const contato = await prisma.contato.create({
      data: {
        nome: input.nome,
        documento: input.documento,
        tipoPessoa: input.tipoPessoa as TipoPessoaContatoDb,
        papeis: input.papeis as PapelContatoDb[],
        telefone: input.telefone,
        cidade: input.cidade ?? null,
        uf: input.uf ?? null,
      },
    })
    return toContatoDto(contato, papeisPermitidos)
  } catch (error) {
    if (isDocumentoDuplicado(error)) {
      throw new ConflictError('CONTATO_DOCUMENTO_DUPLICADO', 'Já existe um contato com este CPF/CNPJ')
    }
    throw error
  }
}

export async function atualizarContato(
  id: string,
  input: UpdateContatoInput,
  papeisPermitidos: ContatoPapelPermitido[]
) {
  const atual = await prisma.contato.findUnique({ where: { id } })
  if (!atual) throw new NotFoundError('Contato não encontrado')

  const papeisPermitidosAtuais = atual.papeis.filter((papel) => papeisPermitidos.includes(papel))
  const papeisRecebidos = input.papeis ?? papeisPermitidosAtuais
  validarPapeis(papeisRecebidos, papeisPermitidos)
  const papeisAtualizados = [
    ...atual.papeis.filter((papel) => !papeisPermitidos.includes(papel)),
    ...papeisRecebidos,
  ]
  const papeisRemovidos = atual.papeis.filter((papel) => !papeisAtualizados.includes(papel))
  if (papeisRemovidos.includes('FORNECEDOR')) {
    const titulosVinculados = await prisma.despesa.count({ where: { fornecedorContatoId: id } })
    if (titulosVinculados > 0) {
      throw new BusinessRuleError(
        'PAPEL_CONTATO_VINCULADO',
        'Não é possível remover Fornecedor enquanto houver títulos vinculados'
      )
    }
  }
  if (papeisRemovidos.includes('CLIENTE')) {
    const titulosVinculados = await prisma.recebimento.count({ where: { clienteContatoId: id } })
    if (titulosVinculados > 0) {
      throw new BusinessRuleError(
        'PAPEL_CONTATO_VINCULADO',
        'Não é possível remover Cliente enquanto houver títulos vinculados'
      )
    }
  }
  const tipoPessoa = input.tipoPessoa ?? atual.tipoPessoa
  const documento = input.documento ?? atual.documento
  validarDocumento(documento, tipoPessoa)

  try {
    const contato = await prisma.contato.update({
      where: { id },
      data: {
        nome: input.nome,
        documento: input.documento,
        tipoPessoa: input.tipoPessoa as TipoPessoaContatoDb | undefined,
        papeis: papeisAtualizados as PapelContatoDb[],
        telefone: input.telefone,
        cidade: input.cidade,
        uf: input.uf,
      },
    })
    return toContatoDto(contato, papeisPermitidos)
  } catch (error) {
    if (isDocumentoDuplicado(error)) {
      throw new ConflictError('CONTATO_DOCUMENTO_DUPLICADO', 'Já existe um contato com este CPF/CNPJ')
    }
    throw error
  }
}

export async function alterarSituacaoContato(
  id: string,
  ativo: boolean,
  papeisPermitidos: ContatoPapelPermitido[]
) {
  const atual = await prisma.contato.findUnique({ where: { id } })
  if (!atual) throw new NotFoundError('Contato não encontrado')
  validarPapeis(atual.papeis, papeisPermitidos)
  const contato = await prisma.contato.update({ where: { id }, data: { ativo } })
  return toContatoDto(contato, papeisPermitidos)
}

export async function sugerirContatos(
  papel: PapelContato,
  nome: string,
  papeisPermitidos: ContatoPapelPermitido[]
) {
  validarPapeis([papel], papeisPermitidos)
  const termos = normalizarBusca(nome)
    .split(' ')
    .filter((termo) => termo.length >= 2)
  const contatos = await prisma.contato.findMany({
    where: {
      papeis: { has: papel as PapelContatoDb },
      OR: termos.length
        ? termos.map((termo) => ({ nome: { contains: termo, mode: 'insensitive' as const } }))
        : [{ nome: { contains: nome, mode: 'insensitive' as const } }],
    },
    take: 100,
  })
  const ordenados = contatos
    .map((contato) => ({ contato, score: similaridade(contato.nome, nome) }))
    .sort((a, b) => b.score - a.score || a.contato.nome.localeCompare(b.contato.nome, 'pt-BR'))
    .slice(0, 8)

  return { items: ordenados.map(({ contato }) => toContatoDto(contato, papeisPermitidos)) }
}

export async function listarVinculosPendentes(
  tipo: 'DESPESA' | 'RECEBIMENTO',
  busca: string | undefined,
  page: number,
  pageSize: number
) {
  const where =
    tipo === 'DESPESA'
      ? {
          fornecedorContatoId: null,
          fornecedor: busca ? { contains: busca, mode: 'insensitive' as const } : undefined,
        }
      : {
          clienteContatoId: null,
          cliente: busca ? { contains: busca, mode: 'insensitive' as const } : undefined,
        }

  const [titulos, total] = await Promise.all([
    tipo === 'DESPESA'
      ? prisma.despesa.findMany({
          where,
          orderBy: [{ fornecedor: 'asc' }, { dataVencimento: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
      : prisma.recebimento.findMany({
          where,
          orderBy: [{ cliente: 'asc' }, { dataVencimento: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
    tipo === 'DESPESA' ? prisma.despesa.count({ where }) : prisma.recebimento.count({ where }),
  ])

  return {
    items: titulos.map((titulo) => ({
      id: titulo.id,
      descricao: titulo.descricao,
      nomeOriginal:
        tipo === 'DESPESA'
          ? (titulo as (typeof titulos)[number] & { fornecedor: string }).fornecedor
          : (titulo as (typeof titulos)[number] & { cliente: string }).cliente,
      valor: Number(titulo.valor),
      dataVencimento: titulo.dataVencimento.toISOString().slice(0, 10),
      status: titulo.status,
    })),
    total,
    page,
    pageSize,
  }
}

export async function vincularTitulos(
  input: { tipo: 'DESPESA' | 'RECEBIMENTO'; itens: { tituloId: string; contatoId: string }[] },
  usuarioId: string
) {
  const contatoIds = [...new Set(input.itens.map((item) => item.contatoId))]
  const papel = input.tipo === 'DESPESA' ? PapelContatoDb.FORNECEDOR : PapelContatoDb.CLIENTE
  const contatos = await prisma.contato.findMany({
    where: { id: { in: contatoIds }, papeis: { has: papel } },
    select: { id: true, nome: true },
  })
  if (contatos.length !== contatoIds.length) {
    throw new BusinessRuleError('CONTATO_INDISPONIVEL', 'Selecione contatos do tipo correspondente')
  }
  const contatosPorId = new Map(contatos.map((contato) => [contato.id, contato]))
  const ids = input.itens.map((item) => item.tituloId)

  return prisma.$transaction(async (tx) => {
    if (input.tipo === 'DESPESA') {
      const titulos = await tx.despesa.findMany({ where: { id: { in: ids }, fornecedorContatoId: null } })
      if (titulos.length !== ids.length) {
        throw new ConflictError(
          'TITULO_JA_VINCULADO',
          'Um ou mais títulos já foram vinculados ou não existem'
        )
      }
      const porId = new Map(titulos.map((titulo) => [titulo.id, titulo]))
      for (const item of input.itens) {
        const contato = contatosPorId.get(item.contatoId)
        const titulo = porId.get(item.tituloId)
        if (!contato || !titulo)
          throw new ConflictError('VINCULO_INVALIDO', 'Não foi possível validar o vínculo solicitado')
        const atualizado = await tx.despesa.updateMany({
          where: { id: titulo.id, fornecedorContatoId: null },
          data: { fornecedorContatoId: contato.id },
        })
        if (atualizado.count !== 1)
          throw new ConflictError('TITULO_JA_VINCULADO', 'O título foi alterado por outra operação')
        await tx.despesaHistorico.create({
          data: {
            despesaId: titulo.id,
            acao: 'CONTATO_VINCULADO',
            statusAnterior: titulo.status,
            statusNovo: titulo.status,
            detalhes: `Fornecedor vinculado ao contato ${contato.nome}`,
            alteradoPorId: usuarioId,
          },
        })
      }
    } else {
      const titulos = await tx.recebimento.findMany({ where: { id: { in: ids }, clienteContatoId: null } })
      if (titulos.length !== ids.length) {
        throw new ConflictError(
          'TITULO_JA_VINCULADO',
          'Um ou mais títulos já foram vinculados ou não existem'
        )
      }
      const porId = new Map(titulos.map((titulo) => [titulo.id, titulo]))
      for (const item of input.itens) {
        const contato = contatosPorId.get(item.contatoId)
        const titulo = porId.get(item.tituloId)
        if (!contato || !titulo)
          throw new ConflictError('VINCULO_INVALIDO', 'Não foi possível validar o vínculo solicitado')
        const atualizado = await tx.recebimento.updateMany({
          where: { id: titulo.id, clienteContatoId: null },
          data: { clienteContatoId: contato.id },
        })
        if (atualizado.count !== 1)
          throw new ConflictError('TITULO_JA_VINCULADO', 'O título foi alterado por outra operação')
        await tx.recebimentoHistorico.create({
          data: {
            recebimentoId: titulo.id,
            acao: 'CONTATO_VINCULADO',
            statusAnterior: titulo.status,
            statusNovo: titulo.status,
            detalhes: `Cliente vinculado ao contato ${contato.nome}`,
            alteradoPorId: usuarioId,
          },
        })
      }
    }
    return { vinculados: input.itens.length }
  })
}
