import { Badge } from '../../../components/ui/badge'

const decideLabel = (score: number) => {
  if (score >= 90) return { label: 'Tələblərə tam cavab verən', variant: 'success' as const }
  if (score >= 80) return { label: 'Tələblərə cavab verən', variant: 'primary' as const }
  if (score >= 60) return { label: 'Tələblərə əsasən cavab verən', variant: 'default' as const }
  if (score >= 50) return { label: 'İnkişaf etdirilməsi zəruri olan', variant: 'outline' as const }
  if (score >= 30) return { label: 'İnkişafı aşağı olan', variant: 'warn' as const }
  return { label: 'İnkişafı çox aşağı olan', variant: 'warn' as const }
}

type DecisionBadgeProps = {
  score: number
}

export const DecisionBadge = ({ score }: DecisionBadgeProps) => {
  const { label, variant } = decideLabel(score)
  return <Badge variant={variant}>{label}</Badge>
}