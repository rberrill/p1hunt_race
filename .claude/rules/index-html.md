---
paths:
  - "index.html"
---

# `index.html` rules

`tests/selftest.js` enforces all of these.

- The Content Security Policy `<meta>` stays **before any stylesheet or script**, with
  `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self'` (the icons),
  `connect-src 'self'` (the app fetches nothing itself; it lets the verify recipe refresh the
  browser cache with a page-side `fetch` of the site's own files, Claude's call),
  `base-uri 'none'`, and no `unsafe-*`, wildcards or other hosts.
- Nothing inline: no `<script>` without `src`, no `style="…"`, no `on…="…"` handlers. Styles go
  in `css/app.css`.
- One entry script, `<script type="module" src="js/app/main.js?v=…">`; every other module is
  reached by `import`. Relative paths only: no leading slash, no host.
- Every asset link (the stylesheet, the entry script and the `icons/` links) carries
  `?v=<appVersion>` matching `CONFIG.appVersion` in `js/config.js`, and its file must exist.
  `node .claude/skills/release/set-version.js` changes them together with the imports.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
  and a `no-referrer` referrer policy.
- The three phases are three sibling sections; the one in use is the only one shown.
