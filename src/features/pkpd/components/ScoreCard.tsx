import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'

type ScoreCardProps = {
  title: string
  value: string
  subtitle?: string
}

export const ScoreCard = ({ title, value, subtitle }: ScoreCardProps) => (
  <Card className="relative overflow-hidden">
    <CardHeader>
      <CardTitle className="text-base text-muted-foreground">{title}</CardTitle>
      {subtitle && <CardDescription>{subtitle}</CardDescription>}
    </CardHeader>
    <CardContent>
      <div className="text-4xl font-semibold text-foreground">{value}</div>
    </CardContent>
  </Card>
)
