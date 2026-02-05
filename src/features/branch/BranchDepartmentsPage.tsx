import { useEffect, useMemo, useState } from 'react'
import { ORG_ID, supabase } from '../../lib/supabase'
import { mapDepartmentRow } from '../../lib/supabaseMappers'
import type { DepartmentDoc } from '../../lib/types'
import { createId } from '../../lib/utils'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { useAuth } from '../auth/AuthProvider'
import { BranchSelector } from './BranchSelector'
import { useBranchScope } from './useBranchScope'

type DepartmentEntry = { id: string; data: DepartmentDoc }

export const BranchDepartmentsPage = () => {
  const { user } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope()
  const [departments, setDepartments] = useState<DepartmentEntry[]>([])
  const [name, setName] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const loadDepartments = async () => {
    if (!branchId) {
      setDepartments([])
      return
    }
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('branch_id', branchId)
      .is('deleted_at', null)
    if (error) {
      setLoadError(error.message || 'Yükləmə zamanı xəta oldu')
      return
    }
    setLoadError(null)
    const items = (data ?? []).map((row) => ({ id: row.id, data: mapDepartmentRow(row) }))
    setDepartments(items)
  }

  useEffect(() => {
    void loadDepartments()
  }, [branchId])

  const handleCreate = async () => {
    if (!branchId) {
      setStatus('Filial seçilməyib. Davam etmək üçün filial seçin.')
      return
    }
    if (!name.trim()) {
      setStatus('Kafedra adı tələb olunur')
      return
    }

    const { error } = await supabase.from('departments').insert({
      id: createId(),
      org_id: ORG_ID,
      branch_id: branchId,
      name: name.trim(),
    })

    if (error) {
      setStatus(error.message || 'Yaratma zamanı xəta oldu')
      return
    }

    setName('')
    setStatus('Kafedra yaradıldı')
    await loadDepartments()
  }

  const handleDelete = async (departmentId: string) => {
    const ok = await confirm({
      title: 'Kafedranı sil',
      message: 'Kafedranı silmək istədiyinizə əminsiniz?',
      confirmText: 'Sil',
      cancelText: 'İmtina',
      tone: 'danger',
    })
    if (!ok) return
    await supabase
      .from('departments')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq('org_id', ORG_ID)
      .eq('id', departmentId)
    await loadDepartments()
  }

  const handleEditStart = (department: DepartmentEntry) => {
    setEditingId(department.id)
    setEditName(department.data.name)
    setStatus(null)
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setEditName('')
  }

  const handleEditSave = async () => {
    if (!editingId) return
    if (!editName.trim()) {
      setStatus('Kafedra adı tələb olunur')
      return
    }
    setSavingEdit(true)
    const { error } = await supabase
      .from('departments')
      .update({ name: editName.trim() })
      .eq('org_id', ORG_ID)
      .eq('id', editingId)
    setSavingEdit(false)
    if (error) {
      setStatus(error.message || 'Yeniləmə zamanı xəta oldu')
      return
    }
    setStatus('Kafedra yeniləndi')
    setEditingId(null)
    await loadDepartments()
  }

  const summary = useMemo(() => departments.length, [departments])

  return (
    <div className="panel branch-page">
      <div className="page-hero">
        <div className="page-hero__content">
          <div className="eyebrow">Filial strukturu</div>
          <h1>Kafedralar</h1>
          <p>Filial üzrə kafedra siyahısı və idarəetmə paneli.</p>
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

      <div className="page-grid">
        <div className="card">
          <h3>Yeni kafedra</h3>
          <div className="form-grid">
            <input
              className="input"
              placeholder="Kafedra adı"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button className="btn primary" type="button" onClick={handleCreate} disabled={!branchId}>
              Yarat
            </button>
          </div>
          {status && <div className="notice">{status}</div>}
        </div>

        <div className="card">
          <div className="section-header">
            <div>
              <div className="section-kicker">Siyahı</div>
              <div className="section-title">Kafedralar</div>
            </div>
          </div>
          {loadError && <div className="notice">{loadError}</div>}
          <div className="data-table">
            <div className="data-row header">
              <div>Kafedra</div>
              <div></div>
            </div>
            {departments.map((department) => (
              <div className="data-row" key={department.id}>
                <div>
                  {editingId === department.id ? (
                    <input
                      className="input"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                  ) : (
                    department.data.name
                  )}
                </div>
                <div className="actions">
                  {editingId === department.id ? (
                    <>
                      <button className="btn primary" type="button" onClick={handleEditSave} disabled={savingEdit}>
                        Yadda saxla
                      </button>
                      <button className="btn ghost" type="button" onClick={handleEditCancel} disabled={savingEdit}>
                        Ləğv et
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn" type="button" onClick={() => handleEditStart(department)}>
                        Redaktə
                      </button>
                      <button className="btn ghost" type="button" onClick={() => void handleDelete(department.id)}>
                        Sil
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {departments.length === 0 && <div className="empty">Məlumat yoxdur.</div>}
          </div>
        </div>
      </div>
      {dialog}
    </div>
  )
}
