/**
 * Sprint arithmetic. No DOM and no clock of its own — every function is given
 * the moment it should answer for, so all of it is testable.
 *
 * Sprints run Wednesday to Tuesday: one week, treated as the half-open
 * interval [Wednesday 00:00, next Wednesday 00:00). The team describes a
 * sprint as ending "Tuesday afternoon", but the boundary here is the end of
 * Tuesday, so no hours fall between one sprint and the next.
 */

import { dayNumber, dayNumberOf, localMidnight } from './days'

export interface SprintAnchor {
  /** The sprint that was running on `start`. */
  number: number
  /** Its first day — a Wednesday — as YYYY-MM-DD in local time. */
  start: string
}

/** Sprint 439 began on Wednesday 30 September 2026. */
export const DEFAULT_ANCHOR: SprintAnchor = { number: 439, start: '2026-09-30' }

export interface Sprint {
  number: number
  /** First day, a Wednesday, at local midnight. */
  start: Date
  /** Last day, inclusive — the Tuesday, at local midnight. */
  end: Date
  /**
   * Whole days from today to the last day: 0 on the Tuesday itself, 1 on the
   * Monday, 6 on the opening Wednesday.
   *
   * Counted this way, and named this way, because "days left" is ambiguous
   * about whether today is one of them — on a Monday with the sprint ending
   * Tuesday, both 1 and 2 are defensible readings of the same phrase.
   */
  daysUntilEnd: number
}

/** Parses YYYY-MM-DD, rejecting values the calendar does not have. */
function parseAnchorDay(start: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start.trim())
  if (!m) return null
  const [year, month, day] = [+m[1]!, +m[2]!, +m[3]!]
  const n = dayNumberOf(year, month - 1, day)
  // Rejects 2026-02-31, which Date.UTC would silently roll into March.
  const back = new Date(n * 86_400_000)
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null
  return n
}

/** True when the anchor falls on a Wednesday, which is what the cycle expects. */
export function anchorStartsWednesday(start: string): boolean {
  const n = parseAnchorDay(start)
  return n !== null && localMidnight(n).getDay() === 3
}

/** Null when the anchor cannot be read; the caller shows nothing rather than a wrong number. */
export function sprintFor(now: Date, anchor: SprintAnchor = DEFAULT_ANCHOR): Sprint | null {
  const anchorDay = parseAnchorDay(anchor.start)
  if (anchorDay === null) return null
  if (!Number.isSafeInteger(anchor.number)) return null

  const today = dayNumber(now)
  // Math.floor rather than a truncating divide: dates before the anchor have
  // to count backwards, and -1/7 truncates towards zero instead of down.
  const index = Math.floor((today - anchorDay) / 7)
  const startDay = anchorDay + index * 7

  return {
    number: anchor.number + index,
    start: localMidnight(startDay),
    end: localMidnight(startDay + 6),
    daysUntilEnd: startDay + 6 - today,
  }
}

/** e.g. `Sep 30 – Oct 6`. */
export function formatRange(sprint: Sprint): string {
  const f = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
  return `${f.format(sprint.start)} – ${f.format(sprint.end)}`
}

/**
 * e.g. `ends today`, `ends tomorrow`, `ends in 3 days`.
 *
 * Phrased around the end date rather than as a count of days left, so there is
 * nothing to misread: "ends tomorrow" cannot be off by one the way "1 day
 * left" can.
 */
export function formatRemaining(sprint: Sprint): string {
  const { daysUntilEnd } = sprint
  if (daysUntilEnd <= 0) return 'ends today'
  if (daysUntilEnd === 1) return 'ends tomorrow'
  return `ends in ${daysUntilEnd} days`
}

/**
 * Milliseconds until the next local midnight, so a page left open overnight
 * can roll over on its own rather than waiting for a reload.
 */
export function msUntilMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime()
}
