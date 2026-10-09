// Exportação simplificada para fins acadêmicos: gera CSV (abre nativamente no Excel/LibreOffice)
// sem bibliotecas externas. Cada linha de `rows` segue a ordem de `headers`.
export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (value: string | number) => {
    const text = String(value)
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  return [headers.map(escape).join(';'), ...rows.map((row) => row.map(escape).join(';'))].join('\n')
}
