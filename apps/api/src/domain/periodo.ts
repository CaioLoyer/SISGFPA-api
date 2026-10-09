/** Filtro Prisma de período por data de vencimento (ambos os limites opcionais). */
export const periodoVencimento = (dataInicio?: string, dataFim?: string) =>
  dataInicio || dataFim
    ? {
        gte: dataInicio ? new Date(dataInicio) : undefined,
        lte: dataFim ? new Date(dataFim) : undefined,
      }
    : undefined

export const paginacao = (page: number, pageSize: number) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
})
