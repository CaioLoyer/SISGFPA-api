/** O adaptador Prisma serializa DateTime em UTC e exige o mesmo fuso na sessão PostgreSQL. */
export function connectionStringWithUtc(connectionString: string) {
  const url = new URL(connectionString)
  const options = url.searchParams.get('options')
  url.searchParams.set('options', `${options ? `${options} ` : ''}-c timezone=UTC`)
  return url.toString()
}
