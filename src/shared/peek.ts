/**
 * Deciding what to do with a clicked link. No DOM here, so the rules that
 * decide whether to take over a click can be tested on their own — and they
 * are the risky part: getting this wrong does not make a feature look bad, it
 * breaks the host page's own navigation.
 */

export type PeekMode = 'overlay' | 'window' | 'ignore'

/** The parts of a click that decide whether it is ours to take. */
export interface ClickIntent {
  /** 0 for the left button; anything else is the user asking for something else. */
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  /** The anchor's `target`, empty when it has none. */
  target: string
  /** True when the anchor carries a `download` attribute. */
  download: boolean
  /** True when something on the page already handled it. */
  defaultPrevented: boolean
}

/**
 * Whether this click is ours at all, before the URL is even looked at.
 *
 * Every rule here gives the click back to the page or the browser, and that
 * is the point: a modified click is the user asking for a new tab or a saved
 * file by name, and a feature that swallows those is worse than no feature.
 */
export function isPlainClick(intent: ClickIntent): boolean {
  if (intent.defaultPrevented) return false
  if (intent.button !== 0) return false
  // Cmd/Ctrl opens a tab, Shift a window, Alt downloads. All deliberate.
  if (intent.metaKey || intent.ctrlKey || intent.shiftKey || intent.altKey) return false
  if (intent.download) return false
  // The page already said where it wants this to go.
  if (intent.target && intent.target !== '_self') return false
  return true
}

/** Strips the fragment, so two links differing only by `#…` compare equal. */
function withoutHash(url: URL): string {
  return `${url.origin}${url.pathname}${url.search}`
}

/**
 * What to do with a link, once the click itself is eligible.
 *
 * Same-origin links are framed: kintone serves `X-Frame-Options: SAMEORIGIN`,
 * which permits exactly that. Cross-origin ones cannot be framed at all —
 * GitHub answers `frame-ancestors 'none'` — so they get a real window, which
 * no header can refuse.
 *
 * Anything that is not plain http(s) is left alone: `mailto:`, `javascript:`
 * and extension URLs are not pages to preview, and an in-page `#anchor` is not
 * a navigation in the first place.
 */
export function peekModeFor(href: string, pageUrl: string, external: boolean): PeekMode {
  let url: URL
  let page: URL
  try {
    url = new URL(href)
    page = new URL(pageUrl)
  } catch {
    return 'ignore'
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'ignore'
  if (url.origin !== page.origin) return external ? 'window' : 'ignore'
  // Same page, different fragment: the browser just scrolls.
  if (withoutHash(url) === withoutHash(page)) return 'ignore'
  return 'overlay'
}

/**
 * `window.open` features for a window that reads as a companion to the page
 * rather than a second browser.
 *
 * Sized against the screen and centred on it. Clamped so a very large display
 * does not produce a window the size of the screen, which would defeat the
 * point, and a small one still leaves a margin.
 */
export function windowFeatures(screenWidth: number, screenHeight: number): string {
  const width = Math.round(Math.max(480, Math.min(1000, screenWidth * 0.55)))
  const height = Math.round(Math.max(400, Math.min(860, screenHeight * 0.8)))
  const left = Math.round(Math.max(0, (screenWidth - width) / 2))
  const top = Math.round(Math.max(0, (screenHeight - height) / 2))
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},noopener`
}

/** Host and path, for the overlay's title bar. */
export function labelFor(href: string): string {
  try {
    const url = new URL(href)
    const path = url.pathname === '/' ? '' : url.pathname
    return `${url.host}${path}`
  } catch {
    return href
  }
}
