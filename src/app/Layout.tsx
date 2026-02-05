import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../components/theme/ThemeToggle'
import { useAuth } from '../features/auth/AuthProvider'
import { useEffect, useState } from 'react'

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-link active' : 'nav-link'

export const Layout = () => {
  const { userDoc } = useAuth()
  const role = userDoc?.role
  const navigate = useNavigate()
  const location = useLocation()
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    if (!role) return
    const path = `${location.pathname}${location.search}${location.hash}`
    if (path !== '/login') {
      localStorage.setItem(`last_path_${role}`, path)
    }
  }, [role, location.pathname, location.search, location.hash])

  useEffect(() => {
    const idx = typeof window !== 'undefined' ? window.history.state?.idx ?? 0 : 0
    setCanGoBack(idx > 0)
  }, [location.pathname, location.search, location.hash])

  const handleBack = () => {
    if (!canGoBack) return
    navigate(-1)
  }

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
        <div className="flex items-center gap-3">
          <button
            className="back-button"
            type="button"
            onClick={handleBack}
            aria-label="Geri"
            disabled={!canGoBack}
          >
            <span aria-hidden>←</span>
            Geri
          </button>
          <ThemeToggle />
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
