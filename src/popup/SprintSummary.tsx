import { formatRange, formatRemaining, sprintFor } from '../shared/sprint'
import type { Settings } from '../shared/types'

interface Props {
  settings: Settings | null
  /** Opens the Sprint panel, for changing the anchor or the pill. */
  onOpen: () => void
}

/**
 * The running sprint, pinned to the bottom of the sidebar.
 *
 * It sits here rather than only in the Sprint panel so that the answer costs
 * no clicks at all. Anyone who turned the pill off has no other place to see
 * it, and making them pick a panel every time is the friction the feature was
 * supposed to remove.
 *
 * Nothing is shown when the anchor cannot be read — the panel says why, and a
 * broken readout in the chrome of every screen would be worse than none.
 */
export function SprintSummary({ settings, onOpen }: Props) {
  if (!settings) return null
  const sprint = sprintFor(new Date(), {
    number: settings.sprint.anchorNumber,
    start: settings.sprint.anchorStart,
  })
  if (!sprint) return null

  return (
    <button
      type="button"
      className={`side__sprint ${sprint.daysUntilEnd <= 0 ? 'side__sprint--last' : ''}`}
      onClick={onOpen}
      // The dates go here rather than on screen: the sidebar is narrow, and
      // the number and the deadline are what the glance is for.
      title={`${formatRange(sprint)} — open the Sprint panel`}
    >
      <span className="side__sprint-no">Sprint {sprint.number}</span>
      <span className="side__sprint-when">{formatRemaining(sprint)}</span>
    </button>
  )
}
