import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BrandLogo } from './BrandLogo'

describe('logo Mil Folhas', () => {
  it('usa o arquivo local da marca dentro do contêiner circular', () => {
    const markup = renderToStaticMarkup(<BrandLogo className="brand-logo-auth" />)

    expect(markup).toContain('class="brand-logo brand-logo-auth"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('<img alt="" src="/mil-folhas.jpg"/>')
  })

  it('expõe texto alternativo quando a logo identifica a marca sozinha', () => {
    const markup = renderToStaticMarkup(
      <BrandLogo alt="Logo da Papelaria Mil Folhas" className="brand-logo-status" />
    )

    expect(markup).not.toContain('aria-hidden="true"')
    expect(markup).toContain('<img alt="Logo da Papelaria Mil Folhas" src="/mil-folhas.jpg"/>')
  })
})
