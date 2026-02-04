import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'subnav-link active' : 'subnav-link'

export const BranchLayout = ({ isAdmin = false }: { isAdmin?: boolean }) => {
  const location = useLocation()

  useEffect(() => {
    const key = isAdmin ? 'last_admin_path' : 'last_branch_path'
    const prefix = isAdmin ? '/admin' : '/branch'
    if (location.pathname.startsWith(prefix)) {
      localStorage.setItem(key, location.pathname)
    }
  }, [isAdmin, location.pathname])

  return (
    <div className="panel-layout">
      <aside className="subnav">
        <div className="subnav-title">{isAdmin ? 'SuperAdmin' : 'Filial adminləri'}</div>
        {isAdmin ? (
          <>
            <NavLink to="/admin/branches" className={linkClass}>
              Filiallar
            </NavLink>
            <NavLink to="/admin/users" className={linkClass}>
              Filial adminləri
            </NavLink>
            <NavLink to="/admin/dashboard" className={linkClass}>
              İdarə paneli
            </NavLink>
            <NavLink to="/admin/cycles" className={linkClass}>
              Sorğu dövrü idarəetmə
            </NavLink>
            <NavLink to="/admin/questions" className={linkClass}>
              Sual bankı
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/branch/teachers" className={linkClass}>
              Müəllimlər
            </NavLink>
            <NavLink to="/branch/students" className={linkClass}>
              Şagirdlər
            </NavLink>
            <NavLink to="/branch/groups" className={linkClass}>
              Qruplar
            </NavLink>
            <NavLink to="/branch/subjects" className={linkClass}>
              Fənnlər
            </NavLink>
            <NavLink to="/branch/departments" className={linkClass}>
              Kafedralar
            </NavLink>
            <NavLink to="/branch/assignments" className={linkClass}>
              Dərs təyinatları
            </NavLink>
            <NavLink to="/branch/management" className={linkClass}>
              Rəhbərlik təyinatları
            </NavLink>
            <NavLink to="/branch/profiles" className={linkClass}>
              İstifadəçilər
            </NavLink>
            <NavLink to="/branch/cycles" className={linkClass}>
              Sorğu dövrləri
            </NavLink>
          </>
        )}
      </aside>
      <section className="panel-content">
        <Outlet />
      </section>
    </div>
  )
}
