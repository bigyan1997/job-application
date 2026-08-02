import { useState } from 'react'
import PipelineTrail from './PipelineTrail'

const STATUS_OPTIONS = [
  'cover_letter_ready',
  'manual_pending',
  'auto_applied',
  'applied',
  'interview',
  'rejected',
]

function scoreTier(score) {
  if (score >= 80) return 'strong match'
  if (score >= 60) return 'good match'
  if (score >= 40) return 'fair match'
  return 'weak match'
}

export default function ApplicationRow({ application, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [draftLetter, setDraftLetter] = useState(application.cover_letter)
  const [saving, setSaving] = useState(false)

  async function handleStatusChange(e) {
    await onUpdate(application.id, { status: e.target.value })
  }

  async function handleSaveLetter() {
    setSaving(true)
    try {
      await onUpdate(application.id, { cover_letter: draftLetter })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b border-line px-1 py-4.5">
      <div className="grid grid-cols-[1.6fr_1.4fr_0.6fr_0.7fr_0.9fr] items-center gap-4">
        <div>
          <div className="font-display text-sm font-semibold">{application.job_title}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-dim">{application.company}</div>
        </div>

        <PipelineTrail status={application.status} />

        <div>
          <div className="font-mono text-[15px] font-medium">{application.match_score}</div>
          <div className="mt-0.5 text-[10.5px] text-ink-faint">{scoreTier(application.match_score)}</div>
        </div>

        <div className="font-mono text-xs text-ink-dim">
          {new Date(application.created_at).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}
        </div>

        <div className="flex items-center justify-end gap-2.5">
          <select
            value={application.status}
            onChange={handleStatusChange}
            className="rounded border border-line bg-surface px-2 py-1 font-mono text-[11px] text-ink-dim"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <a
            href={application.job_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-[4px] border border-ink bg-ink px-3 py-[7px] font-mono text-[11.5px] text-white"
          >
            Open
          </a>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="border-b border-line pb-px font-body text-[12.5px] text-ink-dim hover:border-ink-dim hover:text-ink"
          >
            {expanded ? 'hide letter' : 'letter'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 rounded-md border border-line bg-surface p-4">
          <div className="mb-2 font-mono text-[11px] tracking-wide text-ink-faint">MATCH RATIONALE</div>
          <p className="mb-4 text-sm text-ink-dim">{application.match_rationale}</p>
          <div className="mb-2 font-mono text-[11px] tracking-wide text-ink-faint">COVER LETTER</div>
          <textarea
            value={draftLetter}
            onChange={(e) => setDraftLetter(e.target.value)}
            rows={10}
            className="w-full rounded border border-line p-3 font-body text-sm text-ink"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleSaveLetter}
              disabled={saving || draftLetter === application.cover_letter}
              className="rounded-[5px] border border-ink bg-ink px-4 py-2 font-mono text-xs text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save letter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
