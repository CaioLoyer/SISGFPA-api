import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  alterarSituacaoContato,
  listarContatos,
  listarTitulosSemContato,
  sugerirContatos,
  vincularTitulos,
} from './contatos-api'

const contato = {
  id: '7c49697a-836c-4d09-b30e-903b33cd152d',
  codigo: 123,
  nome: 'Papelaria ABC',
  documento: '12345678000199',
  tipoPessoa: 'JURIDICA',
  papeis: ['CLIENTE', 'FORNECEDOR'],
  telefone: '(67) 3333-4444',
  cidade: 'Campo Grande',
  uf: 'MS',
  ativo: true,
  createdAt: '2026-10-21T12:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('cliente HTTP do módulo Comercial', () => {
  it('lista contatos com filtros, cookie de sessão e papéis permitidos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        items: [contato],
        total: 1,
        page: 1,
        pageSize: 20,
        papeisPermitidos: ['CLIENTE', 'FORNECEDOR'],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await listarContatos({ papel: 'FORNECEDOR', busca: 'Papelaria ABC', situacao: 'ATIVOS' })

    expect(result.items[0]?.nome).toBe('Papelaria ABC')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/contatos?')
    expect(url).toContain('papel=FORNECEDOR')
    expect(url).toContain('busca=Papelaria+ABC')
    expect(init.credentials).toBe('include')
  })

  it('carrega títulos antigos sem contato e sugestões por nome', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: 'd0000000-0000-4000-8000-000000000001',
              descricao: 'Compra de sacolas',
              nomeOriginal: 'Papelaria ABC',
              valor: 100,
              dataVencimento: '2026-10-30',
              status: 'PENDENTE',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        })
      )
      .mockResolvedValueOnce(response({ items: [contato] }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = await listarTitulosSemContato({ tipo: 'DESPESA', busca: 'Papelaria' })
    const suggestions = await sugerirContatos('FORNECEDOR', pending.items[0]!.nomeOriginal)

    expect(pending.items).toHaveLength(1)
    expect(suggestions[0]?.papeis).toContain('FORNECEDOR')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/contatos/sugestoes?')
  })

  it('inativa sem apagar e associa em lote apenas os títulos selecionados', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ ...contato, ativo: false }))
      .mockResolvedValueOnce(response({ vinculados: 2 }))
    vi.stubGlobal('fetch', fetchMock)

    await alterarSituacaoContato(contato.id, false)
    const vinculados = await vincularTitulos('RECEBIMENTO', [
      { tituloId: 'd0000000-0000-4000-8000-000000000002', contatoId: contato.id },
      { tituloId: 'd0000000-0000-4000-8000-000000000003', contatoId: contato.id },
    ])

    expect(vinculados).toBe(2)
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      tipo: 'RECEBIMENTO',
      itens: [
        { tituloId: 'd0000000-0000-4000-8000-000000000002', contatoId: contato.id },
        { tituloId: 'd0000000-0000-4000-8000-000000000003', contatoId: contato.id },
      ],
    })
  })
})
