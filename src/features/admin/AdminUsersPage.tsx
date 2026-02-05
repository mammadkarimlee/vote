import { useEffect, useMemo, useState } from 'react'
import { ORG_ID, supabase } from '../../lib/supabase'
import { mapBranchRow, mapUserRow } from '../../lib/supabaseMappers'
import type { BranchDoc, Role, UserDoc } from '../../lib/types'
import { useConfirmDialog } from '../../components/ConfirmDialog'
import { useAuth } from '../auth/AuthProvider'
import { provisionEmailUser } from '../branch/userProvisioning'

type UserEntry = { id: string; data: UserDoc }

type RoleOption = {
  value: Role
  label: string
}

const roleOptions: RoleOption[] = [
  { value: 'branch_admin', label: 'Branch admin' },
  { value: 'moderator', label: 'Moderator' },
]

export const AdminUsersPage = () => {
  const { user } = useAuth()
  const { confirm, dialog } = useConfirmDialog()
  const [branches, setBranches] = useState<Array<{ id: string; data: BranchDoc }>>([])
  const [admins, setAdmins] = useState<UserEntry[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [branchId, setBranchId] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editBranchId, setEditBranchId] = useState('')
  const [editRole, setEditRole] = useState<Role>('branch_admin')
  const [savingEdit, setSavingEdit] = useState(false)

  const loadData = async () => {
    const [branchesRes, adminsRes] = await Promise.all([
      supabase.from('branches').select('*').eq('org_id', ORG_ID).is('deleted_at', null),
      supabase
        .from('users')
        .select('*')
        .eq('org_id', ORG_ID)
        .in('role', roleOptions.map((role) => role.value))
        .is('deleted_at', null),
    ])

    if (branchesRes.data) {
      setBranches(branchesRes.data.map((row) => ({ id: row.id, data: mapBranchRow(row) })))
    }
    if (adminsRes.data) {
      setAdmins(adminsRes.data.map((row) => ({ id: row.id, data: mapUserRow(row) })))
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleCreate = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !branchId) {
      setStatus('Bütün sahələri doldurun')
      return
    }

    try {
      await provisionEmailUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role: 'branch_admin',
        branchId,
      })
      setName('')
      setEmail('')
      setPassword('')
      setBranchId('')
      setStatus('Filial admini yaradıldı')
      await loadData()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Yaratma zamanı xəta oldu')
    }
  }

  const handleDelete = async (userId: string) => {
    const ok = await confirm({
      title: 'İstifadəçini sil',
      message: 'İstifadəçini silmək istədiyinizə əminsiniz?',
      confirmText: 'Sil',
      cancelText: 'İmtina',
      tone: 'danger',
    })
    if (!ok) return
    await supabase
      .from('users')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq('org_id', ORG_ID)
      .eq('id', userId)
    await loadData()
  }

  const handleEditStart = (admin: UserEntry) => {
    setEditingId(admin.id)
    setEditName(admin.data.displayName ?? '')
    setEditEmail(admin.data.email ?? '')
    setEditBranchId(admin.data.branchId ?? '')
    setEditRole(admin.data.role)
    setStatus(null)
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setEditName('')
    setEditEmail('')
    setEditBranchId('')
    setEditRole('branch_admin')
  }

  const handleEditSave = async () => {
    if (!editingId) return
    if (!editName.trim() || !editBranchId) {
      setStatus('Ad və filial tələb olunur')
      return
    }
    setSavingEdit(true)
    const { error } = await supabase
      .from('users')
      .update({
        display_name: editName.trim(),
        email: editEmail.trim() || null,
        branch_id: editBranchId,
        role: editRole,
      })
      .eq('org_id', ORG_ID)
      .eq('id', editingId)
    setSavingEdit(false)
    if (error) {
      setStatus('Yeniləmə zamanı xəta oldu')
      return
    }
    setStatus('İstifadəçi yeniləndi')
    setEditingId(null)
    await loadData()
  }

  const summary = useMemo(() => admins.length, [admins])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Filial adminləri</h2>
          <p>Super admin tərəfindən yaradılan filial admin hesabları.</p>
        </div>
        <div className="stat-pill">Cəmi: {summary}</div>
      </div>

      <div className="card">
        <h3>Yeni filial admini</h3>
        <div className="form-grid">
          <input
            className="input"
            placeholder="Ad Soyad"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="input"
            placeholder="Şifrə"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <select className="input" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">Filial seçin</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.data.name}
              </option>
            ))}
          </select>
          <button className="btn primary" type="button" onClick={handleCreate}>
            Yarat
          </button>
        </div>
        {status && <div className="notice">{status}</div>}
      </div>

      <div className="data-table">
        <div className="data-row header">
          <div>Ad</div>
          <div>Email</div>
          <div>Filial</div>
          <div>Rol</div>
          <div></div>
        </div>
        {admins.map((admin) => (
          <div className="data-row" key={admin.id}>
            <div>
              {editingId === admin.id ? (
                <input
                  className="input"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                />
              ) : (
                admin.data.displayName ?? '-'
              )}
            </div>
            <div>
              {editingId === admin.id ? (
                <input
                  className="input"
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                />
              ) : (
                admin.data.email ?? '-'
              )}
            </div>
            <div>
              {editingId === admin.id ? (
                <select
                  className="input"
                  value={editBranchId}
                  onChange={(event) => setEditBranchId(event.target.value)}
                >
                  <option value="">Filial seçin</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.data.name}
                    </option>
                  ))}
                </select>
              ) : (
                branches.find((branch) => branch.id === admin.data.branchId)?.data.name ?? '-'
              )}
            </div>
            <div>
              {editingId === admin.id ? (
                <select
                  className="input"
                  value={editRole}
                  onChange={(event) => setEditRole(event.target.value as Role)}
                >
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              ) : (
                admin.data.role
              )}
            </div>
            <div className="actions">
              {editingId === admin.id ? (
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
                  <button className="btn" type="button" onClick={() => handleEditStart(admin)}>
                    Redaktə
                  </button>
                  <button className="btn ghost" type="button" onClick={() => void handleDelete(admin.id)}>
                    Sil
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="hint">Email dəyişikliyi yalnız profile tabelində yenilənir, auth email ayrıca yenilənmir.</div>
      {dialog}
    </div>
  )
}
