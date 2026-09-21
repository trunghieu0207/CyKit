import type { PanelProps } from './panels'
import { Segmented } from './Segmented'
import { Toggle } from './Toggle'

const DAY_STEPS = [
  { value: 1, label: 'Today' },
  { value: 2, label: '2 days' },
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
] as const

export function SchedulePanel({ settings, patchSchedule }: PanelProps) {
  const { schedule } = settings
  const days = DAY_STEPS.reduce((best, step) =>
    Math.abs(step.value - schedule.days) < Math.abs(best.value - schedule.days) ? step : best,
  ).value

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>Schedule</h2>
          <p className="hint">Your Garoon schedule, on kintone pages.</p>
        </div>
        <Toggle
          checked={schedule.enabled}
          onChange={(enabled) => patchSchedule({ enabled })}
          label="Enable the schedule feature"
        />
      </div>

      <fieldset className="panel__body" disabled={!schedule.enabled}>
        <p className="hint">
          Adds a small card to <code>/k/</code> pages listing what is on your
          Garoon calendar, so you do not have to switch tabs to check.
        </p>

        <Segmented
          name="schedule-days"
          label="Show"
          title="How many days to list, starting today"
          value={schedule.enabled ? days : 1}
          options={DAY_STEPS}
          onChange={(value) => patchSchedule({ days: value })}
        />
      </fieldset>

      <footer className="footer">
        This is the only feature that talks to a server, which is why it starts
        switched off. It reads your own Garoon over the session you are already
        signed in with — same host as kintone, so no extra permission — and
        sends nothing anywhere else.
      </footer>
    </>
  )
}
