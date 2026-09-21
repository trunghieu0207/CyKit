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

export interface ScheduleDay {
  /** Midnight local time, identifying the day. */
  date: Date
  events: ScheduleEvent[]
}

/** RFC 3339 with the local UTC offset, which is what the API expects. */
export function rfc3339(d: Date): string {
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
export function windowFor(now: Date, days: number): { start: Date; end: Date } {
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

/** Garoon returns `{ dateTime, timeZone }`; the dateTime alone is unambiguous. */
function readTime(value: unknown): Date | null {
  const raw =
    typeof value === 'string'
      ? value
      : typeof (value as { dateTime?: unknown } | null)?.dateTime === 'string'
        ? (value as { dateTime: string }).dateTime
        : null
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
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
    events.push({
      id: String(e.id ?? ''),
      subject: typeof e.subject === 'string' && e.subject ? e.subject : '(no title)',
      start,
      end: readTime(e.end),
      // `isAllDay` is the documented flag; "banner" is Garoon's all-day type.
      isAllDay: e.isAllDay === true || e.eventType === 'banner',
    })
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function midnight(d: Date): Date {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  return m
}

/**
 * Buckets events into the days actually being shown, keeping empty days so the
 * widget can say "nothing scheduled" rather than silently skipping a date.
 */
export function groupByDay(events: ScheduleEvent[], now: Date, days: number): ScheduleDay[] {
  const out: ScheduleDay[] = []
  const first = midnight(now)

  for (let i = 0; i < Math.max(1, days); i++) {
    const date = new Date(first)
    date.setDate(date.getDate() + i)
    const next = new Date(date)
    next.setDate(next.getDate() + 1)
    out.push({
      date,
      events: events.filter((e) => e.start >= date && e.start < next),
    })
  }
  return out
}

export function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "Today" and "Tomorrow" read faster than a date; anything further gets one. */
export function formatDay(date: Date, now: Date, locale?: string): string {
  const diff = Math.round((midnight(date).getTime() - midnight(now).getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
}
