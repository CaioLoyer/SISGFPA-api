import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  contatoCreate: vi.fn(),
  contatoCount: vi.fn(),
  contatoFindMany: vi.fn(),
  contatoFindUnique: vi.fn(),
  contatoUpdate: vi.fn(),
  despesaFindMany: vi.fn(),
  despesaCount: vi.fn(),
  despesaUpdateMany: vi.fn(),
  despesaHistoricoCreate: vi.fn(),
  recebimentoFindMany: vi.fn(),
  recebimentoCount: vi.fn(),
  recebimentoUpdateMany: vi.fn(),
  recebimentoHistoricoCreate: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@sisgfpa/database', () => ({
  PapelContato: { CLIENTE: 'CLIENTE', FORNECEDOR: 'FORNECEDOR' },
  TipoPessoaContato: { FISICA: 'FISICA', JURIDICA: 'JURIDICA' },
  prisma: {
    contato: {
      create: database.contatoCreate,
      count: database.contatoCount,
      findMany: database.contatoFindMany,
      findUnique: database.contatoFindUnique,
      update: database.contatoUpdate,
    },
    despesa: {
      findMany: database.despesaFindMany,
      count: database.despesaCount,
      updateMany: database.despesaUpdateMany,
    },
    despesaHistorico: { create: database.despesaHistoricoCreate },
    recebimento: {
      findMany: database.recebimentoFindMany,
      count: database.recebimentoCount,
      updateMany: database.recebimentoUpdateMany,
    },
    recebimentoHistorico: { create: database.recebimentoHistoricoCreate },
    $transaction: database.transaction,
  },
}))

import {
  atualizarContato,
  alterarSituacaoContato,
  criarContato,
  listarContatos,
  sugerirContatos,
  vincularTitulos,
} from './contatos.service.js'

const now = new Date('2026-10-21T12:00:00.000Z')
const contact = {
  id: '7c49697a-836c-4d09-b30e-903b33cd152d',
  codigo: 123,
  nome: 'Papelaria ABC Ltda',
  documento: '12345678000199',
  tipoPessoa: 'JURIDICA',
  papeis: ['CLIENTE', 'FORNECEDOR'],
  telefone: '(67) 3333-4444',
  cidade: 'Campo Grande',
  uf: 'MS',
  ativo: true,
  createdAt: now,
  updatedAt: now,
}

beforeEach(() => {
  for (const mock of Object.values(database)) mock.mockReset()
})

describe('cadastro e vínculo de contatos comerciais', () => {
  it('retorna somente os papéis permitidos para o funcionário', async () => {
    database.contatoFindMany.mockResolvedValue([contact])
    database.contatoCount.mockResolvedValue(1)

    const result = await listarContatos({ situacao: 'ATIVOS', page: 1, pageSize: 20 }, ['FORNECEDOR'])

    expect(result.items[0]?.papeis).toEqual(['FORNECEDOR'])
    expect(result.papeisPermitidos).toEqual(['FORNECEDOR'])
    expect(database.contatoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ papeis: { hasSome: ['FORNECEDOR'] } }) })
    )
  })

  it('cria um cadastro com código gerado e CPF/CNPJ normalizado', async () => {
    database.contatoCreate.mockResolvedValue(contact)

    const result = await criarContato(
      {
        nome: contact.nome,
        documento: contact.documento,
        tipoPessoa: 'JURIDICA',
        papeis: ['CLIENTE', 'FORNECEDOR'],
        telefone: contact.telefone,
        cidade: contact.cidade,
        uf: contact.uf,
      },
      ['CLIENTE', 'FORNECEDOR']
    )

    expect(result.codigo).toBe(123)
    expect(database.contatoCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ documento: '12345678000199', papeis: ['CLIENTE', 'FORNECEDOR'] }),
    })
  })

  it('não permite criar contato com papel fora da permissão do funcionário', async () => {
    await expect(
      criarContato(
        {
          nome: 'Cliente sem acesso',
          documento: '12345678901',
          tipoPessoa: 'FISICA',
          papeis: ['CLIENTE'],
          telefone: '67999990000',
        },
        ['FORNECEDOR']
      )
    ).rejects.toMatchObject({ code: 'PAPEL_CONTATO_SEM_PERMISSAO' })
    expect(database.contatoCreate).not.toHaveBeenCalled()
  })

  it('sugere cadastros parecidos pelo nome do título antigo', async () => {
    database.contatoFindMany.mockResolvedValue([{ ...contact, ativo: false }])

    const result = await sugerirContatos('FORNECEDOR', 'Papelaria ABC', ['FORNECEDOR'])

    expect(result.items[0]?.id).toBe(contact.id)
    expect(result.items[0]?.ativo).toBe(false)
    expect(database.contatoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ papeis: { has: 'FORNECEDOR' } }),
      })
    )
  })

  it('impede remover um papel que ainda aparece em títulos vinculados', async () => {
    database.contatoFindUnique.mockResolvedValue(contact)
    database.despesaCount.mockResolvedValue(1)

    await expect(
      atualizarContato(contact.id, { papeis: ['CLIENTE'] }, ['CLIENTE', 'FORNECEDOR'])
    ).rejects.toMatchObject({ code: 'PAPEL_CONTATO_VINCULADO' })
    expect(database.contatoUpdate).not.toHaveBeenCalled()
  })

  it('preserva o papel oculto ao funcionário quando ele edita os campos comuns', async () => {
    database.contatoFindUnique.mockResolvedValue(contact)
    database.contatoUpdate.mockResolvedValue({ ...contact, nome: 'Papelaria ABC Atualizada' })

    const result = await atualizarContato(contact.id, { nome: 'Papelaria ABC Atualizada' }, ['FORNECEDOR'])

    expect(result.papeis).toEqual(['FORNECEDOR'])
    expect(database.contatoUpdate).toHaveBeenCalledWith({
      where: { id: contact.id },
      data: expect.objectContaining({ papeis: ['CLIENTE', 'FORNECEDOR'] }),
    })
  })

  it('inativa o contato sem apagar os dados nem alterar seus papéis', async () => {
    database.contatoFindUnique.mockResolvedValue(contact)
    database.contatoUpdate.mockResolvedValue({ ...contact, ativo: false })

    const result = await alterarSituacaoContato(contact.id, false, ['CLIENTE', 'FORNECEDOR'])

    expect(result.ativo).toBe(false)
    expect(database.contatoUpdate).toHaveBeenCalledWith({ where: { id: contact.id }, data: { ativo: false } })
  })

  it('associa títulos antigos manualmente sem alterar o nome histórico e registra o vínculo no histórico', async () => {
    database.contatoFindMany.mockResolvedValue([{ id: contact.id, nome: contact.nome }])
    database.transaction.mockImplementation(async (callback) =>
      callback({
        despesa: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'd0000000-0000-4000-8000-000000000001',
              status: 'PENDENTE',
              fornecedor: 'Papelaria ABC',
            },
            {
              id: 'd0000000-0000-4000-8000-000000000002',
              status: 'PAGO',
              fornecedor: 'Papelaria ABC LTDA',
            },
          ]),
          updateMany: database.despesaUpdateMany.mockResolvedValue({ count: 1 }),
        },
        despesaHistorico: { create: database.despesaHistoricoCreate.mockResolvedValue({}) },
      })
    )

    await expect(
      vincularTitulos(
        {
          tipo: 'DESPESA',
          itens: [
            { tituloId: 'd0000000-0000-4000-8000-000000000001', contatoId: contact.id },
            { tituloId: 'd0000000-0000-4000-8000-000000000002', contatoId: contact.id },
          ],
        },
        'admin-id'
      )
    ).resolves.toEqual({ vinculados: 2 })

    expect(database.despesaUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'd0000000-0000-4000-8000-000000000001', fornecedorContatoId: null },
      data: { fornecedorContatoId: contact.id },
    })
    expect(database.despesaHistoricoCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          acao: 'CONTATO_VINCULADO',
          detalhes: `Fornecedor vinculado ao contato ${contact.nome}`,
          alteradoPorId: 'admin-id',
        }),
      })
    )
    expect(database.contatoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [contact.id] }, papeis: { has: 'FORNECEDOR' } },
      })
    )
  })
})
