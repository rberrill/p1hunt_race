# Security

P1 Hunt Race is a static web page. It has no server, no accounts and no analytics, and it never uploads anything: the entrant list, the race and its record stay in your browser.

## What the app does to stay safe

- **Nothing from outside runs.** A Content Security Policy allows only the site's own scripts and styles; there are no third-party scripts, fonts or trackers.
- **Untrusted input is checked.** Links can only change number and on/off settings, within safe limits, and a race run with changed settings says so on screen and in its exports. Imported CSV files, and what the app reads back from your browser's storage, are checked field by field, and anything malformed is reset to its default.
- **Text never becomes markup.** Entrant names are only ever shown as text. The interface builds its controls as page elements rather than from HTML text, and an automated check fails the build if that rule is broken.

## What's stored on your device

- The entrant list, seed and duration as you edit them, so you can resume after a reload (**Start over** clears them).
- The record of the last race (the finish order and times, the seed, the duration, any link settings, the app version and when it was saved), for export and re-runs. A race in progress is not saved.

All of this lives in your browser's own storage for this site. Clearing the site's data in your browser removes it.

## Reporting a problem

If you find a security issue, please report it privately through GitHub's **Report a vulnerability** button on the repository's Security tab, rather than opening a public issue. Include the browser, the steps, and what you expected to happen.
