import { statusOf } from './garoon'
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

/** Every event whose title names a branch, paired with that branch. */
export function lockWindows(events: readonly ScheduleEvent[]): LockWindow[] {
  const out: LockWindow[] = []
  for (const event of events) {
    const branch = parseLockBranch(event.subject)
    if (branch) out.push({ branch, event })
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
    .sort((a, b) => a.event.start.getTime() - b.event.start.getTime())

  const open = windows.find((w) => statusOf(w.event, now) === 'now')
  if (open) {
    return { branch: wanted, locked: true, until: open.event.end, next: null }
  }

  const upcoming = windows.find((w) => statusOf(w.event, now) === 'future')
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
