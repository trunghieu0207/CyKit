import {
  eventUrl,
  eventsUrl,
  focusOf,
  formatCountdown,
  formatDay,
  formatTime,
  groupByDay,
  parseEvents,
  splitDay,
  statusOf,
} from '../../shared/garoon'
import type { ScheduleDay, ScheduleEvent } from '../../shared/garoon'
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

/** A countdown that is not re-rendered is worse than none. */
const TICK_MS = 30 * 1000

interface Cache {
  at: number
  origin: string
  days: number
  days_: ScheduleDay[]
}

let cache: Cache | null = null
let inFlight: Promise<ScheduleDay[] | null> | null = null
let settings: Settings['schedule'] | null = null
let tick: number | undefined
let origin = ''
/** All-day entries stay rolled up until asked for; not worth persisting. */
let showAllDay = false

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

/* The answer, before the list. */
#${ROOT_ID} .cykit-sch-hero{
  display:block;
  padding:10px 12px;
  border-top:1px solid #eef1f4;
  border-bottom:1px solid #eef1f4;
  background:#f7fbff;
}
#${ROOT_ID} .cykit-sch-hero:hover{background:#eef6fd}
#${ROOT_ID} .cykit-sch-kind{
  display:flex;
  gap:6px;
  align-items:baseline;
  font-size:11px;
  font-weight:700;
  letter-spacing:.04em;
  text-transform:uppercase;
  color:#1c6fb5;
}
#${ROOT_ID} .cykit-sch-kind em{
  font-style:normal;
  font-weight:600;
  letter-spacing:0;
  text-transform:none;
  color:#6a7987;
}
#${ROOT_ID}[data-soon="true"] .cykit-sch-kind{color:#c2410c}
#${ROOT_ID} .cykit-sch-hero-subject{
  display:block;
  margin-top:2px;
  font-size:13px;
  font-weight:600;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
#${ROOT_ID} .cykit-sch-bar-when{
  flex:none;
  color:#6a7987;
  font-size:11px;
  font-weight:600;
  white-space:nowrap;
}

/* Past fades out, the live one is marked. */
#${ROOT_ID} .cykit-sch-item[data-status="past"]{opacity:.42}
#${ROOT_ID} .cykit-sch-item[data-status="now"] .cykit-sch-subject{font-weight:650}
#${ROOT_ID} .cykit-sch-item[data-status="now"] .cykit-sch-at::after{
  content:"";
  display:inline-block;
  width:5px;
  height:5px;
  margin-left:4px;
  border-radius:50%;
  background:#c2410c;
  vertical-align:middle;
}
#${ROOT_ID} a.cykit-sch-item:hover .cykit-sch-subject{text-decoration:underline}
#${ROOT_ID} .cykit-sch-more{
  display:block;
  width:100%;
  padding:4px 0;
  color:#6a7987;
  font-size:11.5px;
  cursor:pointer;
}
#${ROOT_ID} .cykit-sch-more:hover{color:#1c6fb5}`
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

function row(event: ScheduleEvent, now: Date): HTMLElement {
  const item = document.createElement('a')
  item.className = 'cykit-sch-item'
  item.href = eventUrl(origin, event.id)
  item.target = '_blank'
  item.rel = 'noreferrer noopener'
  item.dataset.status = event.isAllDay ? 'future' : statusOf(event, now)

  const at = document.createElement('span')
  at.className = 'cykit-sch-at'
  at.textContent = event.isAllDay ? 'All day' : formatTime(event.start)
  item.appendChild(at)

  const subject = document.createElement('span')
  subject.className = 'cykit-sch-subject'
  subject.textContent = event.subject
  subject.title = event.subject
  item.appendChild(subject)
  return item
}

function render(root: HTMLElement, days: ScheduleDay[], collapsed: boolean): void {
  // The tick redraws every 30s; without this the list would jump to the top
  // under anyone who had scrolled it.
  const scrolled = root.querySelector('.cykit-sch-body')?.scrollTop ?? 0
  root.textContent = ''
  root.dataset.collapsed = String(collapsed)

  const now = new Date()
  const focus = focusOf(days, now)
  const soon =
    focus.kind === 'now' ||
    (focus.event !== null && focus.event.start.getTime() - now.getTime() < 15 * 60 * 1000)
  root.dataset.soon = String(soon)

  // The count people care about is meetings, not the attendance markers that
  // fill an all-day row. "9 today" was true and useless.
  const todayTimed = days[0] ? splitDay(days[0]).timed.length : 0

  const bar = document.createElement('button')
  bar.type = 'button'
  bar.className = 'cykit-sch-bar'
  bar.setAttribute('aria-expanded', String(!collapsed))

  const name = document.createElement('span')
  name.className = 'cykit-sch-name'
  name.textContent = 'Schedule'
  bar.appendChild(name)

  if (collapsed && focus.event) {
    // Rolled up, the countdown is the only thing worth the space.
    const when = document.createElement('span')
    when.className = 'cykit-sch-bar-when'
    when.textContent =
      focus.kind === 'now' ? 'now' : formatCountdown(now, focus.event.start)
    bar.appendChild(when)
  } else {
    const count = document.createElement('span')
    count.className = 'cykit-sch-count'
    count.textContent = todayTimed === 1 ? '1 meeting' : `${todayTimed} meetings`
    bar.appendChild(count)
  }
  bar.appendChild(chevron(collapsed))

  bar.addEventListener('click', () => {
    const next = root.dataset.collapsed !== 'true'
    render(root, days, next)
    void patchScheduleSettings({ collapsed: next })
  })
  root.appendChild(bar)

  if (collapsed) return

  if (focus.event) {
    const hero = document.createElement('a')
    hero.className = 'cykit-sch-hero'
    hero.href = eventUrl(origin, focus.event.id)
    hero.target = '_blank'
    hero.rel = 'noreferrer noopener'

    const kind = document.createElement('span')
    kind.className = 'cykit-sch-kind'
    kind.textContent = focus.kind === 'now' ? 'Now' : 'Next'
    const when = document.createElement('em')
    when.textContent =
      focus.kind === 'now'
        ? focus.event.end
          ? `until ${formatTime(focus.event.end)}`
          : 'in progress'
        : `${formatTime(focus.event.start)} · ${formatCountdown(now, focus.event.start)}`
    kind.appendChild(when)
    hero.appendChild(kind)

    const subject = document.createElement('span')
    subject.className = 'cykit-sch-hero-subject'
    subject.textContent = focus.event.subject
    subject.title = focus.event.subject
    hero.appendChild(subject)
    root.appendChild(hero)
  }

  const body = document.createElement('div')
  body.className = 'cykit-sch-body'

  for (const day of days) {
    const { timed, allDay } = splitDay(day)

    const heading = document.createElement('div')
    heading.className = 'cykit-sch-day'
    heading.textContent = formatDay(day.date, now)
    body.appendChild(heading)

    if (timed.length === 0 && allDay.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'cykit-sch-empty'
      empty.textContent = 'Nothing scheduled'
      body.appendChild(empty)
      continue
    }

    for (const event of timed) body.appendChild(row(event, now))

    if (allDay.length > 0) {
      if (showAllDay) {
        for (const event of allDay) body.appendChild(row(event, now))
      }
      const more = document.createElement('button')
      more.type = 'button'
      more.className = 'cykit-sch-more'
      more.textContent = showAllDay
        ? `▾ hide ${allDay.length} all-day`
        : `▸ ${allDay.length} all-day`
      more.addEventListener('click', (e) => {
        e.stopPropagation()
        showAllDay = !showAllDay
        render(root, days, false)
      })
      body.appendChild(more)
    }
  }
  root.appendChild(body)
  body.scrollTop = scrolled
}

function stopTick(): void {
  if (tick !== undefined) window.clearInterval(tick)
  tick = undefined
}

function remove(): void {
  stopTick()
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

  origin = page.origin
  draw()

  // One timer covers both jobs: the countdown is redrawn every tick, and the
  // request behind it only repeats once the five-minute cache has expired.
  stopTick()
  tick = window.setInterval(draw, TICK_MS)
}

function draw(): void {
  const current = settings
  if (!current?.enabled) {
    remove()
    return
  }

  void load(origin, current.days).then((days) => {
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
