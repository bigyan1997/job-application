import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Tracker', end: true },
  { to: '/setup', label: 'Setup' },
]

export default function TopNav() {
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-10 py-4">
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
    </div>
  )
}
