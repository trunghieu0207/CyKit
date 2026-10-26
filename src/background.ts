import { eventsUrl } from './shared/garoon'

/**
 * Fetches Garoon events for the content script on github.com, which is bound
 * by the page's origin and cannot make cross-origin requests even with host
 * permissions. The service worker can.
 *
 * Host access is an `optional_host_permissions` grant requested from the
 * popup, so installs and updates never show a new permission warning.
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

  // Never granted, or revoked since from chrome://extensions.
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
      // Sends the Garoon session cookie; without it the API sees a signed-out user.
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
  // Keep the channel open for the async reply.
  void handle(message as LockRequest).then(sendResponse)
  return true
})
