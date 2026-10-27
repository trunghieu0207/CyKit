import { DEFAULT_ANCHOR } from './sprint'
import type { Settings } from './types'

const KEY = 'settings'

export const DEFAULT_SETTINGS: Settings = {
  font: {
    enabled: true,
    // All on by default, matching what the content_scripts globs already reach.
    scope: { kintone: true, garoon: true, other: true },
    family: 'inter',
    applyToMonospace: true,
    monoFamily: 'jetbrains-mono',
    smoothing: true,
    sizeScale: 1,
    minSize: 0,
    weightBump: 0,
  },
  github: {
    enabled: true,
  },
  branchLock: {
    // Also opt-in, and additionally gated on a host permission the user grants
    // by hand.
    enabled: false,
    origin: '',
    organizationId: '',
    days: 14,
    repos: '',
    // The branches these windows are published for; anything else is never
    // blocked by a release lock.
    branches: 'main, beta',
  },
  sprint: {
    // Off by default. The panel answers the question without it, so drawing
    // something over every kintone page before anyone asked would be taking a
    // liberty for no gain.
    enabled: false,
    scope: { kintone: true, garoon: true, other: true },
    corner: 'bottom-right',
    anchorNumber: DEFAULT_ANCHOR.number,
    anchorStart: DEFAULT_ANCHOR.start,
  },
}

/** Shallow-merges stored values over defaults, one level per feature. */
function withDefaults(stored: unknown): Settings {
  const raw = (stored ?? {}) as Partial<Settings>
  return {
    font: {
      ...DEFAULT_SETTINGS.font,
      ...raw.font,
      // Nested, so it needs its own merge or a partial stored value would
      // arrive with missing products.
      scope: { ...DEFAULT_SETTINGS.font.scope, ...raw.font?.scope },
    },
    github: { ...DEFAULT_SETTINGS.github, ...raw.github },
    branchLock: { ...DEFAULT_SETTINGS.branchLock, ...raw.branchLock },
    sprint: {
      ...DEFAULT_SETTINGS.sprint,
      ...raw.sprint,
      scope: { ...DEFAULT_SETTINGS.sprint.scope, ...raw.sprint?.scope },
    },
  }
}

export async function getSettings(): Promise<Settings> {
  const bag = await chrome.storage.sync.get(KEY)
  return withDefaults(bag[KEY])
}

export async function patchFontSettings(
  patch: Partial<Settings['font']>,
): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, font: { ...current.font, ...patch } }
  await chrome.storage.sync.set({ [KEY]: next })
  return next
}

export async function patchGithubSettings(
  patch: Partial<Settings['github']>,
): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, github: { ...current.github, ...patch } }
  await chrome.storage.sync.set({ [KEY]: next })
  return next
}

export async function patchBranchLockSettings(
  patch: Partial<Settings['branchLock']>,
): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, branchLock: { ...current.branchLock, ...patch } }
  await chrome.storage.sync.set({ [KEY]: next })
  return next
}

export async function patchSprintSettings(
  patch: Partial<Settings['sprint']>,
): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, sprint: { ...current.sprint, ...patch } }
  await chrome.storage.sync.set({ [KEY]: next })
  return next
}

/** Fires whenever settings change, including from another tab or device. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'sync' || !(KEY in changes)) return
    cb(withDefaults(changes[KEY]?.newValue))
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
