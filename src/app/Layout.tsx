import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-link active' : 'nav-link'

export const Layout = () => {
  const { userDoc } = useAuth()
  const role = userDoc?.role

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <div className="brand-mark" />
          <div>
            <div className="brand-title">Müəllim Qiymətləndirmə</div>
            <div className="brand-subtitle">Sorğu Platforması</div>
          </div>
        </Link>
        <nav className="nav">
          <NavLink to="/me" className={navClass}>
            Mənim profilim
          </NavLink>
          {role && ['student', 'teacher', 'manager'].includes(role) && (
            <NavLink to="/vote" className={navClass}>
              Səs ver
            </NavLink>
          )}
          {role && ['branch_admin', 'moderator', 'superadmin'].includes(role) && (
            <NavLink to="/branch" className={navClass}>
              Filial paneli
            </NavLink>
          )}
          {role === 'superadmin' && (
            <NavLink to="/admin" className={navClass}>
              SuperAdmin paneli
            </NavLink>
          )}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
