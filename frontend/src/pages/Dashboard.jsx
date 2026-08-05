import { useEffect, useState, useCallback } from 'react'
import { listApplications, updateApplication, regenerateCoverLetter, listJobSearchProfiles } from '../api'
import ApplicationRow from '../components/ApplicationRow'
import { timeAgo } from '../utils/time'

const TABS = [
  { key: '', label: 'All' },
  { key: 'manual_pending', label: 'Manual pending' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interview' },
  { key: 'rejected', label: 'Rejected' },
]

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: '-match_score', label: 'Highest match' },
  { value: 'match_score', label: 'Lowest match' },
]

const MIN_SCORE_OPTIONS = [
  { value: '', label: 'Any score' },
  { value: '80', label: '80%+' },
  { value: '60', label: '60%+' },
  { value: '40', label: '40%+' },
]

const ATS_TYPE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'other', label: 'Other' },
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
  const [sortBy, setSortBy] = useState('-created_at')
  const [minScore, setMinScore] = useState('')
  const [atsType, setAtsType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [profile, setProfile] = useState(null)

  const load = useCallback(async (filters) => {
    setLoading(true)
    setError(null)
    try {
      const data = await listApplications(filters)
      setApplications(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load({ status: activeTab, ordering: sortBy, minScore, atsType })
  }, [activeTab, sortBy, minScore, atsType, load])

  useEffect(() => {
    listJobSearchProfiles().then((profiles) => setProfile(profiles[0] ?? null))
  }, [])

  async function handleUpdate(id, fields) {
    const updated = await updateApplication(id, fields)
    setApplications((prev) => prev.map((a) => (a.id === id ? updated : a)))
    return updated
  }

  async function handleRegenerate(id, instructions) {
    const updated = await regenerateCoverLetter(id, instructions)
    setApplications((prev) => prev.map((a) => (a.id === id ? updated : a)))
    return updated
  }

  const stats = computeStats(applications)

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <header className="mb-10 flex items-start justify-between border-b border-line pb-6">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Application Tracker</h1>
          <div className="mt-1.5 text-[13px] text-ink-dim">
            {profile ? (
              <>
                <span className="font-medium text-ink">{profile.target_role}</span>
                {profile.location && <>&nbsp;·&nbsp;{profile.location}</>}
                &nbsp;·&nbsp;
                {profile.last_searched_at ? `last search ${timeAgo(profile.last_searched_at)}` : 'not yet searched'}
              </>
            ) : (
              'Job Application Automation'
            )}
          </div>
        </div>
        <div className="flex gap-8">
          <Stat value={stats.found} label="found" />
          <Stat value={stats.pending} label="pending" />
          <Stat value={stats.applied} label="applied" />
          <Stat value={stats.interview} label="interview" />
        </div>
      </header>

      <div className="mb-5 flex items-center justify-between">
        <nav className="flex gap-6">
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

        <div className="flex gap-2">
          <FilterSelect value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} />
          <FilterSelect value={minScore} onChange={setMinScore} options={MIN_SCORE_OPTIONS} />
          <FilterSelect value={atsType} onChange={setAtsType} options={ATS_TYPE_OPTIONS} />
        </div>
      </div>

      {error && <div className="mb-4 rounded border border-rust bg-rust-soft p-3 text-sm text-rust">{error}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-ink-faint">Loading…</div>
      ) : applications.length === 0 ? (
        <div className="py-16 text-center text-sm text-ink-faint">No applications in this view yet.</div>
      ) : (
        <div className="border-t border-line">
          {applications.map((application) => (
            <ApplicationRow
              key={application.id}
              application={application}
              onUpdate={handleUpdate}
              onRegenerate={handleRegenerate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-line bg-surface px-2 py-1.5 font-mono text-[11px] text-ink-dim"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
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
