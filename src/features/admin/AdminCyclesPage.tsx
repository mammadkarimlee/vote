import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ORG_ID, supabase } from '../../lib/supabase'
import {
  mapBranchRow,
  mapGroupRow,
  mapManagementAssignmentRow,
  mapQuestionRow,
  mapQuestionSetRow,
  mapStudentRow,
  mapSubjectRow,
  mapSurveyCycleRow,
  mapTeacherRow,
  mapTeachingAssignmentRow,
  mapUserRow,
} from '../../lib/supabaseMappers'
import type {
  BranchDoc,
  QuestionDoc,
  SurveyCycleDoc,
  TargetFlow,
  TaskDoc,
} from '../../lib/types'
import { chunkArray, toJsDate } from '../../lib/utils'

const flows: TargetFlow[] = ['student_teacher', 'teacher_management', 'management_teacher']
const flowLabels: Record<TargetFlow, string> = {
  student_teacher: 'Şagird → Müəllim',
  teacher_management: 'Müəllim → Rəhbərlik',
  management_teacher: 'Rəhbərlik → Müəllim',
}

const buildTaskId = (task: {
  cycleId: string
  raterUid: string
  targetType: string
  targetId: string
  groupId?: string | null
  subjectId?: string | null
}) =>
  [
    task.cycleId,
    task.raterUid,
    task.targetType,
    task.targetId,
    task.groupId ?? 'all',
    task.subjectId ?? 'all',
  ].join('_')

export const AdminCyclesPage = () => {
  const [cycles, setCycles] = useState<Array<{ id: string; data: SurveyCycleDoc }>>([])
  const [questions, setQuestions] = useState<Array<{ id: string; data: QuestionDoc }>>([])
  const [branches, setBranches] = useState<Array<{ id: string; data: BranchDoc }>>([])
  const [selectedCycleId, setSelectedCycleId] = useState<string>('')
  const [selectedFlow, setSelectedFlow] = useState<TargetFlow>('student_teacher')
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([])
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [startAt, setStartAt] = useState('')
  const [durationDays, setDurationDays] = useState('7')
  const [thresholdY, setThresholdY] = useState('3')
  const [thresholdP, setThresholdP] = useState('3')
  const [status, setStatus] = useState<string | null>(null)

  const loadCycles = async () => {
    const { data, error } = await supabase.from('survey_cycles').select('*').eq('org_id', ORG_ID)
    if (error) return
    const items = (data ?? []).map((row) => ({ id: row.id, data: mapSurveyCycleRow(row) }))
    setCycles(items)
  }

  const loadQuestions = async () => {
    const { data, error } = await supabase.from('questions').select('*').eq('org_id', ORG_ID)
    if (error) return
    const items = (data ?? []).map((row) => ({ id: row.id, data: mapQuestionRow(row) }))
    setQuestions(items)
  }

  const loadBranches = async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('org_id', ORG_ID)
      .is('deleted_at', null)
    if (error) return
    const items = (data ?? []).map((row) => ({ id: row.id, data: mapBranchRow(row) }))
    setBranches(items)
  }

  useEffect(() => {
    void loadCycles()
    void loadQuestions()
    void loadBranches()
  }, [])

  useEffect(() => {
    const loadQuestionSet = async () => {
      if (!selectedCycleId) return
      const { data, error } = await supabase
        .from('question_sets')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('cycle_id', selectedCycleId)
        .eq('target_flow', selectedFlow)
        .maybeSingle()

      if (error || !data) {
        setSelectedQuestionIds([])
        return
      }

      const mapped = mapQuestionSetRow(data)
      setSelectedQuestionIds(mapped.questionIds ?? [])
    }

    void loadQuestionSet()
  }, [selectedCycleId, selectedFlow])

  const handleCreate = async () => {
    if (!year || !startAt || !durationDays) {
      setStatus('Bütün sahələri doldurun')
      return
    }

    const startDate = new Date(startAt)
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + Number(durationDays))

    const { error } = await supabase.from('survey_cycles').insert({
      org_id: ORG_ID,
      branch_ids: selectedBranchIds.length > 0 ? selectedBranchIds : null,
      year: Number(year),
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      duration_days: Number(durationDays),
      status: 'DRAFT',
      threshold_y: Number(thresholdY),
      threshold_p: Number(thresholdP),
    })

    if (error) {
      setStatus('Yaratma zamanı xəta oldu')
      return
    }

    setStatus('Sorğu dövrü yaradıldı')
    await loadCycles()
  }

  const handleStatusChange = async (cycleId: string, statusValue: SurveyCycleDoc['status']) => {
    const { error } = await supabase
      .from('survey_cycles')
      .update({ status: statusValue })
      .eq('org_id', ORG_ID)
      .eq('id', cycleId)
    if (error) {
      setStatus('Status yenilənmədi')
      return
    }
    await loadCycles()
  }

  const handleSaveQuestionSet = async () => {
    if (!selectedCycleId) return

    const { error } = await supabase.from('question_sets').upsert(
      {
        org_id: ORG_ID,
        cycle_id: selectedCycleId,
        target_flow: selectedFlow,
        question_ids: selectedQuestionIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,cycle_id,target_flow' },
    )

    if (error) {
      setStatus('Sual seti yenilənmədi')
      return
    }
    setStatus('Sual seti yeniləndi')
  }

  const handleCopyFromPreviousCycle = async () => {
    if (!selectedCycle) return

    const prevCycle = [...cycles]
      .filter((cycle) => cycle.data.year < selectedCycle.data.year)
      .sort((a, b) => b.data.year - a.data.year)[0]

    if (!prevCycle) {
      setStatus('Əvvəlki sorğu dövrü tapılmadı')
      return
    }

    const { data, error } = await supabase
      .from('question_sets')
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('cycle_id', prevCycle.id)

    if (error || !data || data.length === 0) {
      setStatus('Əvvəlki sorğu dövrü üçün sual seti yoxdur')
      return
    }

    const nowIso = new Date().toISOString()
    const rows = data.map((row) => {
      const mapped = mapQuestionSetRow(row)
      return {
        org_id: ORG_ID,
        cycle_id: selectedCycle.id,
        target_flow: mapped.targetFlow,
        question_ids: mapped.questionIds ?? [],
        updated_at: nowIso,
      }
    })

    const { error: upsertError } = await supabase.from('question_sets').upsert(rows, {
      onConflict: 'org_id,cycle_id,target_flow',
    })

    if (upsertError) {
      setStatus('Sual setləri köçürülmədi')
      return
    }

    const currentFlowRow = rows.find((row) => row.target_flow === selectedFlow)
    if (currentFlowRow) setSelectedQuestionIds(currentFlowRow.question_ids ?? [])

    setStatus(`Sual setləri ${prevCycle.data.year} ilindən köçürüldü`)
  }

  const generateTasksForCycle = async (cycleId: string) => {
    setStatus('Tapşırıqlar hazırlanır...')

    const [
      usersRes,
      studentsRes,
      teachersRes,
      groupsRes,
      subjectsRes,
      assignmentsRes,
      managementRes,
      existingTasksRes,
    ] = await Promise.all([
      supabase.from('users').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
      supabase.from('students').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
      supabase.from('teachers').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
      supabase.from('groups').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
      supabase.from('subjects').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
      supabase.from('teaching_assignments').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
      supabase.from('management_assignments').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
      supabase.from('tasks').select('id').eq('org_id', ORG_ID).eq('cycle_id', cycleId),
    ])

    if (
      usersRes.error ||
      studentsRes.error ||
      teachersRes.error ||
      groupsRes.error ||
      subjectsRes.error ||
      assignmentsRes.error ||
      managementRes.error ||
      existingTasksRes.error
    ) {
      setStatus('Tapşırıqlar hazırlanmadı')
      return
    }

    const users = (usersRes.data ?? []).map((row) => ({ id: row.id, data: mapUserRow(row) }))
    const students = (studentsRes.data ?? []).map((row) => ({ id: row.id, data: mapStudentRow(row) }))
    const teachers = (teachersRes.data ?? []).map((row) => ({ id: row.id, data: mapTeacherRow(row) }))
    const groups = (groupsRes.data ?? []).map((row) => ({ id: row.id, data: mapGroupRow(row) }))
    const subjects = (subjectsRes.data ?? []).map((row) => ({ id: row.id, data: mapSubjectRow(row) }))
    const assignments = (assignmentsRes.data ?? []).map((row) => ({
      id: row.id,
      data: mapTeachingAssignmentRow(row),
    }))
    const managementAssignments = (managementRes.data ?? []).map((row) => ({
      id: row.id,
      data: mapManagementAssignmentRow(row),
    }))

    const existingTaskIds = new Set((existingTasksRes.data ?? []).map((row) => row.id as string))
    const cycle = cycles.find((item) => item.id === cycleId)?.data
    const cycleYear = cycle?.year ?? new Date().getFullYear()
    const branchScope = cycle?.branchIds && cycle.branchIds.length > 0 ? new Set(cycle.branchIds) : null

    const inBranchScope = (branchId?: string | null) => {
      if (!branchScope) return true
      if (!branchId) return false
      return branchScope.has(branchId)
    }

    const usersScoped = branchScope ? users.filter((user) => inBranchScope(user.data.branchId)) : users
    const studentsScoped = branchScope ? students.filter((student) => inBranchScope(student.data.branchId)) : students
    const teachersScoped = branchScope
      ? teachers.filter((teacher) => {
          if (inBranchScope(teacher.data.branchId)) return true
          return (teacher.data.branchIds ?? []).some((id) => branchScope.has(id))
        })
      : teachers
    const groupsScoped = branchScope ? groups.filter((group) => inBranchScope(group.data.branchId)) : groups
    const assignmentsScoped = branchScope
      ? assignments.filter((assignment) => inBranchScope(assignment.data.branchId))
      : assignments
    const managementAssignmentsScoped = branchScope
      ? managementAssignments.filter((assignment) => inBranchScope(assignment.data.branchId))
      : managementAssignments

    const assignmentYears = Array.from(new Set(assignmentsScoped.map((assignment) => assignment.data.year))).sort(
      (a, b) => a - b,
    )
    const assignmentYear =
      assignmentYears.length === 0
        ? null
        : assignmentYears.includes(cycleYear)
          ? cycleYear
          : assignmentYears[assignmentYears.length - 1]

    const managementYears = Array.from(
      new Set(managementAssignmentsScoped.map((assignment) => assignment.data.year)),
    ).sort((a, b) => a - b)
    const managementYear =
      managementYears.length === 0
        ? null
        : managementYears.includes(cycleYear)
          ? cycleYear
          : managementYears[managementYears.length - 1]

    const groupMap = Object.fromEntries(groupsScoped.map((group) => [group.id, group.data]))
    const subjectMap = Object.fromEntries(subjects.map((subject) => [subject.id, subject.data]))
    const teacherMap = Object.fromEntries(teachersScoped.map((teacher) => [teacher.id, teacher.data]))
    const managerMap = usersScoped.reduce<Record<string, string>>((acc, user) => {
      if (user.data.role === 'manager') {
        acc[user.id] = user.data.displayName ?? user.data.login ?? user.id
      }
      return acc
    }, {})

    const tasksToCreate: Array<{ id: string; data: TaskDoc }> = []

    if (!assignmentYear) {
      setStatus('Tapşırıq yaradılmadı: dərs təyinatı tapılmadı')
      return
    }

    const assignmentsForYear = assignmentsScoped.filter((assignment) => assignment.data.year === assignmentYear)
    const managementForYear = managementYear
      ? managementAssignmentsScoped.filter((assignment) => assignment.data.year === managementYear)
      : []

    const studentUsers = usersScoped.filter((user) => user.data.role === 'student')
    studentUsers.forEach((user) => {
      const student = studentsScoped.find(
        (studentDoc) => studentDoc.id === user.id || studentDoc.data.uid === user.id,
      )
      if (!student) return
      const studentAssignments = assignmentsForYear.filter(
        (assignment) => assignment.data.groupId === student.data.groupId,
      )
      studentAssignments.forEach((assignment) => {
        const task: TaskDoc = {
          cycleId,
          raterUid: user.id,
          raterRole: 'student',
          targetType: 'teacher',
          targetId: assignment.data.teacherId,
          targetName: teacherMap[assignment.data.teacherId]?.name ?? null,
          branchId: assignment.data.branchId,
          groupId: assignment.data.groupId,
          subjectId: assignment.data.subjectId,
          groupName: groupMap[assignment.data.groupId]?.name ?? null,
          subjectName: subjectMap[assignment.data.subjectId]?.name ?? null,
          status: 'OPEN',
        }
        const taskId = buildTaskId({
          cycleId,
          raterUid: user.id,
          targetType: 'teacher',
          targetId: assignment.data.teacherId,
          groupId: assignment.data.groupId,
          subjectId: assignment.data.subjectId,
        })
        if (!existingTaskIds.has(taskId)) {
          tasksToCreate.push({ id: taskId, data: task })
        }
      })
    })

    const teacherUsers = usersScoped.filter((user) => user.data.role === 'teacher')
    teacherUsers.forEach((user) => {
      if (!user.data.branchId) return
      const managers = managementForYear.filter((assignment) => assignment.data.branchId === user.data.branchId)
      managers.forEach((assignment) => {
        const task: TaskDoc = {
          cycleId,
          raterUid: user.id,
          raterRole: 'teacher',
          targetType: 'manager',
          targetId: assignment.data.managerUid,
          targetName: managerMap[assignment.data.managerUid] ?? null,
          branchId: assignment.data.branchId,
          status: 'OPEN',
        }
        const taskId = buildTaskId({
          cycleId,
          raterUid: user.id,
          targetType: 'manager',
          targetId: assignment.data.managerUid,
        })
        if (!existingTaskIds.has(taskId)) {
          tasksToCreate.push({ id: taskId, data: task })
        }
      })
    })

    const managerUsers = usersScoped.filter((user) => user.data.role === 'manager')
    managerUsers.forEach((user) => {
      if (!user.data.branchId) return
      const managerBranchId = user.data.branchId
      const branchTeachers = teachersScoped.filter((teacher) => {
        if (teacher.data.branchId === managerBranchId) return true
        return (teacher.data.branchIds ?? []).includes(managerBranchId)
      })
      branchTeachers.forEach((teacher) => {
        const task: TaskDoc = {
          cycleId,
          raterUid: user.id,
          raterRole: 'manager',
          targetType: 'teacher',
          targetId: teacher.id,
          targetName: teacherMap[teacher.id]?.name ?? null,
          branchId: managerBranchId,
          status: 'OPEN',
        }
        const taskId = buildTaskId({
          cycleId,
          raterUid: user.id,
          targetType: 'teacher',
          targetId: teacher.id,
        })
        if (!existingTaskIds.has(taskId)) {
          tasksToCreate.push({ id: taskId, data: task })
        }
      })
    })

    const warnings: string[] = []
    if (assignmentYear !== cycleYear) {
      warnings.push(`Dərs təyinatı ${assignmentYear} ilindən istifadə olundu`)
    }
    if (managementYear && managementYear !== cycleYear) {
      warnings.push(`Rəhbərlik təyinatı ${managementYear} ilindən istifadə olundu`)
    }

    if (tasksToCreate.length === 0) {
      if (existingTaskIds.size > 0) {
        setStatus(`Yeni tapşırıq yoxdur. Mövcud tapşırıqlar: ${existingTaskIds.size}`)
        return
      }
      const reasons: string[] = []
      if (studentsScoped.length === 0) reasons.push('şagird tapılmadı')
      if (teachersScoped.length === 0) reasons.push('müəllim tapılmadı')
      if (assignmentsScoped.length === 0) reasons.push('dərs təyinatı yoxdur')
      if (managementAssignmentsScoped.length === 0) reasons.push('rəhbərlik təyinatı yoxdur')
      const reasonText = reasons.length > 0 ? `: ${reasons.join(', ')}` : ''
      setStatus(`Tapşırıq yaradılmadı${reasonText}`)
      return
    }

    const batches = chunkArray(tasksToCreate, 400)
    for (const chunk of batches) {
      const rows = chunk.map((item) => ({
        id: item.id,
        org_id: ORG_ID,
        cycle_id: item.data.cycleId,
        rater_id: item.data.raterUid,
        rater_role: item.data.raterRole,
        target_type: item.data.targetType,
        target_id: item.data.targetId,
        target_name: item.data.targetName ?? null,
        branch_id: item.data.branchId,
        group_id: item.data.groupId ?? null,
        subject_id: item.data.subjectId ?? null,
        group_name: item.data.groupName ?? null,
        subject_name: item.data.subjectName ?? null,
        status: item.data.status,
      }))
      const { error } = await supabase.from('tasks').insert(rows)
      if (error) {
        setStatus('Tapşırıqlar hazırlanmadı')
        return
      }
    }

    const warningText = warnings.length > 0 ? `. ${warnings.join('. ')}` : ''
    setStatus(`Tapşırıqlar hazırdır: ${tasksToCreate.length}${warningText}`)
  }

  const selectedCycle = useMemo(
    () => cycles.find((cycle) => cycle.id === selectedCycleId),
    [cycles, selectedCycleId],
  )

  const branchMap = useMemo(() => Object.fromEntries(branches.map((branch) => [branch.id, branch.data])), [branches])

  const summary = useMemo(() => cycles.length, [cycles])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Sorğu dövrləri</h2>
          <p>İllik sorğuların yaradılması və açılıb-bağlanması.</p>
        </div>
        <div className="stat-pill">Cəmi: {summary}</div>
      </div>

      <div className="card">
        <h3>Yeni sorğu dövrü</h3>
        <div className="form-grid">
          <input className="input" placeholder="İl" value={year} onChange={(event) => setYear(event.target.value)} />
          <input
            className="input"
            type="date"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
          />
          <input
            className="input"
            placeholder="Açıq qalma (gün)"
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
          />
          <input
            className="input"
            placeholder="Risk y (orta < y)"
            value={thresholdY}
            onChange={(event) => setThresholdY(event.target.value)}
          />
          <input
            className="input"
            placeholder="p (ay müşahidə)"
            value={thresholdP}
            onChange={(event) => setThresholdP(event.target.value)}
          />
          <button className="btn primary" type="button" onClick={handleCreate}>
            Yarat
          </button>
        </div>
        <div className="field">
          <span className="label">Filiallar (boş buraxsanız bütün filiallar)</span>
          <div className="checkbox-grid">
            {branches.map((branch) => (
              <label key={branch.id} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedBranchIds.includes(branch.id)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedBranchIds((prev) => [...prev, branch.id])
                    } else {
                      setSelectedBranchIds((prev) => prev.filter((id) => id !== branch.id))
                    }
                  }}
                />
                <span>{branch.data.name}</span>
              </label>
            ))}
          </div>
        </div>
        {status && <div className="notice">{status}</div>}
      </div>

      <div className="table">
        <div className="table-row header">
          <div>İl</div>
          <div>Başlanğıc</div>
          <div>Bitmə</div>
          <div>Filiallar</div>
          <div>Vəziyyət</div>
          <div></div>
        </div>
        {cycles.map((cycle) => {
          const startDate = toJsDate(cycle.data.startAt)
          const endDate = toJsDate(cycle.data.endAt)
          const branchNames =
            cycle.data.branchIds && cycle.data.branchIds.length > 0
              ? cycle.data.branchIds.map((id) => branchMap[id]?.name ?? id).join(', ')
              : 'Bütün filiallar'
          return (
            <div className="table-row" key={cycle.id}>
              <div>{cycle.data.year}</div>
              <div>{startDate ? startDate.toLocaleDateString('az-AZ') : '-'}</div>
              <div>{endDate ? endDate.toLocaleDateString('az-AZ') : '-'}</div>
              <div>{branchNames}</div>
              <div>{cycle.data.status}</div>
              <div className="actions">
                <button className="btn ghost" type="button" onClick={() => setSelectedCycleId(cycle.id)}>
                  Seç
                </button>
                <Link className="btn ghost" to={`/admin/cycles/${cycle.id}`}>
                  Detallara bax
                </Link>
                {cycle.data.status !== 'OPEN' && (
                  <button className="btn" type="button" onClick={() => void handleStatusChange(cycle.id, 'OPEN')}>
                    Aç
                  </button>
                )}
                {cycle.data.status !== 'CLOSED' && (
                  <button className="btn" type="button" onClick={() => void handleStatusChange(cycle.id, 'CLOSED')}>
                    Bağla
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selectedCycle && (
        <div className="card">
          <h3>Sual setləri ({selectedCycle.data.year})</h3>
          <div className="segmented">
            {flows.map((flow) => (
              <button
                key={flow}
                className={selectedFlow === flow ? 'segmented__item active' : 'segmented__item'}
                type="button"
                onClick={() => setSelectedFlow(flow)}
              >
                {flowLabels[flow]}
              </button>
            ))}
          </div>
          <div className="checkbox-grid">
            {questions.map((question) => (
              <label key={question.id} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedQuestionIds.includes(question.id)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedQuestionIds((prev) => [...prev, question.id])
                    } else {
                      setSelectedQuestionIds((prev) => prev.filter((id) => id !== question.id))
                    }
                  }}
                />
                <span>{question.data.text}</span>
              </label>
            ))}
          </div>
          <div className="actions">
            <button className="btn primary" type="button" onClick={handleSaveQuestionSet}>
              Sual setini saxla
            </button>
            <button className="btn ghost" type="button" onClick={handleCopyFromPreviousCycle}>
              Keçən ildən kopyala
            </button>
            <button className="btn" type="button" onClick={() => void generateTasksForCycle(selectedCycle.id)}>
              Tapşırıqları yarat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
