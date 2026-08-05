import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const LINKS = [
  { to: '/', label: 'Tracker', end: true },
  { to: '/setup', label: 'Setup' },
]

export default function TopNav() {
  const { user, logout } = useAuth()

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-10 py-4">
        <div className="flex items-center gap-6">
          <span className="font-display text-sm font-semibold">Job Application Automation</span>
          <nav className="flex gap-5">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  'text-[13px] ' + (isActive ? 'font-medium text-accent' : 'text-ink-dim hover:text-ink')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <span className="text-[12.5px] text-ink-dim">{user.email}</span>
            <button onClick={logout} className="font-mono text-[11px] text-ink-dim hover:text-ink">
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
