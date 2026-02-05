import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'

type IconName =
  | 'dashboard'
  | 'branches'
  | 'admins'
  | 'cycles'
  | 'questions'
  | 'teachers'
  | 'students'
  | 'groups'
  | 'subjects'
  | 'departments'
  | 'assignments'
  | 'management'
  | 'profiles'
  | 'results'
  | 'pkpd'
  | 'doc'
  | 'calculator'

const Icon = ({ name }: { name: IconName }) => {
  const props = {
    className: 'icon-tile__svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (name) {
    case 'dashboard':
      return (
        <svg {...props}>
          <path d="M3 12h8V3H3z" />
          <path d="M13 21h8v-8h-8z" />
          <path d="M13 3h8v6h-8z" />
          <path d="M3 14h8v7H3z" />
        </svg>
      )
    case 'branches':
      return (
        <svg {...props}>
          <path d="M3 10h18" />
          <path d="M5 10v9h14v-9" />
          <path d="M9 10V6h6v4" />
        </svg>
      )
    case 'admins':
      return (
        <svg {...props}>
          <path d="M9 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path d="M17 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path d="M2 21a7 7 0 0 1 14 0" />
          <path d="M14 21a6 6 0 0 1 8 0" />
        </svg>
      )
    case 'cycles':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </svg>
      )
    case 'questions':
      return (
        <svg {...props}>
          <path d="M4 4h16v16H4z" />
          <path d="M8 9h8" />
          <path d="M8 13h5" />
        </svg>
      )
    case 'teachers':
      return (
        <svg {...props}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          <path d="M4 20a8 8 0 0 1 16 0" />
        </svg>
      )
    case 'students':
      return (
        <svg {...props}>
          <path d="M12 3 2 8l10 5 10-5-10-5z" />
          <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
        </svg>
      )
    case 'groups':
      return (
        <svg {...props}>
          <path d="M3 7h18" />
          <path d="M3 12h18" />
          <path d="M3 17h18" />
        </svg>
      )
    case 'subjects':
      return (
        <svg {...props}>
          <path d="M4 5h10a4 4 0 0 1 4 4v10H8a4 4 0 0 1-4-4z" />
          <path d="M14 5h6v14h-6" />
        </svg>
      )
    case 'departments':
      return (
        <svg {...props}>
          <path d="M3 20h18" />
          <path d="M5 20V6l7-3 7 3v14" />
          <path d="M9 20v-6h6v6" />
        </svg>
      )
    case 'assignments':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h10" />
          <path d="M7 12h6" />
        </svg>
      )
    case 'management':
      return (
        <svg {...props}>
          <path d="M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z" />
          <path d="M9 12h6" />
        </svg>
      )
    case 'profiles':
      return (
        <svg {...props}>
          <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5z" />
          <path d="M3 21a9 9 0 0 1 18 0" />
        </svg>
      )
    case 'results':
      return (
        <svg {...props}>
          <path d="M4 19h16" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-7" />
        </svg>
      )
    case 'calculator':
      return (
        <svg {...props}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 7h8" />
          <path d="M8 11h4" />
          <path d="M14 11h2" />
          <path d="M8 15h2" />
          <path d="M12 15h2" />
          <path d="M16 15h2" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...props}>
          <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
          <path d="M8 13h8" />
          <path d="M8 17h8" />
        </svg>
      )
    case 'pkpd':
      return (
        <svg {...props}>
          <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z" />
          <path d="M9 12h6" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8" />
        </svg>
      )
  }
}

const NavTile = ({ to, label, icon }: { to: string; label: string; icon: IconName }) => (
  <NavLink to={to} className={({ isActive }) => cn('icon-tile', isActive && 'active')}>
    <span className="icon-tile__icon">
      <Icon name={icon} />
    </span>
    <span className="icon-tile__label">{label}</span>
  </NavLink>
)

const MenuGroup = ({ title, items }: { title: string; items: Array<{ to: string; label: string; icon: IconName }> }) => (
  <div className="icon-menu-group">
    <div className="icon-menu-title">{title}</div>
    <div className="icon-menu-grid">
      {items.map((item) => (
        <NavTile key={item.to} to={item.to} label={item.label} icon={item.icon} />
      ))}
    </div>
  </div>
)

export const BranchLayout = ({ isAdmin = false }: { isAdmin?: boolean }) => {
  const location = useLocation()
  const prefix = isAdmin ? '/admin' : '/branch'
  const showMenu = location.pathname === prefix

  useEffect(() => {
    const key = isAdmin ? 'last_admin_path' : 'last_branch_path'
    if (location.pathname.startsWith(prefix) && location.pathname !== prefix) {
      localStorage.setItem(key, location.pathname)
    }
  }, [isAdmin, location.pathname, prefix])

  const adminGroups = [
    {
      title: 'İdarə paneli',
      items: [
        { to: '/admin/dashboard/overview', label: 'Dashboard', icon: 'dashboard' },
        { to: '/admin/branches', label: 'Filiallar', icon: 'branches' },
        { to: '/admin/users', label: 'Filial adminləri', icon: 'admins' },
      ],
    },
    {
      title: 'Sorğu idarəetməsi',
      items: [
        { to: '/admin/cycles', label: 'Sorğu dövrü', icon: 'cycles' },
        { to: '/admin/questions', label: 'Sual bankı', icon: 'questions' },
      ],
    },
    {
      title: 'PKPD portalı',
      items: [
        { to: '/pkpd/doc', label: 'PKPD sənədi', icon: 'doc' },
        { to: '/pkpd/calculator', label: 'PKPD kalkulyatoru', icon: 'calculator' },
      ],
    },
  ]

  const branchGroups = [
    {
      title: 'Struktur',
      items: [
        { to: '/branch/teachers', label: 'Müəllimlər', icon: 'teachers' },
        { to: '/branch/students', label: 'Şagirdlər', icon: 'students' },
        { to: '/branch/groups', label: 'Qruplar', icon: 'groups' },
        { to: '/branch/subjects', label: 'Fənnlər', icon: 'subjects' },
        { to: '/branch/departments', label: 'Kafedralar', icon: 'departments' },
      ],
    },
    {
      title: 'Təyinatlar',
      items: [
        { to: '/branch/assignments', label: 'Dərs təyinatları', icon: 'assignments' },
        { to: '/branch/management', label: 'Rəhbərlik təyinatları', icon: 'management' },
      ],
    },
    {
      title: 'Sorğu və nəticə',
      items: [
        { to: '/branch/cycles', label: 'Sorğu dövrləri', icon: 'cycles' },
        { to: '/branch/results/teachers', label: 'Nəticələr', icon: 'results' },
      ],
    },
    {
      title: 'İstifadəçilər',
      items: [{ to: '/branch/profiles', label: 'İstifadəçi profilləri', icon: 'profiles' }],
    },
    {
      title: 'PKPD',
      items: [
        { to: '/branch/pkpd', label: 'PKPD idarəetməsi', icon: 'pkpd' },
        { to: '/pkpd/doc', label: 'PKPD sənədi', icon: 'doc' },
        { to: '/pkpd/calculator', label: 'PKPD kalkulyatoru', icon: 'calculator' },
      ],
    },
  ]

  return (
    <div className="layout-shell">
      <div className="panel-layout">
        <section className="panel-content">
          <div className="icon-menu">
            {showMenu && (
              <>
                <div className="icon-menu-header">
                  <div className="icon-menu-title">{isAdmin ? 'SuperAdmin paneli' : 'Filial paneli'}</div>
                  <div className="icon-menu-subtitle">
                    {isAdmin ? 'Sistem idarəetməsi üçün əsas bölmələr' : 'Əsas əməliyyat bölmələri'}
                  </div>
                </div>
                <div className="icon-menu-groups">
                  {(isAdmin ? adminGroups : branchGroups).map((group) => (
                    <MenuGroup key={group.title} title={group.title} items={group.items} />
                  ))}
                </div>
              </>
            )}
          </div>
          <Outlet />
        </section>
      </div>
    </div>
  )
}
