# Contributing to Dayloom

Dayloom is a small, personal, phone-first app. Keep changes small, focused,
and compatible with the constraints below. They are the project's shape, not
suggestions.

## Hard constraints

- **GitHub Pages only, $0 spend.** No backend, no accounts, no sync, no paid
  services, no new frameworks, no new runtime dependencies. The only external
  content is YouTube embeds.
- **Pages deploys from `main` only.** Work on a branch for review; never
  change Pages/deployment settings, and never merge or deploy from an audit
  or review branch without the owner's go-ahead.
- **Preserve features, design, and stored data.** No rewrites for their own
  sake. Do not remove something because it looks unused — verify first
  (grep the emitters: templates in `app.js`, static markup in `index.html`,
  and the `icon()` / `views` tables).
- **Old backups must keep importing.** Any new task/event/note field must be
  validated in `parseData` the way existing fields are (id format, type,
  caps) and preserved in `saveTask` / `saveEvent` / `saveNote`, or it will
  be silently dropped on the next save or import.

## Code style

- One IIFE in `app.js`; views render from string templates. Match the
  existing dense style (one-line helpers are normal here), but keep new logic
  readable — a named helper beats a longer one-liner.
- Every user-supplied value rendered into HTML goes through `escapeHtml`.
  Links go through `webLinks` (http/https only). Never build an embed URL
  from raw user input — YouTube embeds use fixed `youtube.com/embed/<id>`
  URLs with 11-character IDs only.
- CSS lives in `styles.css`, mobile rules in the 720 px / 350 px blocks.
  Touch targets on phones are 28 px+ for checkboxes, 32 px+ for media
  buttons, 36 px for swatches. Respect `prefers-reduced-motion`.
- Locks stay UI gates: never store a password, only salted SHA-256 hashes;
  never claim encryption for plain backups or localStorage.

## Before pushing

1. `node --check app.js` — must pass.
2. Re-run the node suites that cover your change area, plus a fresh
   extraction-based check of the changed functions against stubbed data
   (extract the function from `app.js`, stub `data` / `ui` / `el` /
   `notify` / `persist` / `render` on `globalThis`, assert behavior). The
   repo ships no test runner; suites live alongside the working copies and
   are documented in `AUDIT_REPORT.md`.
3. Review the full diff: no accidental changes, no secrets, no generated
   files, no unrelated edits, no weakened tests. Never delete or weaken a
   failing test — fix the code, or update the test's *harness* (not its
   assertions) when the UI it drives was intentionally redesigned.
4. If the change needs a real browser (phone-width menu, viewer taps,
   native `confirm()` dialogs, installed-PWA branch, real-device
   reminder/timer pings), say so explicitly and list the exact steps —
   never claim browser verification that was not performed.

## Things automation cannot prove

- Phone-width UI (the automation viewport is desktop-width).
- Native `confirm()` / `prompt()` dialogs (they cannot be pressed in
  automation; a delete that "does nothing" in a check is usually an
  unpressed dialog, not a bug).
- GitHub Pages + HTTP cache lag (a new build can take minutes to appear,
  and a check can briefly serve mixed old/new files). Live checks need a
  version gate and a wait past the cache window.

## Releases

There is no release process beyond pushing to `main` (Pages deploys it).
Bump the service-worker cache name in `sw.js` when shipping a change that
must reach installed users promptly, and note it in the commit message.
