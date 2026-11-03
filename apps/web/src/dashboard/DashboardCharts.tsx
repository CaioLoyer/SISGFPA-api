import { formatarMoeda } from '../shared/formatters'

export interface MonthlyPoint {
  mes: string
  entradas: number
  saidas: number
}

export interface CategoryPoint {
  nome: string
  valor: number
}

const categoryColors = ['#1b7a4b', '#439b70', '#c0392b', '#d88354', '#8aa99a']

function monthName(month: string, format: 'short' | 'long') {
  return new Intl.DateTimeFormat('pt-BR', { month: format, timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00.000Z`)
  )
}

export function MonthlyChart({
  points,
  entryLabel,
  exitLabel,
}: {
  points: MonthlyPoint[]
  entryLabel: string
  exitLabel: string
}) {
  const maximum = Math.max(0, ...points.flatMap((point) => [point.entradas, point.saidas]))

  return (
    <section className="overview-panel overview-monthly" aria-labelledby="overview-monthly-title">
      <div className="overview-chart-heading">
        <div>
          <h2 id="overview-monthly-title">
            {entryLabel} x {exitLabel}
          </h2>
          <p>Comparativo mensal</p>
        </div>
        <div className="overview-chart-legend" aria-hidden="true">
          <span>
            <i className="overview-color-entry" />
            {entryLabel}
          </span>
          <span>
            <i className="overview-color-exit" />
            {exitLabel}
          </span>
        </div>
      </div>

      {maximum > 0 ? (
        <>
          <div className="overview-bars" aria-hidden="true">
            {points.map((point) => (
              <div className="overview-bar-month" key={point.mes}>
                <div className="overview-bar-pair">
                  <div
                    className="overview-bar overview-color-entry"
                    style={{ height: `${(point.entradas / maximum) * 100}%` }}
                    title={`${monthName(point.mes, 'long')}: ${entryLabel} ${formatarMoeda(point.entradas)}`}
                  />
                  <div
                    className="overview-bar overview-color-exit"
                    style={{ height: `${(point.saidas / maximum) * 100}%` }}
                    title={`${monthName(point.mes, 'long')}: ${exitLabel} ${formatarMoeda(point.saidas)}`}
                  />
                </div>
                <span>{monthName(point.mes, 'short').replace('.', '')}</span>
              </div>
            ))}
          </div>
          <details className="overview-chart-details">
            <summary>Ver valores do gráfico</summary>
            <div className="overview-table-scroll">
              <table>
                <caption className="overview-screen-reader">Comparativo mensal em reais</caption>
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">{entryLabel}</th>
                    <th scope="col">{exitLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.mes}>
                      <th scope="row">
                        {monthName(point.mes, 'long')} {point.mes.slice(0, 4)}
                      </th>
                      <td>{formatarMoeda(point.entradas)}</td>
                      <td>{formatarMoeda(point.saidas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="overview-empty">Não há valores para comparar nesses meses.</p>
      )}
    </section>
  )
}

export function CategoryChart({ title, points }: { title: string; points: CategoryPoint[] }) {
  const total = points.reduce((sum, point) => sum + Math.round(point.valor * 100), 0)
  let accumulated = 0
  const segments = points.map((point, index) => {
    const start = accumulated
    const percentage = total > 0 ? (Math.round(point.valor * 100) / total) * 100 : 0
    accumulated += percentage
    return `${categoryColors[index % categoryColors.length]} ${start}% ${accumulated}%`
  })

  return (
    <section className="overview-panel overview-categories" aria-labelledby="overview-category-title">
      <div className="overview-chart-heading">
        <div>
          <h2 id="overview-category-title">{title}</h2>
          <p>Distribuição do mês</p>
        </div>
      </div>

      {total > 0 ? (
        <div className="overview-category-content">
          <div
            className="overview-donut"
            style={{ background: `conic-gradient(${segments.join(', ')})` }}
            aria-hidden="true"
          >
            <div>
              {new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(total / 100)}
            </div>
          </div>
          <ul className="overview-category-legend" aria-label={title}>
            {points.map((point, index) => (
              <li key={`${index}-${point.nome}`} title={formatarMoeda(point.valor)}>
                <i style={{ background: categoryColors[index % categoryColors.length] }} aria-hidden="true" />
                <span>
                  {point.nome}
                  <span className="overview-screen-reader">: {formatarMoeda(point.valor)}</span>
                </span>
                <strong>
                  {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(
                    (Math.round(point.valor * 100) / total) * 100
                  )}
                  %
                </strong>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="overview-empty">Nenhum valor registrado no mês para essa distribuição.</p>
      )}
    </section>
  )
}
