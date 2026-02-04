import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ORG_ID, supabase } from '../../lib/supabase'
import { mapGroupRow, mapSubjectRow, mapTaskRow, mapTeacherRow } from '../../lib/supabaseMappers'
import type { GroupDoc, SubjectDoc, TaskDoc, TeacherDoc } from '../../lib/types'
import { chunkArray } from '../../lib/utils'
import { useAuth } from '../auth/AuthProvider'

const buildNameMap = <T extends { name?: string }>(docs: { id: string; data: T }[]) => {
  const map: Record<string, string> = {}
  docs.forEach((doc) => {
    map[doc.id] = doc.data.name ?? doc.id
  })
  return map
}

export const TaskListPage = () => {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Array<{ id: string; data: TaskDoc }>>([])
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({})
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!user) return undefined
    const loadTasks = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('rater_id', user.id)
      if (error) return
      const nextTasks = (data ?? []).map((row) => ({ id: row.id, data: mapTaskRow(row) }))
      setTasks(nextTasks)
    }

    void loadTasks()
  }, [user])

  useEffect(() => {
    const loadLookups = async () => {
      const teacherIds = Array.from(
        new Set(tasks.filter((task) => task.data.targetType === 'teacher').map((task) => task.data.targetId)),
      )
      const groupIds = Array.from(
        new Set(tasks.map((task) => task.data.groupId).filter((id): id is string => Boolean(id))),
      )
      const subjectIds = Array.from(
        new Set(tasks.map((task) => task.data.subjectId).filter((id): id is string => Boolean(id))),
      )

      if (teacherIds.length === 0 && groupIds.length === 0 && subjectIds.length === 0) {
        setTeacherNames({})
        setGroupNames({})
        setSubjectNames({})
        return
      }

      const teacherMap: Record<string, string> = {}
      const groupMap: Record<string, string> = {}
      const subjectMap: Record<string, string> = {}

      for (const chunk of chunkArray(teacherIds, 200)) {
        if (chunk.length === 0) continue
        const res = await supabase
          .from('teachers')
          .select('*')
          .eq('org_id', ORG_ID)
          .in('id', chunk)
          .is('deleted_at', null)
        Object.assign(
          teacherMap,
          buildNameMap((res.data ?? []).map((row) => ({ id: row.id, data: mapTeacherRow(row) as TeacherDoc }))),
        )
      }

      for (const chunk of chunkArray(groupIds, 200)) {
        if (chunk.length === 0) continue
        const res = await supabase
          .from('groups')
          .select('*')
          .eq('org_id', ORG_ID)
          .in('id', chunk)
          .is('deleted_at', null)
        Object.assign(
          groupMap,
          buildNameMap((res.data ?? []).map((row) => ({ id: row.id, data: mapGroupRow(row) as GroupDoc }))),
        )
      }

      for (const chunk of chunkArray(subjectIds, 200)) {
        if (chunk.length === 0) continue
        const res = await supabase
          .from('subjects')
          .select('*')
          .eq('org_id', ORG_ID)
          .in('id', chunk)
          .is('deleted_at', null)
        Object.assign(
          subjectMap,
          buildNameMap((res.data ?? []).map((row) => ({ id: row.id, data: mapSubjectRow(row) as SubjectDoc }))),
        )
      }

      setTeacherNames(teacherMap)
      setGroupNames(groupMap)
      setSubjectNames(subjectMap)
    }

    void loadLookups()
  }, [tasks])

  const grouped = useMemo(() => {
    const open = tasks.filter((task) => task.data.status === 'OPEN')
    const done = tasks.filter((task) => task.data.status === 'DONE')
    return { open, done }
  }, [tasks])

  const resolveTargetName = (task: TaskDoc) => {
    if (task.targetName) return task.targetName
    if (task.targetType === 'teacher') return teacherNames[task.targetId] ?? task.targetId
    return `Rəhbərlik (${task.targetId})`
  }

  const resolveMeta = (task: TaskDoc) => {
    const groupLabel = task.groupName ?? (task.groupId && groupNames[task.groupId])
    const subjectLabel = task.subjectName
      ? ` • ${task.subjectName}`
      : task.subjectId && ` • ${subjectNames[task.subjectId] ?? task.subjectId}`
    return `${groupLabel ?? ''}${subjectLabel ?? ''}`.trim()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Səsvermə tapşırıqları</h1>
          <p>Hər hədəf üçün yalnız bir dəfə səs verə bilərsiniz.</p>
        </div>
        <div className="stats">
          <div className="stat-card">
            <div className="stat-label">Açıq tapşırıqlar</div>
            <div className="stat-value">{grouped.open.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Tamamlanan</div>
            <div className="stat-value">{grouped.done.length}</div>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Açıq tapşırıqlar</h2>
          {grouped.open.length === 0 && <div className="empty">Açıq tapşırıq yoxdur.</div>}
          <div className="list">
            {grouped.open.map((task, index) => (
              <Link
                to={`/vote/${task.id}`}
                className="list-item"
                key={task.id}
                style={{ animationDelay: `${index * 0.03}s` }}
              >
                <div>
                  <div className="list-title">{resolveTargetName(task.data)}</div>
                  <div className="list-meta">{resolveMeta(task.data)}</div>
                </div>
                <span className="tag">Səs ver</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Tamamlanan</h2>
          {grouped.done.length === 0 && <div className="empty">Hələlik tamamlanan yoxdur.</div>}
          <div className="list">
            {grouped.done.map((task, index) => (
              <div className="list-item done" key={task.id} style={{ animationDelay: `${index * 0.03}s` }}>
                <div>
                  <div className="list-title">{resolveTargetName(task.data)}</div>
                  <div className="list-meta">{resolveMeta(task.data)}</div>
                </div>
                <span className="tag success">Tamamlandı ✓</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
