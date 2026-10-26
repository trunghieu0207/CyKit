import { isPlainClick, labelFor, peekModeFor, windowFeatures } from '../../shared/peek'
import type { PeekMode } from '../../shared/peek'
import { isInScope } from '../../shared/scope'
import type { Settings } from '../../shared/types'

/**
 * Opens a link without leaving the page — the habit Arc's little windows
 * build, brought to kintone.
 *
 * Two mechanisms, because one cannot cover both cases:
 *
 * - **Same origin** is framed in an overlay. kintone serves
 *   `X-Frame-Options: SAMEORIGIN`, which permits exactly this, so a link to
 *   another record opens over the one you are reading.
 * - **Anything else** gets a real window. Cross-origin framing is refused
 *   outright — GitHub answers `frame-ancestors 'none'` — and no extension can
 *   override a response header. A window is the only thing that always works.
 *
 * Arc can overlay anything because it *is* the browser and renders the page in
 * its own view; an extension is a guest of the page it runs on and does not
 * get that choice.
 *
 * Experimental, and off by default. It takes over clicks on a host page that
 * runs its own router, which is the kind of thing that earns trust slowly.
 */

const ROOT_ID = 'cykit-peek'
const STYLE_ID = 'cykit-peek-style'

/** How long to wait for the frame before admitting it is not coming. */
const LOAD_TIMEOUT_MS = 6000

/** The parts of `location` this feature reads. */
export interface PageLocation {
  hostname: string
  pathname: string
  href: string
}

let loc: PageLocation = location
let active: Settings['linkPeek'] | null = null
let close: (() => void) | null = null

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  /*
   * Namespaced with the reset first, as everywhere: kintone styles bare
   * elements heavily, so an unguarded button here arrives wearing kintone's
   * own chrome.
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
  min-width:0;
}
#${ROOT_ID}{
  position:fixed;
  inset:0;
  z-index:2147483100;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:26px;
  background:rgb(20 30 38 / 0.42);
  font-family:system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;
  /* Fades the backdrop in only; the sheet itself must not animate its size,
     or the frame reflows mid-load. */
  animation:cykit-peek-in 120ms ease-out;
}
@keyframes cykit-peek-in{from{opacity:0}to{opacity:1}}
#${ROOT_ID} .cykit-peek-sheet{
  display:flex;
  flex-direction:column;
  width:min(1100px, 100%);
  height:min(760px, 100%);
  border-radius:12px;
  background:#fff;
  box-shadow:0 24px 60px rgb(0 0 0 / 0.3);
  overflow:hidden;
}
#${ROOT_ID} .cykit-peek-bar{
  flex:none;
  display:flex;
  gap:10px;
  align-items:center;
  padding:9px 12px;
  border-bottom:1px solid #e3e7e8;
  background:#f7f9fa;
  color:#3a4145;
  font-size:12px;
}
#${ROOT_ID} .cykit-peek-url{
  flex:1;
  min-width:0;
  font-weight:600;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
#${ROOT_ID} .cykit-peek-act{
  flex:none;
  padding:4px 10px;
  border:1px solid #d0d5d8;
  border-radius:6px;
  background:#fff;
  color:#3a4145;
  font-size:12px;
  font-weight:600;
  white-space:nowrap;
  cursor:pointer;
}
#${ROOT_ID} .cykit-peek-act:hover{background:#eef3f5;border-color:#a8b3b8}
#${ROOT_ID} .cykit-peek-body{
  flex:1;
  position:relative;
  min-height:0;
  background:#fff;
}
#${ROOT_ID} iframe{
  display:block;
  width:100%;
  height:100%;
  border:0;
}
#${ROOT_ID} .cykit-peek-note{
  position:absolute;
  inset:0;
  display:flex;
  flex-direction:column;
  gap:10px;
  align-items:center;
  justify-content:center;
  padding:20px;
  background:#fff;
  color:#7b878c;
  font-size:13px;
  text-align:center;
}`
  ;(document.head ?? document.documentElement).appendChild(style)
}

function remove(): void {
  close?.()
  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()
}

/** A real window, for anything that cannot be framed. */
function openWindow(href: string): void {
  window.open(href, '_blank', windowFeatures(window.screen.width, window.screen.height))
}

/**
 * The overlay.
 *
 * A frame can still fail for reasons the URL does not reveal — a path with its
 * own stricter CSP, a login redirect to another host — so a timeout turns the
 * dead frame into an offer to open the page properly. Failing closed and
 * showing nothing would leave the click looking broken.
 */
function openOverlay(href: string): void {
  ensureStyle()
  close?.()

  const root = document.createElement('div')
  root.id = ROOT_ID
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', labelFor(href))

  const sheet = document.createElement('div')
  sheet.className = 'cykit-peek-sheet'

  const bar = document.createElement('div')
  bar.className = 'cykit-peek-bar'
  const url = document.createElement('span')
  url.className = 'cykit-peek-url'
  url.textContent = labelFor(href)
  bar.appendChild(url)

  const full = document.createElement('button')
  full.type = 'button'
  full.className = 'cykit-peek-act'
  full.textContent = 'Open in tab'
  full.addEventListener('click', () => {
    done()
    window.location.href = href
  })
  bar.appendChild(full)

  const shut = document.createElement('button')
  shut.type = 'button'
  shut.className = 'cykit-peek-act'
  shut.textContent = 'Close'
  shut.setAttribute('aria-label', 'Close (Esc)')
  shut.addEventListener('click', () => done())
  bar.appendChild(shut)

  sheet.appendChild(bar)

  const body = document.createElement('div')
  body.className = 'cykit-peek-body'
  const frame = document.createElement('iframe')
  frame.src = href
  // No sandbox attribute: the page is same-origin and is expected to work,
  // and sandboxing would strip the session it needs.
  frame.setAttribute('referrerpolicy', 'same-origin')
  body.appendChild(frame)
  sheet.appendChild(body)
  root.appendChild(sheet)
  document.body.appendChild(root)

  let loaded = false
  frame.addEventListener('load', () => {
    loaded = true
  })
  const timer = window.setTimeout(() => {
    if (loaded) return
    const note = document.createElement('div')
    note.className = 'cykit-peek-note'
    const text = document.createElement('span')
    text.textContent = 'This page would not open here.'
    note.appendChild(text)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cykit-peek-act'
    button.textContent = 'Open in a window'
    button.addEventListener('click', () => {
      done()
      openWindow(href)
    })
    note.appendChild(button)
    body.appendChild(note)
  }, LOAD_TIMEOUT_MS)

  function done(): void {
    window.clearTimeout(timer)
    root.remove()
    document.removeEventListener('keydown', onKey, true)
    close = null
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation()
      done()
    }
  }

  // Clicking the backdrop closes; clicking inside the sheet does not.
  root.addEventListener('click', (event) => {
    if (event.target === root) done()
  })
  document.addEventListener('keydown', onKey, true)
  close = done
  shut.focus()
}

function open(href: string, mode: PeekMode): void {
  if (mode === 'overlay') openOverlay(href)
  else if (mode === 'window') openWindow(href)
}

/**
 * Bubble phase, not capture, and that is the whole safety story.
 *
 * kintone runs its own router and handles many links itself. By the time a
 * click bubbles here, anything the page meant to handle has already called
 * `preventDefault` or stopped propagation — so the clicks that reach this
 * handler are the ones nobody else wanted.
 */
function onClick(event: MouseEvent): void {
  if (!active) return
  const at = event.target as Element | null
  if (!at || typeof at.closest !== 'function') return

  const anchor = at.closest('a[href]') as HTMLAnchorElement | null
  if (!anchor) return
  // Our own overlay: its buttons are not links, but a framed page is.
  if (anchor.closest(`#${ROOT_ID}`)) return

  if (
    !isPlainClick({
      button: event.button,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      target: anchor.target,
      download: anchor.hasAttribute('download'),
      defaultPrevented: event.defaultPrevented,
    })
  ) {
    return
  }

  const mode = peekModeFor(anchor.href, loc.href, active.external)
  if (mode === 'ignore') return

  event.preventDefault()
  open(anchor.href, mode)
}

export function applyLinkPeek(settings: Settings, page: PageLocation = location): void {
  loc = page
  const { linkPeek } = settings
  const on =
    linkPeek.enabled &&
    isInScope(linkPeek.scope, loc.hostname, loc.pathname) &&
    // Only the top frame takes clicks. Inside the overlay's own frame the
    // page should behave normally, or a peek inside a peek is one click away.
    window.self === window.top

  // Idempotent: unbind first, so repeated calls never stack handlers.
  document.removeEventListener('click', onClick)
  if (!on || !document.body) {
    active = null
    remove()
    return
  }
  active = linkPeek
  document.addEventListener('click', onClick)
}
