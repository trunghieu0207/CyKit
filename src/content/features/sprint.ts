import { isInScope } from '../../shared/scope'
import {
  formatRange,
  formatRemaining,
  msUntilMidnight,
  sprintFor,
} from '../../shared/sprint'
import type { Settings } from '../../shared/types'

/**
 * Shows which sprint is running, as a small pill pinned to a corner of the
 * page.
 *
 * It attaches to `document.body` and positions itself, so it needs no selector
 * from kintone or Garoon at all — nothing to break when either redesigns. The
 * cost is that it sits over the page rather than in it, which is why the
 * corner is a setting.
 */

const ROOT_ID = 'cykit-sprint'
const STYLE_ID = 'cykit-sprint-style'

/** The parts of `location` this feature reads. */
export interface PageLocation {
  hostname: string
  pathname: string
}

let loc: PageLocation = location
let timer: number | undefined
let current: Settings['sprint'] | null = null

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  /*
   * Namespaced throughout, with the reset first. kintone and Garoon both style
   * bare elements heavily, so anything created here arrives wearing rules it
   * never asked for.
   */
  style.textContent = `
#${ROOT_ID}, #${ROOT_ID} *{
  box-sizing:border-box;
  margin:0;
  padding:0;
  border:0;
  outline:0;
  background:none;
  box-shadow:none;
  color:inherit;
  font:inherit;
  letter-spacing:normal;
  text-align:left;
  text-decoration:none;
  text-transform:none;
  text-indent:0;
  list-style:none;
  float:none;
  width:auto;
  height:auto;
  min-width:0;
}
#${ROOT_ID}{
  position:fixed;
  z-index:2147482000;
  display:block;
  padding:7px 12px;
  border:1px solid #d7dcdf;
  border-radius:8px;
  background:#ffffff;
  box-shadow:0 2px 10px rgba(0,0,0,.12);
  color:#3a4145;
  font-family:system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;
  font-size:12px;
  line-height:1.35;
  /* Pointer-transparent: it is a readout, and it must never sit between the
     user and whatever it happens to cover. */
  pointer-events:none;
  user-select:none;
  opacity:.94;
}
#${ROOT_ID}[data-corner="top-left"]{top:12px;left:12px}
#${ROOT_ID}[data-corner="top-right"]{top:12px;right:12px}
#${ROOT_ID}[data-corner="bottom-left"]{bottom:12px;left:12px}
#${ROOT_ID}[data-corner="bottom-right"]{bottom:12px;right:12px}
#${ROOT_ID} .cykit-sprint-no{
  display:block;
  font-size:13px;
  font-weight:700;
}
#${ROOT_ID} .cykit-sprint-sub{
  display:block;
  margin-top:1px;
  color:#7b878c;
  font-size:11px;
  white-space:nowrap;
}
/* The day it ends is the one worth noticing. */
#${ROOT_ID}[data-last="true"]{border-color:#e0a32e}
#${ROOT_ID}[data-last="true"] .cykit-sprint-no{color:#8a5a00}`
  ;(document.head ?? document.documentElement).appendChild(style)
}

function remove(): void {
  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()
}

/** Idempotent: rebuilds the pill's contents in place. */
function draw(): void {
  if (!current) return remove()

  const sprint = sprintFor(new Date(), {
    number: current.anchorNumber,
    start: current.anchorStart,
  })
  // An unreadable anchor shows nothing rather than a confidently wrong number.
  if (!sprint) return remove()

  ensureStyle()
  let root = document.getElementById(ROOT_ID)
  if (!root) {
    root = document.createElement('div')
    root.id = ROOT_ID
    document.body.appendChild(root)
  }
  root.dataset.corner = current.corner
  root.dataset.last = String(sprint.daysUntilEnd <= 0)
  root.textContent = ''

  const no = document.createElement('span')
  no.className = 'cykit-sprint-no'
  no.textContent = `Sprint ${sprint.number}`
  root.appendChild(no)

  const sub = document.createElement('span')
  sub.className = 'cykit-sprint-sub'
  sub.textContent = `${formatRange(sprint)} · ${formatRemaining(sprint)}`
  root.appendChild(sub)
}

/**
 * Redraws just after midnight, so a page left open overnight rolls over on its
 * own. The extra minute is slack for a clock that fires a hair early; `draw`
 * reads the time again anyway, so firing late after the machine sleeps is
 * harmless.
 */
function schedule(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    draw()
    schedule()
  }, msUntilMidnight(new Date()) + 60_000)
}

function stop(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = undefined
}

export function applySprint(settings: Settings, page: PageLocation = location): void {
  loc = page
  const { sprint } = settings
  const on =
    sprint.enabled &&
    isInScope(sprint.scope, loc.hostname, loc.pathname) &&
    // One pill per page. The Garoon portal nests several iframes, and a
    // fixed-position badge in each would stack them in the same corner.
    window.self === window.top

  if (!on || !document.body) {
    current = null
    stop()
    remove()
    return
  }

  current = sprint
  draw()
  schedule()
}
