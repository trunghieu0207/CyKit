import { SCOPE_OPTIONS } from '../shared/scope'
import {
  anchorStartsWednesday,
  formatRange,
  formatRemaining,
  sprintFor,
} from '../shared/sprint'
import type { Corner } from '../shared/types'
import type { PanelProps } from './panels'
import { Toggle } from './Toggle'

const CORNERS: readonly { id: Corner; label: string }[] = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-right', label: 'Top right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-right', label: 'Bottom right' },
]

export function SprintPanel({ settings, patchSprint }: PanelProps) {
  const { sprint } = settings
  const now = sprintFor(new Date(), {
    number: sprint.anchorNumber,
    start: sprint.anchorStart,
  })
  const anchorOk = anchorStartsWednesday(sprint.anchorStart)

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>Sprint</h2>
          {/*
           * This describes the toggle, not the feature. The toggle governs
           * only the pill on the page, and nothing else on screen says so —
           * the reader has to be told here or they will assume it turns the
           * whole panel off.
           */}
          <p className="hint">
            On: a pill in the corner of kintone and Garoon pages. Off: nothing
            on any page — this panel still tells you.
          </p>
        </div>
        <Toggle
          checked={sprint.enabled}
          onChange={(enabled) => patchSprint({ enabled })}
          label="Show the sprint on kintone and Garoon pages"
        />
      </div>

      {/*
       * Outside the fieldset below, on purpose. The toggle turns off the pill
       * on the page, not the answer — someone who does not want it following
       * them around still wants to be able to look it up here.
       */}
      <div className="panel__body">
        {now ? (
          <div className={`sprint ${now.daysUntilEnd <= 0 ? 'sprint--last' : ''}`}>
            <span className="sprint__no">Sprint {now.number}</span>
            <span className="sprint__when">
              {formatRange(now)}
              <span className="hint">{formatRemaining(now)}</span>
            </span>
          </div>
        ) : (
          <div className="sprint sprint--bad">
            <span className="sprint__when">
              The starting point below cannot be read, so no sprint can be
              worked out.
            </span>
          </div>
        )}

        <p className="hint">
          Sprints run one week, Wednesday to Tuesday. The number is counted from
          the starting point below, not stored, so it stays right on its own.
        </p>

        <label className="field">
          <span>Sprint</span>
          <input
            type="number"
            value={sprint.anchorNumber}
            onChange={(e) => patchSprint({ anchorNumber: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span>began on</span>
          <input
            type="date"
            value={sprint.anchorStart}
            onChange={(e) => patchSprint({ anchorStart: e.target.value })}
          />
        </label>

        {sprint.anchorStart && !anchorOk && (
          <span className="hint bad">
            That date is not a Wednesday. Every sprint will start on whichever
            day it is instead.
          </span>
        )}
      </div>

      <hr className="rule" />

      {/* Only the on-page pill is governed by the toggle. */}
      <fieldset className="panel__body" disabled={!sprint.enabled}>
        <p className="hint">Where the pill sits, and which products get one.</p>

        <div className="seg">
          <span className="seg__label">Corner</span>
          <select
            value={sprint.corner}
            onChange={(e) => patchSprint({ corner: e.target.value as Corner })}
          >
            {CORNERS.map((corner) => (
              <option key={corner.id} value={corner.id}>
                {corner.label}
              </option>
            ))}
          </select>
        </div>

        <div className="seg">
          <span className="seg__label">Show on</span>
          <div className="checks">
            {SCOPE_OPTIONS.map((option) => (
              <label key={option.key} className="check" title={option.hint}>
                <input
                  type="checkbox"
                  checked={sprint.scope[option.key]}
                  // Shallow-merged, so the whole scope object has to go along.
                  onChange={(e) =>
                    patchSprint({
                      scope: { ...sprint.scope, [option.key]: e.target.checked },
                    })
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <footer className="footer">
        The pill ignores the mouse, so it never sits between you and whatever it
        happens to cover.
      </footer>
    </>
  )
}
