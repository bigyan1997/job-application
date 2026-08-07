import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function TopNav() {
  const { user, logout } = useAuth()

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-10 py-4">
        <div className="flex items-center gap-6">
          <span className="font-display text-sm font-semibold">Job Application Automation</span>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              'text-[13px] ' + (isActive ? 'font-medium text-accent' : 'text-ink-dim hover:text-ink')
            }
          >
            Tracker
          </NavLink>
        </div>

        {user && (
          <div className="group relative">
            <button className="text-[13px] text-ink-dim hover:text-ink">Welcome, {user.name}</button>

            <div className="invisible absolute right-0 top-full w-40 rounded-md border border-line bg-surface py-1.5 opacity-0 shadow-sm transition-opacity group-hover:visible group-hover:opacity-100">
              <NavLink
                to="/setup"
                className={({ isActive }) =>
                  'block px-3.5 py-2 text-[13px] ' +
                  (isActive ? 'font-medium text-accent' : 'text-ink-dim hover:text-ink')
                }
              >
                Setup
              </NavLink>
              <button
                onClick={logout}
                className="block w-full px-3.5 py-2 text-left font-mono text-[11px] text-ink-dim hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
