import { formatRange, formatRemaining, sprintFor } from '../shared/sprint'
import type { SummaryProps } from './panels'

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
export function SprintSummary({ settings, onOpen }: SummaryProps) {
  const sprint = sprintFor(new Date(), {
    number: settings.sprint.anchorNumber,
    start: settings.sprint.anchorStart,
  })
  if (!sprint) return null

  return (
    <button
      type="button"
      className={`side__card ${sprint.daysUntilEnd <= 0 ? 'side__card--warn' : ''}`}
      onClick={onOpen}
      // The dates go here rather than on screen: the sidebar is narrow, and
      // the number and the deadline are what the glance is for.
      title={`${formatRange(sprint)} — open the Sprint panel`}
    >
      <span className="side__card-main">Sprint {sprint.number}</span>
      <span className="side__card-sub">{formatRemaining(sprint)}</span>
    </button>
  )
}
