import type { ScheduleEvent } from './garoon'

/**
 * Branch-lock windows published on a Garoon group calendar, e.g.
 *
 *   🔒 [main] Sep/24 19:00 - Sep/28 12:00 (JST)
 *   🔒 [beta] Oct/01 18:00 - Oct/02 09:00 (JST)
 *
 * The point of surfacing these on GitHub is to stop someone merging into a
 * branch that is closed. That makes correctness matter more than presentation:
 * a missed lock is worse than no feature, because people come to rely on it.
 */

export interface LockWindow {
  branch: string
  event: ScheduleEvent
  /** When the branch actually closes — from the title, not the event. */
  start: Date
  /** When it reopens; null when the title gives no end. */
  end: Date | null
  /** True when the window came from the title rather than the event times. */
  fromTitle: boolean
}

/**
 * Minutes east of UTC for the labels these titles carry. The team writes JST,
 * and that is the default when no label is present — guessing the reader's own
 * zone would silently shift every window by the difference.
 */
const ZONES: Record<string, number> = { jst: 540, kst: 540, ict: 420, utc: 0, gmt: 0 }
const DEFAULT_ZONE = ZONES.jst!

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

/**
 * `Sep/24 19:00 - Sep/28 12:00`, with the end's month and day optional when the
 * window closes the same day. Several dash characters are accepted because
 * these titles are typed by hand.
 */
const RANGE =
  /([A-Za-z]{3,9})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*[-–—~]+\s*(?:([A-Za-z]{3,9})\/(\d{1,2})\s+)?(\d{1,2}):(\d{2})/

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase())
}

function atZone(year: number, month: number, day: number, h: number, m: number, zone: number): Date {
  // The title states a wall-clock time in its own zone, so build the instant
  // from UTC and subtract the offset rather than going through local time.
  return new Date(Date.UTC(year, month, day, h, m) - zone * 60_000)
}

function zoneOf(subject: string): number {
  const label = /\(([A-Za-z]{3,4})\)/.exec(subject)?.[1]?.toLowerCase()
  return label === undefined ? DEFAULT_ZONE : (ZONES[label] ?? DEFAULT_ZONE)
}

/**
 * Reads the window out of a title such as
 * `🔒 [main] Sep/24 19:00 - Sep/28 12:00 (JST)`.
 *
 * The title carries no year, so it is taken from `anchor` — the event's own
 * start, which sits within days of the window it describes. The neighbouring
 * years are tried too and the closest match wins, which is what makes a window
 * spanning New Year (`Dec/30 → Jan/02`) land in the right years instead of
 * ending three hundred days before it starts.
 */
export function parseLockTitleWindow(
  subject: string,
  anchor: Date,
): { start: Date; end: Date | null } | null {
  const m = RANGE.exec(subject)
  if (!m) return null

  const startMonth = monthIndex(m[1]!)
  const endMonth = m[5] ? monthIndex(m[5]) : startMonth
  if (startMonth < 0 || endMonth < 0) return null

  const startDay = Number(m[2])
  const endDay = m[6] ? Number(m[6]) : startDay
  const zone = zoneOf(subject)

  let best: { start: Date; end: Date } | null = null
  for (const year of [anchor.getFullYear() - 1, anchor.getFullYear(), anchor.getFullYear() + 1]) {
    const start = atZone(year, startMonth, startDay, Number(m[3]), Number(m[4]), zone)
    let end = atZone(year, endMonth, endDay, Number(m[7]), Number(m[8]), zone)
    // A window that appears to end before it starts has crossed New Year.
    if (end < start) end = atZone(year + 1, endMonth, endDay, Number(m[7]), Number(m[8]), zone)
    if (
      !best ||
      Math.abs(start.getTime() - anchor.getTime()) < Math.abs(best.start.getTime() - anchor.getTime())
    ) {
      best = { start, end }
    }
  }
  return best
}

export interface LockState {
  branch: string
  /** True while a window is open right now. */
  locked: boolean
  /** When the current lock lifts, if it has an end. */
  until: Date | null
  /** The next window, when not currently locked. */
  next: LockWindow | null
}

/**
 * Reads the branch out of a title.
 *
 * The lock emoji is not required: it is decoration, and a title typed without
 * it should still be honoured. The bracketed branch is the part that carries
 * meaning, and it must be the first bracket so that a trailing "[JST]" or a
 * note in brackets cannot be mistaken for one.
 */
export function parseLockBranch(subject: string): string | null {
  const m = /^[^\[]*\[\s*([A-Za-z0-9._/-]+)\s*\]/.exec(subject)
  return m ? m[1]!.toLowerCase() : null
}

/**
 * Every event whose title names a branch, with the window it closes.
 *
 * The event's own times win. They come from the API with a timezone attached
 * and need no interpretation, whereas the title is hand-typed prose that can
 * disagree with the event it sits on — and text that can override good data is
 * a liability, not a safety net.
 *
 * The title is read only when the event cannot answer: an all-day marker, or
 * one with no end. There the hours exist only in the subject, and reporting a
 * lock from midnight to midnight would be wrong by hours at both ends — wrong
 * in the unsafe direction at the close, where it would claim a branch is shut
 * after it has reopened.
 */
export function lockWindows(events: readonly ScheduleEvent[]): LockWindow[] {
  const out: LockWindow[] = []
  for (const event of events) {
    const branch = parseLockBranch(event.subject)
    if (!branch) continue

    if (!event.isAllDay && event.end) {
      out.push({ branch, event, start: event.start, end: event.end, fromTitle: false })
      continue
    }

    const titled = parseLockTitleWindow(event.subject, event.start)
    out.push(
      titled
        ? { branch, event, start: titled.start, end: titled.end, fromTitle: true }
        : { branch, event, start: event.start, end: event.end, fromTitle: false },
    )
  }
  return out
}

/**
 * Whether the given branch is closed right now, and what happens next.
 *
 * Matching is case-insensitive because branch names on GitHub and titles typed
 * by hand will not agree on case.
 */
export function lockStateFor(
  branch: string,
  events: readonly ScheduleEvent[],
  now: Date,
): LockState {
  const wanted = branch.toLowerCase()
  const windows = lockWindows(events)
    .filter((w) => w.branch === wanted)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  // Half-open, as everywhere else: a window ending at 12:00 is over at 12:00.
  const open = windows.find((w) => w.start <= now && (w.end === null || w.end > now))
  if (open) return { branch: wanted, locked: true, until: open.end, next: null }

  const upcoming = windows.find((w) => w.start > now)
  return { branch: wanted, locked: false, until: null, next: upcoming ?? null }
}

/** The branches mentioned by any window, in first-seen order. */
export function branchesIn(events: readonly ScheduleEvent[]): string[] {
  const seen = new Set<string>()
  for (const w of lockWindows(events)) seen.add(w.branch)
  return [...seen]
}

// --- reading the pull request's target branch ------------------------------

/**
 * The branch a pull request would merge into.
 *
 * Read from the href of the first `BranchName` link (`/owner/repo/tree/<branch>`)
 * rather than its text. The text carries an owner prefix — `react:main` — and
 * branch names may contain slashes, so splitting the text is ambiguous while
 * the href is not. `.base-ref` is the pre-React markup, still on older GitHub
 * Enterprise, and is kept as a fallback.
 */
export function baseBranchFrom(doc: Document): string | null {
  const link = doc.querySelector('a[data-component="BranchName"]')
  const href = link?.getAttribute('href') ?? ''
  const viaHref = /\/tree\/(.+)$/.exec(href)
  if (viaHref) return decodeURIComponent(viaHref[1]!)

  const legacy = doc.querySelector('.base-ref')?.textContent?.trim()
  if (legacy) return legacy.includes(':') ? legacy.slice(legacy.indexOf(':') + 1) : legacy

  // Last resort: the link text, minus the owner prefix.
  const text = link?.textContent?.trim()
  if (!text) return null
  return text.includes(':') ? text.slice(text.indexOf(':') + 1) : text
}

// --- which repositories this applies to -----------------------------------

/**
 * Whether the banner belongs on this repository.
 *
 * A lock window says something about one codebase, so showing it on an
 * unrelated pull request is not merely noise — it asserts something false. An
 * empty list means every repository, which keeps a half-configured install
 * visible rather than silently doing nothing.
 *
 * A pattern with a slash is matched as `owner/repo`; without one it matches
 * the repository name under any owner, so `garoon` covers both
 * `acme/app` and `acme-private/app`.
 */
export function matchesRepo(owner: string, repo: string, patterns: string): boolean {
  const wanted = patterns
    .split(',')
    .map((p) => p.trim().toLowerCase().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
  if (wanted.length === 0) return true

  const full = `${owner.toLowerCase()}/${repo.toLowerCase()}`
  const name = repo.toLowerCase()
  return wanted.some((p) => (p.includes('/') ? p === full : p === name))
}

/**
 * Whether this target branch is one the windows ever describe.
 *
 * A pull request into a feature branch is never blocked by a release lock, so
 * a row telling its author the branch is open would be noise — and noise is
 * how a warning earns the right to be ignored.
 *
 * Deliberately a setting rather than derived from the calendar. Reading the
 * branches out of the fetched windows would look self-configuring, but it
 * fails exactly when it matters: with no lock scheduled in the window the
 * calendar mentions no branches at all, and "main is open" — the most useful
 * thing the feature ever says — would vanish.
 */
export function matchesBranch(branch: string, patterns: string): boolean {
  const wanted = patterns
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  if (wanted.length === 0) return true
  return wanted.includes(branch.toLowerCase())
}
