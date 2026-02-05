import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold transition',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-secondary-foreground',
        primary: 'bg-primary text-primary-foreground',
        outline: 'border-border text-foreground',
        success: 'bg-accent text-accent-foreground',
        warn: 'bg-destructive/15 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
)

export { Badge, badgeVariants }
