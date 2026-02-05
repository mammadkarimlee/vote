import { useState, type ReactNode } from 'react'
import { Button } from '../../../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../../components/ui/dialog'
import { ThemeToggle } from '../../../components/theme/ThemeToggle'
import { cn } from '../../../lib/utils'
import { TableOfContents, type TocItem } from './TableOfContents'

type DocLayoutProps = {
  title: string
  subtitle?: string
  toc: TocItem[]
  children: ReactNode
  actions?: ReactNode
  className?: string
}

export const DocLayout = ({ title, subtitle, toc, children, actions, className }: DocLayoutProps) => {
  const [tocOpen, setTocOpen] = useState(false)

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="rounded-3xl border border-border bg-card/80 p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl border border-border bg-gradient-to-br from-white to-secondary shadow-soft" />
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">PKPD</div>
              <div className="text-lg font-semibold text-foreground">{title}</div>
              {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[220px]">
            <input className="input" placeholder="Sənəd daxilində axtarış..." />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" type="button">
              Çap et
            </Button>
            <Button variant="outline" size="sm" type="button">
              PDF yüklə
            </Button>
            <Dialog open={tocOpen} onOpenChange={setTocOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" type="button" className="md:hidden">
                  Mündəricat
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[70vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Mündəricat</DialogTitle>
                </DialogHeader>
                <TableOfContents items={toc} onNavigate={() => setTocOpen(false)} />
              </DialogContent>
            </Dialog>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_240px]">
        <aside className="hidden md:block">
          <div className="sticky top-28 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Mündəricat</div>
            <TableOfContents items={toc} />
          </div>
        </aside>
        <main className="min-w-0 space-y-6">
          {actions && <div className="xl:hidden">{actions}</div>}
          {children}
        </main>
        <aside className="hidden xl:block">
          <div className="sticky top-28 space-y-4">{actions}</div>
        </aside>
      </div>
    </div>
  )
}