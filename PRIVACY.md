# Privacy Policy — CyKit Extension

_Last updated: 2026-09-23_

**CyKit does not collect, transmit, or sell any data.** It has no analytics, no
telemetry, no accounts, and no server of its own.

## What the extension can access

CyKit runs only on the sites listed in its manifest:

- `*.cybozu.com`, `*.kintone.com`, `*.cybozu.cn`, `*.kintone.cn`,
  `*.cybozu-dev.com`
- `github.com`

It does not run anywhere else, and it does not request access to all websites.

## What it does with that access

**Font feature.** Reads the computed font size and weight of elements on
kintone and Garoon pages in order to rescale them, and injects a stylesheet.
This happens entirely in the page; nothing is read for any other purpose and
nothing leaves your browser.

**GitHub feature.** On a pull request or issue page, reads the page title and
URL so that it can place them on your clipboard. This happens **only when you
click the Copy button**, and the text goes only to your clipboard.

**Branch locks feature.** Also **off by default**, and additionally gated on a
permission you grant by hand.

When enabled, it reads branch-lock windows from one Garoon group calendar you
nominate, so a pull request can warn you before you merge into a closed branch.
Because a GitHub page cannot call Garoon itself, the request is made by the
extension's own background worker — which is why it needs host access to your
Cybozu address, requested from the popup rather than at install time. You can
withdraw it at any time from `chrome://extensions`.

It reads only that calendar, only to display the result on the page, and sends
nothing to anywhere else. It cannot create, change or delete anything.

## What is stored

Your feature settings — chosen font, size, weight, which products each feature
applies to, and for the branch-lock feature your Garoon address and the group
id you nominated — are stored with `chrome.storage.sync`. That is Chrome's
own settings storage. If you have Chrome Sync enabled, Chrome synchronises it
through your Google Account so your settings follow you between devices; this
is done by Chrome, not by CyKit, and the authors never receive it. No page
content, browsing history, or personal data is stored.

You can erase everything by removing the extension.

## Network

With the branch-lock feature **off**, which is how it ships, the extension makes
no network requests at all. Fonts are bundled inside the package and loaded from
`chrome-extension://` URLs, so nothing is fetched from Google Fonts or any other
host while you browse.

With it **on**, the only request it ever makes is to the Garoon address you
nominated, to read the one group calendar you nominated. There is no server
belonging to this extension, no analytics endpoint, and no third party
involved.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save your feature settings |
| Host access to the Cybozu domains | Apply the font changes to those pages, and — if you enable Schedule — read your own Garoon schedule from that same host |
| Host access to `github.com` | Add the Copy button to pull request and issue pages |
| Optional host access to your Cybozu address | Granted by you, only for the branch-lock feature, so the extension can read that one group calendar while you are on GitHub |

## Third-party content

The bundled fonts are redistributed under the SIL Open Font License 1.1. Their
licences ship with the extension in `fonts/licenses/`.

## Contact

Please open an issue on the project's repository.
