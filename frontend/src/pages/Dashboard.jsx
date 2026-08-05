import { useEffect, useState, useCallback } from 'react'
import { listApplications, updateApplication } from '../api'
import ApplicationRow from '../components/ApplicationRow'

const TABS = [
  { key: '', label: 'All' },
  { key: 'manual_pending', label: 'Manual pending' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interview' },
  { key: 'rejected', label: 'Rejected' },
]

function computeStats(applications) {
  return {
    found: applications.length,
    applied: applications.filter((a) => ['applied', 'auto_applied'].includes(a.status)).length,
    pending: applications.filter((a) => ['cover_letter_ready', 'manual_pending'].includes(a.status)).length,
    interview: applications.filter((a) => a.status === 'interview').length,
  }
}

export default function Dashboard() {
  const [applications, setApplications] = useState([])
  const [activeTab, setActiveTab] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (status) => {
    setLoading(true)
    setError(null)
    try {
      const data = await listApplications(status)
      setApplications(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(activeTab)
  }, [activeTab, load])

  async function handleUpdate(id, fields) {
    const updated = await updateApplication(id, fields)
    setApplications((prev) => prev.map((a) => (a.id === id ? updated : a)))
  }

  const stats = computeStats(applications)

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <header className="mb-10 flex items-start justify-between border-b border-line pb-6">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Application Tracker</h1>
          <div className="mt-1.5 text-[13px] text-ink-dim">Job Application Automation</div>
        </div>
        <div className="flex gap-8">
          <Stat value={stats.found} label="found" />
          <Stat value={stats.pending} label="pending" />
          <Stat value={stats.applied} label="applied" />
          <Stat value={stats.interview} label="interview" />
        </div>
      </header>

      <nav className="mb-5 flex gap-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={
              'border-b-2 pb-2 text-[13px] ' +
              (activeTab === tab.key
                ? 'border-accent font-medium text-ink'
                : 'border-transparent text-ink-dim hover:text-ink')
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error && <div className="mb-4 rounded border border-rust bg-rust-soft p-3 text-sm text-rust">{error}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-ink-faint">Loading…</div>
      ) : applications.length === 0 ? (
        <div className="py-16 text-center text-sm text-ink-faint">No applications in this view yet.</div>
      ) : (
        <div className="border-t border-line">
          {applications.map((application) => (
            <ApplicationRow key={application.id} application={application} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[19px] font-medium">{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-faint">{label}</div>
    </div>
  )
}
