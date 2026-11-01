---
paths:
  - "js/app/**/*.js"
  - "js/config.js"
---

# App module rules (`js/app/`, `js/config.js`)

`tests/selftest.js` enforces the first four.

- ES modules on relative specifiers with `?v=<appVersion>` on every static import. A name
  from another module is imported by name, never read from a global.
- **Never build HTML from strings:** no `innerHTML` / `outerHTML` / `insertAdjacentHTML` /
  `document.write` / `eval` / `new Function` / string timers. Build with `makeEl(tag,
  attributes, ...children)`; set text with `textContent`. Setting `el.style.x` is fine.
- Only globals in the `GLOBALS` list in `tests/selftest.js`. When you use a new browser API,
  add it there.
- `js/app/main.js` is the entry: it imports the modules, wires events and calls `init()` last.
- Shared state lives in one `app` state object exported by the core module, never in a
  top-level `let` shared across modules.
- Untrusted input (links, CSV files, localStorage) goes through the engine's sanitizers.
- Keep `window.__race` (the test hook) and `CONFIG.storageKey` unchanged.
- Touch first: every feature works by touch alone, with ≥ 44 px targets. Keyboard shortcuts
  are extras.
- Drawing is driven by `requestAnimationFrame`, but the engine's race time advances only in its
  own fixed steps; a frame never passes its delta into the physics (see `engine.md`).

## Where things are

Not written yet. When the modules exist, list each one here with what it owns (as the
Finisher's `shell-modules.md` does), and keep the list current.
