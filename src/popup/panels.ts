import type { ComponentType } from 'react'
import type {
  FontSettings,
  GithubSettings,
  ScheduleSettings,
  Settings,
} from '../shared/types'
import { FontPanel } from './FontPanel'
import { GithubPanel } from './GithubPanel'
import { SchedulePanel } from './SchedulePanel'

export interface PanelProps {
  settings: Settings
  patchFont: (patch: Partial<FontSettings>) => void
  patchGithub: (patch: Partial<GithubSettings>) => void
  patchSchedule: (patch: Partial<ScheduleSettings>) => void
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
}

/** The sidebar menu. Adding a feature means adding one entry here. */
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
    id: 'schedule',
    label: 'Schedule',
    hint: 'Garoon, on kintone',
    glyph: '17',
    isOn: (s) => s.schedule.enabled,
    Component: SchedulePanel,
  },
]
