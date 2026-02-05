import { Link } from 'react-router-dom'
import { buttonVariants } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PkpdCalculatorForm } from './components/PkpdCalculatorForm'

export const PkpdCalculatorPage = () => (
  <div className="page">
    <div className="page-hero">
      <div className="page-hero__content">
        <div className="section-kicker">PKPD</div>
        <h1 className="section-title text-2xl">PKPD Kalkulyatoru</h1>
        <p>
          BİQ, sorğu, özünü dəyərləndirmə və akkreditasiya nəticələrini daxil edin. Sistem yekun balı real vaxtda
          hesablayacaq.
        </p>
        <div className="actions">
          <Link className={buttonVariants({ size: 'sm' })} to="/pkpd/doc">
            Sənədi oxu
          </Link>
        </div>
      </div>
      <div className="page-hero__aside">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Yadda saxla</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Bonus ballar maksimum 10 baldır. Hesablamanı paylaşmaq üçün “Linki paylaş” istifadə edin.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Aralıqlar</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            90–100 tam cavab verən, 0–29 inkişafı çox aşağı olan.
          </CardContent>
        </Card>
      </div>
    </div>

    <PkpdCalculatorForm />
  </div>
)