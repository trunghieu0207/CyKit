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

/**
 * Garoon returns `{ dateTime, timeZone }`.
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
function readTime(value: unknown): Date | null {
  const box = value as { dateTime?: unknown; timeZone?: unknown } | null
  const raw = typeof value === 'string' ? value
    : typeof box?.dateTime === 'string' ? box.dateTime
    : null
  if (!raw) return null

  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw.trim())
  if (!hasOffset && typeof box?.timeZone === 'string' && box.timeZone) {
    const resolved = fromWallClock(raw, box.timeZone)
    if (resolved) return resolved
  }

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


/** "in 12 min", "in 2h 05m", "in 3 days" — coarser the further out it is. */
export function formatCountdown(now: Date, target: Date): string {
  const mins = Math.round((target.getTime() - now.getTime()) / 60000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    const rest = mins % 60
    return rest === 0 ? `in ${hours}h` : `in ${hours}h ${String(rest).padStart(2, '0')}m`
  }
  const days = Math.round(hours / 24)
  return days === 1 ? 'tomorrow' : `in ${days} days`
}
