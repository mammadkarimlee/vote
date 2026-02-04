import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ORG_ID, supabase } from '../../lib/supabase'
import { mapSurveyCycleRow } from '../../lib/supabaseMappers'
import type { SurveyCycleDoc } from '../../lib/types'
import { BranchSelector } from './BranchSelector'
import { useBranchScope } from './useBranchScope'

type DocEntry<T> = { id: string; data: T }

export const BranchCyclesPage = () => {
  const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope()
  const [cycles, setCycles] = useState<Array<DocEntry<SurveyCycleDoc>>>([])

  useEffect(() => {
    const loadCycles = async () => {
      if (!branchId) return
      const { data } = await supabase.from('survey_cycles').select('*').eq('org_id', ORG_ID)
      const allCycles = (data ?? []).map((row) => ({ id: row.id, data: mapSurveyCycleRow(row) }))
      const filtered = allCycles.filter((cycle) => {
        const branchIds = cycle.data.branchIds ?? []
        if (branchIds.length === 0) return true
        return branchIds.includes(branchId)
      })
      setCycles(filtered)
    }

    if (branchId) {
      void loadCycles()
    } else {
      setCycles([])
    }
  }, [branchId])

  return (
    <div className="panel">
      {isSuperAdmin && (
        <BranchSelector branchId={branchId} branches={branches} onChange={setBranchId} />
      )}

      <div className="panel-header">
        <div>
          <h2>Sorğu dövrləri</h2>
          <p>Filial üzrə sorğu dövrlərinin siyahısı.</p>
        </div>
      </div>

      <div className="table">
        <div className="table-row header">
          <div>İl</div>
          <div>Vəziyyət</div>
          <div></div>
        </div>
        {cycles.map((cycle) => (
          <div className="table-row" key={cycle.id}>
            <div>{cycle.data.year}</div>
            <div>{cycle.data.status}</div>
            <div>
              <Link className="btn ghost" to={`/branch/cycles/${cycle.id}`}>
                Detallara bax
              </Link>
            </div>
          </div>
        ))}
        {cycles.length === 0 && <div className="empty">Sorğu dövrü yoxdur.</div>}
      </div>
    </div>
  )
}
