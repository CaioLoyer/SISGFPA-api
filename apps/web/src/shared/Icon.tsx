import type { ReactNode } from 'react'

const paths = {
  home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3Z" />
    </>
  ),
  paperclip: (
    <path d="m21.4 11.1-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
    </>
  ),
  settings: (
    <>
      <path d="m9.5 3-.6 2.2-2 .9-2.1-.6-2.5 4.3 1.5 1.6v2.3l-1.5 1.6 2.5 4.3 2.1-.6 2 .9.6 2.1h5l.6-2.1 2-.9 2.1.6 2.5-4.3-1.5-1.6v-2.3l1.5-1.6-2.5-4.3-2.1.6-2-.9-.6-2.2Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  bot: (
    <>
      <rect x="3" y="8" width="18" height="13" rx="3" />
      <path d="M12 8V3H9M1 13v4m22-4v4M8 12v3m8-3v3M9 18h6" />
    </>
  ),
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrow: <path d="M7 17 17 7M7 7h10v10" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  )
}
