# Dayloom architecture

Dayloom is a single-page app with **no build step, no dependencies, no backend,
no accounts, and no sync**. It is designed to be hosted as static files on
GitHub Pages (it also runs by opening `index.html`, with full PWA/offline
behavior only over HTTP/HTTPS).

## Files

| File | Role |
| --- | --- |
| `index.html` | Shell: sidebar, topbar, view sections, all dialogs, SVG icon symbols, `<noscript>` fallback. Views that change shape a lot (tasks, workouts, converter, settings) are rendered by JS into empty sections. |
| `app.js` | The whole app: one IIFE (~1,170 lines). State, rendering, editors, calendar, workouts, converter, locks, backups, timers. |
| `styles.css` | All styling, including dark theme (`[data-theme="dark"]`), mobile breakpoints (720 px / 350 px), and `prefers-reduced-motion`. |
| `sw.js` | Service worker. Cache `dayloom-static-v8`, network-first with cache fallback, deletes old `dayloom-static-*` caches on activate, re-caches on a `refresh-cache` message. All asset paths are relative (`./`) so the `/Dayloom/` subpath works. |
| `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png` | PWA install metadata and icons. |
| `.nojekyll` | Disables Jekyll processing on Pages. |

Pages deploys from the `main` branch only. Pushing any other branch (for
example a review branch) does **not** publish it.

## Runtime shape

- One IIFE. `data` holds the whole user dataset; `ui` holds ephemeral view
  state (current view, selection, editor drafts, timer, undo slot, unlock sets).
- `render()` re-renders the current view from `data` + `ui` and re-applies
  settings (theme/accent/density). Rendering is string templates; every user
  value goes through `escapeHtml`. Links are rendered only for `http(s)` URLs
  via `webLinks` (credentials stripped, length capped, `rel="noopener"`).
- Interaction is delegated: one document click handler dispatches on
  `data-action` (plus `data-id` / `data-view` / `data-date`). Editors are
  native `<dialog>` elements with backdrop-click close and an Esc guard while
  a media viewer is fullscreen.
- Navigation is hash-based (`#today`, `#calendar`, `#tasks`, `#workouts`,
  `#notes`, `#converter`, `#settings`, `#list:<id>`). The secret view is not a
  hash route and cannot be deep-linked into.

## Data model

- **localStorage** key `dayloom:data:v1` holds the JSON dataset:
  `{lists, tasks, events, notes, noteFolders, secretAlbums, settings}`.
  The timer is deliberately **not** in the dataset; it lives in
  `dayloom:timer` and is never backed up.
- **IndexedDB** database `dayloom-media`, store `attachments` (keyed by
  attachment id) holds photo/video blobs. 200 MB per-file attach cap.
- Tasks carry `completed`, `missed`, `skipped` flags plus roll-link fields
  (`skipRolledId`, `completedRolledId`, `missedRolledId`) — see
  "Repeat rolls" below. Notes carry `isList` + `checklist` for checklist
  lists, which always live in the built-in `lists` folder. Events are
  standalone calendar entries (all-day or timed, multi-day, colored,
  daily/weekly/monthly/yearly repeats, unbounded by design).

## Repeat rolls (the invariant to preserve)

Completing, skipping, or marking-missed a repeating task creates exactly one
next instance (checklist reset, no attachments, cleared flags) and records its
id on the original (`completedRolledId` / `skipRolledId` / `missedRolledId`).
Reversing the action (un-complete, unskip, restore-missed) removes that
rolled instance **only if it is still pristine**: still open, unskipped,
`updatedAt === createdAt`, and attachment-free. A touched instance (edited,
ticked, moved, completed) is never auto-deleted — the user keeps it and can
delete it manually. A transition that rolls a new instance first removes any
pristine instance rolled by a *different* transition, so a task can never gain
two next instances (for example completing a missed task, or skipping a
missed task). Rolls never propagate a stale link: every rolled copy starts
with all three link fields empty.

Repeat math (`nextRepeatDate`): daily = +1 day; weekly = strictly the next
occurrence of the same weekday (even when completed late); monthly = same
day-of-month clamped to the month length; custom = strictly the next matching
weekday. `saveTask` auto-fills an empty due date on repeating tasks only
(daily/weekly/monthly → today; custom → today if it matches, else the next
matching weekday; a past `repeatUntil` or no valid occurrence → stays blank).
Monthly/yearly *event* repeats skip short months (Jan 31 has no February
occurrence; Feb 29 skips non-leap years) — known limitation, not a bug.

## Storage integrity

- `parseData` validates everything on load and on import: ids
  (`^[a-zA-Z0-9_-]+$`, <120 chars), title/body caps, enums, colors, dates,
  attachment types (`image`/`video`), and collection caps (500 lists, 10,000
  tasks, 2,500 notes, 250 folders, 100 albums). Timestamps must look like ISO
  (`YYYY-MM-DDTHH:MM` prefix) or they fall back to now — a garbage
  `updatedAt` must never win a Merge comparison. New fields are validated
  the same way as the existing `skipRolledId`.
- **Merge** (import): incoming tasks/events/notes win when their `updatedAt`
  is newer; lists/folders/albums are add-if-missing; tasks with a missing
  list fall back to `inbox`, notes with a missing folder fall back to
  Unfiled; settings are never touched. **Replace**: wipes everything and
  clears the media store first, then restores only blobs referenced by the
  final items (cap 1,000). Import cap 500 MB.
- **Backups**: `{format:'dayloom-backup', version:4, exportedAt, data}` plus
  an optional top-level `media` array. The importer still accepts versions
  1–3. Optional password-protected variant: AES-GCM envelope
  (`{format:'dayloom-backup-encrypted', version:1, salt, iv, data}`,
  PBKDF2 100k, SHA-256). The export includes *all* media blobs in the store,
  so orphans bloat backups — see below.
- **Undo + media**: deleting an item does *not* delete its blobs at once.
  The blob ids ride with the undo record (`pendingMedia`) and are deleted
  when the 8-second undo window expires, when the undo slot is replaced by a
  newer delete, or never if the user undoes (the restored item keeps working
  media). A startup orphan sweep deletes blobs referenced by no item — but
  only when storage loaded successfully; if the JSON load failed and data
  fell back to defaults, the sweep is skipped so it can never wipe real
  media. "Erase local data" clears the media store, drops any pending undo,
  and stops the running timer.
- **Locks are UI gates, not encryption.** Note/folder/app-lock passwords are
  stored only as salted SHA-256 hashes; note text sits in plain localStorage
  and in plain backup JSON. Only a password-protected backup encrypts the
  file. There is **no password recovery** for any lock. The secret folder
  (id `secret`) is invisible while locked: no row, no search hits, no counts,
  excluded from editor/move dropdowns; leaving its isolated view re-locks it.

## Timers, reminders, notifications

- One timestamp-based timer engine (`dayloom:timer`, persisted across reload;
  beep 880 Hz + vibrate per phase; finish-only system notification when the
  reminders permission is on). Timers are Workouts-only by design.
- Reminders: a task's `reminder` time (HH:MM) fires while Dayloom is open
  (boot + every 60 s), only for due-today open tasks, once per day
  (`reminderNotified`). Skipped/completed tasks never remind.
- Any toast replaces the undo toast and clears the undo slot, so undo lasts
  "8 seconds or until the next toast" — known behavior, mitigated by the
  orphan sweep (see AUDIT_REPORT.md).

## Calendar transfer (.ics)

Export uses exclusive DTEND for all-day events (correct per RFC) and FREQ-only
RRULEs (repeats are unbounded by design). Import dedupes by stable `icsId`
(own `@dayloom.local` ids pass through; external UIDs get a dual-FNV hash),
caps 2,500 events per file, converts TZID/UTC to device-local time (unknown
timezones are rejected, not shifted), and defaults a missing timed DTEND to
the event's start time (zero-length event). Unsupported recurrences import as
a single event with a warning.

## Performance notes

- No per-keystroke iframe churn: YouTube embeds re-render only when the ID
  set changes. Timers tick on a 200 ms interval from stored timestamps, so
  they survive tab switches and reloads.
- The dataset is re-rendered wholesale on each `render()`; the app is sized
  for personal data volumes (caps above), not for thousands of items.
- `render()` re-applies settings every render (cheap CSS-variable sets).
