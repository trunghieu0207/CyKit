import { useEffect, useState } from 'react'
import type { LockRequest, LockResponse } from '../background'
import type { PanelProps } from './panels'
import { Toggle } from './Toggle'

/** What the last connection attempt told us, in words a person can act on. */
type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; events: number }
  | { state: 'error'; message: string }

const CYBOZU_ORIGINS = [
  'https://*.cybozu.com/*',
  'https://*.kintone.com/*',
  'https://*.cybozu.cn/*',
  'https://*.kintone.cn/*',
  'https://*.cybozu-dev.com/*',
]

const MESSAGES: Record<string, string> = {
  'no-permission': 'Permission was not granted for that host.',
  unauthorised: 'Garoon rejected the request — open Garoon and sign in, then retry.',
  http: 'Garoon answered with an error.',
  network: 'Could not reach Garoon.',
  'bad-request': 'Fill in the Garoon address and group id first.',
}

export function BranchLockPanel({ settings, patchBranchLock }: PanelProps) {
  const lock = settings.branchLock
  const [granted, setGranted] = useState<boolean | null>(null)
  const [check, setCheck] = useState<Check>({ state: 'idle' })

  useEffect(() => {
    void chrome.permissions.contains({ origins: CYBOZU_ORIGINS }).then(setGranted)
  }, [])

  // Must be called straight from the click: Chrome only shows the prompt for a
  // request made during a user gesture.
  const grant = () => {
    void chrome.permissions.request({ origins: CYBOZU_ORIGINS }).then(setGranted)
  }

  const test = () => {
    setCheck({ state: 'checking' })
    const request: LockRequest = {
      type: 'garoon-events',
      origin: lock.origin,
      organizationId: lock.organizationId,
      keyword: '',
      days: lock.days,
    }
    void chrome.runtime.sendMessage(request).then((res: LockResponse) => {
      if (res?.ok) {
        const events = (res.payload as { events?: unknown[] })?.events?.length ?? 0
        setCheck({ state: 'ok', events })
      } else {
        const base = MESSAGES[res?.reason ?? ''] ?? 'Something went wrong.'
        setCheck({ state: 'error', message: res?.status ? `${base} (${res.status})` : base })
      }
    })
  }

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>Branch locks</h2>
          <p className="hint">Warn on a pull request when its branch is closed.</p>
        </div>
        <Toggle
          checked={lock.enabled}
          onChange={(enabled) => patchBranchLock({ enabled })}
          label="Enable branch lock warnings"
        />
      </div>

      <fieldset className="panel__body" disabled={!lock.enabled}>
        <p className="hint">
          Reads lock windows such as <code>🔒 [main] Sep/24 19:00 – Sep/28 12:00</code>{' '}
          from a Garoon group calendar, and shows a banner on pull requests that
          target a branch which is closed.
        </p>

        <div className="row">
          <span className="row__text">Garoon access</span>
          {granted ? (
            <span className="ok-pill">Granted</span>
          ) : (
            <button type="button" className="btn" onClick={grant}>
              Grant access…
            </button>
          )}
        </div>
        <p className="hint">
          GitHub pages cannot call Garoon directly, so the extension does it.
          That needs your permission for the Cybozu host, asked for only here.
        </p>

        <hr className="rule" />

        <label className="field">
          <span>Garoon address</span>
          <input
            type="url"
            placeholder="https://example.cybozu.com"
            value={lock.origin}
            onChange={(e) => patchBranchLock({ origin: e.target.value.trim().replace(/\/+$/, '') })}
          />
        </label>

        <label className="field">
          <span>Group id</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 42"
            value={lock.organizationId}
            onChange={(e) => patchBranchLock({ organizationId: e.target.value.trim() })}
          />
        </label>

        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={test}
            disabled={!granted || !lock.origin || !lock.organizationId}
          >
            Test connection
          </button>
          <span className="row__text">
            {check.state === 'checking' && <span className="hint">Checking…</span>}
            {check.state === 'ok' && (
              <span className="hint ok">
                Connected — {check.events} event{check.events === 1 ? '' : 's'} in the
                next {lock.days} days.
              </span>
            )}
            {check.state === 'error' && <span className="hint bad">{check.message}</span>}
          </span>
        </div>
      </fieldset>
    </>
  )
}
