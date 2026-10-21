import { describe, expect, it } from 'vitest'

import { CreateContatoBodySchema, VincularContatosBodySchema } from '@sisgfpa/validation'

describe('validação de contatos e associação histórica', () => {
  it('aceita um mesmo contato com os papéis de cliente e fornecedor', () => {
    const result = CreateContatoBodySchema.safeParse({
      nome: 'Papelaria ABC',
      documento: '12.345.678/0001-99',
      tipoPessoa: 'JURIDICA',
      papeis: ['CLIENTE', 'FORNECEDOR'],
      telefone: '(67) 3333-4444',
      cidade: 'Campo Grande',
      uf: 'ms',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.documento).toBe('12345678000199')
      expect(result.data.uf).toBe('MS')
      expect(result.data.papeis).toEqual(['CLIENTE', 'FORNECEDOR'])
    }
  })

  it('rejeita CPF/CNPJ incompatível com o tipo de pessoa e papel duplicado', () => {
    expect(
      CreateContatoBodySchema.safeParse({
        nome: 'Pessoa física',
        documento: '12.345.678/0001-99',
        tipoPessoa: 'FISICA',
        papeis: ['CLIENTE'],
        telefone: '67999990000',
      }).success
    ).toBe(false)

    expect(
      CreateContatoBodySchema.safeParse({
        nome: 'Distribuidor',
        documento: '12345678000199',
        tipoPessoa: 'JURIDICA',
        papeis: ['FORNECEDOR', 'FORNECEDOR'],
        telefone: '6733334444',
      }).success
    ).toBe(false)
  })

  it('rejeita associação repetida do mesmo título no lote', () => {
    expect(
      VincularContatosBodySchema.safeParse({
        tipo: 'DESPESA',
        itens: [
          {
            tituloId: 'd0000000-0000-4000-8000-000000000001',
            contatoId: 'c0000000-0000-4000-8000-000000000003',
          },
          {
            tituloId: 'd0000000-0000-4000-8000-000000000001',
            contatoId: 'c0000000-0000-4000-8000-000000000003',
          },
        ],
      }).success
    ).toBe(false)
  })
})
