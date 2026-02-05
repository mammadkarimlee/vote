import { useEffect, useMemo, useState } from 'react'
import { ORG_ID, supabase } from '../../lib/supabase'
import { mapQuestionRow } from '../../lib/supabaseMappers'
import type { QuestionDoc } from '../../lib/types'
import { createId } from '../../lib/utils'
import { useConfirmDialog } from '../../components/ConfirmDialog'

export const AdminQuestionsPage = () => {
  const { confirm, dialog } = useConfirmDialog()
  const [questions, setQuestions] = useState<Array<{ id: string; data: QuestionDoc }>>([])
  const [text, setText] = useState('')
  const [required, setRequired] = useState(true)
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const loadQuestions = async () => {
    const { data, error } = await supabase.from('questions').select('*').eq('org_id', ORG_ID)
    if (error) return
    const items = (data ?? []).map((row) => ({ id: row.id, data: mapQuestionRow(row) }))
    setQuestions(items)
  }

  useEffect(() => {
    void loadQuestions()
  }, [])

  const handleCreate = async () => {
    if (!text.trim()) {
      setStatus('Sual mətni tələb olunur')
      return
    }

    const docData: QuestionDoc = {
      text: text.trim(),
      type: 'scale',
      required,
      category: category.trim() || null,
    }

    docData.scaleMin = 1
    docData.scaleMax = 10

    const { error } = await supabase.from('questions').insert({
      id: createId(),
      org_id: ORG_ID,
      text: docData.text,
      type: docData.type,
      required: docData.required,
      options: null,
      scale_min: 1,
      scale_max: 10,
      category: docData.category ?? null,
    })

    if (error) {
      setStatus('Yaratma zamanı xəta oldu')
      return
    }

    setText('')
    setCategory('')
    setStatus('Sual yaradıldı')
    await loadQuestions()
  }

  const handleDelete = async (questionId: string) => {
    const ok = await confirm({
      title: 'Sualı sil',
      message: 'Sualı silmək istədiyinizə əminsiniz?',
      confirmText: 'Sil',
      cancelText: 'İmtina',
      tone: 'danger',
    })
    if (!ok) return
    await supabase.from('questions').delete().eq('org_id', ORG_ID).eq('id', questionId)
    await loadQuestions()
  }

  const summary = useMemo(() => questions.length, [questions])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Sual bankı</h2>
          <p>Dinamik sualların idarə olunması.</p>
        </div>
        <div className="stat-pill">Cəmi: {summary}</div>
      </div>

      <div className="card">
        <h3>Yeni sual</h3>
        <div className="form-grid">
          <input
            className="input"
            placeholder="Sual mətni"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <input className="input" value="1–10 (scale)" disabled />
          <select
            className="input"
            value={required ? 'yes' : 'no'}
            onChange={(event) => setRequired(event.target.value === 'yes')}
          >
            <option value="yes">Məcburi</option>
            <option value="no">Optional</option>
          </select>
          <input
            className="input"
            placeholder="Kateqoriya (optional)"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
        <div className="form-row">
          <span className="hint">Sual tipi yalnız 1–10 scale olaraq sabitdir.</span>
        </div>
        <div className="actions">
          <button className="btn primary" type="button" onClick={handleCreate}>
            Yarat
          </button>
        </div>
        {status && <div className="notice">{status}</div>}
      </div>

      <div className="data-table">
        <div className="data-row header">
          <div>Mətni</div>
          <div>Tip</div>
          <div>Kateqoriya</div>
          <div></div>
        </div>
        {questions.map((question) => (
          <div className="data-row" key={question.id}>
            <div>{question.data.text}</div>
            <div>{question.data.type}</div>
            <div>{question.data.category ?? '-'}</div>
            <div>
              <button className="btn ghost" type="button" onClick={() => void handleDelete(question.id)}>
                Sil
              </button>
            </div>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  )
}
