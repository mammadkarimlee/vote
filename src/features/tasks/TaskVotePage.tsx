import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ORG_ID, supabase } from '../../lib/supabase'
import {
  mapQuestionRow,
  mapQuestionSetRow,
  mapSurveyCycleRow,
  mapTaskRow,
} from '../../lib/supabaseMappers'
import type { QuestionDoc, QuestionSetDoc, TaskDoc, SurveyCycleDoc } from '../../lib/types'
import { chunkArray, toJsDate } from '../../lib/utils'
import { useAuth } from '../auth/AuthProvider'

const flowFromTask = (task: TaskDoc): QuestionSetDoc['targetFlow'] => {
  if (task.raterRole === 'student' && task.targetType === 'teacher') return 'student_teacher'
  if (task.raterRole === 'teacher' && task.targetType === 'manager') return 'teacher_management'
  if (task.raterRole === 'teacher' && task.targetType === 'teacher') return 'teacher_self'
  return 'management_teacher'
}

export const TaskVotePage = () => {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [task, setTask] = useState<TaskDoc | null>(null)
  const [questions, setQuestions] = useState<Array<{ id: string; data: QuestionDoc }>>([])
  const [cycle, setCycle] = useState<SurveyCycleDoc | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!taskId) return
    const loadTask = async () => {
      const taskRes = await supabase
        .from('tasks')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('id', taskId)
        .maybeSingle()

      if (!taskRes.data) {
        setStatus('Tapşırıq tapılmadı')
        return
      }

      const taskData = mapTaskRow(taskRes.data)
      setTask(taskData)

      const cycleRes = await supabase
        .from('survey_cycles')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('id', taskData.cycleId)
        .maybeSingle()
      setCycle(cycleRes.data ? mapSurveyCycleRow(cycleRes.data) : null)

      const flow = flowFromTask(taskData)
      const questionSetRes = await supabase
        .from('question_sets')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('cycle_id', taskData.cycleId)
        .eq('target_flow', flow)
        .maybeSingle()

      if (!questionSetRes.data) {
        setStatus('Bu tapşırıq üçün sual seti tapılmadı')
        return
      }

      const questionSet = mapQuestionSetRow(questionSetRes.data)
      const ids = questionSet.questionIds ?? []
      if (ids.length === 0) {
        setQuestions([])
        return
      }

      const chunks = chunkArray(ids, 200)
      const loaded: Array<{ id: string; data: QuestionDoc }> = []
      for (const chunk of chunks) {
        const qRes = await supabase.from('questions').select('*').eq('org_id', ORG_ID).in('id', chunk)
        ;(qRes.data ?? []).forEach((row) => {
          loaded.push({ id: row.id, data: mapQuestionRow(row) })
        })
      }

      loaded.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
      setQuestions(loaded)
    }

    void loadTask()
  }, [taskId])

  const isOpen = useMemo(() => {
    if (!cycle) return false
    if (cycle.status !== 'OPEN') return false
    const start = toJsDate(cycle.startAt)
    const end = toJsDate(cycle.endAt)
    const now = new Date()
    if (start && now < start) return false
    if (end && now > end) return false
    return true
  }, [cycle])

  const handleChange = (questionId: string, value: string | number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleSubmit = async () => {
    if (!user || !task || !taskId) return
    setStatus(null)

    if (task.status === 'DONE') {
      setStatus('Bu tapşırıq artıq tamamlanıb')
      return
    }

    if (!isOpen) {
      setStatus('Sorğu dövrü açıq deyil, cavab göndərmək mümkün deyil')
      return
    }

    const missingRequired = questions.filter(
      (question) => question.data.required && (answers[question.id] === undefined || answers[question.id] === ''),
    )
    if (missingRequired.length > 0) {
      setStatus('Bütün məcburi sualları cavablayın')
      return
    }

    const answersPayload = Object.entries(answers)
      .map(([questionId, value]) => ({
        question_id: questionId,
        value,
      }))
      .filter((item) => item.value !== undefined && item.value !== '')

    const { error } = await supabase.rpc('submit_vote', {
      p_task_id: taskId,
      p_answers: answersPayload,
    })

    if (error) {
      setStatus(error.message || 'Cavablar göndərilmədi')
      return
    }

    setStatus('Cavablar göndərildi')
    navigate('/vote', { replace: true })
  }

  if (!task) {
    return (
      <div className="page">
        <div className="card">Tapşırıq yüklənir...</div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="card">
        <div className="stack">
          <Link to="/vote" className="link">
            ← Tapşırıqlara qayıt
          </Link>
          <h1>Sorğu formu</h1>
          {cycle && (
            <div className="meta">
              Sorğu dövrü: {cycle.year} • Vəziyyət: {cycle.status}
            </div>
          )}

          <div className="stack">
            {questions.map((question) => (
              <div className="question" key={question.id}>
                <div className="question-title">
                  {question.data.text}
                  {question.data.required && <span className="required">*</span>}
                </div>
                {question.data.type === 'scale' && (
                  <div className="scale">
                    {Array.from({
                      length: (question.data.scaleMax ?? 10) - (question.data.scaleMin ?? 1) + 1,
                    }).map((_, idx) => {
                      const value = (question.data.scaleMin ?? 1) + idx
                      return (
                        <label key={value} className="scale-item">
                          <input
                            type="radio"
                            name={question.id}
                            value={value}
                            checked={answers[question.id] === value}
                            onChange={() => handleChange(question.id, value)}
                          />
                          <span>{value}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {question.data.type === 'choice' && (
                  <div className="choice">
                    {(question.data.options ?? []).map((option) => (
                      <label key={option} className="choice-item">
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={answers[question.id] === option}
                          onChange={() => handleChange(question.id, option)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                )}
                {question.data.type === 'text' && (
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Fikrinizi yazın..."
                    value={String(answers[question.id] ?? '')}
                    onChange={(event) => handleChange(question.id, event.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          {status && <div className="notice">{status}</div>}

          <div className="actions">
            <button className="btn primary" type="button" onClick={handleSubmit} disabled={!isOpen}>
              Göndər
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
