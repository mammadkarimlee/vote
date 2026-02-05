import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { ORG_ID, supabase } from '../../lib/supabase'
import {
  mapAnswerRow,
  mapBranchRow,
  mapGroupRow,
  mapQuestionRow,
  mapSubmissionRow,
  mapSubjectRow,
  mapSurveyCycleRow,
  mapTeacherRow,
} from '../../lib/supabaseMappers'
import type {
  AnswerDoc,
  BranchDoc,
  GroupDoc,
  QuestionDoc,
  SubmissionDoc,
  SubjectDoc,
  SurveyCycleDoc,
  TeacherDoc,
} from '../../lib/types'
import { chunkArray, formatShortDate, toNumber } from '../../lib/utils'
import { downloadCsv } from '../../lib/csv'
import { InfoTip } from '../../components/InfoTip'

type DocEntry<T> = { id: string; data: T }

type AggregationResult = {
  teacherStats: Record<string, { sum: number; count: number; submissions: number }>
  branchStats: Record<string, { sum: number; count: number; submissions: number }>
  heatmap: Record<string, Record<string, { sum: number; count: number; submissions: number }>>
  comments: Array<{
    submissionId: string
    targetId: string
    questionId: string
    value: string
    createdAt?: unknown
    branchId: string
    groupId?: string | null
    subjectId?: string | null
  }>
}

const DASHBOARD_SECTIONS = [
  { key: 'overview', label: 'Ümumi baxış' },
  { key: 'teachers', label: 'Müəllim nəticələri' },
  { key: 'branches', label: 'Filial müqayisəsi' },
  { key: 'heatmap', label: 'İstilik xəritəsi' },
  { key: 'comments', label: 'Şərhlər' },
] as const

const aggregateCycle = (
  submissions: Array<DocEntry<SubmissionDoc>>,
  answers: Array<DocEntry<AnswerDoc>>,
  questions: Record<string, QuestionDoc>,
  groupMap: Record<string, GroupDoc>,
) => {
  const teacherStats: AggregationResult['teacherStats'] = {}
  const branchStats: AggregationResult['branchStats'] = {}
  const heatmap: AggregationResult['heatmap'] = {}
  const comments: AggregationResult['comments'] = []

  const submissionMap = submissions.reduce<Record<string, SubmissionDoc>>((acc, item) => {
    acc[item.id] = item.data
    return acc
  }, {})

  const submissionCountsTeacher: Record<string, Set<string>> = {}
  const submissionCountsBranch: Record<string, Set<string>> = {}
  const submissionCountsHeatmap: Record<string, Record<string, Set<string>>> = {}

  answers.forEach((answer) => {
    const submission = submissionMap[answer.data.submissionId]
    if (!submission) return
    const question = questions[answer.data.questionId]
    if (!question) return

    if (question.type === 'text') {
      comments.push({
        submissionId: answer.data.submissionId,
        targetId: submission.targetId,
        questionId: answer.data.questionId,
        value: String(answer.data.value ?? ''),
        createdAt: answer.data.createdAt,
        branchId: submission.branchId,
        groupId: submission.groupId,
        subjectId: submission.subjectId,
      })
      return
    }

    const numeric = toNumber(answer.data.value)
    if (numeric === null) return

    const teacherStat = teacherStats[submission.targetId] ?? { sum: 0, count: 0, submissions: 0 }
    teacherStat.sum += numeric
    teacherStat.count += 1
    teacherStats[submission.targetId] = teacherStat

    const branchStat = branchStats[submission.branchId] ?? { sum: 0, count: 0, submissions: 0 }
    branchStat.sum += numeric
    branchStat.count += 1
    branchStats[submission.branchId] = branchStat

    if (submission.subjectId) {
      const classLevel = submission.groupId ? groupMap[submission.groupId]?.classLevel ?? 'N/A' : 'N/A'
      if (!heatmap[submission.subjectId]) {
        heatmap[submission.subjectId] = {}
      }
      const cell = heatmap[submission.subjectId][classLevel] ?? { sum: 0, count: 0, submissions: 0 }
      cell.sum += numeric
      cell.count += 1
      heatmap[submission.subjectId][classLevel] = cell
    }

    submissionCountsTeacher[submission.targetId] = submissionCountsTeacher[submission.targetId] || new Set()
    submissionCountsTeacher[submission.targetId].add(answer.data.submissionId)

    submissionCountsBranch[submission.branchId] = submissionCountsBranch[submission.branchId] || new Set()
    submissionCountsBranch[submission.branchId].add(answer.data.submissionId)

    if (submission.subjectId) {
      const classLevel = submission.groupId ? groupMap[submission.groupId]?.classLevel ?? 'N/A' : 'N/A'
      submissionCountsHeatmap[submission.subjectId] = submissionCountsHeatmap[submission.subjectId] || {}
      submissionCountsHeatmap[submission.subjectId][classLevel] =
        submissionCountsHeatmap[submission.subjectId][classLevel] || new Set()
      submissionCountsHeatmap[submission.subjectId][classLevel].add(answer.data.submissionId)
    }
  })

  Object.entries(submissionCountsTeacher).forEach(([teacherId, set]) => {
    if (teacherStats[teacherId]) teacherStats[teacherId].submissions = set.size
  })
  Object.entries(submissionCountsBranch).forEach(([branchId, set]) => {
    if (branchStats[branchId]) branchStats[branchId].submissions = set.size
  })
  Object.entries(submissionCountsHeatmap).forEach(([subjectId, levels]) => {
    Object.entries(levels).forEach(([classLevel, set]) => {
      if (heatmap[subjectId]?.[classLevel]) heatmap[subjectId][classLevel].submissions = set.size
    })
  })

  return { teacherStats, branchStats, heatmap, comments }
}

const formatDistribution = (distribution?: Record<string, number>, numeric = false) => {
  if (!distribution) return '-'
  const entries = Object.entries(distribution).filter(([, count]) => count > 0)
  if (entries.length === 0) return '-'
  const sorted = numeric
    ? entries.sort((a, b) => Number(a[0]) - Number(b[0]))
    : entries.sort((a, b) => a[0].localeCompare(b[0]))
  return sorted.map(([value, count]) => `${value}:${count}`).join(' ')
}

const formatAvg = (avg: number | null | undefined, count: number) => {
  if (avg === null || avg === undefined || count === 0) return '—'
  return avg.toFixed(2)
}

export const AdminDashboardPage = () => {
  const [cycles, setCycles] = useState<Array<DocEntry<SurveyCycleDoc>>>([])
  const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([])
  const [branches, setBranches] = useState<Array<DocEntry<BranchDoc>>>([])
  const [groups, setGroups] = useState<Array<DocEntry<GroupDoc>>>([])
  const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([])
  const [questions, setQuestions] = useState<Record<string, QuestionDoc>>({})
  const [submissions, setSubmissions] = useState<Array<DocEntry<SubmissionDoc>>>([])
  const [answers, setAnswers] = useState<Array<DocEntry<AnswerDoc>>>([])
  const [prevSubmissions, setPrevSubmissions] = useState<Array<DocEntry<SubmissionDoc>>>([])
  const [prevAnswers, setPrevAnswers] = useState<Array<DocEntry<AnswerDoc>>>([])
  const [selectedCycleId, setSelectedCycleId] = useState<string>('')
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('')
  const [filters, setFilters] = useState({
    branchId: '',
    teacherId: '',
    groupId: '',
    subjectId: '',
    classLevel: '',
    search: '',
  })
  const { section } = useParams()
  const activeSection = DASHBOARD_SECTIONS.find((item) => item.key === section)?.key ?? 'overview'
  const navigate = useNavigate()

  useEffect(() => {
    if (!section || !DASHBOARD_SECTIONS.some((item) => item.key === section)) {
      navigate('/admin/dashboard/overview', { replace: true })
    }
  }, [navigate, section])

  useEffect(() => {
    const loadLookups = async () => {
      const [cycleRes, teacherRes, branchRes, groupRes, subjectRes, questionRes] = await Promise.all([
        supabase.from('survey_cycles').select('*').eq('org_id', ORG_ID),
        supabase.from('teachers').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
        supabase.from('branches').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
        supabase.from('groups').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
        supabase.from('subjects').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
        supabase.from('questions').select('*').eq('org_id', ORG_ID),
      ])

      const cycleDocs = (cycleRes.data ?? []).map((row) => ({ id: row.id, data: mapSurveyCycleRow(row) }))
      setCycles(cycleDocs)
      setTeachers((teacherRes.data ?? []).map((row) => ({ id: row.id, data: mapTeacherRow(row) })))
      setBranches((branchRes.data ?? []).map((row) => ({ id: row.id, data: mapBranchRow(row) })))
      setGroups((groupRes.data ?? []).map((row) => ({ id: row.id, data: mapGroupRow(row) })))
      setSubjects((subjectRes.data ?? []).map((row) => ({ id: row.id, data: mapSubjectRow(row) })))

      const questionMap: Record<string, QuestionDoc> = {}
      ;(questionRes.data ?? []).forEach((row) => {
        questionMap[row.id] = mapQuestionRow(row)
      })
      setQuestions(questionMap)

      if (cycleDocs.length > 0 && !selectedCycleId) {
        const latest = [...cycleDocs].sort((a, b) => b.data.year - a.data.year)[0]
        setSelectedCycleId(latest.id)
      }
    }

    void loadLookups()
  }, [selectedCycleId])

  useEffect(() => {
    if (filters.teacherId) {
      setSelectedTeacherId(filters.teacherId)
    }
  }, [filters.teacherId])

  useEffect(() => {
    if (!selectedTeacherId && teachers.length > 0) {
      setSelectedTeacherId(teachers[0].id)
    }
  }, [teachers, selectedTeacherId])

  useEffect(() => {
    const loadCycleData = async () => {
      if (!selectedCycleId) return

      const submissionRes = await supabase
        .from('submissions')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('cycle_id', selectedCycleId)
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

      const currentCycle = cycles.find((cycle) => cycle.id === selectedCycleId)
      const prevCycle = cycles.find((cycle) => cycle.data.year === (currentCycle?.data.year ?? 0) - 1)
      if (!prevCycle) {
        setPrevSubmissions([])
        setPrevAnswers([])
        return
      }

      const prevSubmissionRes = await supabase
        .from('submissions')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('cycle_id', prevCycle.id)
      const prevSubmissionDocs = (prevSubmissionRes.data ?? []).map((row) => ({
        id: row.task_id ?? row.id,
        data: mapSubmissionRow(row),
      }))
      setPrevSubmissions(prevSubmissionDocs)

      const prevAnswerDocs: Array<DocEntry<AnswerDoc>> = []
      const prevIds = prevSubmissionDocs.map((item) => item.id)
      const prevChunks = chunkArray(prevIds, 200)
      for (const chunk of prevChunks) {
        if (chunk.length === 0) continue
        const answerRes = await supabase
          .from('answers')
          .select('*')
          .eq('org_id', ORG_ID)
          .in('submission_id', chunk)
        ;(answerRes.data ?? []).forEach((row) => {
          const key = `${row.submission_id}_${row.question_id}`
          prevAnswerDocs.push({ id: key, data: mapAnswerRow(row) })
        })
      }
      setPrevAnswers(prevAnswerDocs)
    }

    void loadCycleData()
  }, [selectedCycleId, cycles])

  const teacherMap = useMemo(() => Object.fromEntries(teachers.map((t) => [t.id, t.data])), [teachers])
  const branchMap = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.data])), [branches])
  const groupMap = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.data])), [groups])
  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s.data])), [subjects])

  const filteredTeacherOptions = useMemo(() => {
    if (!filters.branchId) return teachers
    return teachers.filter((teacher) => {
      if (teacher.data.branchId === filters.branchId) return true
      return (teacher.data.branchIds ?? []).includes(filters.branchId)
    })
  }, [teachers, filters.branchId])

  const filteredGroupOptions = useMemo(() => {
    if (!filters.branchId) return groups
    return groups.filter((group) => group.data.branchId === filters.branchId)
  }, [groups, filters.branchId])

  const filterSubmission = useCallback(
    (submission: DocEntry<SubmissionDoc>) => {
      if (filters.branchId && submission.data.branchId !== filters.branchId) return false
      if (filters.teacherId && submission.data.targetId !== filters.teacherId) return false
      if (filters.groupId && submission.data.groupId !== filters.groupId) return false
      if (filters.subjectId && submission.data.subjectId !== filters.subjectId) return false
      if (filters.classLevel) {
        const group = submission.data.groupId ? groupMap[submission.data.groupId] : null
        if (!group || group.classLevel !== filters.classLevel) return false
      }
      return true
    },
    [filters, groupMap],
  )

  const filteredSubmissions = useMemo(
    () => submissions.filter(filterSubmission),
    [submissions, filterSubmission],
  )

  const prevFilteredSubmissions = useMemo(
    () => prevSubmissions.filter(filterSubmission),
    [prevSubmissions, filterSubmission],
  )

  const filteredSubmissionIds = useMemo(
    () => new Set(filteredSubmissions.map((item) => item.id)),
    [filteredSubmissions],
  )

  const prevFilteredSubmissionIds = useMemo(
    () => new Set(prevFilteredSubmissions.map((item) => item.id)),
    [prevFilteredSubmissions],
  )

  const filteredAnswers = useMemo(
    () => answers.filter((answer) => filteredSubmissionIds.has(answer.data.submissionId)),
    [answers, filteredSubmissionIds],
  )

  const prevFilteredAnswers = useMemo(
    () => prevAnswers.filter((answer) => prevFilteredSubmissionIds.has(answer.data.submissionId)),
    [prevAnswers, prevFilteredSubmissionIds],
  )

  const selectedTeacherSubmissions = useMemo(() => {
    if (!selectedTeacherId) return []
    return filteredSubmissions.filter((submission) => submission.data.targetId === selectedTeacherId)
  }, [filteredSubmissions, selectedTeacherId])

  const selectedTeacherSubmissionIds = useMemo(
    () => new Set(selectedTeacherSubmissions.map((item) => item.id)),
    [selectedTeacherSubmissions],
  )

  const selectedTeacherAnswers = useMemo(
    () => filteredAnswers.filter((answer) => selectedTeacherSubmissionIds.has(answer.data.submissionId)),
    [filteredAnswers, selectedTeacherSubmissionIds],
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
      distribution?: Record<string, number>
      distributionLabel: string
    }> = []

    const statMap: Record<
      string,
      {
        sum: number
        count: number
        choices: Record<string, number>
        texts: string[]
        type: QuestionDoc['type']
        distribution: Record<string, number>
      }
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
          distribution: {},
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
          const key = String(numeric)
          entry.distribution[key] = (entry.distribution[key] ?? 0) + 1
        }
      }

      statMap[answer.data.questionId] = entry
    })

    Object.entries(statMap).forEach(([questionId, entry]) => {
      const question = questions[questionId]
      if (!question) return
      const distributionLabel =
        question.type === 'choice'
          ? formatDistribution(entry.choices)
          : question.type === 'scale'
            ? formatDistribution(entry.distribution, true)
            : '-'

      stats.push({
        questionId,
        text: question.text,
        type: question.type,
        avg: entry.count > 0 ? entry.sum / entry.count : undefined,
        count: entry.count,
        choices: entry.choices,
        texts: entry.texts,
        distribution: entry.distribution,
        distributionLabel,
      })
    })

    return stats
  }, [selectedTeacherAnswers, questions, selectedTeacherId])

  const currentAggregation = useMemo(
    () => aggregateCycle(filteredSubmissions, filteredAnswers, questions, groupMap),
    [filteredSubmissions, filteredAnswers, questions, groupMap],
  )

  const prevAggregation = useMemo(
    () => aggregateCycle(prevFilteredSubmissions, prevFilteredAnswers, questions, groupMap),
    [prevFilteredSubmissions, prevFilteredAnswers, questions, groupMap],
  )

  const currentCycle = cycles.find((cycle) => cycle.id === selectedCycleId)
  const riskThreshold = currentCycle?.data.thresholds?.y ?? 3
  const observeMonths = currentCycle?.data.thresholds?.p ?? 3

  const topTeachers = useMemo(() => {
    return Object.entries(currentAggregation.teacherStats)
      .map(([teacherId, stat]) => ({
        teacherId,
        avg: stat.count === 0 ? null : stat.sum / stat.count,
        submissions: stat.submissions,
      }))
      .filter((item): item is { teacherId: string; avg: number; submissions: number } => item.avg !== null)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5)
  }, [currentAggregation])

  const riskTeachers = useMemo(() => {
    return Object.entries(currentAggregation.teacherStats)
      .map(([teacherId, stat]) => ({
        teacherId,
        avg: stat.count === 0 ? null : stat.sum / stat.count,
        submissions: stat.submissions,
      }))
      .filter((item): item is { teacherId: string; avg: number; submissions: number } => item.avg !== null)
      .filter((item) => item.avg < riskThreshold)
  }, [currentAggregation, riskThreshold])

  const branchCompare = useMemo(() => {
    return Object.entries(currentAggregation.branchStats).map(([branchId, stat]) => ({
      branchId,
      avg: stat.count === 0 ? null : stat.sum / stat.count,
      submissions: stat.submissions,
    }))
  }, [currentAggregation])

  const heatmapCells = useMemo(() => {
    const rows: Array<{ subjectId: string; classLevel: string; avg: number; submissions: number }> = []
    Object.entries(currentAggregation.heatmap).forEach(([subjectId, levels]) => {
      Object.entries(levels).forEach(([classLevel, stat]) => {
        rows.push({
          subjectId,
          classLevel,
          avg: stat.count === 0 ? null : stat.sum / stat.count,
          submissions: stat.submissions,
        })
      })
    })
    return rows
  }, [currentAggregation])

  const commentFeed = useMemo(() => {
    return currentAggregation.comments
      .filter((comment) => {
        if (filters.search && !comment.value.toLowerCase().includes(filters.search.toLowerCase())) return false
        return true
      })
      .sort((a, b) => {
        const aRaw = a.createdAt ? new Date(a.createdAt as string).getTime() : 0
        const bRaw = b.createdAt ? new Date(b.createdAt as string).getTime() : 0
        const aTime = Number.isNaN(aRaw) ? 0 : aRaw
        const bTime = Number.isNaN(bRaw) ? 0 : bRaw
        return bTime - aTime
      })
      .slice(0, 30)
  }, [currentAggregation.comments, filters.search])

  const overallCurrent = useMemo(() => {
    const sum = Object.values(currentAggregation.teacherStats).reduce((acc, item) => acc + item.sum, 0)
    const count = Object.values(currentAggregation.teacherStats).reduce((acc, item) => acc + item.count, 0)
    const submissionsCount = filteredSubmissions.length
    return { avg: count === 0 ? null : sum / count, submissions: submissionsCount }
  }, [currentAggregation, filteredSubmissions])

  const overallPrev = useMemo(() => {
    const sum = Object.values(prevAggregation.teacherStats).reduce((acc, item) => acc + item.sum, 0)
    const count = Object.values(prevAggregation.teacherStats).reduce((acc, item) => acc + item.count, 0)
    const submissionsCount = prevFilteredSubmissions.length
    return { avg: count === 0 ? null : sum / count, submissions: submissionsCount }
  }, [prevAggregation, prevFilteredSubmissions])

  const selectedTeacherSummary = useMemo(() => {
    if (!selectedTeacherId) return { avg: null, submissions: 0 }
    const stat = currentAggregation.teacherStats[selectedTeacherId]
    if (!stat) return { avg: null, submissions: 0 }
    return {
      avg: stat.count === 0 ? null : stat.sum / stat.count,
      submissions: stat.submissions,
    }
  }, [currentAggregation.teacherStats, selectedTeacherId])

  const selectedTeacherTexts = useMemo(() => {
    return selectedTeacherQuestionStats
      .filter((stat) => stat.type === 'text' && stat.texts && stat.texts.length > 0)
      .flatMap((stat) => stat.texts ?? [])
  }, [selectedTeacherQuestionStats])

  const selectedTeacherNonTextStats = useMemo(
    () => selectedTeacherQuestionStats.filter((stat) => stat.type !== 'text'),
    [selectedTeacherQuestionStats],
  )

  const handleExportCsv = () => {
    if (!selectedCycleId) return
    const year = currentCycle?.data.year ?? '-'
    const rows = filteredSubmissions.map((submission) => {
      const submissionAnswers = filteredAnswers.filter((answer) => answer.data.submissionId === submission.id)
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

      const avg = numericValues.length === 0 ? '' : numericValues.reduce((a, b) => a + b, 0) / numericValues.length
      return [
        year,
        teacherMap[submission.data.targetId]?.name ?? submission.data.targetId,
        submission.data.targetId,
        submission.data.groupId ? groupMap[submission.data.groupId]?.name ?? submission.data.groupId : '-',
        submission.data.subjectId ? subjectMap[submission.data.subjectId]?.name ?? submission.data.subjectId : '-',
        avg === '' ? '' : Number(avg).toFixed(2),
        formatShortDate(submission.data.createdAt),
        comments.join(' | '),
      ]
    })

    downloadCsv(
      `admin-results-${year}.csv`,
      ['cycle_year', 'teacher_name', 'teacher_id', 'group', 'subject', 'score_avg', 'submitted_at', 'comment'],
      rows,
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>İdarə paneli</h2>
          <p>İllik nəticələr və müqayisələr.</p>
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

      <div className="segmented mt-4">
        {DASHBOARD_SECTIONS.map((item) => (
          <NavLink
            key={item.key}
            to={`/admin/dashboard/${item.key}`}
            className={`segmented__item${activeSection === item.key ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      <div className="card">
        <div className="section-header">
          <div>
            <h3>Sorğular / Sorğu dövrü</h3>
            <p>Seçilmiş sorğu dövrü üzrə ümumi göstəricilər və filtrlər.</p>
          </div>
          {currentCycle && (
            <div className="meta">
              Sorğu dövrü: {currentCycle.data.year} • Vəziyyət: {currentCycle.data.status}
            </div>
          )}
        </div>

        <div className="filters">
          <label className="field">
            <span className="label">Filial</span>
            <select
              className="input"
              value={filters.branchId}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  branchId: event.target.value,
                  groupId: '',
                  classLevel: '',
                }))
              }
            >
              <option value="">Hamısı</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.data.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Müəllim</span>
            <select
              className="input"
              value={filters.teacherId}
              onChange={(event) => setFilters((prev) => ({ ...prev, teacherId: event.target.value }))}
            >
              <option value="">Hamısı</option>
              {filteredTeacherOptions.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.data.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Qrup</span>
            <select
              className="input"
              value={filters.groupId}
              onChange={(event) => setFilters((prev) => ({ ...prev, groupId: event.target.value }))}
            >
              <option value="">Hamısı</option>
              {filteredGroupOptions.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.data.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Sinif səviyyəsi</span>
            <select
              className="input"
              value={filters.classLevel}
              onChange={(event) => setFilters((prev) => ({ ...prev, classLevel: event.target.value }))}
            >
              <option value="">Hamısı</option>
              {Array.from(new Set(filteredGroupOptions.map((group) => group.data.classLevel))).map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Fənn</span>
            <select
              className="input"
              value={filters.subjectId}
              onChange={(event) => setFilters((prev) => ({ ...prev, subjectId: event.target.value }))}
            >
              <option value="">Hamısı</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.data.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Şərh axtarışı</span>
            <input
              className="input"
              placeholder="Məsələn: izahı aydın"
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            />
          </label>
        </div>
      </div>

      {activeSection === 'overview' && (
        <>
          <div className="card">
            <div className="grid three">
              <div className="stat-card">
                <div className="stat-label">
                  Cari il ortalaması
                  <InfoTip text="Seçilmiş sorğu dövrü üzrə bütün scale cavablarının ortalaması." />
                </div>
                <div className="stat-value">{formatAvg(overallCurrent.avg, overallCurrent.submissions)}</div>
                <div className="stat-meta">n={overallCurrent.submissions}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Keçən il ortalaması
                  <InfoTip text="Əvvəlki sorğu dövrü üzrə scale cavablarının ortalaması." />
                </div>
                <div className="stat-value">{formatAvg(overallPrev.avg, overallPrev.submissions)}</div>
                <div className="stat-meta">n={overallPrev.submissions}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Risk qaydası
                  <InfoTip text="Ortalama bu həddən aşağıdırsa risk statusu tətbiq olunur." />
                </div>
                <div className="stat-value">orta &lt; {riskThreshold}</div>
                <div className="stat-meta">Tədbir: {observeMonths} ay müşahidə</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-header">
              <div>
                <h3>Müəllimlər</h3>
                <p>Ən yaxşı və risk müəllim siyahıları.</p>
              </div>
            </div>
            <div className="grid two">
              <div className="card">
                <h4>Ən yaxşı müəllimlər</h4>
                <div className="data-table">
                  <div className="data-row header">
                    <div>Müəllim</div>
                    <div>Orta</div>
                    <div>n</div>
                  </div>
                  {topTeachers.map((item) => (
                    <div className="data-row" key={item.teacherId}>
                      <div>{teacherMap[item.teacherId]?.name ?? item.teacherId}</div>
                      <div>{formatAvg(item.avg, item.submissions)}</div>
                      <div>{item.submissions}</div>
                    </div>
                  ))}
                  {topTeachers.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
                </div>
              </div>

              <div className="card">
                <h4>Risk müəllimlər</h4>
                <div className="data-table">
                  <div className="data-row header">
                    <div>Müəllim</div>
                    <div>Orta</div>
                    <div>n</div>
                    <div>Plan</div>
                  </div>
                  {riskTeachers.map((item) => (
                    <div className="data-row" key={item.teacherId}>
                      <div>{teacherMap[item.teacherId]?.name ?? item.teacherId}</div>
                      <div>{formatAvg(item.avg, item.submissions)}</div>
                      <div>{item.submissions}</div>
                      <div className="badge warn">
                        Səbəb: orta &lt; {riskThreshold}. Plan: {observeMonths} ay müşahidə
                      </div>
                    </div>
                  ))}
                  {riskTeachers.length === 0 && <div className="empty">Risk yoxdur.</div>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeSection === 'teachers' && (
        <div className="card">
          <div className="section-header">
            <div>
              <h3>Müəllim nəticələri</h3>
              <p>Seçilmiş müəllim üzrə sual nəticələri və səsvermə yazıları.</p>
            </div>
          </div>
          <div className="form-row">
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
            <div className="stat-pill">Orta: {formatAvg(selectedTeacherSummary.avg, selectedTeacherSummary.submissions)}</div>
            <div className="stat-pill">n={selectedTeacherSummary.submissions}</div>
          </div>

          <div className="data-table">
            <div className="data-row header">
              <div>Sual</div>
              <div>Tip</div>
              <div>Ortalama</div>
              <div>n</div>
              <div>Paylanma</div>
            </div>
            {selectedTeacherNonTextStats.map((stat) => (
              <div className="data-row" key={stat.questionId}>
                <div>{stat.text}</div>
                <div>{stat.type}</div>
                <div>{stat.type === 'scale' ? stat.avg?.toFixed(2) ?? '-' : '-'}</div>
                <div>{stat.count}</div>
                <div>{stat.distributionLabel}</div>
              </div>
            ))}
            {selectedTeacherNonTextStats.length === 0 && (
              <div className="empty">Bu müəllim üçün nəticə yoxdur.</div>
            )}
          </div>

          <div className="divider" />

          <div className="data-table">
            <div className="data-row header">
              <div>Qrup</div>
              <div>Fənn</div>
              <div>Tarix</div>
            </div>
            {selectedTeacherSubmissions.map((submission) => (
              <div className="data-row" key={submission.id}>
                <div>{submission.data.groupId ? groupMap[submission.data.groupId]?.name ?? '-' : '-'}</div>
                <div>{submission.data.subjectId ? subjectMap[submission.data.subjectId]?.name ?? '-' : '-'}</div>
                <div>{formatShortDate(submission.data.createdAt)}</div>
              </div>
            ))}
            {selectedTeacherSubmissions.length === 0 && (
              <div className="empty">Bu müəllim üçün səsvermə yoxdur.</div>
            )}
          </div>

          {selectedTeacherTexts.length > 0 && (
            <>
              <div className="divider" />
              <h4>Yazılı şərhlər</h4>
              <div className="comment-feed">
                {selectedTeacherTexts.map((text, index) => (
                  <div className="comment" key={`${selectedTeacherId}_${index}`}>
                    <div className="comment-text">{text}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeSection === 'branches' && (
        <div className="card">
          <div className="section-header">
            <div>
              <h3>Filial müqayisəsi</h3>
              <p>Seçilmiş sorğu dövrü üzrə filialların müqayisəsi.</p>
            </div>
          </div>
          <div className="data-table">
            <div className="data-row header">
              <div>Filial</div>
              <div>Orta</div>
              <div>n</div>
            </div>
            {branchCompare.map((item) => (
              <div className="data-row" key={item.branchId}>
                <div>{branchMap[item.branchId]?.name ?? item.branchId}</div>
                <div>{formatAvg(item.avg, item.submissions)}</div>
                <div>{item.submissions}</div>
              </div>
            ))}
            {branchCompare.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
          </div>
        </div>
      )}

      {activeSection === 'heatmap' && (
        <div className="card">
          <div className="section-header">
            <div>
              <h3>İstilik xəritəsi</h3>
              <p>Fənn və sinif səviyyəsi üzrə orta nəticələr.</p>
            </div>
          </div>
          <div className="heatmap">
            {heatmapCells.map((cell) => (
              <div className="heatmap-cell" key={`${cell.subjectId}_${cell.classLevel}`}>
                <div className="heatmap-title">
                  {subjectMap[cell.subjectId]?.name ?? cell.subjectId} • {cell.classLevel}
                </div>
                <div className="heatmap-value">{formatAvg(cell.avg, cell.submissions)}</div>
                <div className="heatmap-meta">n={cell.submissions}</div>
              </div>
            ))}
            {heatmapCells.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
          </div>
        </div>
      )}

      {activeSection === 'comments' && (
        <div className="card">
          <div className="section-header">
            <div>
              <h3>Şərhlər</h3>
              <p>Son yazılı rəylər və müəllim üzrə filtr.</p>
            </div>
          </div>
          <div className="comment-feed">
            {commentFeed.map((comment) => (
              <div className="comment" key={`${comment.submissionId}_${comment.questionId}`}>
                <div className="comment-title">{teacherMap[comment.targetId]?.name ?? comment.targetId}</div>
                {questions[comment.questionId]?.text && (
                  <div className="comment-meta">{questions[comment.questionId]?.text}</div>
                )}
                <div className="comment-text">{comment.value}</div>
                <div className="comment-meta">
                  {branchMap[comment.branchId]?.name ?? comment.branchId}
                  {comment.groupId && ` • ${groupMap[comment.groupId]?.name ?? comment.groupId}`}
                  {comment.subjectId && ` • ${subjectMap[comment.subjectId]?.name ?? comment.subjectId}`}
                </div>
              </div>
            ))}
            {commentFeed.length === 0 && <div className="empty">Şərh yoxdur.</div>}
          </div>
        </div>
      )}
    </div>
  )
}









