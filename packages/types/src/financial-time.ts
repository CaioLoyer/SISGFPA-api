/** Fuso da papelaria. Datas civis de vencimento continuam sendo AAAA-MM-DD. */
export const FINANCIAL_TIME_ZONE = 'America/Campo_Grande'

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FINANCIAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function financialDateTime(date = new Date()): string {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

/** Converte datetime-local do estabelecimento, independentemente do fuso do computador. */
export function financialInstant(value: string): Date {
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) return new Date(value)
  const normalized = value.length === 16 ? `${value}:00` : value
  const wallTime = Date.parse(`${normalized}Z`)
  let instant = wallTime
  for (let attempt = 0; attempt < 4; attempt++) {
    const delta = wallTime - Date.parse(`${financialDateTime(new Date(instant))}Z`)
    if (delta === 0) return new Date(instant)
    instant += delta
  }
  throw new RangeError('Horário inexistente no fuso da papelaria.')
}

/** Primeiro instante de um dia, inclusive em transições históricas de horário de verão. */
export function financialDayStart(day: string): Date {
  try {
    return financialInstant(`${day}T00:00:00`)
  } catch {
    let lower = Date.parse(`${day}T00:00:00Z`) - 36 * 3_600_000
    let upper = lower + 72 * 3_600_000
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2)
      if (financialDateTime(new Date(middle)).slice(0, 10) < day) lower = middle + 1
      else upper = middle
    }
    return new Date(lower)
  }
}

export function nextCivilDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
