import { SCOPE_OPTIONS } from '../shared/scope'
import type { PanelProps } from './panels'
import { Toggle } from './Toggle'

export function LinkPeekPanel({ settings, patchLinkPeek }: PanelProps) {
  const { linkPeek } = settings
  // Mirrors what the content script does, so inner rows read as off too.
  const view = linkPeek.enabled ? linkPeek : { ...linkPeek, external: false }

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>
            Link peek <span className="tag">Experimental</span>
          </h2>
          <p className="hint">
            On: a link opens over the page instead of replacing it. Off: links
            behave exactly as the page intends.
          </p>
        </div>
        <Toggle
          checked={linkPeek.enabled}
          onChange={(enabled) => patchLinkPeek({ enabled })}
          label="Enable link peek"
        />
      </div>

      <fieldset className="panel__body" disabled={!linkPeek.enabled}>
        <p className="hint">
          A link to another record opens in a panel over the one you are
          reading, so you keep your place. Press <code>Esc</code>, or click
          outside it, to go back.
        </p>

        <hr className="rule" />

        <label className="row">
          <span className="row__text">
            Links to other sites
            <span className="hint">
              Opened in a small window instead. They cannot be shown over the
              page: sites such as GitHub refuse to be framed, and no extension
              can overrule that.
            </span>
          </span>
          <Toggle
            checked={view.external}
            onChange={(external) => patchLinkPeek({ external })}
            label="Open external links in a window"
          />
        </label>

        <hr className="rule" />

        <div className="seg">
          <span className="seg__label">Apply on</span>
          <div className="checks">
            {SCOPE_OPTIONS.map((option) => (
              <label key={option.key} className="check" title={option.hint}>
                <input
                  type="checkbox"
                  checked={linkPeek.scope[option.key]}
                  // Shallow-merged, so the whole scope object has to go along.
                  onChange={(e) =>
                    patchLinkPeek({
                      scope: { ...linkPeek.scope, [option.key]: e.target.checked },
                    })
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <footer className="footer">
        Cmd-click, middle-click and anything the page handles itself are left
        alone — this only takes clicks nothing else wanted. Start with kintone
        and add the rest once you trust it.
      </footer>
    </>
  )
}
