import { useEffect, useState } from 'react'
import {
  getSettings,
  onSettingsChanged,
  patchFontSettings,
  patchGithubSettings,
  patchBranchLockSettings,
  patchSprintSettings,
} from '../shared/storage'
import type {
  BranchLockSettings,
  FontSettings,
  GithubSettings,
  SprintSettings,
  Settings,
} from '../shared/types'
import { DashboardPanel } from './DashboardPanel'
import { LicencesPanel } from './LicencesPanel'
import { PANELS } from './panels'

const LICENCES_ID = 'licences'

/** The landing screen. Not a feature, so it is not in PANELS. */
const HOME_ID = 'overview'

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [activeId, setActiveId] = useState(HOME_ID)

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
  const patchBranchLock = (patch: Partial<BranchLockSettings>) => {
    setSettings((prev) =>
      prev ? { ...prev, branchLock: { ...prev.branchLock, ...patch } } : prev,
    )
    void patchBranchLockSettings(patch)
  }

  const patchSprint = (patch: Partial<SprintSettings>) => {
    setSettings((prev) => (prev ? { ...prev, sprint: { ...prev.sprint, ...patch } } : prev))
    void patchSprintSettings(patch)
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
          <li>
            <button
              type="button"
              className={`menu__item ${activeId === HOME_ID ? 'menu__item--on' : ''}`}
              aria-current={activeId === HOME_ID}
              onClick={() => setActiveId(HOME_ID)}
            >
              <span className="menu__glyph" aria-hidden="true">
                &#9707;
              </span>
              <span className="menu__text">
                Overview
                <span className="hint">Everything at a glance</span>
              </span>
              {/* No status dot: there is nothing here to switch on or off. */}
            </button>
          </li>

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
          onClick={() => setActiveId(showingLicences ? HOME_ID : LICENCES_ID)}
        >
          Fonts &amp; licences
        </button>
      </nav>

      <main className="panel">
        {showingLicences ? (
          <LicencesPanel />
        ) : settings && activeId === HOME_ID ? (
          <DashboardPanel settings={settings} onOpen={setActiveId} />
        ) : !settings || !active ? (
          <p className="loading">Loading…</p>
        ) : (
          <active.Component
              settings={settings}
              patchFont={patchFont}
            patchGithub={patchGithub}
            patchBranchLock={patchBranchLock}
            patchSprint={patchSprint}
          />
        )}
      </main>
    </div>
  )
}
