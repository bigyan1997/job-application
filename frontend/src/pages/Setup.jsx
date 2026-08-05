import { useEffect, useRef, useState } from 'react'
import {
  uploadResume,
  getResume,
  listResumes,
  listJobSearchProfiles,
  createJobSearchProfile,
  updateJobSearchProfile,
} from '../api'

export default function Setup() {
  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <header className="mb-8 border-b border-line pb-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Set Up Your Search</h1>
        <div className="mt-1.5 text-[13px] text-ink-dim">
          Upload a resume and tell us what to look for — this runs automatically every 24 hours.
        </div>
      </header>

      <div className="grid grid-cols-2 gap-6">
        <ResumePanel />
        <SearchProfilePanel />
      </div>
    </div>
  )
}

function ResumePanel() {
  const [resume, setResume] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    listResumes().then((resumes) => {
      if (resumes.length > 0) setResume(resumes[0])
    })
    return () => clearInterval(pollRef.current)
  }, [])

  function pollUntilParsed(id) {
    pollRef.current = setInterval(async () => {
      const updated = await getResume(id)
      setResume(updated)
      if (updated.status !== 'pending') clearInterval(pollRef.current)
    }, 2000)
  }

  async function handleFileSelected(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const created = await uploadResume(file)
      setResume(created)
      pollUntilParsed(created.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const parsed = resume?.parsed_data

  return (
    <div className="rounded-lg border border-line bg-surface p-7">
      <div className="mb-5 font-mono text-[11px] tracking-wide text-ink-faint">RESUME</div>

      {resume ? (
        <div className="mb-4 flex items-center justify-between rounded-md border border-line bg-bg px-3.5 py-3">
          <span className="text-[13px] font-medium">{resume.original_filename}</span>
          <StatusBadge status={resume.status} />
        </div>
      ) : (
        <div className="mb-5 rounded-md border border-dashed border-line px-5 py-9 text-center">
          <div className="text-[13.5px] font-medium">Drop your resume here</div>
          <div className="mt-1 text-xs text-ink-faint">PDF or plain text</div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt"
        onChange={handleFileSelected}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current.click()}
        disabled={uploading}
        className="mb-5 rounded-[5px] border border-line px-4 py-2 font-mono text-xs text-ink-dim disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : resume ? 'Replace resume' : 'Choose file'}
      </button>

      {error && <div className="mb-4 rounded border border-rust bg-rust-soft p-2 text-xs text-rust">{error}</div>}

      {resume?.status === 'failed' && (
        <div className="mb-4 rounded border border-rust bg-rust-soft p-2 text-xs text-rust">
          Parsing failed: {resume.error_message}
        </div>
      )}

      {parsed && (
        <>
          <div className="mb-2 mt-5 font-mono text-[11px] tracking-wide text-ink-faint">DETECTED ROLES</div>
          <ChipRow items={parsed.titles} />

          <div className="mb-2 mt-4 font-mono text-[11px] tracking-wide text-ink-faint">DETECTED SKILLS</div>
          <ChipRow items={parsed.skills} accent />

          <div className="mb-2 mt-4 font-mono text-[11px] tracking-wide text-ink-faint">EXPERIENCE</div>
          <ChipRow items={[`${parsed.years_experience} yrs equivalent`]} />
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-soft text-amber',
    parsed: 'bg-accent-soft text-accent',
    failed: 'bg-rust-soft text-rust',
  }
  return (
    <span className={'rounded px-2 py-0.5 font-mono text-[11px] ' + styles[status]}>
      {status === 'pending' ? 'parsing…' : status}
    </span>
  )
}

function ChipRow({ items, accent }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={
            'rounded-full border px-2.5 py-1 text-xs ' +
            (accent ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-dim')
          }
        >
          {item}
        </span>
      ))}
    </div>
  )
}

function SearchProfilePanel() {
  const [profileId, setProfileId] = useState(null)
  const [targetRole, setTargetRole] = useState('')
  const [location, setLocation] = useState('')
  const [keywords, setKeywords] = useState([])
  const [keywordInput, setKeywordInput] = useState('')
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false)
  const [searchActive, setSearchActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    listJobSearchProfiles().then((profiles) => {
      if (profiles.length === 0) return
      const p = profiles[0]
      setProfileId(p.id)
      setTargetRole(p.target_role)
      setLocation(p.location)
      setKeywords(p.keywords)
      setAutoApplyEnabled(p.auto_apply_enabled)
      setSearchActive(p.search_active)
    })
  }, [])

  function addKeyword() {
    const value = keywordInput.trim()
    if (value && !keywords.includes(value)) setKeywords([...keywords, value])
    setKeywordInput('')
  }

  function removeKeyword(value) {
    setKeywords(keywords.filter((k) => k !== value))
  }

  async function handleSave() {
    setSaving(true)
    const fields = {
      target_role: targetRole,
      location,
      keywords,
      auto_apply_enabled: autoApplyEnabled,
      search_active: searchActive,
    }
    try {
      if (profileId) {
        await updateJobSearchProfile(profileId, fields)
      } else {
        const created = await createJobSearchProfile(fields)
        setProfileId(created.id)
      }
      setSavedAt(new Date())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-7">
      <div className="mb-5 font-mono text-[11px] tracking-wide text-ink-faint">SEARCH PROFILE</div>

      <Field label="Target role">
        <input
          type="text"
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          className="w-full rounded border border-line px-3 py-2.5 text-sm"
        />
      </Field>

      <Field label="Location" hint="defaults to Australia">
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full rounded border border-line px-3 py-2.5 text-sm"
        />
      </Field>

      <Field label="Keywords" hint="helps narrow matches">
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-line px-2.5 py-2">
          {keywords.map((k) => (
            <span key={k} className="flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-xs">
              {k}
              <button onClick={() => removeKeyword(k)} className="text-ink-faint">
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addKeyword()
              }
            }}
            placeholder="add keyword…"
            className="min-w-24 flex-1 border-none text-sm outline-none"
          />
        </div>
      </Field>

      <ToggleRow
        label="Auto-apply where possible"
        sub="Greenhouse & Lever listings only"
        checked={autoApplyEnabled}
        onChange={setAutoApplyEnabled}
      />
      <ToggleRow
        label="Search active"
        sub="Runs every 24 hours"
        checked={searchActive}
        onChange={setSearchActive}
      />

      <div className="mt-6 flex items-center justify-end gap-3">
        {savedAt && <span className="text-xs text-ink-faint">Saved</span>}
        <button
          onClick={handleSave}
          disabled={saving || !targetRole}
          className="rounded-[5px] border border-ink bg-ink px-5 py-2.5 font-mono text-xs text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save & Start Searching'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="mb-5">
      <label className="mb-1.5 block text-[12.5px] font-medium">
        {label}
        {hint && <span className="ml-1.5 text-[11.5px] font-normal text-ink-faint">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <div className="flex items-center justify-between border-t border-line py-3.5 first:border-t-0 first:pt-0">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        <div className="mt-0.5 text-[11.5px] text-ink-faint">{sub}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={'relative h-[19px] w-[34px] rounded-full ' + (checked ? 'bg-accent' : 'bg-line')}
      >
        <span
          className={
            'absolute top-0.5 h-[15px] w-[15px] rounded-full bg-white transition-all ' +
            (checked ? 'left-[17px]' : 'left-0.5')
          }
        />
      </button>
    </div>
  )
}
