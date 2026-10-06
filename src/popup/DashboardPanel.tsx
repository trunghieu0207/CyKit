import { PANELS } from './panels'
import type { Settings } from '../shared/types'

interface Props {
  settings: Settings
  /** Opens a feature's own panel, from its card. */
  onOpen: (panelId: string) => void
}

/**
 * What the features want you to know, without being asked.
 *
 * This is the popup's landing screen, so the common case — "which sprint is
 * this" — costs opening the extension and nothing more. It lives in the panel
 * area rather than the sidebar because the sidebar is the menu: a readout
 * wedged in there competes with every feature added later for the same narrow
 * column.
 *
 * Cards come from the `PANELS` registry, so a feature joins by filling in
 * `Summary` and nothing here changes.
 */
export function DashboardPanel({ settings, onOpen }: Props) {
  const reporting = PANELS.filter((panel) => panel.Summary)

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>Overview</h2>
          <p className="hint">Everything worth a glance, in one place.</p>
        </div>
      </div>

      <div className="panel__body">
        {reporting.length === 0 ? (
          <p className="hint">
            Nothing to report yet. Features that have something worth knowing
            at a glance show it here.
          </p>
        ) : (
          reporting.map((panel) => {
            // Bound to a capitalised local so TypeScript narrows away the
            // undefined and JSX treats it as a component rather than a tag.
            const Summary = panel.Summary!
            return (
              <Summary
                key={panel.id}
                settings={settings}
                onOpen={() => onOpen(panel.id)}
              />
            )
          })
        )}
      </div>
    </>
  )
}
