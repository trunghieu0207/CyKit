# Chrome Web Store listing — CyKit Extension

Copy/paste source for the Developer Dashboard. Lead with the purpose, then the
features that serve it; opening with a list of three sites reads as a
multi-purpose extension.

---

## Name

```
CyKit Extension
```

## Short description (132 char limit — currently 129)

```
Fewer trips between kintone, Garoon and GitHub: a readable font, one-click PR copy, and a warning before merging a locked branch.
```

## Category

`Workflow & Planning` fits the single-purpose story better than
`Developer Tools`, which only covers the GitHub half. Either is defensible —
pick one and keep the description consistent with it.

## Graphic assets

Upload these from `store/`. Sizes are the store's, not ours:

| Asset | File | Size | Note |
| --- | --- | --- | --- |
| Store icon | `store/store-icon-128.png` | 128×128 | 96×96 of artwork with 16px transparent padding, as the guidelines require. **Not** the same file as the extension's own `icons/icon-128.png`, which fills its canvas. |
| Small promo tile | `store/promo-440x280.png` | 440×280 | Optional, but an item without one ranks lower in search. |
| Screenshots | `01-font.png`, `04-branch-lock.png`, `03-copy-menu.png` | 1280×800 | At least one required, up to five. Lead with whichever feature you most want found. |

All are regenerated from sources in the repo: `pnpm icons` writes the store
icon, and the `store/screenshots/s*.html` pages render with headless Chromium
(see `store/screenshots/README.md`).

---

## Detailed description

```
CyKit removes the small, repeated friction of working across the three tools one engineering team keeps open side by side: kintone, Garoon and GitHub.

Each feature takes away one trip between them.

A READABLE INTERFACE ON KINTONE AND GAROON

• Nine bundled fonts, including Be Vietnam Pro for Vietnamese and Noto Sans for a look close to the original.
• Scale every text size proportionally, from 100% to 130%. Headings stay larger than body text — nothing is flattened to one size.
• Set a minimum size so small labels stop straining your eyes.
• Add weight for thin text, without turning already-bold headings into a smudge.
• Icons, images and column widths are left exactly as they are. Only text changes.
• Choose per product whether it applies: kintone, Garoon, or neither.

ONE-CLICK COPY ON GITHUB

• Adds a Copy button to pull request and issue pages.
• Choose the title and link together, the title alone, or just the link — each row previews exactly what lands on the clipboard.
• The link is normalised, so copying from the Files or Commits tab still gives the plain pull request URL, ready to paste into a ticket.

A WARNING BEFORE MERGING A LOCKED BRANCH (OPT-IN)

• Teams that close main or beta for a release publish the window on a Garoon calendar. Nobody on GitHub can see it without going to look.
• This puts the answer on the pull request, directly above the merge button: locked and until when, or open and when it next closes.
• Scoped to the repositories and branches you name, so it never speaks about a codebase it knows nothing about.
• Read-only, and switched off until you turn it on.

BUILT TO STAY OUT OF THE WAY

• No accounts, no analytics, no telemetry. Nothing is sent to us — there is no server belonging to this extension.
• Fonts are bundled in the package, so nothing is fetched while you browse.
• Runs only on the sites listed below — never on all websites.
• Every feature has its own on/off switch. Turn one off and the page goes straight back to normal.

CyKit is an independent, unofficial project. It is not affiliated with, endorsed by, or sponsored by Cybozu, Inc. or GitHub, Inc. "Cybozu", "kintone" and "Garoon" are trademarks of Cybozu, Inc.
```

---

## Privacy practices tab — paste-ready

The submit button stays disabled until every box below is filled. Each is a
separate field in the **Privacy practices** tab of the item's edit page.

### Single purpose description

```
CyKit has one purpose: to reduce the friction of working across the set of tools one engineering team uses side by side — kintone, Garoon and GitHub.

Each feature removes one trip between them. The font feature makes the kintone and Garoon interfaces comfortable to read, so time is not lost squinting at the tools where the work is recorded. The copy button turns a GitHub pull request into the title-and-link line that gets pasted back into those same records. The branch-lock warning carries the release schedule already published on a Garoon calendar onto the GitHub pull request, where the decision to merge is actually made.

Nothing runs outside the small, explicit list of hosts in the manifest, and each feature can be switched off independently.
```

### Permission justification — `storage`

```
Stores the user's own settings and nothing else: the selected font, the size, minimum size and weight steps, which products each feature applies to, whether each feature is enabled, and for the branch-lock feature the Garoon address, group id, repositories and branches the user nominated.

These values never leave the browser. No page content, browsing history or personal data is stored.
```

### Permission justification — host permissions

```
*.cybozu.com, *.kintone.com, *.cybozu.cn, *.kintone.cn and *.cybozu-dev.com serve kintone and Garoon. There the extension injects one stylesheet and reads computed font sizes and weights so it can rescale them. One host serves several products, so a match pattern cannot separate them; the product is resolved from the URL path at runtime and each can be switched off.

github.com is needed for the Copy button, which reads the page title and URL on click and writes them to the clipboard, and for the branch-lock warning, which reads the pull request's target branch.

The Cybozu hosts also appear under optional_host_permissions. That grant is requested at runtime from a button in the popup, only by a user enabling the branch-lock feature, and lets the background worker read one Garoon calendar they nominate — a GitHub page cannot make that request itself, as Chrome treats content-script requests as cross-origin regardless of host permissions. Nothing is written or sent elsewhere.
```

### Remote code

Select **No, I am not using remote code**, then paste:

```
None. All code and all fonts are bundled in the package, and the extension uses no eval, new Function, or other dynamic code execution. The optional branch-lock feature reads data from the user's own Garoon over its REST API, but no code is fetched or executed from anywhere outside the package.
```

### Data use certification

Tick all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

They are all true: the extension collects no user data at all.

### Privacy tab answers

| Question | Answer |
| --- | --- |
| Does this item collect or use personally identifiable information? | No |
| Health information? | No |
| Financial and payment information? | No |
| Authentication information? | No |
| Personal communications? | No |
| Location? | No |
| Web history? | No |
| User activity (clicks, mouse position, keystrokes)? | No |
| Website content (text, images, sound, files)? | No — the branch-lock feature reads one nominated Garoon calendar to display the result locally; nothing is transmitted to us or any third party |
| Privacy policy URL | `https://github.com/trunghieu0207/CyKit/blob/main/PRIVACY.md` |

---

## What changed in 0.2.0

Worth knowing before you submit, and useful if a reviewer asks.

- **New feature: branch-lock warnings on GitHub pull requests.** Opt-in.
- **New: a background service worker** (`background.js`). It exists solely to
  make the one cross-origin request the branch-lock feature needs, which a
  content script is not permitted to make.
- **New: `optional_host_permissions`** for the Cybozu hosts. Because it is
  *optional*, it is granted at runtime rather than at install, so this update
  shows existing users **no new warning and does not disable the extension**.
  The required `permissions` list is unchanged: still only `storage`.
- The Copy button now offers title, link, or both.
- The kintone schedule widget that appeared in development was removed before
  release; nothing referring to it remains.

---

## Settings page — your action, not a paste

Two blockers live on the account **Settings** page rather than the item:

- **Publisher contact email** — enter it.
- **Verify that email** — click the link Google sends.

Already done for this publisher; nothing to redo for an update.

---

## Before submitting

- [ ] `pnpm bump` was already run for this release — the manifest says 0.2.0.
      The store rejects a version it has already published.
- [ ] `pnpm package` → upload `cykit-0.2.0.zip`.
- [ ] Re-paste the **short description** and **detailed description**: both
      changed for this release.
- [ ] Re-paste all four **Privacy practices** boxes: the single purpose and the
      host-permission justification both changed, and the justification now has
      to explain the optional grant and the service worker.
- [ ] Upload `store/screenshots/04-branch-lock.png`; it is the new feature and
      no existing shot covers it.
- [ ] Privacy policy URL is unchanged and already live.
- [ ] Keep the repository public for as long as the item is listed — if it goes
      private the privacy policy URL 404s.
