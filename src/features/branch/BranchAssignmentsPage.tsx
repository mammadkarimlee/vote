import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ORG_ID, supabase } from '../../lib/supabase'
import {
  mapGroupRow,
  mapSubjectRow,
  mapTeacherRow,
  mapTeachingAssignmentRow,
} from '../../lib/supabaseMappers'
import type { GroupDoc, SubjectDoc, TeacherDoc, TeachingAssignmentDoc } from '../../lib/types'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { useAuth } from '../auth/AuthProvider'
import { BranchSelector } from './BranchSelector'
import { parseSpreadsheet } from './importUtils'
import { useBranchScope } from './useBranchScope'

export const BranchAssignmentsPage = () => {
  const { user } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope()
  const [searchParams] = useSearchParams()
  const [teachers, setTeachers] = useState<Array<{ id: string; data: TeacherDoc }>>([])
  const [groups, setGroups] = useState<Array<{ id: string; data: GroupDoc }>>([])
  const [subjects, setSubjects] = useState<Array<{ id: string; data: SubjectDoc }>>([])
  const [assignments, setAssignments] = useState<Array<{ id: string; data: TeachingAssignmentDoc }>>([])
  const [teacherId, setTeacherId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [status, setStatus] = useState<string | null>(null)

  const preselectedTeacherId = searchParams.get('teacherId') ?? ''

  const loadData = async () => {
    if (!branchId) {
      setTeachers([])
      setGroups([])
      setSubjects([])
      setAssignments([])
      return
    }

    let teachersQuery = supabase.from('teachers').select('*').eq('org_id', ORG_ID).is('deleted_at', null)
    let groupsQuery = supabase.from('groups').select('*').eq('org_id', ORG_ID).is('deleted_at', null)
    let assignmentsQuery = supabase
      .from('teaching_assignments')
      .select('*')
      .eq('org_id', ORG_ID)
      .is('deleted_at', null)
    const subjectsQuery = supabase.from('subjects').select('*').eq('org_id', ORG_ID).is('deleted_at', null)

    teachersQuery = teachersQuery.or(`branch_id.eq.${branchId},branch_ids.cs.{${branchId}}`)
    groupsQuery = groupsQuery.eq('branch_id', branchId)
    assignmentsQuery = assignmentsQuery.eq('branch_id', branchId)

    const [teachersRes, groupsRes, subjectsRes, assignmentsRes] = await Promise.all([
      teachersQuery,
      groupsQuery,
      subjectsQuery,
      assignmentsQuery,
    ])

    const teacherDocs = (teachersRes.data ?? []).map((row) => ({ id: row.id, data: mapTeacherRow(row) }))
    const groupDocs = (groupsRes.data ?? []).map((row) => ({ id: row.id, data: mapGroupRow(row) }))
    const subjectDocs = (subjectsRes.data ?? []).map((row) => ({ id: row.id, data: mapSubjectRow(row) }))
    const assignmentDocs = (assignmentsRes.data ?? []).map((row) => ({
      id: row.id,
      data: mapTeachingAssignmentRow(row),
    }))

    setTeachers(
      teacherDocs.filter((teacher) => {
        if (teacher.data.branchId === branchId) return true
        return (teacher.data.branchIds ?? []).includes(branchId)
      }),
    )
    setGroups(groupDocs.filter((group) => group.data.branchId === branchId))
    setSubjects(subjectDocs)
    setAssignments(assignmentDocs.filter((assignment) => assignment.data.branchId === branchId))
  }

  useEffect(() => {
    void loadData()
  }, [branchId])

  useEffect(() => {
    if (!teacherId && preselectedTeacherId) {
      setTeacherId(preselectedTeacherId)
    }
  }, [preselectedTeacherId, teacherId])

  const handleCreate = async () => {
    if (!branchId) {
      setStatus('Filial seçilməyib. Davam etmək üçün filial seçin.')
      return
    }
    if (!teacherId || !groupId || !subjectId || !year) {
      setStatus('Bütün sahələri doldurun')
      return
    }

    const { error } = await supabase.from('teaching_assignments').insert({
      org_id: ORG_ID,
      teacher_id: teacherId,
      group_id: groupId,
      subject_id: subjectId,
      branch_id: branchId,
      year: Number(year),
    })

    if (error) {
      setStatus(error.message || 'Yaratma zamanı xəta oldu')
      return
    }

    setTeacherId('')
    setGroupId('')
    setSubjectId('')
    setStatus('Təyinat yaradıldı')
    await loadData()
  }

  const handleDelete = async (assignmentId: string) => {
    const ok = await confirm({
      title: 'Təyinatı sil',
      message: 'Təyinatı silmək istədiyinizə əminsiniz?',
      confirmText: 'Sil',
      cancelText: 'İmtina',
      tone: 'danger',
    })
    if (!ok) return
    await supabase
      .from('teaching_assignments')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq('org_id', ORG_ID)
      .eq('id', assignmentId)
    await loadData()
  }

  const handleImport = async (file: File) => {
    if (!branchId) {
      setStatus('Filial seçilməyib. Import üçün filial seçin.')
      return
    }
    const rows = await parseSpreadsheet(file)
    const existingKeys = new Set(
      assignments.map(
        (assignment) =>
          `${assignment.data.teacherId}|${assignment.data.groupId}|${assignment.data.subjectId}|${assignment.data.year}`,
      ),
    )
    const seen = new Set<string>()

    let missing = 0
    let duplicates = 0
    let mismatch = 0

    const cleaned = rows.filter((row) => {
      if (!row.teacherId || !row.groupId || !row.subjectId || !row.year) {
        missing += 1
        return false
      }
      if (row.branchId && row.branchId !== branchId) {
        mismatch += 1
        return false
      }
      const key = `${row.teacherId}|${row.groupId}|${row.subjectId}|${row.year}`
      if (seen.has(key) || existingKeys.has(key)) {
        duplicates += 1
        return false
      }
      seen.add(key)
      return true
    })

    if (cleaned.length === 0) {
      setStatus(`Fayl boşdur. Missing: ${missing}, Duplicate: ${duplicates}, Branch mismatch: ${mismatch}`)
      return
    }

    const { error } = await supabase.from('teaching_assignments').insert(
      cleaned.map((row) => ({
        org_id: ORG_ID,
        teacher_id: row.teacherId,
        group_id: row.groupId,
        subject_id: row.subjectId,
        branch_id: branchId,
        year: Number(row.year),
      })),
    )

    if (error) {
      setStatus(error.message || 'Bulk import zamanı xəta oldu')
      return
    }

    setStatus(`Bulk import tamamlandı. Missing: ${missing}, Duplicate: ${duplicates}, Branch mismatch: ${mismatch}`)
    await loadData()
  }

  const summary = useMemo(() => assignments.length, [assignments])
  const missingSetup = useMemo(() => {
    const missing: string[] = []
    if (subjects.length === 0) missing.push('fənn')
    if (teachers.length === 0) missing.push('müəllim')
    if (groups.length === 0) missing.push('qrup')
    return missing
  }, [subjects.length, teachers.length, groups.length])

  const canCreate = missingSetup.length === 0

  return (
    <div className="panel branch-page">
      <div className="page-hero">
        <div className="page-hero__content">
          <div className="eyebrow">Təyinat idarəetməsi</div>
          <h1>
            Dərs təyinatları
            <span
              className="info-tip"
              data-tip="Müəllim–qrup–fənn–il əlaqəsi BİQ nəticələri və sorğu tapşırıqlarını düzgün hesablamaq üçün lazımdır."
            >
              i
            </span>
          </h1>
          <p>Müəllim, qrup, fənn və il üzrə əlaqə cədvəli.</p>
        </div>
        <div className="page-hero__aside">
          {isSuperAdmin && (
            <BranchSelector branchId={branchId} branches={branches} onChange={setBranchId} />
          )}
          <div className="stat-pill">Cəmi: {summary}</div>
        </div>
      </div>
      {isSuperAdmin && !branchId && (
        <div className="notice">Filial seçilməyib. Davam etmək üçün filial seçin.</div>
      )}

      {missingSetup.length > 0 && (
        <div className="notice">
          Əvvəlcə {missingSetup.join(', ')} yaradın. Sonra müəllimi qrupa təyin edə bilərsiniz.{' '}
          <Link className="link" to="/branch/subjects">Fənnlər</Link> •{' '}
          <Link className="link" to="/branch/teachers">Müəllimlər</Link> •{' '}
          <Link className="link" to="/branch/groups">Qruplar</Link>
        </div>
      )}

      <div className="page-grid">
        <div className="card">
          <h3>Yeni təyinat</h3>
          <div className="form-grid">
            <select className="input" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
              <option value="">Müəllim seçin</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.data.name}
                </option>
              ))}
            </select>
            <select className="input" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              <option value="">Qrup seçin</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.data.name}
                </option>
              ))}
            </select>
            <select className="input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              <option value="">Fənn seçin</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.data.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="İl"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
            <button className="btn primary" type="button" onClick={handleCreate} disabled={!canCreate || !branchId}>
              Yarat
            </button>
          </div>
          <div className="form-row">
            <input
              className="input"
              type="file"
              accept=".csv,.xlsx"
              disabled={!canCreate || !branchId}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleImport(file)
              }}
            />
            <span className="hint">Şablon sütunları: teacherId, groupId, subjectId, year, branchId (optional)</span>
          </div>
          {status && <div className="notice">{status}</div>}
        </div>

        <div className="card">
          <div className="section-header">
            <div>
              <div className="section-kicker">Siyahı</div>
              <div className="section-title">Dərs təyinatları</div>
            </div>
          </div>
          <div className="data-table">
            <div className="data-row header">
              <div>Müəllim</div>
              <div>Qrup</div>
              <div>Fənn</div>
              <div>İl</div>
              <div></div>
            </div>
            {assignments.map((assignment) => (
              <div className="data-row" key={assignment.id}>
                <div>
                  {teachers.find((teacher) => teacher.id === assignment.data.teacherId)?.data.name ??
                    assignment.data.teacherId}
                </div>
                <div>
                  {groups.find((group) => group.id === assignment.data.groupId)?.data.name ?? assignment.data.groupId}
                </div>
                <div>
                  {subjects.find((subject) => subject.id === assignment.data.subjectId)?.data.name ??
                    assignment.data.subjectId}
                </div>
                <div>{assignment.data.year}</div>
                <div>
                  <button className="btn ghost" type="button" onClick={() => void handleDelete(assignment.id)}>
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {dialog}
    </div>
  )
}
