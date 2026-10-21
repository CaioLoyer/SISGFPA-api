import z from 'zod'

import { EXEMPLOS, PAPEIS_CONTATO, STATUS_TITULO, TIPOS_CATEGORIA, TIPOS_PESSOA } from '@sisgfpa/types'

// ===================== Comuns =====================

export const ErrorSchema = z
  .object({
    error: z.string().meta({ example: 'Você não tem permissão para realizar esta ação' }),
    code: z.string().meta({ example: 'FORBIDDEN' }),
  })
  .meta({ example: { error: 'Você não tem permissão para realizar esta ação', code: 'FORBIDDEN' } })

// ===================== Autenticação (Better Auth, exposta pela API) =====================

export const CreateFuncionarioBodySchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).meta({ example: 'Maria Souza' }),
    email: z.email().meta({ example: 'maria.souza@papelariaexemplo.com' }),
    password: z.string().min(8).max(128).meta({ example: 'senha12345' }),
  })
  .meta({
    description:
      'Cria uma conta FUNCIONARIO. O papel é definido pelo servidor e não pode ser informado pelo cliente.',
    example: { name: 'Maria Souza', email: 'maria.souza@papelariaexemplo.com', password: 'senha12345' },
  })

export const CreateFuncionarioResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: z.literal('FUNCIONARIO'),
})

export const FuncionarioPermissoesSchema = z
  .strictObject({
    despesas: z.boolean(),
    recebimentos: z.boolean(),
  })
  .meta({ example: { despesas: true, recebimentos: true } })

export const FuncionarioParamsSchema = z.object({
  id: z.string().min(1).max(128).meta({ example: 'funcionario-id' }),
})

export const UpdateFuncionarioPermissoesBodySchema = FuncionarioPermissoesSchema

export const FuncionarioAdminSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    createdAt: z.iso.datetime(),
    permissoes: FuncionarioPermissoesSchema,
  })
  .meta({
    example: {
      id: 'funcionario-id',
      name: 'Maria Souza',
      email: 'maria.souza@papelariaexemplo.com',
      createdAt: '2026-10-21T12:00:00.000Z',
      permissoes: { despesas: true, recebimentos: true },
    },
  })

export const ListFuncionariosResponseSchema = z
  .object({
    items: z.array(FuncionarioAdminSchema),
  })
  .meta({ example: { items: [] } })

export const FuncionarioPermissoesResponseSchema = z
  .object({
    funcionarioId: z.string(),
    permissoes: FuncionarioPermissoesSchema,
  })
  .meta({ example: { funcionarioId: 'funcionario-id', permissoes: { despesas: true, recebimentos: true } } })

export const SignInBodySchema = z
  .object({
    email: z.email().meta({ example: EXEMPLOS.admin.email }),
    password: z.string().min(1).meta({ example: EXEMPLOS.admin.password }),
  })
  .meta({ example: { email: EXEMPLOS.admin.email, password: EXEMPLOS.admin.password } })

export const StatusTituloSchema = z.enum(STATUS_TITULO)
export const TipoCategoriaSchema = z.enum(TIPOS_CATEGORIA)
export const PapelContatoSchema = z.enum(PAPEIS_CONTATO)
export const TipoPessoaContatoSchema = z.enum(TIPOS_PESSOA)

// ===================== Contatos comerciais =====================

const DocumentoContatoSchema = z
  .string()
  .trim()
  .min(11)
  .max(20)
  .transform((value) => value.replace(/\D/g, ''))
  .refine((value) => value.length === 11 || value.length === 14, {
    message: 'Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos',
  })

const ContatoFieldsSchema = {
  nome: z.string().trim().min(1).max(160),
  documento: DocumentoContatoSchema,
  tipoPessoa: TipoPessoaContatoSchema,
  papeis: z.array(PapelContatoSchema).min(1).max(2),
  telefone: z.string().trim().min(8).max(24),
  cidade: z.string().trim().max(100).nullable().optional(),
  uf: z.string().trim().length(2).toUpperCase().nullable().optional(),
}

export const ContatoParamsSchema = z.object({ id: z.uuid().meta({ example: EXEMPLOS.contatoId }) })

export const ContatoSchema = z.object({
  id: z.uuid(),
  codigo: z.number().int(),
  nome: z.string(),
  documento: z.string(),
  tipoPessoa: TipoPessoaContatoSchema,
  papeis: z.array(PapelContatoSchema),
  telefone: z.string(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const CreateContatoBodySchema = z
  .strictObject(ContatoFieldsSchema)
  .superRefine((contato, context) => {
    if (new Set(contato.papeis).size !== contato.papeis.length) {
      context.addIssue({ code: 'custom', path: ['papeis'], message: 'Os papéis não podem se repetir' })
    }
    const tamanhoEsperado = contato.tipoPessoa === 'FISICA' ? 11 : 14
    if (contato.documento.length !== tamanhoEsperado) {
      context.addIssue({
        code: 'custom',
        path: ['documento'],
        message: contato.tipoPessoa === 'FISICA' ? 'CPF deve ter 11 dígitos' : 'CNPJ deve ter 14 dígitos',
      })
    }
  })
  .meta({
    example: {
      nome: 'Distribuidora Escolar ABC',
      documento: '12345678000199',
      tipoPessoa: 'JURIDICA',
      papeis: ['CLIENTE', 'FORNECEDOR'],
      telefone: '(67) 3333-4444',
      cidade: 'Campo Grande',
      uf: 'MS',
    },
  })

export const UpdateContatoBodySchema = z
  .strictObject({
    nome: ContatoFieldsSchema.nome.optional(),
    documento: ContatoFieldsSchema.documento.optional(),
    tipoPessoa: ContatoFieldsSchema.tipoPessoa.optional(),
    papeis: ContatoFieldsSchema.papeis.optional(),
    telefone: ContatoFieldsSchema.telefone.optional(),
    cidade: ContatoFieldsSchema.cidade,
    uf: ContatoFieldsSchema.uf,
  })
  .refine((contato) => Object.keys(contato).length > 0, 'Informe ao menos um campo para atualizar')
  .meta({ example: { nome: 'Distribuidora Escolar ABC Ltda' } })

export const UpdateContatoStatusBodySchema = z
  .strictObject({ ativo: z.boolean().meta({ example: false }) })
  .meta({ example: { ativo: false } })

export const ListContatosQuerySchema = z.object({
  papel: PapelContatoSchema.optional().meta({ example: 'FORNECEDOR' }),
  busca: z.string().trim().min(1).max(160).optional().meta({ example: 'Distribuidora' }),
  situacao: z.enum(['ATIVOS', 'INATIVOS', 'TODOS']).default('ATIVOS').meta({ example: 'ATIVOS' }),
  page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).meta({ example: 20 }),
})

export const ListContatosResponseSchema = z.object({
  items: z.array(ContatoSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  papeisPermitidos: z.array(PapelContatoSchema),
})

export const ContatoSugestoesQuerySchema = z.object({
  papel: PapelContatoSchema.meta({ example: 'FORNECEDOR' }),
  nome: z.string().trim().min(1).max(160).meta({ example: 'Distribuidora Escolar ABC' }),
})

export const ContatoSugestoesResponseSchema = z.object({ items: z.array(ContatoSchema) })

export const ListVinculosPendentesQuerySchema = z.object({
  tipo: z.enum(['DESPESA', 'RECEBIMENTO']).meta({ example: 'DESPESA' }),
  busca: z.string().trim().min(1).max(160).optional().meta({ example: 'Distribuidora' }),
  page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).meta({ example: 20 }),
})

export const VinculoContatoItemSchema = z
  .strictObject({
    tituloId: z.uuid().meta({ example: EXEMPLOS.despesaId }),
    contatoId: z.uuid().meta({ example: EXEMPLOS.contatoId }),
  })
  .meta({ example: { tituloId: EXEMPLOS.despesaId, contatoId: EXEMPLOS.contatoId } })

export const VincularContatosBodySchema = z
  .strictObject({
    tipo: z.enum(['DESPESA', 'RECEBIMENTO']),
    itens: z.array(VinculoContatoItemSchema).min(1).max(100),
  })
  .superRefine((input, context) => {
    const ids = input.itens.map((item) => item.tituloId)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['itens'], message: 'O mesmo título não pode ser repetido' })
    }
  })
  .meta({
    example: {
      tipo: 'DESPESA',
      itens: [{ tituloId: EXEMPLOS.despesaId, contatoId: EXEMPLOS.contatoId }],
    },
  })

export const VinculosPendentesResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      descricao: z.string(),
      nomeOriginal: z.string(),
      valor: z.number(),
      dataVencimento: z.iso.date(),
      status: StatusTituloSchema,
    })
  ),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export const VincularContatosResponseSchema = z.object({ vinculados: z.number() })

const MAX_PARCELAS = 120

// ===================== Categorias =====================

export const CategoriaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipo: TipoCategoriaSchema,
})

export const ListCategoriasQuerySchema = z.object({
  tipo: TipoCategoriaSchema.optional().meta({ example: 'DESPESA' }),
})

export const ListCategoriasResponseSchema = z.object({
  items: z.array(CategoriaSchema),
})

const CategoriaResumoSchema = z.object({ id: z.uuid(), nome: z.string() }).nullable()

const ParcelaSchema = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  valor: z.number(),
  valorLiquidado: z.number(), // pago (despesa) ou recebido (recebimento)
  dataVencimento: z.iso.date(),
  status: StatusTituloSchema,
})

// ===================== Despesas =====================

export const DespesaParamsSchema = z.object({
  id: z
    .uuid()
    .meta({ example: EXEMPLOS.despesaId, description: 'Despesa de demonstração (pnpm db:seed:demo)' }),
})

export const CreateDespesaBodySchema = z
  .object({
    descricao: z.string().min(1).meta({ example: 'Compra de cadernos' }),
    fornecedor: z.string().min(1).meta({ example: 'Distribuidora Escolar ABC' }),
    fornecedorContatoId: z.uuid().optional(),
    valor: z.number().positive().meta({ example: 2500 }),
    dataVencimento: z.iso.date().meta({ example: '2026-10-30', description: 'Vencimento da 1ª parcela' }),
    dataLancamento: z.iso.date().optional().meta({ example: '2026-09-30' }),
    parcelas: z.number().int().min(1).max(MAX_PARCELAS).default(1).meta({ example: 5 }),
    categoriaId: z.uuid().optional().meta({
      example: EXEMPLOS.categoriaDespesaId,
      description: 'Mercadorias. Ids em GET /categorias?tipo=DESPESA',
    }),
    observacoes: z
      .string()
      .optional()
      .meta({ example: 'Compra de cadernos e canetas para a volta às aulas' }),
    // Fato já ocorrido: cria o título e registra o pagamento total na mesma transação.
    liquidarNoAto: z.boolean().default(false).meta({ example: false }),
  })
  .meta({
    example: {
      descricao: 'Compra de cadernos',
      fornecedor: 'Distribuidora Escolar ABC',
      fornecedorContatoId: EXEMPLOS.contatoId,
      valor: 2500,
      dataLancamento: '2026-09-30',
      dataVencimento: '2026-10-30',
      parcelas: 5,
      categoriaId: EXEMPLOS.categoriaDespesaId,
      observacoes: 'Compra de cadernos e canetas para a volta às aulas',
      liquidarNoAto: false,
    },
  })

export const UpdateDespesaBodySchema = z
  .object({
    descricao: z.string().min(1).optional().meta({ example: 'Compra de cadernos e canetas' }),
    fornecedor: z.string().min(1).optional().meta({ example: 'Distribuidora Escolar ABC' }),
    fornecedorContatoId: z.uuid().nullable().optional(),
    valor: z.number().positive().optional().meta({ description: 'Não pode mudar após pagamento registrado' }),
    dataVencimento: z.iso.date().optional().meta({ description: 'Não pode mudar após pagamento registrado' }),
    categoriaId: z.uuid().nullable().optional(),
    observacoes: z.string().nullable().optional().meta({ example: 'Pedido revisado com desconto de 5%' }),
  })
  .meta({
    example: {
      descricao: 'Compra de cadernos e canetas',
      fornecedor: 'Distribuidora Escolar ABC',
      observacoes: 'Pedido revisado com desconto de 5%',
    },
  })

export const RegistrarPagamentoDespesaBodySchema = z
  .object({
    valor: z.number().positive().meta({ example: 500 }),
    pagoEm: z.iso.datetime().optional().meta({ example: '2026-10-05T12:00:00.000Z' }),
  })
  .meta({ example: { valor: 500, pagoEm: '2026-10-05T12:00:00.000Z' } })

export const ListDespesasQuerySchema = z.object({
  status: StatusTituloSchema.optional().meta({ example: 'PENDENTE' }),
  fornecedor: z.string().min(1).optional().meta({ example: 'Distribuidora' }),
  categoriaId: z
    .uuid()
    .optional()
    .meta({ example: EXEMPLOS.categoriaDespesaId, description: 'Mercadorias. Ids em GET /categorias' }),
  dataInicio: z.iso.date().optional().meta({ example: '2026-10-01' }),
  dataFim: z.iso.date().optional().meta({ example: '2026-12-31' }),
  page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).meta({ example: 20 }),
})

export const DespesaSchema = z.object({
  id: z.uuid(),
  descricao: z.string(),
  fornecedor: z.string(),
  fornecedorContatoId: z.uuid().nullable(),
  valor: z.number(),
  valorPago: z.number(),
  dataLancamento: z.iso.date(),
  dataVencimento: z.iso.date(),
  numeroParcelas: z.number().int(),
  observacoes: z.string().nullable(),
  categoria: CategoriaResumoSchema,
  status: StatusTituloSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const DespesaComParcelasSchema = DespesaSchema.extend({
  parcelas: z.array(ParcelaSchema),
})

export const ListDespesasResponseSchema = z.object({
  items: z.array(DespesaSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export const HistoricoItemSchema = z.object({
  id: z.uuid(),
  acao: z.string(),
  statusAnterior: StatusTituloSchema.nullable(),
  statusNovo: StatusTituloSchema.nullable(),
  detalhes: z.string().nullable(),
  alteradoPorId: z.string(),
  createdAt: z.iso.datetime(),
})

export const DespesaComHistoricoSchema = DespesaComParcelasSchema.extend({
  historico: z.array(HistoricoItemSchema),
  pagamentos: z.array(
    z.object({
      id: z.uuid(),
      valor: z.number(),
      pagoEm: z.iso.datetime(),
      registradoPorId: z.string(),
    })
  ),
})

// ===================== Recebimentos =====================

export const RecebimentoParamsSchema = z.object({
  id: z.uuid().meta({
    example: EXEMPLOS.recebimentoId,
    description: 'Recebimento de demonstração (pnpm db:seed:demo)',
  }),
})

export const CreateRecebimentoBodySchema = z
  .object({
    descricao: z.string().min(1).meta({ example: 'Venda de material escolar' }),
    cliente: z.string().min(1).meta({ example: 'Maria da Silva' }),
    clienteContatoId: z.uuid().optional(),
    valor: z.number().positive().meta({ example: 350 }),
    dataVencimento: z.iso.date().meta({ example: '2026-10-15', description: 'Vencimento da 1ª parcela' }),
    dataLancamento: z.iso.date().optional().meta({ example: '2026-09-30' }),
    parcelas: z.number().int().min(1).max(MAX_PARCELAS).default(1).meta({ example: 1 }),
    categoriaId: z.uuid().optional().meta({
      example: EXEMPLOS.categoriaRecebimentoId,
      description: 'Vendas. Ids em GET /categorias?tipo=RECEBIMENTO',
    }),
    observacoes: z.string().optional().meta({ example: 'Venda de kit escolar' }),
    // Fato já ocorrido: cria o título e registra a baixa total na mesma transação.
    liquidarNoAto: z.boolean().default(false).meta({ example: false }),
  })
  .meta({
    example: {
      descricao: 'Venda de material escolar',
      cliente: 'Maria da Silva',
      clienteContatoId: EXEMPLOS.clienteContatoId,
      valor: 350,
      dataLancamento: '2026-09-30',
      dataVencimento: '2026-10-15',
      parcelas: 1,
      categoriaId: EXEMPLOS.categoriaRecebimentoId,
      observacoes: 'Venda de kit escolar',
      liquidarNoAto: false,
    },
  })

export const UpdateRecebimentoBodySchema = z
  .object({
    descricao: z.string().min(1).optional().meta({ example: 'Venda de material escolar (kit completo)' }),
    cliente: z.string().min(1).optional().meta({ example: 'Maria da Silva' }),
    clienteContatoId: z.uuid().nullable().optional(),
    valor: z.number().positive().optional().meta({ description: 'Não pode mudar após baixa registrada' }),
    dataVencimento: z.iso.date().optional().meta({ description: 'Não pode mudar após baixa registrada' }),
    categoriaId: z.uuid().nullable().optional(),
    observacoes: z.string().nullable().optional().meta({ example: 'Cliente retira na loja' }),
  })
  .meta({
    example: {
      descricao: 'Venda de material escolar (kit completo)',
      cliente: 'Maria da Silva',
      observacoes: 'Cliente retira na loja',
    },
  })

export const RegistrarBaixaRecebimentoBodySchema = z
  .object({
    valor: z.number().positive().meta({ example: 150 }),
    recebidoEm: z.iso.datetime().optional().meta({ example: '2026-10-10T12:00:00.000Z' }),
  })
  .meta({ example: { valor: 150, recebidoEm: '2026-10-10T12:00:00.000Z' } })

export const ListRecebimentosQuerySchema = z.object({
  status: StatusTituloSchema.optional().meta({ example: 'PENDENTE' }),
  cliente: z.string().min(1).optional().meta({ example: 'Maria' }),
  categoriaId: z
    .uuid()
    .optional()
    .meta({ example: EXEMPLOS.categoriaRecebimentoId, description: 'Vendas. Ids em GET /categorias' }),
  dataInicio: z.iso.date().optional().meta({ example: '2026-10-01' }),
  dataFim: z.iso.date().optional().meta({ example: '2026-12-31' }),
  page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).meta({ example: 20 }),
})

export const RecebimentoSchema = z.object({
  id: z.uuid(),
  descricao: z.string(),
  cliente: z.string(),
  clienteContatoId: z.uuid().nullable(),
  valor: z.number(),
  valorRecebido: z.number(),
  dataLancamento: z.iso.date(),
  dataVencimento: z.iso.date(),
  numeroParcelas: z.number().int(),
  observacoes: z.string().nullable(),
  categoria: CategoriaResumoSchema,
  status: StatusTituloSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const RecebimentoComParcelasSchema = RecebimentoSchema.extend({
  parcelas: z.array(ParcelaSchema),
})

export const ListRecebimentosResponseSchema = z.object({
  items: z.array(RecebimentoSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export const RecebimentoComHistoricoSchema = RecebimentoComParcelasSchema.extend({
  historico: z.array(HistoricoItemSchema),
  baixas: z.array(
    z.object({
      id: z.uuid(),
      valor: z.number(),
      recebidoEm: z.iso.datetime(),
      registradoPorId: z.string(),
    })
  ),
})

// ===================== Relatórios =====================

export const RelatorioQuerySchema = z.object({
  dataInicio: z.iso.date().optional().meta({ example: '2026-10-01' }),
  dataFim: z.iso.date().optional().meta({ example: '2026-12-31' }),
  // json (padrão, retorna o relatório estruturado) ou csv (RF-FM-013 - versão simplificada)
  formato: z.enum(['json', 'csv']).default('json').meta({ example: 'json' }),
})

export const RelatorioContasAPagarSchema = z.object({
  totalAPagar: z.number(),
  totalPago: z.number(),
  totalPendente: z.number(),
  itens: z.array(DespesaSchema),
})

export const RelatorioContasAReceberSchema = z.object({
  totalAReceber: z.number(),
  totalRecebido: z.number(),
  totalPendente: z.number(),
  itens: z.array(RecebimentoSchema),
})

// ===================== Tipos inferidos =====================
// `*Body` = o que o cliente envia (defaults opcionais); `*Input` = o que o service recebe (defaults aplicados).

export type CreateDespesaBody = z.input<typeof CreateDespesaBodySchema>
export type CreateRecebimentoBody = z.input<typeof CreateRecebimentoBodySchema>
export type CreateDespesaInput = z.output<typeof CreateDespesaBodySchema>
export type UpdateDespesaInput = z.output<typeof UpdateDespesaBodySchema>
export type RegistrarPagamentoInput = z.output<typeof RegistrarPagamentoDespesaBodySchema>
export type ListDespesasQuery = z.output<typeof ListDespesasQuerySchema>
export type CreateRecebimentoInput = z.output<typeof CreateRecebimentoBodySchema>
export type UpdateRecebimentoInput = z.output<typeof UpdateRecebimentoBodySchema>
export type RegistrarBaixaInput = z.output<typeof RegistrarBaixaRecebimentoBodySchema>
export type ListRecebimentosQuery = z.output<typeof ListRecebimentosQuerySchema>
export type CreateContatoInput = z.output<typeof CreateContatoBodySchema>
export type UpdateContatoInput = z.output<typeof UpdateContatoBodySchema>
export type ListContatosQuery = z.output<typeof ListContatosQuerySchema>
export type ContatoDto = z.infer<typeof ContatoSchema>
export type ContatoSugestoesQuery = z.output<typeof ContatoSugestoesQuerySchema>
export type ListVinculosPendentesQuery = z.output<typeof ListVinculosPendentesQuerySchema>
export type VincularContatosInput = z.output<typeof VincularContatosBodySchema>
export type RelatorioQuery = z.output<typeof RelatorioQuerySchema>
export type StatusTituloDto = z.infer<typeof StatusTituloSchema>
export type DespesaDto = z.infer<typeof DespesaSchema>
export type DespesaComParcelasDto = z.infer<typeof DespesaComParcelasSchema>
export type RecebimentoDto = z.infer<typeof RecebimentoSchema>
export type RecebimentoComParcelasDto = z.infer<typeof RecebimentoComParcelasSchema>
export type CategoriaDto = z.infer<typeof CategoriaSchema>
