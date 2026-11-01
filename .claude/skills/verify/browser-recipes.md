# Browser recipes (preview pane)

- **Servers:** `race` serves this folder on 8768. `subfolder` serves the parent folder on 8772, which mimics Pages' `/p1hunt_race/` subfolder URL. Rich's own LAN server uses 8769, and the Finisher's previews use 8766 and 8771, so nothing collides.
- **Fresh assets:** the `?v=` doesn't change during development, so the browser may serve stale JS or CSS. Before navigating, run `fetch(url, {cache: 'reload'})` for each asset link in `index.html` and each module under `js/`.
- **Hidden pane:** rendering pauses, and `requestAnimationFrame` stops firing. Shim it first: `window.requestAnimationFrame = f => setTimeout(() => f(performance.now()), 16)`. The race must still finish with the identical order under the shim; if it doesn't, the physics is reading frame time (see `.claude/rules/engine.md`).
- **Driving a race deterministically:** use the test hook `window.__race` (the engine session defines its members) to load a list, set the seed and duration, start, and run the simulation to the end without waiting for real time. Compare `finishOrder` between two runs; never compare screenshots for determinism.
- **Frame-rate rows:** replace `requestAnimationFrame` with a shim that fires at a fixed interval (33 ms for 30 fps, 8 ms for 120 fps) and run the same race under each; the finish must be identical.
- **Reduced motion:** the preview pane can't emulate `prefers-reduced-motion`. Claude's proposal for the engine session: a `CONFIG` on/off override (`?reducedMotion=1`) that forces the mode, so the row can run here.
- **Downloads:** capture them by wrapping the app's download function on the hook rather than reading the browser's download folder.
- **Phone emulation:** `resize_window` with `mobile` (or any width under 768) also emulates touch and a mobile user agent. Reload after switching so the layout's load-time checks re-run. Clicks still arrive as mouse events; drive touch-only paths with dispatched `PointerEvent`s with `pointerType: 'touch'`.
- **Screenshots:** they sometimes come back tiled or stale. Retake once before trusting one.
