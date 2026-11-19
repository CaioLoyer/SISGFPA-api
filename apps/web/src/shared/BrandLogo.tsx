export function BrandLogo({ className, alt = '' }: { className: string; alt?: string }) {
  return (
    <span aria-hidden={alt ? undefined : true} className={`brand-logo ${className}`}>
      <img alt={alt} src="/mil-folhas.jpg" />
    </span>
  )
}
