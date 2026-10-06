import { formatRange, formatRemaining, sprintFor } from '../shared/sprint'
import type { SummaryProps } from './panels'

/**
 * The running sprint, as a card on the Overview screen.
 *
 * It is there so the answer costs opening the extension and nothing more.
 * Anyone who turned the on-page pill off has no other place to see it, and
 * making them pick a panel every time is the friction the feature was supposed
 * to remove.
 *
 * Nothing is shown when the anchor cannot be read — the Sprint panel says why,
 * and a broken card on the landing screen would be worse than none.
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
      className={`card ${sprint.daysUntilEnd <= 0 ? 'card--warn' : ''}`}
      onClick={onOpen}
      title="Open the Sprint panel"
    >
      <span className="card__main">Sprint {sprint.number}</span>
      <span className="card__sub">
        {formatRange(sprint)} · {formatRemaining(sprint)}
      </span>
    </button>
  )
}
