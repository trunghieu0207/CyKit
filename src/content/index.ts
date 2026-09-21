import { getSettings, onSettingsChanged } from '../shared/storage'
import type { Settings } from '../shared/types'
import { applyFont } from './features/font'
import { applyFontMetrics } from './features/font-metrics'
import { applyGithubCopy } from './features/github-copy'
import { applyBranchLock } from './features/branch-lock'

/**
 * Every feature gets an `apply(settings)` that must be idempotent — it is
 * called on load, on every settings change, and again once the DOM is ready.
 */
// applyFont runs first: it changes font-family, which font-metrics then
// measures against.
const FEATURES: readonly ((settings: Settings) => void)[] = [
  applyFont,
  applyFontMetrics,
  applyGithubCopy,
  applyBranchLock,
]

function applyAll(settings: Settings): void {
  for (const feature of FEATURES) {
    try {
      feature(settings)
    } catch (err) {
      console.error('[CyKit] feature failed', err)
    }
  }
}

async function main(): Promise<void> {
  let settings = await getSettings()
  applyAll(settings)

  onSettingsChanged((next) => {
    settings = next
    applyAll(settings)
  })

  // Re-assert after kintone has injected its own stylesheets.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyAll(settings), { once: true })
  }
  window.addEventListener('load', () => applyAll(settings), { once: true })
}

void main()
