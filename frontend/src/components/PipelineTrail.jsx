// Five stages an application moves through: found -> matched -> letter
// ready -> applied -> response. Rather than a generic colored status badge,
// this renders a dot-and-line trail showing exactly where an application
// sits in that pipeline.
const STAGE_COUNT = 5

const STATUS_CONFIG = {
  cover_letter_ready: { doneCount: 2, currentIndex: 2, label: 'letter ready — needs manual apply' },
  manual_pending: { doneCount: 2, currentIndex: 2, label: 'letter ready — needs manual apply' },
  auto_applied: { doneCount: 4, currentIndex: null, label: 'auto-applied' },
  applied: { doneCount: 4, currentIndex: null, label: 'applied' },
  interview: { doneCount: 4, currentIndex: 4, label: 'interview scheduled' },
  rejected: { doneCount: 4, currentIndex: 4, label: 'not progressing', stalled: true },
}

export default function PipelineTrail({ status }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.cover_letter_ready

  return (
    <div>
      <div className="flex items-center">
        {Array.from({ length: STAGE_COUNT }).map((_, i) => {
          const isDone = i < config.doneCount
          const isCurrent = i === config.currentIndex
          return (
            <div key={i} className="flex items-center">
              <span
                className={
                  'h-[7px] w-[7px] shrink-0 rounded-full ' +
                  (isCurrent
                    ? config.stalled
                      ? 'bg-rust shadow-[0_0_0_3px_var(--color-rust-soft)]'
                      : 'bg-amber shadow-[0_0_0_3px_var(--color-amber-soft)]'
                    : isDone
                      ? 'bg-accent'
                      : 'bg-line')
                }
              />
              {i < STAGE_COUNT - 1 && (
                <span className={'h-px w-[18px] ' + (i < config.doneCount - 1 ? 'bg-accent' : 'bg-line')} />
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-[7px] font-mono text-[10.5px] tracking-wide text-ink-dim">{config.label}</div>
    </div>
  )
}
