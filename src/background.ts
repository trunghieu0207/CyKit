import { eventsUrl } from './shared/garoon'

/**
 * Fetches Garoon data on behalf of content scripts that cannot do it
 * themselves.
 *
 * A content script on github.com is bound by the page's origin — Chrome is
 * explicit that "cross-origin requests are always treated as such in content
 * scripts, even if the extension has host permissions". Only an extension
 * service worker can reach another host, and only with host permissions.
 *
 * Those permissions are declared as `optional_host_permissions` and requested
 * from the popup, so installing or updating the extension never presents a new
 * warning and never disables it for people who do not use this feature.
 */

export interface LockRequest {
  type: 'garoon-events'
  /** e.g. https://example.cybozu.com */
  origin: string
  /** Garoon organization id whose calendar carries the lock windows. */
  organizationId: string
  keyword: string
  days: number
}

export interface LockResponse {
  ok: boolean
  /** Raw API payload; parsing stays in the content script. */
  payload?: unknown
  /** Why it failed, in terms the popup can show a person. */
  reason?: 'no-permission' | 'unauthorised' | 'http' | 'network' | 'bad-request'
  status?: number
}

function originPattern(origin: string): string {
  return `${origin}/*`
}

async function handle(request: LockRequest): Promise<LockResponse> {
  if (!/^https:\/\/[^/]+$/.test(request.origin) || !request.organizationId) {
    return { ok: false, reason: 'bad-request' }
  }

  // Asking rather than assuming: the user may never have granted it, or may
  // have revoked it from chrome://extensions since.
  const granted = await chrome.permissions.contains({
    origins: [originPattern(request.origin)],
  })
  if (!granted) return { ok: false, reason: 'no-permission' }

  const url = new URL(eventsUrl(request.origin, new Date(), request.days))
  url.searchParams.set('target', request.organizationId)
  url.searchParams.set('targetType', 'organization')
  if (request.keyword) url.searchParams.set('keyword', request.keyword)

  try {
    const res = await fetch(url.toString(), {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      // Required for a cross-origin request to carry the Garoon session
      // cookie. Without it the API answers as if signed out.
      credentials: 'include',
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'unauthorised', status: res.status }
    }
    if (!res.ok) return { ok: false, reason: 'http', status: res.status }
    return { ok: true, payload: await res.json() }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if ((message as LockRequest)?.type !== 'garoon-events') return undefined
  // Returning true keeps the channel open for the async reply.
  void handle(message as LockRequest).then(sendResponse)
  return true
})
