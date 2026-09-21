# Store screenshots

1280×800 PNG, the size the Chrome Web Store expects.

`s1.html`, `s2.html`, `s3.html` and `s4.html` are the sources. They embed the real popup build and
the real GitHub button code, so re-rendering after a UI change keeps the
listing honest:

```sh
pnpm build
"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" --headless \
  --disable-gpu --allow-file-access-from-files --virtual-time-budget=6000 \
  --window-size=1280,800 --screenshot=01-font.png s1.html
```

The GitHub frame is a mock page header, not a capture of a real repository —
the Copy button in it is inserted by the extension's own code.

The promo tile is rendered the same way from `../promo-tile.html`:

```sh
"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" --headless \
  --disable-gpu --allow-file-access-from-files --virtual-time-budget=3000 \
  --window-size=440,280 --screenshot=../promo-440x280.png ../promo-tile.html
```

`s3.html` (copy menu) and `s4.html` (branch lock) embed the stylesheet and
markup the content script actually produces, extracted from a page where it
ran — not a hand-drawn copy of them. Regenerate them by re-running the dump
step in the repository history rather than editing the HTML by hand, or the
shot and the product will drift apart.
