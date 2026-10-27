import type { ComponentType } from 'react'
import type {
  FontSettings,
  GithubSettings,
  BranchLockSettings,
  SprintSettings,
  Settings,
} from '../shared/types'
import { FontPanel } from './FontPanel'
import { GithubPanel } from './GithubPanel'
import { BranchLockPanel } from './BranchLockPanel'
import { SprintPanel } from './SprintPanel'
import { SprintSummary } from './SprintSummary'

export interface PanelProps {
  settings: Settings
  patchFont: (patch: Partial<FontSettings>) => void
  patchGithub: (patch: Partial<GithubSettings>) => void
  patchBranchLock: (patch: Partial<BranchLockSettings>) => void
  patchSprint: (patch: Partial<SprintSettings>) => void
}

/**
 * An at-a-glance readout for the sidebar dashboard, below the menu.
 *
 * Separate from the panel because the two answer different questions: the
 * panel is where a feature is configured, the summary is what it wants you to
 * know without being asked. A feature with nothing to report leaves it off.
 */
export interface SummaryProps {
  settings: Settings
  /** Opens this feature's own panel, for acting on what the summary says. */
  onOpen: () => void
}

export interface PanelEntry {
  id: string
  /** Sidebar label. */
  label: string
  /** One-line description under the label. */
  hint: string
  /** Two or three characters used as the sidebar glyph. */
  glyph: string
  /** True when the feature is currently doing something. */
  isOn: (settings: Settings) => boolean
  Component: ComponentType<PanelProps>
  /**
   * Optional. When present it is rendered in the sidebar on every screen, so
   * whatever it says costs no clicks to read.
   */
  Summary?: ComponentType<SummaryProps>
}

/**
 * The sidebar menu, and the dashboard under it.
 *
 * Adding a feature means adding one entry here. Giving it a `Summary` is how
 * it earns a line on the dashboard — nothing else needs editing for it to
 * appear.
 */
export const PANELS: readonly PanelEntry[] = [
  {
    id: 'font',
    label: 'Font',
    hint: 'Family, size, weight',
    glyph: 'Aa',
    isOn: (s) => s.font.enabled,
    Component: FontPanel,
  },
  {
    id: 'github',
    label: 'GitHub',
    hint: 'Copy title or link',
    glyph: 'PR',
    isOn: (s) => s.github.enabled,
    Component: GithubPanel,
  },
  {
    id: 'sprint',
    label: 'Sprint',
    hint: 'Show it on pages',
    glyph: '\u2691',
    isOn: (s) => s.sprint.enabled,
    Component: SprintPanel,
    Summary: SprintSummary,
  },
  {
    id: 'branch-lock',
    label: 'Branch locks',
    hint: 'Warn before merging',
    glyph: '\u{1F512}',
    isOn: (s) => s.branchLock.enabled,
    Component: BranchLockPanel,
  },
]
