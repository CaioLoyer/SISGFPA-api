import z from 'zod'

import { EXEMPLOS, STATUS_TITULO, TIPOS_CATEGORIA } from '@sisgfpa/types'

// ===================== Comuns =====================

export const ErrorSchema = z
  .object({
    error: z.string().meta({ example: 'Você não tem permissão para realizar esta ação' }),
    code: z.string().meta({ example: 'FORBIDDEN' }),
  })
  .meta({ example: { error: 'Você não tem permissão para realizar esta ação', code: 'FORBIDDEN' } })

// ===================== Autenticação (Better Auth, exposta pela API) =====================

export const SignUpBodySchema = z
  .object({
    name: z.string().min(1).meta({ example: 'Maria Souza' }),
    email: z.email().meta({ example: 'maria.souza@papelariaexemplo.com' }),
    password: z.string().min(8).meta({ example: 'senha12345' }),
  })
  .meta({
    example: { name: 'Maria Souza', email: 'maria.souza@papelariaexemplo.com', password: 'senha12345' },
  })

export const SignInBodySchema = z
  .object({
    email: z.email().meta({ example: EXEMPLOS.admin.email }),
    password: z.string().min(1).meta({ example: EXEMPLOS.admin.password }),
  })
  .meta({ example: { email: EXEMPLOS.admin.email, password: EXEMPLOS.admin.password } })

export const StatusTituloSchema = z.enum(STATUS_TITULO)
export const TipoCategoriaSchema = z.enum(TIPOS_CATEGORIA)

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
export type RelatorioQuery = z.output<typeof RelatorioQuerySchema>
export type StatusTituloDto = z.infer<typeof StatusTituloSchema>
export type DespesaDto = z.infer<typeof DespesaSchema>
export type DespesaComParcelasDto = z.infer<typeof DespesaComParcelasSchema>
export type RecebimentoDto = z.infer<typeof RecebimentoSchema>
export type RecebimentoComParcelasDto = z.infer<typeof RecebimentoComParcelasSchema>
export type CategoriaDto = z.infer<typeof CategoriaSchema>
