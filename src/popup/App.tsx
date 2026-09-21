import { useEffect, useState } from 'react'
import {
  getSettings,
  onSettingsChanged,
  patchFontSettings,
  patchGithubSettings,
  patchScheduleSettings,
} from '../shared/storage'
import type {
  FontSettings,
  GithubSettings,
  ScheduleSettings,
  Settings,
} from '../shared/types'
import { LicencesPanel } from './LicencesPanel'
import { PANELS } from './panels'

const LICENCES_ID = 'licences'

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [activeId, setActiveId] = useState(PANELS[0]?.id ?? '')

  useEffect(() => {
    void getSettings().then(setSettings)
    return onSettingsChanged(setSettings)
  }, [])

  // Optimistic update: reflect the change now, write to storage in the
  // background. The storage listener then confirms it.
  const patchFont = (patch: Partial<FontSettings>) => {
    setSettings((prev) => (prev ? { ...prev, font: { ...prev.font, ...patch } } : prev))
    void patchFontSettings(patch)
  }

  const patchGithub = (patch: Partial<GithubSettings>) => {
    setSettings((prev) => (prev ? { ...prev, github: { ...prev.github, ...patch } } : prev))
    void patchGithubSettings(patch)
  }

  // Not a feature, so it is kept out of PANELS and off the feature menu.
  const showingLicences = activeId === LICENCES_ID
  const patchSchedule = (patch: Partial<ScheduleSettings>) => {
    setSettings((prev) =>
      prev ? { ...prev, schedule: { ...prev.schedule, ...patch } } : prev,
    )
    void patchScheduleSettings(patch)
  }

  const active = PANELS.find((panel) => panel.id === activeId) ?? PANELS[0]

  return (
    <div className="shell">
      <nav className="side" aria-label="Features">
        <div className="brand">
          <img src="icons/icon-48.png" alt="" width={26} height={26} />
          <span>
            CyKit
            <span className="hint">Quality-of-life tweaks</span>
          </span>
        </div>

        <ul className="menu">
          {PANELS.map((panel) => (
            <li key={panel.id}>
              <button
                type="button"
                className={`menu__item ${panel.id === activeId ? 'menu__item--on' : ''}`}
                aria-current={panel.id === activeId}
                onClick={() => setActiveId(panel.id)}
              >
                <span className="menu__glyph" aria-hidden="true">
                  {panel.glyph}
                </span>
                <span className="menu__text">
                  {panel.label}
                  <span className="hint">{panel.hint}</span>
                </span>
                <span
                  className={`dot ${settings && panel.isOn(settings) ? 'dot--on' : ''}`}
                  role="img"
                  aria-label={settings && panel.isOn(settings) ? 'On' : 'Off'}
                />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className={`side__link ${showingLicences ? 'side__link--on' : ''}`}
          onClick={() => setActiveId(showingLicences ? (PANELS[0]?.id ?? '') : LICENCES_ID)}
        >
          Fonts &amp; licences
        </button>
      </nav>

      <main className="panel">
        {showingLicences ? (
          <LicencesPanel />
        ) : !settings || !active ? (
          <p className="loading">Loading…</p>
        ) : (
          <active.Component
              settings={settings}
              patchFont={patchFont}
            patchGithub={patchGithub}
            patchSchedule={patchSchedule}
          />
        )}
      </main>
    </div>
  )
}
