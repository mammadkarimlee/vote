import { useEffect, useMemo, useState } from 'react'
import { ORG_ID, supabase } from '../../lib/supabase'
import { mapBranchRow } from '../../lib/supabaseMappers'
import type { BranchDoc } from '../../lib/types'
import { useAuth } from '../auth/AuthProvider'

export const useBranchScope = () => {
  const { userDoc } = useAuth()
  const isSuperAdmin = userDoc?.role === 'superadmin'
  const [branchId, setBranchId] = useState(userDoc?.branchId ?? '')
  const [branches, setBranches] = useState<Array<{ id: string; data: BranchDoc }>>([])

  useEffect(() => {
    if (userDoc?.branchId) {
      setBranchId(userDoc.branchId)
    }
  }, [userDoc?.branchId])

  useEffect(() => {
    if (!isSuperAdmin) return

    const loadBranches = async () => {
      const { data } = await supabase.from('branches').select('*').eq('org_id', ORG_ID).is('deleted_at', null)
      setBranches((data ?? []).map((row) => ({ id: row.id, data: mapBranchRow(row) })))
    }

    void loadBranches()
  }, [isSuperAdmin])

  const branchName = useMemo(() => {
    if (!branchId) return ''
    return branches.find((branch) => branch.id === branchId)?.data.name ?? ''
  }, [branchId, branches])

  return { branchId, setBranchId, branches, branchName, isSuperAdmin }
}
