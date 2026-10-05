/**
 * Garoon schedule API — URL building and response shaping. No DOM and no
 * network here, so the awkward parts (time zones, day boundaries, all-day
 * events) can be tested on their own.
 *
 * Reads use session authentication: the browser already holds the Garoon
 * cookie, and kintone and Garoon share one host, so a content script on a
 * `/k/` page can call `/g/api/v1/…` same-origin. Only the `X-Requested-With`
 * header is needed; the CSRF token the docs require is for writes, and this
 * never writes.
 */

import { calendarDaysBetween } from './days'

/** Cloud Garoon. On-premise installs put the API under a different prefix. */
const API_PATH = '/g/api/v1/schedule/events'

/** The API caps a page at 1000; a few days of one person's diary is far less. */
const LIMIT = 100

export interface ScheduleEvent {
  id: string
  subject: string
  /** Local start, as returned. */
  start: Date
  /** Absent for events with no end time. */
  end: Date | null
  isAllDay: boolean
}

/** RFC 3339 with the local UTC offset, which is what the API expects. */
function rfc3339(d: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  const offset = -d.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(Math.abs(offset) % 60)}`
  )
}

/** Midnight today through the end of the last requested day. */
function windowFor(now: Date, days: number): { start: Date; end: Date } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + Math.max(1, days))
  end.setMilliseconds(-1)
  return { start, end }
}

export function eventsUrl(origin: string, now: Date, days: number): string {
  const { start, end } = windowFor(now, days)
  const query = new URLSearchParams({
    rangeStart: rfc3339(start),
    rangeEnd: rfc3339(end),
    orderBy: 'start asc',
    limit: String(LIMIT),
  })
  // `target` is omitted on purpose: the API then defaults to the Garoon user
  // running the request, which is exactly "my schedule".
  return `${origin}${API_PATH}?${query}`
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function zoneOffset(instant: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant)
    const at: Record<string, string> = {}
    for (const { type, value } of parts) at[type] = value
    const hour = at.hour === '24' ? '0' : (at.hour ?? '0')
    const asIfUtc = Date.UTC(
      Number(at.year),
      Number(at.month) - 1,
      Number(at.day),
      Number(hour),
      Number(at.minute),
      Number(at.second ?? 0),
    )
    return asIfUtc - instant.getTime()
  } catch {
    // An unknown zone name; the caller falls back.
    return null
  }
}

/**
 * Resolves a wall-clock string in a named zone to an absolute instant.
 *
 * Two passes: the first guess treats the wall time as UTC and corrects by the
 * zone's offset, the second re-checks that offset at the corrected instant,
 * which is what gets a time near a daylight-saving change onto the right side
 * of it.
 */
function fromWallClock(wall: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(wall)
  if (!m) return null
  const asUtc = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] ?? 0),
  )
  let t = asUtc
  for (let i = 0; i < 2; i++) {
    const offset = zoneOffset(new Date(t), timeZone)
    if (offset === null) return null
    t = asUtc - offset
  }
  return new Date(t)
}

/** A time read from the API, and whether it named a day rather than a moment. */
interface ReadTime {
  at: Date
  /** True for `{ date }`, which carries no hour at all. */
  dateOnly: boolean
}

/**
 * Garoon returns `{ dateTime, timeZone }` for a timed event and `{ date }` for
 * one that occupies whole days — an all-day entry or the multi-day banner.
 *
 * Reading only `dateTime` was a silent hole: a banner event has no such field,
 * so it was dropped for want of a start and the branch it locked looked open.
 * Nothing logged it, because dropping an unparseable event is otherwise the
 * right thing to do.
 *
 * When `dateTime` carries a UTC offset it names an instant outright, and the
 * zone beside it only says how Garoon would display it — `19:00+09:00` and
 * `17:00+07:00` are the same moment, so the viewer's own zone is irrelevant.
 *
 * When it carries no offset it is a wall-clock reading in `timeZone`, and
 * handing it to `new Date` would resolve it against the *browser's* zone
 * instead. Those agree only while the Garoon profile and the machine agree,
 * which is exactly the case that does not hold for a team working across Japan
 * and Vietnam — so the zone is applied explicitly.
 */
function readTime(value: unknown): ReadTime | null {
  const box = value as { dateTime?: unknown; date?: unknown; timeZone?: unknown } | null
  const zone = typeof box?.timeZone === 'string' && box.timeZone ? box.timeZone : null

  // A bare day. `new Date('2026-10-08')` would read it as UTC midnight, which
  // lands on the previous day for anyone west of Greenwich, so it is resolved
  // explicitly instead.
  if (typeof box?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(box.date.trim())) {
    const [y, mo, d] = box.date.trim().split('-').map(Number)
    const at = zone
      ? fromWallClock(`${box.date.trim()}T00:00`, zone)
      : new Date(y!, mo! - 1, d!)
    return at ? { at, dateOnly: true } : null
  }

  const raw = typeof value === 'string' ? value
    : typeof box?.dateTime === 'string' ? box.dateTime
    : null
  if (!raw) return null

  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw.trim())
  if (!hasOffset && zone) {
    const resolved = fromWallClock(raw, zone)
    if (resolved) return { at: resolved, dateOnly: false }
  }

  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : { at: d, dateOnly: false }
}

/**
 * Shapes the response defensively: anything without a usable start is dropped
 * rather than rendered as a broken row, and unknown fields are ignored so a
 * Garoon update cannot break the widget.
 */
export function parseEvents(payload: unknown): ScheduleEvent[] {
  const raw = (payload as { events?: unknown })?.events
  if (!Array.isArray(raw)) return []

  const events: ScheduleEvent[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const e = item as Record<string, unknown>
    const start = readTime(e.start)
    if (!start) continue
    const end = readTime(e.end)
    events.push({
      id: String(e.id ?? ''),
      subject: typeof e.subject === 'string' && e.subject ? e.subject : '(no title)',
      start: start.at,
      end: end?.at ?? null,
      /*
       * A start given as a bare day counts as all-day whatever the flags say.
       * That is the condition the window actually depends on — it decides
       * whether `lockWindows` trusts the event's hours or recovers them from
       * the title — and inferring it from the data is steadier than trusting a
       * flag whose spelling varies between Garoon versions.
       */
      isAllDay: start.dateOnly || e.isAllDay === true || e.eventType === 'ALL_DAY',
    })
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}


/**
 * "in 12 min", "in 2h 05m", "tomorrow", "in 3 days" — coarser the further out.
 *
 * Beyond today the unit is the **calendar day**, not elapsed hours. Rounding
 * hours made the same deadline drift during a single day: a lock 60 hours away
 * read as "in 3 days" at nine in the morning and "in 2 days" by the evening,
 * with nothing having changed but the clock. A calendar count holds still from
 * midnight to midnight, and matches how the sprint feature counts, so the two
 * never contradict each other on the same screen.
 *
 * Inside a day it stays on hours and minutes whatever the date says. A lock at
 * midnight is five hours away at seven in the evening, and calling that
 * "tomorrow" is true but useless — the whole point of the row is to say how
 * much room is left. Hours do not drift the way rounded days did: they simply
 * count down.
 */
export function formatCountdown(now: Date, target: Date): string {
  const mins = Math.round((target.getTime() - now.getTime()) / 60000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} min`

  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    const rest = mins % 60
    return rest === 0 ? `in ${hours}h` : `in ${hours}h ${String(rest).padStart(2, '0')}m`
  }

  // A day or more out, where the calendar is what people reason with.
  const days = calendarDaysBetween(now, target)
  return days <= 1 ? 'tomorrow' : `in ${days} days`
}
