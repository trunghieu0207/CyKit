import type { LockRequest, LockResponse } from '../../background'
import { formatCountdown, parseEvents } from '../../shared/garoon'
import type { ScheduleEvent } from '../../shared/garoon'
import {
  baseBranchFrom,
  lockStateFor,
  matchesBranch,
  matchesRepo,
} from '../../shared/lock'
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

/*
 * Shaped after the status rows GitHub already stacks in the merge box — white
 * ground, hairline border, and the state carried by a round icon badge rather
 * than by flooding the row with colour. A filled panel read as a bolt-on
 * sitting next to "This branch has not been deployed"; this reads as another
 * row of the same list.
 */
#${ROOT_ID}{
  display:flex;
  gap:16px;
  align-items:center;
  margin:0 0 8px;
  padding:16px;
  border:1px solid var(--borderColor-default, #d1d9e0);
  border-radius:6px;
  background:var(--bgColor-default, #ffffff);
  color:var(--fgColor-default, #1f2328);
  font-family:inherit;
  font-size:14px;
  line-height:20px;
}
#${ROOT_ID} .cykit-bl-badge{
  flex:none;
  display:flex;
  align-items:center;
  justify-content:center;
  width:30px;
  height:30px;
  border-radius:50%;
  background:var(--bgColor-neutral-emphasis, #59636e);
  color:#ffffff;
}
#${ROOT_ID}[data-tone="locked"] .cykit-bl-badge{
  background:var(--bgColor-danger-emphasis, #cf222e);
}
#${ROOT_ID}[data-tone="soon"] .cykit-bl-badge{
  background:var(--bgColor-attention-emphasis, #bf8700);
}
#${ROOT_ID}[data-tone="open"] .cykit-bl-badge{
  background:var(--bgColor-success-emphasis, #1f883d);
}
#${ROOT_ID}[data-tone="unknown"] .cykit-bl-badge{
  background:var(--bgColor-default, #fff);
  border:1px solid var(--borderColor-default, #d1d9e0);
  color:var(--fgColor-muted, #59636e);
}

/* Locked is the one state that should catch an eye already on its way to the
   merge button, so it keeps a tint — everything else stays plain. */
#${ROOT_ID}[data-tone="locked"]{
  border-color:var(--borderColor-danger-emphasis, #cf222e);
}

#${ROOT_ID} .cykit-bl-text{flex:1;min-width:0}
/* 16px, measured against GitHub's own rows: at 14px the title sat visibly
   smaller than "This branch has not been deployed" beside it. */
#${ROOT_ID} .cykit-bl-head{
  display:block;
  font-size:16px;
  font-weight:600;
  line-height:24px;
}
#${ROOT_ID}[data-tone="locked"] .cykit-bl-head{color:var(--fgColor-danger, #cf222e)}
#${ROOT_ID} .cykit-bl-sub{
  display:block;
  color:var(--fgColor-muted, #59636e);
  font-size:14px;
  line-height:20px;
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

/**
 * Octicon-shaped glyphs rather than emoji: an emoji renders in its own colour
 * and its own metrics, which is exactly what made the row look pasted on.
 */
const GLYPHS: Record<Tone, string> = {
  locked:
    '<rect x="3.2" y="7.2" width="9.6" height="6.6" rx="1.4"/>' +
    '<path d="M5.4 7.2V5.2a2.6 2.6 0 0 1 5.2 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  soon:
    '<path d="M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Zm0 1.6a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Z"/>' +
    '<path d="M7.25 4.6h1.5v3.7l2.4 1.4-.75 1.3-3.15-1.85V4.6Z"/>',
  open:
    '<path d="M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Zm3.1 4.4-3.9 4a.8.8 0 0 1-1.15 0L4.9 8.95l1.1-1.15 1 1 3.05-3.15 1.05 1.15Z"/>',
  unknown:
    '<path d="M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Zm0 1.5a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4Z"/>' +
    '<path d="M7.3 10.6h1.4v1.4H7.3v-1.4Zm2.6-4.2c0 1.1-.6 1.5-1.1 1.9-.4.3-.5.5-.5.9v.3H7.1v-.4c0-.9.4-1.4 1-1.8.5-.4.7-.6.7-1 0-.5-.4-.8-.9-.8s-.9.3-1 .9l-1.3-.3c.2-1.1 1-1.9 2.3-1.9 1.2 0 2 .8 2 1.9Z"/>',
}

function glyph(tone: Tone): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = GLYPHS[tone]
  return svg
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

  const badge = document.createElement('span')
  badge.className = 'cykit-bl-badge'
  badge.appendChild(glyph(tone))
  root.appendChild(badge)

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
  // Nothing at all on a repository the windows do not describe: a lock says
  // something about one codebase, and repeating it elsewhere would assert
  // something untrue rather than merely clutter.
  if (!matchesRepo(ref.owner, ref.repo, current.repos)) {
    remove()
    return
  }
  if (!current.origin || !current.organizationId) {
    paint('unknown', 'Branch locks are not configured', 'Set the Garoon address and group id in the CyKit popup.')
    return
  }

  const branch = baseBranchFrom(document)
  if (!branch) return
  // Same reasoning as the repository filter: on a branch no window describes,
  // the feature is making no claim, so saying anything would be noise.
  if (!matchesBranch(branch, current.branches)) {
    remove()
    return
  }

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
