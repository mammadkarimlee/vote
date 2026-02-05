import { cn } from '../../../lib/utils'

type BreakdownItem = {
  label: string
  value: number
  max: number
}

type ScoreBreakdownProps = {
  items: BreakdownItem[]
  className?: string
}

export const ScoreBreakdown = ({ items, className }: ScoreBreakdownProps) => (
  <div className={cn('flex flex-col gap-3', className)}>
    {items.map((item) => {
      const pct = item.max > 0 ? Math.min(100, Math.round((item.value / item.max) * 100)) : 0
      return (
        <div key={item.label} className="rounded-2xl border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">{item.label}</span>
            <span className="text-muted-foreground">
              {item.value.toFixed(1)} / {item.max}
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-secondary">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    })}
  </div>
)
