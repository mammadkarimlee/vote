import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { buttonVariants } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { Callout } from './components/Callout'
import { DocLayout } from './components/DocLayout'
import { FormulaBox } from './components/FormulaBox'
import { bonusOptions, decisionRanges, stimulusStandards } from './pkpdData'

const toc = [
  { id: 'umumi-muddealar', label: 'Ümumi müddəalar' },
  { id: 'meqsed', label: 'Məqsəd və əsas məsələlər' },
  { id: 'prinsipler', label: 'Prinsiplər' },
  { id: 'proses', label: 'Proses və komissiya' },
  { id: 'meyarlar', label: 'Meyarlar (100 bal)' },
  { id: 'balabirge', label: 'Balabirgə dəyərləndirilməsi (30)' },
  { id: 'ozunu', label: 'Özünü dəyərləndirmə (10)' },
  { id: 'rehberlik', label: 'Rəhbərlik dəyərləndirməsi (10)' },
  { id: 'akkreditasiya', label: 'Akkreditasiya: İmtahan + Portfolio' },
  { id: 'hesablanma', label: 'PKPD hesablanma nümunəsi' },
  { id: 'xususi-fennler', label: 'Xüsusi fənlər (dram/gimnastika/şahmat)' },
  { id: 'qerar-araliqlari', label: 'Qərar aralıqları' },
  { id: 'stimullasma', label: 'Stimullaşdırma standartları (14.1–14.6)' },
  { id: 'bonus-ballar', label: 'Bonus ballar' },
  { id: 'kitab-siyahisi', label: 'Kitab siyahısı' },
  { id: 'qeyd', label: 'Qeyd / hüquqlar / imza' },
]

const bentoCards = [
  { title: 'Sorğu + BİQ', value: '30 bal', description: 'Şagird və sinif nəticələri' },
  { title: 'Akkreditasiya', value: '50 bal', description: 'İmtahan + Portfolio' },
  { title: 'Dəyərləndirmə', value: '20 bal', description: 'Özünü + Rəhbərlik' },
]

export const PkpdDocumentPage = () => {
  const actions = (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tez keçidlər</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link className={buttonVariants({ size: 'sm' })} to="/pkpd/calculator">
            Kalkulyatora keç
          </Link>
          <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href="#bonus-ballar">
            Bonus ballar
          </a>
          <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href="#qerar-araliqlari">
            Qərar aralıqları
          </a>
          <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href="#hesablanma">
            Hesablanma nümunəsi
          </a>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qərar aralıqları</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {decisionRanges.map((range) => (
            <div key={range.range} className="flex items-center justify-between">
              <span className="text-muted-foreground">{range.range}</span>
              <span className="font-semibold text-foreground">{range.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="page">
      <DocLayout
        title="PKPD sənədi"
        subtitle="Pedaqoji Kadrların Performans Dəyərləndirilməsi"
        toc={toc}
        actions={actions}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {bentoCards.map((card) => (
            <Card key={card.title}>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">{card.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <section id="umumi-muddealar" className="space-y-3">
          <Badge variant="outline">Ümumi müddəalar</Badge>
          <h2 className="text-2xl font-semibold">Ümumi müddəalar</h2>
          <p className="text-sm text-muted-foreground">
            PKPD sənədi pedaqoji heyətin fəaliyyətini şəffaf, ölçülə bilən və müqayisə edilən göstəricilər əsasında
            qiymətləndirmək üçün hazırlanmışdır.
          </p>
          <Callout variant="info" title="Qeyd">
            Bu sənəd təlimat xarakterlidir və filial rəhbərliyi tərəfindən illik dövrün əvvəlində elan olunur.
          </Callout>
        </section>

        <section id="meqsed" className="space-y-3">
          <Badge variant="outline">Məqsəd</Badge>
          <h2 className="text-2xl font-semibold">Məqsəd və əsas məsələlər</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>Şagird nəticələrinin davamlı yüksəlişini təmin etmək.</li>
            <li>Müəllimlərin peşəkar inkişafını sistemləşdirmək.</li>
            <li>Şəffaf motivasiya və stimullaşdırma mexanizmi yaratmaq.</li>
            <li>İdarəetmə qərarları üçün obyektiv məlumat bazası formalaşdırmaq.</li>
          </ul>
        </section>

        <section id="prinsipler" className="space-y-3">
          <Badge variant="outline">Prinsiplər</Badge>
          <h2 className="text-2xl font-semibold">Prinsiplər</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {['Şəffaflıq', 'Davamlı inkişaf', 'Ədalətlilik', 'Məlumata əsaslanma'].map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Prinsip</div>
                <div className="mt-1 font-semibold text-foreground">{item}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="proses" className="space-y-3">
          <Badge variant="outline">Proses</Badge>
          <h2 className="text-2xl font-semibold">Proses və komissiya</h2>
          <p className="text-sm text-muted-foreground">
            PKPD prosesi filial rəhbərliyi, fənn koordinatorları və metodistlərdən ibarət komissiya tərəfindən idarə olunur.
            Qiymətləndirmə hər sorğu dövründə aparılır.
          </p>
          <Callout variant="example" title="Komissiya">
            Komissiya protokolları saxlanılır və qərar əsaslandırmaları PKPD nəticələrinə əlavə edilir.
          </Callout>
        </section>

        <section id="meyarlar" className="space-y-3">
          <Badge variant="outline">Meyarlar</Badge>
          <h2 className="text-2xl font-semibold">Meyarlar (100 bal)</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Blok</TableHead>
                <TableHead>Çəkisi</TableHead>
                <TableHead>Məzmun</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Şagird sorğusu + BİQ</TableCell>
                <TableCell>30</TableCell>
                <TableCell>Sinif və sorğu nəticələri</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Özünü dəyərləndirmə</TableCell>
                <TableCell>10</TableCell>
                <TableCell>Self-assessment</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Rəhbərlik dəyərləndirməsi</TableCell>
                <TableCell>10</TableCell>
                <TableCell>Menecer qiymətləndirməsi</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>İmtahan</TableCell>
                <TableCell>30</TableCell>
                <TableCell>Akkreditasiya imtahanı</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Portfolio</TableCell>
                <TableCell>20</TableCell>
                <TableCell>Peşəkar inkişaf göstəriciləri</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>

        <section id="balabirge" className="space-y-3">
          <Badge variant="outline">Balabirgə</Badge>
          <h2 className="text-2xl font-semibold">Balabirgə dəyərləndirilməsi (30)</h2>
          <Tabs defaultValue="biq">
            <TabsList>
              <TabsTrigger value="biq">BİQ (15)</TabsTrigger>
              <TabsTrigger value="survey">Sorğu (15)</TabsTrigger>
            </TabsList>
            <TabsContent value="biq" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                BİQ nəticələri sinif və fənn üzrə orta göstəricilərdən hesablanır.
              </p>
              <FormulaBox label="Formula" formula="BİQ balı = (BİQ ortalama × 15) / 100" />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sinif</TableHead>
                    <TableHead>Fənn</TableHead>
                    <TableHead>Ortalama</TableHead>
                    <TableHead>Bal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>IX</TableCell>
                    <TableCell>Riyaziyyat</TableCell>
                    <TableCell>84</TableCell>
                    <TableCell>12.6</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="survey" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Şagird sorğusu 1–10 şkalası ilə aparılır və 100-lük sistemə çevrilir.
              </p>
              <FormulaBox label="Formula" formula="Sorğu balı = (Sorğu ortalama × 15) / 100" />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Qrup</TableHead>
                    <TableHead>Ortalama</TableHead>
                    <TableHead>Bal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>IX B</TableCell>
                    <TableCell>92</TableCell>
                    <TableCell>13.8</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </section>

        <section id="ozunu" className="space-y-3">
          <Badge variant="outline">Özünü dəyərləndirmə</Badge>
          <h2 className="text-2xl font-semibold">Özünü dəyərləndirmə (10)</h2>
          <p className="text-sm text-muted-foreground">
            Müəllim öz fəaliyyətini 10 ballıq şkala üzrə qiymətləndirir. Dəyərləndirmə mətn əsaslandırması ilə birlikdə
            təqdim edilir.
          </p>
          <FormulaBox label="Qaydalar" formula="Özünü dəyərləndirmə balı = daxil edilən bal (0–10)" />
        </section>

        <section id="rehberlik" className="space-y-3">
          <Badge variant="outline">Rəhbərlik</Badge>
          <h2 className="text-2xl font-semibold">Rəhbərlik dəyərləndirməsi (10)</h2>
          <p className="text-sm text-muted-foreground">
            Menecer qiymətləndirməsi dərs planlaşdırılması, nizam-intizam və kommunikasiya üzrə aparılır.
          </p>
          <FormulaBox label="Qaydalar" formula="Rəhbərlik balı = daxil edilən bal (0–10)" />
        </section>

        <section id="akkreditasiya" className="space-y-3">
          <Badge variant="outline">Akkreditasiya</Badge>
          <h2 className="text-2xl font-semibold">Akkreditasiya: İmtahan (30) + Portfolio (20)</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">İmtahan</div>
              <p className="mt-2 text-muted-foreground">
                Akkreditasiya imtahanı 30 ballıq şkala üzrə qiymətləndirilir.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Portfolio</div>
              <p className="mt-2 text-muted-foreground">
                Təhsil pilləsi, davamiyyət, təlim və layihələr üzrə göstəricilər toplanır.
              </p>
            </div>
          </div>
        </section>

        <section id="hesablanma" className="space-y-3">
          <Badge variant="outline">Hesablanma nümunəsi</Badge>
          <h2 className="text-2xl font-semibold">PKPD hesablanma nümunəsi</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BİQ</TableHead>
                <TableHead>Sorğu</TableHead>
                <TableHead>Özünü</TableHead>
                <TableHead>Rəhbərlik</TableHead>
                <TableHead>İmtahan</TableHead>
                <TableHead>Portfolio</TableHead>
                <TableHead>Bonus</TableHead>
                <TableHead>Yekun</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>12.6</TableCell>
                <TableCell>13.8</TableCell>
                <TableCell>8</TableCell>
                <TableCell>9</TableCell>
                <TableCell>26</TableCell>
                <TableCell>17</TableCell>
                <TableCell>4</TableCell>
                <TableCell>90.4</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>

        <section id="xususi-fennler" className="space-y-3">
          <Badge variant="outline">Xüsusi fənlər</Badge>
          <h2 className="text-2xl font-semibold">Dram / Gimnastika / Şahmat</h2>
          <Accordion type="single" collapsible>
            <AccordionItem value="drama">
              <AccordionTrigger>Dram və gimnastika</AccordionTrigger>
              <AccordionContent>
                Portfolio çəkisi artırılır, imtahan tələbi yoxdur. Fərdi performans göstəriciləri əlavə edilir.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="chess">
              <AccordionTrigger>Şahmat</AccordionTrigger>
              <AccordionContent>
                Olimpiada nəticələri və layihə fəaliyyəti xüsusi bal cədvəli ilə qiymətləndirilir.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <section id="qerar-araliqlari" className="space-y-3">
          <Badge variant="outline">Qərar aralıqları</Badge>
          <h2 className="text-2xl font-semibold">Qərar aralıqları (0–29 / 30–100)</h2>
          <div className="grid gap-2">
            {decisionRanges.map((range) => (
              <div
                key={range.range}
                className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="text-muted-foreground">{range.range}</span>
                <span className="font-semibold text-foreground">{range.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="stimullasma" className="space-y-3">
          <Badge variant="outline">Stimullaşdırma</Badge>
          <h2 className="text-2xl font-semibold">Stimullaşdırma standartları (14.1–14.6)</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {stimulusStandards.map((standard) => (
              <div key={standard.id} className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
                <Badge variant="outline">{standard.id}</Badge>
                <div className="mt-2 font-semibold text-foreground">{standard.title}</div>
                <p className="mt-1 text-muted-foreground">{standard.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="bonus-ballar" className="space-y-3">
          <Badge variant="outline">Bonus ballar</Badge>
          <h2 className="text-2xl font-semibold">Bonus ballar (checklist)</h2>
          <div className="grid gap-2">
            {bonusOptions.map((option) => (
              <label
                key={option.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm"
              >
                <span>
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{option.id}</span>
                  <span className="ml-2 text-foreground">{option.label}</span>
                </span>
                <span className="text-xs text-muted-foreground">+{option.points} bal</span>
              </label>
            ))}
          </div>
          <Callout variant="warn" title="Qaydalar">
            Bonus ballar maksimum 10 bal olmaqla yekun nəticəyə əlavə olunur.
          </Callout>
        </section>

        <section id="kitab-siyahisi" className="space-y-3">
          <Badge variant="outline">Kitab siyahısı</Badge>
          <h2 className="text-2xl font-semibold">Kitab siyahısı</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>Müasir təlim texnologiyaları</li>
            <li>Qiymətləndirmə və ölçmə metodları</li>
            <li>Pedaqoji psixologiya</li>
            <li>Diferensiallaşdırılmış tədris</li>
          </ul>
        </section>

        <section id="qeyd" className="space-y-3">
          <Badge variant="outline">Qeyd</Badge>
          <h2 className="text-2xl font-semibold">Qeyd / hüquqlar / imza</h2>
          <Callout variant="example">
            Sənədin bütün maddələri filial rəhbərliyinin qərarı ilə ildə bir dəfə yenilənə bilər. Nəticələr rəsmi
            protokolla təsdiqlənir.
          </Callout>
        </section>
      </DocLayout>
    </div>
  )
}