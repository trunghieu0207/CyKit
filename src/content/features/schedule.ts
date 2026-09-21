import {
  eventsUrl,
  formatDay,
  formatTime,
  groupByDay,
  parseEvents,
} from '../../shared/garoon'
import type { ScheduleDay } from '../../shared/garoon'
import { detectProduct } from '../../shared/scope'
import { patchScheduleSettings } from '../../shared/storage'
import type { Settings } from '../../shared/types'

/**
 * Shows the signed-in user's Garoon schedule on kintone pages.
 *
 * kintone and Garoon are served from one host, so this is a same-origin GET
 * and the session cookie rides along — no stored credentials, no extra host
 * permission, and nothing is sent anywhere but back to the user's own Garoon.
 *
 * The card is `position: fixed` and owns no part of kintone's markup. That is
 * deliberate: anchoring into the page would mean matching kintone's class
 * names, which change between versions.
 *
 * It renders in the top frame only. The content script runs with
 * `all_frames: true` — the font features need that — but kintone's portal
 * embeds its portlets in iframes, and a fixed-position card inside one anchors
 * to that iframe's own viewport, so every frame drew its own copy.
 */

const ROOT_ID = 'cykit-schedule'
const STYLE_ID = 'cykit-schedule-style'

/** Long enough that navigating around kintone does not re-request per page. */
const CACHE_MS = 5 * 60 * 1000

interface Cache {
  at: number
  origin: string
  days: number
  days_: ScheduleDay[]
}

let cache: Cache | null = null
let inFlight: Promise<ScheduleDay[] | null> | null = null
let settings: Settings['schedule'] | null = null

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  // Namespaced and reset first: kintone styles bare elements, and a generic
  // class of ours would pick up its rules. Same lesson as the GitHub menu.
  style.textContent = `#${ROOT_ID}, #${ROOT_ID} *{
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
  line-height:1.45;
  text-align:left;
  text-decoration:none;
  text-transform:none;
  list-style:none;
  float:none;
  min-width:0;
}
#${ROOT_ID}{
  position:fixed;
  right:16px;
  bottom:16px;
  z-index:2147482000;
  width:272px;
  border:1px solid #e2e6ea;
  border-radius:12px;
  background:#fff;
  box-shadow:0 10px 28px rgba(20,50,80,.16), 0 1px 3px rgba(20,50,80,.10);
  color:#1b2733;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:13px;
  overflow:hidden;
}
#${ROOT_ID}[data-collapsed="true"]{width:auto}
#${ROOT_ID} .cykit-sch-bar{
  display:flex;
  gap:8px;
  align-items:center;
  width:100%;
  padding:9px 12px;
  cursor:pointer;
}
#${ROOT_ID} .cykit-sch-bar:hover{background:#f5f7f9}
#${ROOT_ID} .cykit-sch-name{
  flex:1;
  font-size:12px;
  font-weight:600;
  letter-spacing:.02em;
  text-transform:uppercase;
  color:#6a7987;
  white-space:nowrap;
}
#${ROOT_ID} .cykit-sch-count{
  flex:none;
  padding:1px 7px;
  border-radius:999px;
  background:#e8f2fb;
  color:#1c6fb5;
  font-size:11px;
  font-weight:600;
}
#${ROOT_ID} .cykit-sch-chev{flex:none;color:#6a7987}
#${ROOT_ID} .cykit-sch-body{
  max-height:330px;
  padding:0 12px 10px;
  overflow-y:auto;
  overscroll-behavior:contain;
}
#${ROOT_ID} .cykit-sch-day{
  margin-top:8px;
  padding-top:8px;
  border-top:1px solid #eef1f4;
  font-size:11px;
  font-weight:600;
  color:#6a7987;
}
#${ROOT_ID} .cykit-sch-day:first-child{margin-top:0;padding-top:0;border-top:0}
#${ROOT_ID} .cykit-sch-item{
  display:flex;
  gap:9px;
  align-items:baseline;
  padding:5px 0;
}
#${ROOT_ID} .cykit-sch-at{
  flex:none;
  width:42px;
  color:#1c6fb5;
  font-size:12px;
  font-weight:600;
  font-variant-numeric:tabular-nums;
}
#${ROOT_ID} .cykit-sch-subject{
  flex:1;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
#${ROOT_ID} .cykit-sch-empty{padding:5px 0;color:#94a1ac;font-size:12px}
#${ROOT_ID} .cykit-sch-note{padding:2px 0 4px;color:#94a1ac;font-size:11px}`
  ;(document.head ?? document.documentElement).appendChild(style)
}

async function load(origin: string, days: number): Promise<ScheduleDay[] | null> {
  const now = new Date()
  if (cache && cache.origin === origin && cache.days === days && now.getTime() - cache.at < CACHE_MS) {
    return cache.days_
  }
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetch(eventsUrl(origin, now, days), {
        // Garoon requires this header for session-authenticated API calls.
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
      })
      if (!res.ok) return null
      const grouped = groupByDay(parseEvents(await res.json()), now, days)
      cache = { at: now.getTime(), origin, days, days_: grouped }
      return grouped
    } catch {
      // Signed out, Garoon not enabled on this host, network down — none of
      // which should surface as a broken widget on someone's kintone page.
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

function chevron(collapsed: boolean): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', 'cykit-sch-chev')
  svg.innerHTML = collapsed ? '<path d="M4 10l4-4 4 4"/>' : '<path d="M4 6l4 4 4-4"/>'
  return svg
}

function render(root: HTMLElement, days: ScheduleDay[], collapsed: boolean): void {
  root.textContent = ''
  root.dataset.collapsed = String(collapsed)

  const now = new Date()
  const todayCount = days[0]?.events.length ?? 0

  const bar = document.createElement('button')
  bar.type = 'button'
  bar.className = 'cykit-sch-bar'
  bar.setAttribute('aria-expanded', String(!collapsed))

  const name = document.createElement('span')
  name.className = 'cykit-sch-name'
  name.textContent = 'Schedule'
  bar.appendChild(name)

  const count = document.createElement('span')
  count.className = 'cykit-sch-count'
  count.textContent = `${todayCount} today`
  bar.appendChild(count)
  bar.appendChild(chevron(collapsed))

  bar.addEventListener('click', () => {
    const next = root.dataset.collapsed !== 'true'
    render(root, days, next)
    void patchScheduleSettings({ collapsed: next })
  })
  root.appendChild(bar)

  if (collapsed) return

  const body = document.createElement('div')
  body.className = 'cykit-sch-body'

  for (const day of days) {
    const heading = document.createElement('div')
    heading.className = 'cykit-sch-day'
    heading.textContent = formatDay(day.date, now)
    body.appendChild(heading)

    if (day.events.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'cykit-sch-empty'
      empty.textContent = 'Nothing scheduled'
      body.appendChild(empty)
      continue
    }

    for (const event of day.events) {
      const row = document.createElement('div')
      row.className = 'cykit-sch-item'

      const at = document.createElement('span')
      at.className = 'cykit-sch-at'
      at.textContent = event.isAllDay ? 'All day' : formatTime(event.start)
      row.appendChild(at)

      const subject = document.createElement('span')
      subject.className = 'cykit-sch-subject'
      subject.textContent = event.subject
      subject.title = event.subject
      row.appendChild(subject)

      body.appendChild(row)
    }
  }
  root.appendChild(body)
}

function remove(): void {
  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()
}

export function applySchedule(
  all: Settings,
  page: { hostname: string; pathname: string; origin: string } = location,
): void {
  settings = all.schedule
  const onKintone = detectProduct(page.hostname, page.pathname) === 'kintone'
  // Comparing the references is safe cross-origin; reading through them is not.
  const topFrame = window.self === window.top

  if (!settings.enabled || !onKintone || !topFrame || !document.body) {
    remove()
    return
  }

  void load(page.origin, settings.days).then((days) => {
    // Settings can change while the request is in flight.
    if (!settings?.enabled || !days) {
      remove()
      return
    }
    ensureStyle()
    let root = document.getElementById(ROOT_ID)
    if (!root) {
      root = document.createElement('div')
      root.id = ROOT_ID
      document.body.appendChild(root)
    }
    render(root, days, settings.collapsed)
  })
}
