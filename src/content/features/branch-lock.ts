import type { LockRequest, LockResponse } from '../../background'
import { formatCountdown, parseEvents } from '../../shared/garoon'
import type { ScheduleEvent } from '../../shared/garoon'
import { baseBranchFrom, lockStateFor } from '../../shared/lock'
import { parseIssuePath } from '../../shared/github'
import { detectProduct } from '../../shared/scope'
import type { Settings } from '../../shared/types'

/**
 * Warns on a pull request when the branch it targets is closed for merging.
 *
 * The windows live on a Garoon group calendar as titles like
 * `🔒 [main] Sep/24 19:00 - Sep/28 12:00 (JST)`. A GitHub page cannot read them
 * itself — Chrome blocks cross-origin requests from content scripts regardless
 * of host permissions — so the service worker fetches and this renders.
 *
 * The feature exists to prevent a mistake, which shapes one decision
 * throughout: **every outcome is shown, including failure**. A banner that
 * simply does not appear when the check breaks looks exactly like "the branch
 * is open", and people would merge on that. So "open", "could not check" and
 * "no permission" each get a line of their own.
 */

const ROOT_ID = 'cykit-branch-lock'
const STYLE_ID = 'cykit-branch-lock-style'

/** Short: a stale "open" here is the expensive kind of wrong. */
const CACHE_MS = 2 * 60 * 1000

const DEBOUNCE_MS = 250

/**
 * Where to put it, best first. `mergebox-partial` is the merge box itself, so
 * the warning sits exactly where the decision is made. The rest are fallbacks,
 * ending at the page body — appearing in a worse place beats not appearing.
 */
const ANCHORS = [
  '[data-testid="mergebox-partial"]',
  '[data-testid="mergebox-border-container"]',
  '#partial-pull-merging',
  '.merge-pr',
  'main',
]

type Tone = 'locked' | 'soon' | 'open' | 'unknown'

interface Cache {
  at: number
  key: string
  events: ScheduleEvent[]
}

let cache: Cache | null = null
let inFlight: Promise<ScheduleEvent[] | null> | null = null
let settings: Settings['branchLock'] | null = null
let observer: MutationObserver | null = null
let timer: number | undefined
let lastError: string | null = null

/** The parts of `location` this feature reads. */
export interface PageLocation {
  hostname: string
  pathname: string
}

/**
 * Read through one place rather than touching the global further down: `draw`
 * runs from a timer as well as from `apply`, and it should see the same URL
 * either way.
 */
let loc: PageLocation = location

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  // Namespaced and reset, like every other surface this extension injects into
  // a page it does not own.
  style.textContent = `#${ROOT_ID}, #${ROOT_ID} *{
  box-sizing:border-box;
  margin:0;
  padding:0;
  border:0;
  background:none;
  box-shadow:none;
  color:inherit;
  font:inherit;
  letter-spacing:normal;
  text-align:left;
  text-transform:none;
  list-style:none;
}
#${ROOT_ID}{
  display:flex;
  gap:10px;
  align-items:flex-start;
  margin:0 0 12px;
  padding:12px 14px;
  border:1px solid var(--borderColor-default, #d1d9e0);
  border-radius:8px;
  background:var(--bgColor-default, #fff);
  color:var(--fgColor-default, #1f2328);
  font-family:inherit;
  font-size:14px;
  line-height:20px;
}
#${ROOT_ID}[data-tone="locked"]{
  border-color:var(--borderColor-danger-emphasis, #cf222e);
  background:var(--bgColor-danger-muted, #fff1f0);
}
#${ROOT_ID}[data-tone="soon"]{
  border-color:var(--borderColor-attention-emphasis, #9a6700);
  background:var(--bgColor-attention-muted, #fff8c5);
}
#${ROOT_ID}[data-tone="unknown"]{
  border-style:dashed;
  color:var(--fgColor-muted, #59636e);
}
#${ROOT_ID} .cykit-bl-mark{flex:none;font-size:16px;line-height:20px}
#${ROOT_ID} .cykit-bl-text{flex:1;min-width:0}
#${ROOT_ID} .cykit-bl-head{display:block;font-weight:600}
#${ROOT_ID}[data-tone="locked"] .cykit-bl-head{color:var(--fgColor-danger, #cf222e)}
#${ROOT_ID} .cykit-bl-sub{
  display:block;
  margin-top:2px;
  color:var(--fgColor-muted, #59636e);
  font-size:12px;
  line-height:16px;
}`
  ;(document.head ?? document.documentElement).appendChild(style)
}

async function load(origin: string, organizationId: string, days: number) {
  const key = `${origin}|${organizationId}|${days}`
  const now = Date.now()
  if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.events
  if (inFlight) return inFlight

  inFlight = (async () => {
    const request: LockRequest = {
      type: 'garoon-events',
      origin,
      organizationId,
      keyword: '',
      days,
    }
    try {
      const res: LockResponse = await chrome.runtime.sendMessage(request)
      if (!res?.ok) {
        lastError =
          res?.reason === 'no-permission'
            ? 'CyKit has no access to Garoon yet — grant it from the extension popup.'
            : res?.reason === 'unauthorised'
              ? 'Garoon refused the request. Open Garoon, sign in, then reload.'
              : 'Could not reach Garoon.'
        return null
      }
      lastError = null
      const events = parseEvents(res.payload)
      cache = { at: now, key, events }
      return events
    } catch {
      lastError = 'Could not reach Garoon.'
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/**
 * Shown in the reader's own zone, with the zone named.
 *
 * The titles are written in JST and the team reading them is not in Japan, so
 * an unlabelled "12:00" would be read as the Japanese time it is not. Naming
 * the zone makes the conversion visible instead of silent.
 */
function when(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function paint(tone: Tone, head: string, sub: string): void {
  ensureStyle()

  let root = document.getElementById(ROOT_ID)
  if (!root) {
    root = document.createElement('div')
    root.id = ROOT_ID
  }
  root.dataset.tone = tone
  root.textContent = ''

  const mark = document.createElement('span')
  mark.className = 'cykit-bl-mark'
  mark.textContent = tone === 'locked' ? '🔒' : tone === 'soon' ? '⏳' : tone === 'open' ? '✅' : '❔'
  root.appendChild(mark)

  const text = document.createElement('span')
  text.className = 'cykit-bl-text'
  const h = document.createElement('strong')
  h.className = 'cykit-bl-head'
  h.textContent = head
  text.appendChild(h)
  const s = document.createElement('span')
  s.className = 'cykit-bl-sub'
  s.textContent = sub
  text.appendChild(s)
  root.appendChild(text)

  for (const selector of ANCHORS) {
    const anchor = document.querySelector(selector)
    if (!anchor) continue
    if (anchor.firstChild !== root) anchor.insertBefore(root, anchor.firstChild)
    return
  }
  root.remove()
}

function remove(): void {
  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()
}

function draw(): void {
  const current = settings
  const ref = parseIssuePath(loc.pathname)

  if (!current?.enabled || ref?.kind !== 'pull') {
    remove()
    return
  }
  if (!current.origin || !current.organizationId) {
    paint('unknown', 'Branch locks are not configured', 'Set the Garoon address and group id in the CyKit popup.')
    return
  }

  const branch = baseBranchFrom(document)
  if (!branch) return

  void load(current.origin, current.organizationId, current.days).then((events) => {
    if (!settings?.enabled) {
      remove()
      return
    }
    if (!events) {
      paint('unknown', `Could not check whether ${branch} is locked`, lastError ?? '')
      return
    }

    const now = new Date()
    const state = lockStateFor(branch, events, now)

    if (state.locked) {
      paint(
        'locked',
        `${branch} is locked — do not merge`,
        state.until ? `Opens again ${when(state.until)}.` : 'No end time given.',
      )
      return
    }
    if (state.next) {
      const start = state.next.event.start
      paint('soon', `${branch} is open`, `Locks ${when(start)} · ${formatCountdown(now, start)}.`)
      return
    }
    paint('open', `${branch} is open`, 'No lock window scheduled.')
  })
}

function schedule(): void {
  if (timer !== undefined) return
  timer = window.setTimeout(() => {
    timer = undefined
    draw()
  }, DEBOUNCE_MS)
}

export function applyBranchLock(all: Settings, page: PageLocation = location): void {
  settings = all.branchLock
  loc = page
  const onGithub = detectProduct(page.hostname, page.pathname) === 'github'

  if (!all.branchLock.enabled || !onGithub || !document.body) {
    observer?.disconnect()
    observer = null
    remove()
    return
  }

  draw()
  if (!observer) {
    // GitHub renders the merge box after the rest of the page, and navigates
    // between pull requests without reloading.
    observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
  }
}
