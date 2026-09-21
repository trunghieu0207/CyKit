# Chrome Web Store listing — CyKit

Copy/paste source for the Developer Dashboard. Keep the single-purpose framing:
lead with the purpose, then the features that serve it. Do not open with a list
of the three sites — that reads as a multi-purpose extension.

---

## Name

```
CyKit Extension
```

## Short description (132 char limit — currently 130)

```
Read and share work items faster: a cleaner, larger font on kintone and Garoon, plus one-click copy of GitHub PR titles and links.
```

## Category

`Workflow & Planning` fits the single-purpose story in the description better
than `Developer Tools`, which only covers the GitHub half. Either is
defensible — pick one and keep the description consistent with it.

## Graphic assets

Upload these from `store/`. Sizes are the store's, not ours:

| Asset | File | Size | Note |
| --- | --- | --- | --- |
| Store icon | `store/store-icon-128.png` | 128×128 | 96×96 of artwork with 16px transparent padding, as the guidelines require. **Not** the same file as the extension's own `icons/icon-128.png`, which fills its canvas. |
| Small promo tile | `store/promo-440x280.png` | 440×280 | Optional, but an item without one ranks lower in search. |
| Screenshots | `store/screenshots/01-font.png`, `02-github-copy.png`, `03-copy-menu.png` | 1280×800 | At least one required, up to five. |

All three are regenerated from sources in the repo: `pnpm icons` writes the
store icon, `store/promo-tile.html` and `store/screenshots/s*.html` render with
headless Chromium (see `store/screenshots/README.md`).

---

## Detailed description

```
CyKit removes the small, everyday friction in reading and sharing work items
across the tools an engineering team uses all day.

Two things slow that down. Interface text that is too small or too thin to read
comfortably for hours. And re-typing a ticket title and link every time you
need to quote a pull request somewhere else.

CyKit fixes both.

READABLE TEXT ON KINTONE AND GAROON

• Nine bundled fonts, including Be Vietnam Pro for Vietnamese and Noto Sans
  for a look close to the original.
• Scale every text size proportionally, from 100% to 130%. Headings stay
  larger than body text — nothing is flattened to one size.
• Set a minimum size so small labels stop straining your eyes.
• Add weight for thin text, without turning already-bold headings into a
  smudge.
• Icons, images, and column widths are left exactly as they are. Only text
  changes.
• Choose per product whether it applies: kintone, Garoon, or neither.

YOUR GAROON SCHEDULE, ON KINTONE (OPT-IN)

• A small card on kintone pages listing what is on your Garoon calendar, so
  checking your next meeting does not mean switching tabs.
• Reads your own schedule over the session you are already signed in with.
  kintone and Garoon share a host, so no extra permission is needed and no
  password is ever stored.
• Read-only, and switched off until you turn it on.

ONE-CLICK COPY ON GITHUB

• Adds a Copy button to pull request and issue pages.
• Copies the title on one line and the canonical link on the next, ready to
  paste into a ticket, a report, or chat.
• The link is normalised, so copying from the Files or Commits tab still gives
  the plain pull request URL.

BUILT TO STAY OUT OF THE WAY

• No accounts, no analytics, no telemetry. Nothing is sent to us — there is no
  server belonging to this extension.
• Fonts are bundled in the extension, so nothing is fetched while you browse.
• Runs only on the sites listed below — never on all websites.
• Every feature has its own on/off switch. Turn one off and the page goes
  straight back to normal.

CyKit is an independent, unofficial project. It is not affiliated with,
endorsed by, or sponsored by Cybozu, Inc. or GitHub, Inc. "Cybozu", "kintone",
and "Garoon" are trademarks of Cybozu, Inc.
```

---

## Privacy practices tab — paste-ready

The submit button stays disabled until every box below is filled. Each one is a
separate field in the **Privacy practices** tab of the item's edit page.

### Single purpose description

```
CyKit has one purpose: to reduce the friction of reading and quoting work items in a team's daily tools.

On kintone and Garoon it replaces the interface font and rescales text size and weight, so the interface stays readable during a long working day. On GitHub pull request and issue pages it adds a Copy button that places the item's title and canonical link on the clipboard — which is exactly the text that gets pasted back into those same work items.

Both halves serve one workflow: read an item, then quote it somewhere else. Neither runs anywhere beyond the explicit list of hosts in the manifest, and each can be switched off independently.
```

### Permission justification — `storage`

```
Stores the user's own settings and nothing else: the selected font, the text size, minimum size and weight steps, which products each feature applies to, and whether each feature is enabled.

These values never leave the browser. No page content, browsing history or personal data is stored.
```

### Permission justification — host permissions

```
*.cybozu.com, *.kintone.com, *.cybozu.cn, *.kintone.cn and *.cybozu-dev.com serve kintone and Garoon. On those pages the extension injects one stylesheet and reads the computed font size and weight of elements so it can rescale them proportionally. A single host serves several products, so a manifest match pattern cannot tell them apart; the product is resolved from the URL path at runtime and the user can switch each one off.

github.com is needed for the Copy button on pull request and issue pages. When the user clicks it, the extension reads the page title and builds the canonical URL, then writes both to the clipboard. It reads nothing else and runs on no other part of GitHub.

The optional Schedule feature issues one request, and only when the user switches it on: GET /g/api/v1/schedule/events against the same Cybozu host the page is served from, authenticated by the session cookie the browser already holds. It reads the user's own events, renders them on the page, and sends nothing to any other destination. There is no server belonging to this extension.
```

### Remote code

Select **No, I am not using remote code**, then paste:

```
All JavaScript and CSS ships inside the package. The nine bundled webfonts are also in the package and are loaded from chrome-extension:// URLs, so nothing is fetched from Google Fonts or any other host while the user browses.

None. All code and all fonts are bundled in the package, and the extension uses no eval, new Function, or other dynamic code execution. The optional Schedule feature reads data from the user's own Garoon over its REST API, but no code is fetched or executed from anywhere outside the package.
```

### Data use certification

Tick all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

They are all true here: the extension collects no user data at all.

---

## Settings page — your action, not a paste

Two of the blockers are on the account **Settings** page rather than the item:

- **Publisher contact email** — enter it.
- **Verify that email** — start the verification and click the link Google sends.

Publishing is blocked until the address is both entered and verified, so do this
early; it is the step most likely to sit waiting on an inbox.

## Before submitting

- [ ] Privacy practices tab: single purpose, `storage`, host permissions,
      remote code, and the three data-use certifications — all blockers until
      filled. Paste-ready text is in the section above.
- [ ] Settings page: enter the publisher contact email and complete the
      verification link Google emails you.
- [x] Privacy policy URL — the repository is public, so this is live:
      `https://github.com/trunghieu0207/CyKit/blob/main/PRIVACY.md`
      Keep the repository public for as long as the item is listed; if it goes
      private the URL 404s and the listing is taken down.
- [ ] Upload the screenshots in `store/screenshots/` (1280×800).
- [ ] Publish from a developer account that is allowed to use the Cybozu name.
      The listing's remaining risk is the name itself — "Cybozu" in the title
      reads as official regardless of the disclaimer in the description. The
      icon is an original mark and is not part of this.
- [ ] Bump `version` in `public/manifest.json` for every upload; the store
      rejects a re-used version.
