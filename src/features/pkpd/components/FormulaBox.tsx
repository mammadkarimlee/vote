import { useState } from 'react'
import { Button } from '../../../components/ui/button'
import { cn } from '../../../lib/utils'

type FormulaBoxProps = {
  label?: string
  formula: string
  className?: string
}

export const FormulaBox = ({ label, formula, className }: FormulaBoxProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formula)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={cn('rounded-2xl border border-border bg-card px-4 py-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {label && <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>}
          <div className="mt-1 font-mono text-sm text-foreground">{formula}</div>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy} aria-live="polite">
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </Button>
      </div>
    </div>
  )
}