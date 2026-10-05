/**
 * Calendar-day arithmetic, shared by everything that counts days for a person.
 *
 * It lives on its own because two features count days and they must agree: a
 * sprint saying "ends tomorrow" while a lock two hours later says "in 2 days"
 * is the kind of disagreement that makes both look wrong.
 */

const DAY_MS = 86_400_000

/**
 * A calendar day as an integer, counted in UTC from local year/month/day.
 *
 * Subtracting two `Date`s and dividing by a day is wrong across a daylight
 * saving change: the difference is 23 or 25 hours and floors to the wrong day,
 * which would slide every later result by one. Neither Vietnam nor Japan
 * observes DST, but the extension does not get to assume where it is running.
 */
export function dayNumberOf(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) / DAY_MS
}

/** The same, read off a `Date` in whatever zone the browser is in. */
export function dayNumber(d: Date): number {
  return dayNumberOf(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Local midnight of a day number. */
export function localMidnight(dayNo: number): Date {
  const utc = new Date(dayNo * DAY_MS)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

/**
 * Whole calendar days from `from` to `to`, ignoring the time of day.
 *
 * Counting days rather than elapsed hours is deliberate. "In 60 hours" rounds
 * to three days in the morning and two by the evening, so the same deadline
 * appears to move while nothing has changed; a calendar count holds still all
 * day, which is how people hold it in their heads.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from)
}
