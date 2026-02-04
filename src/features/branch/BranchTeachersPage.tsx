import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ORG_ID, supabase } from '../../lib/supabase'
import { mapDepartmentRow, mapGroupRow, mapSubjectRow, mapTeacherRow, mapTeachingAssignmentRow } from '../../lib/supabaseMappers'
import type { DepartmentDoc, GroupDoc, SubjectDoc, TeacherDoc, TeachingAssignmentDoc } from '../../lib/types'
import { createId } from '../../lib/utils'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { useAuth } from '../auth/AuthProvider'
import { BranchSelector } from './BranchSelector'
import { parseSpreadsheet } from './importUtils'
import { useBranchScope } from './useBranchScope'
import { provisionLoginUser } from './userProvisioning'

const buildFullName = (first: string, last: string) => {
  const full = `${first.trim()} ${last.trim()}`.trim()
  return full.replace(/\s+/g, ' ')
}

const splitName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? ''
  const last = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] ?? ''
  return { first, last }
}

const uploadTeacherPhoto = async (teacherId: string, file: File) => {
  const extension = file.name.split('.').pop() || 'jpg'
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const path = `teachers/${teacherId}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from('teacher-photos').upload(path, file, {
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from('teacher-photos').getPublicUrl(path)
  return data.publicUrl
}

type DocEntry<T> = { id: string; data: T }

type AssignmentDraft = {
  subjectId: string
  groupId: string
  year: number
}

export const BranchTeachersPage = () => {
  const { user } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const { branchId, setBranchId, branches, branchName, isSuperAdmin } = useBranchScope()
  const [teachers, setTeachers] = useState<Array<DocEntry<TeacherDoc>>>([])
  const [departments, setDepartments] = useState<Array<DocEntry<DepartmentDoc>>>([])
  const [subjects, setSubjects] = useState<Array<DocEntry<SubjectDoc>>>([])
  const [groups, setGroups] = useState<Array<DocEntry<GroupDoc>>>([])
  const [assignments, setAssignments] = useState<Array<DocEntry<TeachingAssignmentDoc>>>([])

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [assignmentYear, setAssignmentYear] = useState(new Date().getFullYear().toString())
  const [assignmentSubjectId, setAssignmentSubjectId] = useState('')
  const [assignmentGroupId, setAssignmentGroupId] = useState('')
  const [draftAssignments, setDraftAssignments] = useState<AssignmentDraft[]>([])

  const [filterDepartmentId, setFilterDepartmentId] = useState('')
  const [filterSubjectId, setFilterSubjectId] = useState('')
  const [filterGroupId, setFilterGroupId] = useState('')
  const [filterClassLevel, setFilterClassLevel] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editDepartmentId, setEditDepartmentId] = useState('')
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null)
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const [importDepartmentId, setImportDepartmentId] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const loadLookups = async () => {
    if (!branchId) {
      setTeachers([])
      setDepartments([])
      setGroups([])
      setAssignments([])
      return
    }

    const [teacherRes, departmentRes, subjectRes, groupRes, assignmentRes] = await Promise.all([
      supabase
        .from('teachers')
        .select('*')
        .eq('org_id', ORG_ID)
        .is('deleted_at', null)
        .eq('branch_id', branchId),
      supabase
        .from('departments')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('branch_id', branchId)
        .is('deleted_at', null),
      supabase.from('subjects').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
      supabase
        .from('groups')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('branch_id', branchId)
        .is('deleted_at', null),
      supabase
        .from('teaching_assignments')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('branch_id', branchId)
        .is('deleted_at', null),
    ])

    setTeachers((teacherRes.data ?? []).map((row) => ({ id: row.id, data: mapTeacherRow(row) })))
    setDepartments((departmentRes.data ?? []).map((row) => ({ id: row.id, data: mapDepartmentRow(row) })))
    setSubjects((subjectRes.data ?? []).map((row) => ({ id: row.id, data: mapSubjectRow(row) })))
    setGroups((groupRes.data ?? []).map((row) => ({ id: row.id, data: mapGroupRow(row) })))
    setAssignments((assignmentRes.data ?? []).map((row) => ({ id: row.id, data: mapTeachingAssignmentRow(row) })))
  }

  useEffect(() => {
    void loadLookups()
  }, [branchId])

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null)
      return
    }
    const preview = URL.createObjectURL(photoFile)
    setPhotoPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [photoFile])

  useEffect(() => {
    if (!editPhotoFile) {
      setEditPhotoPreview(null)
      return
    }
    const preview = URL.createObjectURL(editPhotoFile)
    setEditPhotoPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [editPhotoFile])

  useEffect(() => {
    if (!departmentId && departments.length > 0) {
      setDepartmentId(departments[0].id)
    }
    if (!importDepartmentId && departments.length > 0) {
      setImportDepartmentId(departments[0].id)
    }
  }, [departments, departmentId, importDepartmentId])

  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s.data])), [subjects])
  const groupMap = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.data])), [groups])
  const departmentMap = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.data])),
    [departments],
  )

  const assignmentMap = useMemo(() => {
    const map: Record<string, TeachingAssignmentDoc[]> = {}
    assignments.forEach((assignment) => {
      map[assignment.data.teacherId] = map[assignment.data.teacherId] || []
      map[assignment.data.teacherId].push(assignment.data)
    })
    return map
  }, [assignments])

  const availableGroups = useMemo(() => {
    if (!filterClassLevel) return groups
    return groups.filter((group) => group.data.classLevel === filterClassLevel)
  }, [groups, filterClassLevel])

  const filteredTeachers = useMemo(() => {
    return teachers.filter((teacher) => {
      if (filterDepartmentId && teacher.data.departmentId !== filterDepartmentId) return false
      const teacherAssignments = assignmentMap[teacher.id] ?? []
      if (filterSubjectId && !teacherAssignments.some((item) => item.subjectId === filterSubjectId)) return false
      if (filterGroupId && !teacherAssignments.some((item) => item.groupId === filterGroupId)) return false
      if (filterClassLevel) {
        const matchesClass = teacherAssignments.some((item) => groupMap[item.groupId]?.classLevel === filterClassLevel)
        if (!matchesClass) return false
      }
      return true
    })
  }, [teachers, filterDepartmentId, filterSubjectId, filterGroupId, filterClassLevel, assignmentMap, groupMap])

  const summary = useMemo(() => filteredTeachers.length, [filteredTeachers])
  const displayBranchName = branchName || 'Filial'

  const handleAddAssignment = () => {
    const year = Number(assignmentYear)
    if (!assignmentSubjectId || !assignmentGroupId || Number.isNaN(year)) {
      setStatus('Fənn, qrup və il tələb olunur')
      return
    }
    const exists = draftAssignments.some(
      (item) => item.subjectId === assignmentSubjectId && item.groupId === assignmentGroupId && item.year === year,
    )
    if (exists) return
    setDraftAssignments((prev) => [...prev, { subjectId: assignmentSubjectId, groupId: assignmentGroupId, year }])
  }

  const handleRemoveDraft = (index: number) => {
    setDraftAssignments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCreate = async () => {
    if (!branchId) {
      setStatus('Filial seçilməyib')
      return
    }
    if (!firstName.trim() || !lastName.trim()) {
      setStatus('Ad və soyad tələb olunur')
      return
    }
    if (!departmentId) {
      setStatus('Kafedra seçilməlidir')
      return
    }
    if (draftAssignments.length === 0) {
      setStatus('Ən azı bir dərs təyinatı əlavə edin')
      return
    }

    const fullName = buildFullName(firstName, lastName)

    try {
      const result = await provisionLoginUser({
        name: fullName,
        branchId,
        role: 'teacher',
        collection: 'teachers',
        docData: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          departmentId,
        },
      })

      let photoUrl: string | null = null
      if (photoFile) {
        photoUrl = await uploadTeacherPhoto(result.uid, photoFile)
        await supabase
          .from('teachers')
          .update({ photo_url: photoUrl })
          .eq('org_id', ORG_ID)
          .eq('id', result.uid)
      }

      await supabase.from('teaching_assignments').insert(
        draftAssignments.map((item) => ({
          id: createId(),
          org_id: ORG_ID,
          teacher_id: result.uid,
          group_id: item.groupId,
          subject_id: item.subjectId,
          branch_id: branchId,
          year: item.year,
        })),
      )

      setFirstName('')
      setLastName('')
      setPhotoFile(null)
      setPhotoPreview(null)
      setDraftAssignments([])
      setStatus(`Login: ${result.login} • Şifrə: ${result.password}`)
      await loadLookups()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Yaratma zamanı xəta oldu')
    }
  }

  const handleDelete = async (teacherId: string) => {
    const ok = await confirm({
      title: 'Müəllimi sil',
      message: 'Müəllimi silmək istədiyinizə əminsiniz?',
      confirmText: 'Sil',
      cancelText: 'İmtina',
      tone: 'danger',
    })
    if (!ok) return
    await supabase
      .from('teachers')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq('org_id', ORG_ID)
      .eq('id', teacherId)
    await loadLookups()
  }

  const handleEditStart = (teacher: DocEntry<TeacherDoc>) => {
    setEditingId(teacher.id)
    setEditFirstName(teacher.data.firstName ?? '')
    setEditLastName(teacher.data.lastName ?? '')
    setEditDepartmentId(teacher.data.departmentId ?? '')
    setEditPhotoFile(null)
    setEditPhotoPreview(teacher.data.photoUrl ?? null)
    setStatus(null)
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setEditFirstName('')
    setEditLastName('')
    setEditDepartmentId('')
    setEditPhotoFile(null)
    setEditPhotoPreview(null)
  }

  const handleEditSave = async () => {
    if (!editingId) return
    if (!editFirstName.trim() || !editLastName.trim()) {
      setStatus('Ad və soyad tələb olunur')
      return
    }
    if (!editDepartmentId) {
      setStatus('Kafedra seçilməlidir')
      return
    }

    setSavingEdit(true)
    try {
      const fullName = buildFullName(editFirstName, editLastName)
      let photoUrl = editPhotoPreview
      if (editPhotoFile) {
        photoUrl = await uploadTeacherPhoto(editingId, editPhotoFile)
      }

      const { error } = await supabase
        .from('teachers')
        .update({
          name: fullName,
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          department_id: editDepartmentId,
          photo_url: photoUrl ?? null,
        })
        .eq('org_id', ORG_ID)
        .eq('id', editingId)

      if (error) {
        setStatus('Yeniləmə zamanı xəta oldu')
        return
      }

      setStatus('Müəllim yeniləndi')
      setEditingId(null)
      setEditFirstName('')
      setEditLastName('')
      setEditDepartmentId('')
      setEditPhotoFile(null)
      setEditPhotoPreview(null)
      await loadLookups()
    } finally {
      setSavingEdit(false)
    }
  }

  const handleImport = async (file: File) => {
    if (!branchId) return
    if (!importDepartmentId) {
      setStatus('Import üçün kafedra seçilməlidir')
      return
    }

    const rows = await parseSpreadsheet(file)
    const existingNames = new Set(teachers.map((teacher) => teacher.data.name.toLowerCase()))
    const seen = new Set<string>()

    let missing = 0
    let duplicates = 0
    let mismatch = 0
    let created = 0
    let failed = 0

    const cleaned = rows.filter((row) => {
      if (!row.name) {
        missing += 1
        return false
      }
      if (row.branchId && row.branchId !== branchId) {
        mismatch += 1
        return false
      }
      const key = row.name.toLowerCase()
      if (seen.has(key) || existingNames.has(key)) {
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

    for (const row of cleaned) {
      try {
        const parsed = splitName(row.name)
        await provisionLoginUser({
          name: buildFullName(parsed.first, parsed.last),
          branchId,
          role: 'teacher',
          collection: 'teachers',
          docData: {
            firstName: parsed.first,
            lastName: parsed.last,
            departmentId: importDepartmentId,
          },
        })
        created += 1
      } catch (error) {
        failed += 1
        setStatus(error instanceof Error ? error.message : 'Yaratma zamanı xəta oldu')
      }
    }

    setStatus(
      `Bulk import tamamlandı. Created: ${created}, Failed: ${failed}, Missing: ${missing}, Duplicate: ${duplicates}, Branch mismatch: ${mismatch}`,
    )
    await loadLookups()
  }

  return (
    <div className="panel">
      {isSuperAdmin && (
        <BranchSelector branchId={branchId} branches={branches} onChange={setBranchId} />
      )}

      <div className="panel-header">
        <div>
          <h2>Müəllimlər</h2>
          <p>Filiala aid müəllim siyahısı və dərs təyinatları.</p>
        </div>
        <div className="stat-pill">Cəmi: {summary}</div>
      </div>

      <div className="card">
        <h3>Yeni müəllim</h3>
        <div className="form-grid">
          <input
            className="input"
            placeholder="Ad"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <input
            className="input"
            placeholder="Soyad"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
          <select className="input" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">Kafedra seçin</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.data.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
          />
        </div>
        {photoPreview && (
          <div className="form-row">
            <img src={photoPreview} alt="Müəllim şəkli" style={{ width: 72, height: 72, borderRadius: 16 }} />
          </div>
        )}
        <div className="divider" />
        <h4>Dərs təyinatı</h4>
        <div className="filters">
          <select className="input" value={filterSubjectId} onChange={(event) => setFilterSubjectId(event.target.value)}>
            <option value="">Fənn filtri</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.data.name}
              </option>
            ))}
          </select>
          <select className="input" value={filterGroupId} onChange={(event) => setFilterGroupId(event.target.value)}>
            <option value="">Qrup filtri</option>
            {availableGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.data.name}
              </option>
            ))}
          </select>
          <select className="input" value={filterClassLevel} onChange={(event) => setFilterClassLevel(event.target.value)}>
            <option value="">Sinif səviyyəsi</option>
            {[...new Set(groups.map((group) => group.data.classLevel))].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <select
            className="input"
            value={assignmentSubjectId}
            onChange={(event) => setAssignmentSubjectId(event.target.value)}
          >
            <option value="">Fənn seçin</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.data.name}
              </option>
            ))}
          </select>
          <select className="input" value={assignmentGroupId} onChange={(event) => setAssignmentGroupId(event.target.value)}>
            <option value="">Qrup seçin</option>
            {availableGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.data.name} ({group.data.classLevel})
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            placeholder="İl"
            value={assignmentYear}
            onChange={(event) => setAssignmentYear(event.target.value)}
          />
          <button className="btn" type="button" onClick={handleAddAssignment}>
            Əlavə et
          </button>
        </div>
        {draftAssignments.length > 0 && (
          <div className="list">
            {draftAssignments.map((item, index) => (
              <div className="list-item" key={`${item.subjectId}_${item.groupId}_${item.year}_${index}`}>
                <div>
                  <div className="list-title">
                    {subjectMap[item.subjectId]?.name ?? item.subjectId} • {groupMap[item.groupId]?.name ?? item.groupId}
                  </div>
                  <div className="list-meta">{item.year}</div>
                </div>
                <button className="btn ghost" type="button" onClick={() => handleRemoveDraft(index)}>
                  Sil
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="form-row">
          <button className="btn primary" type="button" onClick={handleCreate} disabled={!branchId}>
            Yarat
          </button>
          <span className="hint">Şifrə default olaraq login ilə eynidir.</span>
        </div>
        {status && <div className="notice">{status}</div>}
      </div>

      {editingId && (
        <div className="card">
          <h3>Müəllimi redaktə et</h3>
          <div className="form-grid">
            <input
              className="input"
              placeholder="Ad"
              value={editFirstName}
              onChange={(event) => setEditFirstName(event.target.value)}
            />
            <input
              className="input"
              placeholder="Soyad"
              value={editLastName}
              onChange={(event) => setEditLastName(event.target.value)}
            />
            <select className="input" value={editDepartmentId} onChange={(event) => setEditDepartmentId(event.target.value)}>
              <option value="">Kafedra seçin</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.data.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(event) => setEditPhotoFile(event.target.files?.[0] ?? null)}
            />
          </div>
          {editPhotoPreview && (
            <div className="form-row">
              <img src={editPhotoPreview} alt="Müəllim şəkli" style={{ width: 72, height: 72, borderRadius: 16 }} />
            </div>
          )}
          <div className="form-row">
            <button className="btn primary" type="button" onClick={handleEditSave} disabled={savingEdit}>
              Yadda saxla
            </button>
            <button className="btn ghost" type="button" onClick={handleEditCancel} disabled={savingEdit}>
              Ləğv et
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Bulk import</h3>
        <div className="form-row">
          <select
            className="input"
            value={importDepartmentId}
            onChange={(event) => setImportDepartmentId(event.target.value)}
          >
            <option value="">Kafedra seçin</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.data.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleImport(file)
            }}
          />
          <span className="hint">Şablon sütunları: name, branchId (optional)</span>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div>
            <h3>Müəllim siyahısı</h3>
            <p>Filial: {displayBranchName}</p>
          </div>
          <div className="filters">
            <select className="input" value={filterDepartmentId} onChange={(event) => setFilterDepartmentId(event.target.value)}>
              <option value="">Kafedra</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.data.name}
                </option>
              ))}
            </select>
            <select className="input" value={filterSubjectId} onChange={(event) => setFilterSubjectId(event.target.value)}>
              <option value="">Fənn</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.data.name}
                </option>
              ))}
            </select>
            <select className="input" value={filterGroupId} onChange={(event) => setFilterGroupId(event.target.value)}>
              <option value="">Qrup</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.data.name}
                </option>
              ))}
            </select>
            <select className="input" value={filterClassLevel} onChange={(event) => setFilterClassLevel(event.target.value)}>
              <option value="">Sinif səviyyəsi</option>
              {[...new Set(groups.map((group) => group.data.classLevel))].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table">
          <div className="table-row header">
            <div>Müəllim</div>
            <div>Kafedra</div>
            <div>Login</div>
            <div>Dərslər</div>
            <div></div>
          </div>
          {filteredTeachers.map((teacher) => {
            const teacherAssignments = assignmentMap[teacher.id] ?? []
            return (
              <div className="table-row" key={teacher.id}>
                <div className="stack">
                  <div className="list-title">{teacher.data.name}</div>
                  {teacher.data.photoUrl && (
                    <img src={teacher.data.photoUrl} alt="Şəkil" style={{ width: 48, height: 48, borderRadius: 12 }} />
                  )}
                </div>
                <div>{departmentMap[teacher.data.departmentId ?? '']?.name ?? '-'}</div>
                <div>{teacher.data.login ?? '-'}</div>
                <div>{teacherAssignments.length} təyinat</div>
                <div className="actions">
                  <button className="btn" type="button" onClick={() => handleEditStart(teacher)}>
                    Redaktə
                  </button>
                  <Link className="btn ghost" to={`/branch/assignments?teacherId=${teacher.id}`}>
                    Təyinat yarat
                  </Link>
                  <button className="btn ghost" type="button" onClick={() => void handleDelete(teacher.id)}>
                    Sil
                  </button>
                </div>
              </div>
            )
          })}
          {filteredTeachers.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
        </div>
      </div>
      {dialog}
    </div>
  )
}
