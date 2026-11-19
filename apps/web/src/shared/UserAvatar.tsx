import { useEffect, useState } from 'react'

import { getProfileImageUrl } from '../auth/auth-api'

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('')
}

export function UserAvatar({
  name,
  image,
  previewSrc,
  className,
}: {
  name: string
  image?: string | null
  previewSrc?: string | null
  className: string
}) {
  const imageUrl = getProfileImageUrl(image)
  const source = previewSrc ?? imageUrl
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => setImageFailed(false), [source])

  return (
    <span aria-hidden="true" className={className}>
      {source && !imageFailed ? (
        <img
          alt=""
          {...(previewSrc ? {} : { crossOrigin: 'use-credentials' as const })}
          onError={() => setImageFailed(true)}
          src={source}
        />
      ) : (
        initials(name) || 'U'
      )}
    </span>
  )
}
