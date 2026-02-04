import { useEffect, useMemo, useState } from 'react'
import { ORG_ID, supabase } from '../../lib/supabase'
import {
  mapAnswerRow,
  mapGroupRow,
  mapQuestionRow,
  mapSubmissionRow,
  mapSubjectRow,
  mapSurveyCycleRow,
  mapTeacherRow,
} from '../../lib/supabaseMappers'
import type {
  AnswerDoc,
  GroupDoc,
  QuestionDoc,
  SubmissionDoc,
  SubjectDoc,
  SurveyCycleDoc,
  TeacherDoc,
} from '../../lib/types'
import { chunkArray, formatShortDate, toNumber } from '../../lib/utils'
import { BranchSelector } from './BranchSelector'
import { useBranchScope } from './useBranchScope'
import { downloadCsv } from '../../lib/csv'
import { InfoTip } from '../../components/InfoTip'

type DocEntry<T> = { id: string; data: T }

const formatAvg = (avg: number | null | undefined, count: number) => {
  if (avg === null || avg === undefined || count === 0) return '—'
  return avg.toFixed(2)
}

export const BranchResultsPage = () => {
  const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope()
  const [cycles, setCycles] = useState<Array<DocEntry<SurveyCycleDoc>>>([])
  const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([])
  const [groups, setGroups] = useState<Array<DocEntry<GroupDoc>>>([])
  const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([])
  const [questions, setQuestions] = useState<Record<string, QuestionDoc>>({})
  const [submissions, setSubmissions] = useState<Array<DocEntry<SubmissionDoc>>>([])
  const [answers, setAnswers] = useState<Array<DocEntry<AnswerDoc>>>([])
  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')

  useEffect(() => {
    const loadLookups = async () => {
      if (!isSuperAdmin) return
      const [cycleRes, teacherRes, groupRes, subjectRes, questionRes] = await Promise.all([
        supabase.from('survey_cycles').select('*').eq('org_id', ORG_ID),
        supabase
          .from('teachers')
          .select('*')
          .eq('org_id', ORG_ID)
          .is('deleted_at', null)
          .eq('branch_id', branchId || ''),
        supabase
          .from('groups')
          .select('*')
          .eq('org_id', ORG_ID)
          .is('deleted_at', null)
          .eq('branch_id', branchId || ''),
        supabase.from('subjects').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
        supabase.from('questions').select('*').eq('org_id', ORG_ID),
      ])

      const allCycles = (cycleRes.data ?? []).map((row) => ({ id: row.id, data: mapSurveyCycleRow(row) }))
      const cycleDocs = allCycles.filter((cycle) => {
        const branchIds = cycle.data.branchIds ?? []
        if (branchIds.length === 0) return true
        return branchId ? branchIds.includes(branchId) : false
      })
      setCycles(cycleDocs)
      setTeachers((teacherRes.data ?? []).map((row) => ({ id: row.id, data: mapTeacherRow(row) })))
      setGroups((groupRes.data ?? []).map((row) => ({ id: row.id, data: mapGroupRow(row) })))
      setSubjects((subjectRes.data ?? []).map((row) => ({ id: row.id, data: mapSubjectRow(row) })))

      const questionMap: Record<string, QuestionDoc> = {}
      ;(questionRes.data ?? []).forEach((row) => {
        questionMap[row.id] = mapQuestionRow(row)
      })
      setQuestions(questionMap)

      if (cycleDocs.length > 0) {
        const latest = [...cycleDocs].sort((a, b) => b.data.year - a.data.year)[0]
        if (!selectedCycleId || !cycleDocs.some((cycle) => cycle.id === selectedCycleId)) {
          setSelectedCycleId(latest.id)
        }
      } else if (selectedCycleId) {
        setSelectedCycleId('')
      }
    }

    if (branchId) {
      void loadLookups()
    } else {
      setCycles([])
      setTeachers([])
      setGroups([])
    }
  }, [branchId, selectedCycleId, isSuperAdmin])

  useEffect(() => {
    const loadCycleData = async () => {
      if (!isSuperAdmin) return
      if (!selectedCycleId || !branchId) return

      const submissionRes = await supabase
        .from('submissions')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('cycle_id', selectedCycleId)
        .eq('branch_id', branchId)

      const submissionDocs = (submissionRes.data ?? []).map((row) => ({
        id: row.task_id ?? row.id,
        data: mapSubmissionRow(row),
      }))
      setSubmissions(submissionDocs)

      const answerDocs: Array<DocEntry<AnswerDoc>> = []
      const ids = submissionDocs.map((item) => item.id)
      const chunks = chunkArray(ids, 200)
      for (const chunk of chunks) {
        if (chunk.length === 0) continue
        const answerRes = await supabase
          .from('answers')
          .select('*')
          .eq('org_id', ORG_ID)
          .in('submission_id', chunk)
        ;(answerRes.data ?? []).forEach((row) => {
          const key = `${row.submission_id}_${row.question_id}`
          answerDocs.push({ id: key, data: mapAnswerRow(row) })
        })
      }
      setAnswers(answerDocs)
    }

    void loadCycleData()
  }, [selectedCycleId, branchId, isSuperAdmin])

  if (!isSuperAdmin) {
    return (
      <div className="panel">
        <div className="card">
          <h3>Nəticələr yalnız SuperAdmin üçündür</h3>
          <p>Filial adminləri nəticələri görə bilməz. Yalnız “DONE” statusu göstərilir.</p>
        </div>
      </div>
    )
  }

  const teacherMap = useMemo(() => Object.fromEntries(teachers.map((t) => [t.id, t.data])), [teachers])
  const groupMap = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.data])), [groups])
  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s.data])), [subjects])

  const filteredAnswers = useMemo(() => answers, [answers])

  const teacherStats = useMemo(() => {
    const stats: Record<string, { sum: number; count: number; submissions: number }> = {}
    const submissionCounts: Record<string, Set<string>> = {}

    filteredAnswers.forEach((answer) => {
      const submission = submissions.find((item) => item.id === answer.data.submissionId)
      if (!submission) return
      const question = questions[answer.data.questionId]
      if (!question || question.type !== 'scale') return

      const numeric = toNumber(answer.data.value)
      if (numeric === null) return

      const stat = stats[submission.data.targetId] ?? { sum: 0, count: 0, submissions: 0 }
      stat.sum += numeric
      stat.count += 1
      stats[submission.data.targetId] = stat

      submissionCounts[submission.data.targetId] = submissionCounts[submission.data.targetId] || new Set()
      submissionCounts[submission.data.targetId].add(answer.data.submissionId)
    })

    Object.entries(submissionCounts).forEach(([teacherId, set]) => {
      if (stats[teacherId]) stats[teacherId].submissions = set.size
    })

    return stats
  }, [filteredAnswers, submissions, questions])

  const teacherRows = useMemo(() => {
    return Object.entries(teacherStats)
      .map(([teacherId, stat]) => ({
        teacherId,
        avg: stat.count === 0 ? null : stat.sum / stat.count,
        submissions: stat.submissions,
      }))
      .sort((a, b) => {
        if (a.avg === null && b.avg === null) return 0
        if (a.avg === null) return 1
        if (b.avg === null) return -1
        return b.avg - a.avg
      })
  }, [teacherStats])

  useEffect(() => {
    if (!selectedTeacherId && teacherRows.length > 0) {
      setSelectedTeacherId(teacherRows[0].teacherId)
    }
  }, [teacherRows, selectedTeacherId])

  const selectedTeacherSubmissions = useMemo(() => {
    if (!selectedTeacherId) return []
    return submissions.filter((submission) => submission.data.targetId === selectedTeacherId)
  }, [submissions, selectedTeacherId])

  const selectedTeacherSubmissionIds = useMemo(
    () => new Set(selectedTeacherSubmissions.map((item) => item.id)),
    [selectedTeacherSubmissions],
  )

  const selectedTeacherAnswers = useMemo(
    () => answers.filter((answer) => selectedTeacherSubmissionIds.has(answer.data.submissionId)),
    [answers, selectedTeacherSubmissionIds],
  )

  const selectedTeacherQuestionStats = useMemo(() => {
    if (!selectedTeacherId) return []
    const stats: Array<{
      questionId: string
      text: string
      type: QuestionDoc['type']
      avg?: number
      count: number
      choices?: Record<string, number>
      texts?: string[]
    }> = []

    const statMap: Record<
      string,
      { sum: number; count: number; choices: Record<string, number>; texts: string[]; type: QuestionDoc['type'] }
    > = {}

    selectedTeacherAnswers.forEach((answer) => {
      const question = questions[answer.data.questionId]
      if (!question) return
      const entry =
        statMap[answer.data.questionId] ?? {
          sum: 0,
          count: 0,
          choices: {},
          texts: [],
          type: question.type,
        }

      if (question.type === 'text') {
        const textValue = String(answer.data.value ?? '').trim()
        if (textValue) entry.texts.push(textValue)
      } else if (question.type === 'choice') {
        const raw = typeof answer.data.value === 'string' ? answer.data.value : String(answer.data.value ?? '')
        const value = raw.trim()
        if (value) {
          entry.choices[value] = (entry.choices[value] ?? 0) + 1
          entry.count += 1
        }
      } else {
        const numeric = toNumber(answer.data.value)
        if (numeric !== null) {
          entry.sum += numeric
          entry.count += 1
        }
      }

      statMap[answer.data.questionId] = entry
    })

    Object.entries(statMap).forEach(([questionId, entry]) => {
      const question = questions[questionId]
      if (!question) return
      stats.push({
        questionId,
        text: question.text,
        type: question.type,
        avg: entry.count > 0 ? entry.sum / entry.count : undefined,
        count: entry.count,
        choices: entry.choices,
        texts: entry.texts,
      })
    })

    return stats
  }, [selectedTeacherAnswers, questions, selectedTeacherId])

  const selectedTeacherSummary = useMemo(() => {
    if (!selectedTeacherId) return { avg: null, submissions: 0 }
    const stat = teacherStats[selectedTeacherId]
    if (!stat) return { avg: null, submissions: 0 }
    return {
      avg: stat.count === 0 ? null : stat.sum / stat.count,
      submissions: stat.submissions,
    }
  }, [teacherStats, selectedTeacherId])

  const selectedTeacherTexts = useMemo(() => {
    return selectedTeacherQuestionStats
      .filter((stat) => stat.type === 'text' && stat.texts && stat.texts.length > 0)
      .flatMap((stat) => stat.texts ?? [])
  }, [selectedTeacherQuestionStats])

  const selectedTeacherNonTextStats = useMemo(
    () => selectedTeacherQuestionStats.filter((stat) => stat.type !== 'text'),
    [selectedTeacherQuestionStats],
  )

  const overallSummary = useMemo(() => {
    const sum = Object.values(teacherStats).reduce((acc, item) => acc + item.sum, 0)
    const count = Object.values(teacherStats).reduce((acc, item) => acc + item.count, 0)
    return {
      avg: count === 0 ? null : sum / count,
      submissions: submissions.length,
    }
  }, [teacherStats, submissions.length])

  const handleExportCsv = () => {
    if (!selectedCycleId) return
    const cycle = cycles.find((item) => item.id === selectedCycleId)
    const year = cycle?.data.year ?? '-'
    const rows = submissions.map((submission) => {
      const submissionAnswers = answers.filter((answer) => answer.data.submissionId === submission.id)
      const numericValues: number[] = []
      const comments: string[] = []

      submissionAnswers.forEach((answer) => {
        const question = questions[answer.data.questionId]
        if (!question) return
        if (question.type === 'text') {
          const text = String(answer.data.value ?? '').trim()
          if (text) comments.push(text)
          return
        }
        if (question.type !== 'scale') return
        const numeric = toNumber(answer.data.value)
        if (numeric !== null) numericValues.push(numeric)
      })

      const avg = numericValues.length === 0 ? '' : (numericValues.reduce((a, b) => a + b, 0) / numericValues.length)
      return [
        year,
        teacherMap[submission.data.targetId]?.name ?? submission.data.targetId,
        submission.data.targetId,
        submission.data.groupId ? groupMap[submission.data.groupId]?.name ?? submission.data.groupId : '- ',
        submission.data.subjectId ? subjectMap[submission.data.subjectId]?.name ?? submission.data.subjectId : '- ',
        avg === '' ? '' : Number(avg).toFixed(2),
        formatShortDate(submission.data.createdAt),
        comments.join(' | '),
      ]
    })

    downloadCsv(`branch-results-${year}.csv`, ['cycle_year', 'teacher_name', 'teacher_id', 'group', 'subject', 'score_avg', 'submitted_at', 'comment'], rows)
  }

  return (
    <div className="panel">
      {isSuperAdmin && (
        <BranchSelector branchId={branchId} branches={branches} onChange={setBranchId} />
      )}

      <div className="panel-header">
        <div>
          <h2>Nəticələr</h2>
          <p>Filial üzrə müəllim nəticələri və şərhlər.</p>
        </div>
        <div className="actions">
          <label className="field">
            <span className="label">Sorğu dövrü</span>
            <select
              className="input"
              value={selectedCycleId}
              onChange={(event) => setSelectedCycleId(event.target.value)}
            >
              <option value="">Sorğu dövrü seçin</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.data.year} ({cycle.data.status})
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="button" onClick={handleExportCsv} disabled={!selectedCycleId}>
            CSV ixracı
          </button>
        </div>
      </div>

      <div className="grid three">
        <div className="stat-card">
          <div className="stat-label">
            Ümumi orta
            <InfoTip text="Seçilmiş sorğu dövrü üzrə scale cavablarının ortalaması." />
          </div>
          <div className="stat-value">{formatAvg(overallSummary.avg, overallSummary.submissions)}</div>
          <div className="stat-meta">n={overallSummary.submissions}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Müəllim sayı
            <InfoTip text="Seçilmiş sorğu dövrü üzrə nəticəsi olan müəllim sayı." />
          </div>
          <div className="stat-value">{teacherRows.length}</div>
          <div className="stat-meta">Seçilmiş sorğu dövrü</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Qiymətləndirmə
            <InfoTip text="Scale sualları üçün 1–10 bal aralığı." />
          </div>
          <div className="stat-value">1–10</div>
          <div className="stat-meta">Scale sualları</div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Müəllim siyahısı</h3>
          <div className="table">
            <div className="table-row header">
              <div>Müəllim</div>
              <div>Orta</div>
              <div>n</div>
              <div></div>
            </div>
            {teacherRows.map((item) => (
              <div className="table-row" key={item.teacherId}>
                <div>{teacherMap[item.teacherId]?.name ?? item.teacherId}</div>
                <div>{formatAvg(item.avg, item.submissions)}</div>
                <div>{item.submissions}</div>
                <div>
                  <button className="btn ghost" type="button" onClick={() => setSelectedTeacherId(item.teacherId)}>
                    Baxış
                  </button>
                </div>
              </div>
            ))}
            {teacherRows.length === 0 && <div className="empty">Nəticə yoxdur.</div>}
          </div>
        </div>

        <div className="card">
          <h3>Seçilmiş müəllim</h3>
          <div className="form-row">
            <label className="field">
              <span className="label">Müəllim</span>
              <select
                className="input"
                value={selectedTeacherId}
                onChange={(event) => setSelectedTeacherId(event.target.value)}
              >
                <option value="">Müəllim seçin</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.data.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="stat-pill">Orta: {formatAvg(selectedTeacherSummary.avg, selectedTeacherSummary.submissions)}</div>
            <div className="stat-pill">n={selectedTeacherSummary.submissions}</div>
          </div>

          <div className="table">
            <div className="table-row header">
              <div>Sual</div>
              <div>Tip</div>
              <div>Nəticə</div>
              <div>n</div>
            </div>
            {selectedTeacherNonTextStats.map((stat) => {
              const choiceSummary = stat.choices
                ? Object.entries(stat.choices)
                    .map(([value, count]) => `${value} (${count})`)
                    .join(', ')
                : '-'
              const resultLabel = stat.type === 'choice' ? choiceSummary : stat.avg?.toFixed(2) ?? '-'
              return (
                <div className="table-row" key={stat.questionId}>
                  <div>{stat.text}</div>
                  <div>{stat.type}</div>
                  <div>{resultLabel}</div>
                  <div>{stat.count}</div>
                </div>
              )
            })}
            {selectedTeacherNonTextStats.length === 0 && <div className="empty">Nəticə yoxdur.</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Səsvermə yazıları</h3>
        <div className="table">
          <div className="table-row header">
            <div>Qrup</div>
            <div>Fənn</div>
            <div>Tarix</div>
          </div>
          {selectedTeacherSubmissions.map((submission) => (
            <div className="table-row" key={submission.id}>
              <div>{submission.data.groupId ? groupMap[submission.data.groupId]?.name ?? '-' : '-'}</div>
              <div>{submission.data.subjectId ? subjectMap[submission.data.subjectId]?.name ?? '-' : '-'}</div>
              <div>{formatShortDate(submission.data.createdAt)}</div>
            </div>
          ))}
          {selectedTeacherSubmissions.length === 0 && <div className="empty">Səsvermə yoxdur.</div>}
        </div>
      </div>

      {selectedTeacherTexts.length > 0 && (
        <div className="card">
          <h3>Yazılı şərhlər</h3>
          <div className="comment-feed">
            {selectedTeacherTexts.map((text, index) => (
              <div className="comment" key={`${selectedTeacherId}_${index}`}>
                <div className="comment-text">{text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
