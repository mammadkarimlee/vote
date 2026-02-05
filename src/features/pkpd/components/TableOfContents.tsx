import { useEffect, useMemo, useState } from 'react'
import { cn } from '../../../lib/utils'

export type TocItem = {
  id: string
  label: string
  level?: number
}

type TableOfContentsProps = {
  items: TocItem[]
  className?: string
  onNavigate?: () => void
}

export const TableOfContents = ({ items, className, onNavigate }: TableOfContentsProps) => {
  const ids = useMemo(() => items.map((item) => item.id), [items])
  const [activeId, setActiveId] = useState(ids[0] ?? '')

  useEffect(() => {
    if (ids.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '0px 0px -60% 0px', threshold: 0.1 },
    )

    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [ids])

  return (
    <nav className={cn('flex flex-col gap-1 text-sm', className)} aria-label="Table of contents">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          onClick={onNavigate}
          className={cn(
            'rounded-lg px-3 py-2 transition',
            activeId === item.id
              ? 'bg-secondary text-foreground font-semibold'
              : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
          )}
          style={{ paddingLeft: item.level ? 12 + item.level * 12 : undefined }}
          aria-current={activeId === item.id ? 'location' : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  )
}
