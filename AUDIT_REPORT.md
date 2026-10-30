# Dayloom comprehensive audit report

- **Repo:** `bobuildington/Dayloom` (public), site <https://bobuildington.github.io/Dayloom/>
- **Baseline:** `main` at `7d58d572` (verified by blob SHA for every file before editing).
- **Audit branch:** `audit/dayloom-comprehensive-review` (created from that commit; Pages deploys from `main` only, so pushing the branch publishes nothing).
- **Scope:** all 14 phases of the audit prompt except Phase 14 (PR creation — deliberately not done; this report is the handoff for review).
- **No changes to:** `main`, Pages/deployment settings, design, features, or stored user data. No new frameworks, services, or backends. $0 spend.

## Overall assessment

Dayloom is in good shape for a single-file, no-build app. The data model is
sound, import validation is thorough, escaping is consistent, locks behave
as documented (UI gates, not encryption), and the service worker and
Pages setup are correct. The audit found **one family of real data-integrity
bugs** (repeat-roll duplicates), **two media-integrity bugs** (undo losing
photos/videos; "erase" leaving them behind), and a set of small, low-risk
issues. All confirmed bugs are fixed on the audit branch and covered by
regression tests. Nothing found warrants a rewrite or a data migration:
every fix preserves the existing backup format, and old backups still import
unchanged (new fields validate and default exactly like the existing
`skipRolledId`).

## Method

1. Fetched every repo file from `main` and verified blob SHAs
   (`app.js 15a173…`, `index.html 92b734…`, `styles.css 460a8d…`,
   `sw.js a61db5…`, `README.md 7c65e1…`) before editing.
2. Read `app.js` (1,162 lines), `index.html` (278 lines), `sw.js`,
   `manifest.webmanifest`, `styles.css`, and `README.md` in full.
3. Cross-checked mechanically: every `el('…')` id against its definition
   (static markup or JS template), every `icon('…')` / `views` icon against
   the SVG symbol table, every CSS class family against its emitters.
4. Ran the existing node suites as a baseline (all green except one stale
   test — see below), then fixed code, then re-ran everything plus new
   regression suites.
5. No live browser was available to this audit (subagent) and Playwright on
   this VM cannot reach the live site, so browser-dependent behavior is
   listed as a checklist at the end — never claimed as verified.

## Findings and fixes

Severity: **H** = data loss / privacy / duplication of user data,
**M** = real bug with a bounded trigger, **L** = small / cosmetic / hardening.

| # | Severity | File | Problem | Fix (audit branch) | Verified by |
| --- | --- | --- | --- | --- | --- |
| 1 | M | `app.js` | Complete → un-complete → complete duplicated a repeating task: the completion roll was never linked, so un-completing left it behind. Same family as the skip bug fixed in `7d58d572`. | Track `completedRolledId` on the completion roll; un-complete removes the rolled instance under the same pristine guard as skip. Generalized `removeSkipRolled` into `removeRolled(task, field)`. | audit suite: complete/un-complete, touched-roll-kept |
| 2 | M | `app.js` | Mark-missed → restore → mark-missed duplicated: `restore-missed` cleared `missed` but never removed the instance `markMissed` rolled. | Track `missedRolledId`; restore removes the pristine rolled instance. | audit suite: missed/restore, touched-roll-kept |
| 3 | M | `app.js` | Completing a missed task, or skipping a missed task, created a second next instance alongside the missed roll (the transition rolled without removing the other transition's roll). | Every rolling transition first removes pristine rolls from the other transitions (complete removes skip+missed rolls; missed removes skip+completed; skip removes missed+completed). | audit suite: complete-missed, skip-missed |
| 4 | M | `app.js` | "Erase local data" (clear-all) did not erase IndexedDB media, so a later backup still contained the "erased" photos/videos (backup export reads all blobs). It also left a running timer and its stored state behind. | Clear-all now calls `mediaClear()`, drops any pending undo, stops the timer interval, clears `ui.timer`, and clears the stored timer key. | Static check on the handler + browser checklist |
| 5 | M | `app.js` | Undo restored a deleted item without its media: deletes removed blobs immediately, then the undo restored only the record (the editor silently dropped the dangling refs). | Media deletion is deferred: blob ids ride with the undo record (`pendingMedia`) and are deleted at undo expiry, or when the undo slot is replaced; undoing never deletes them. Plus a startup orphan sweep (below). | audit suite: defer/expiry/restore/replacement |
| 6 | M | `app.js` | Orphaned blobs (cancelled editors attach immediately; old code left them forever) bloated backups, since export reads all blobs. | `sweepOrphanMedia()` at boot deletes blobs referenced by no item — but only when storage loaded successfully. If the JSON load failed and data fell back to defaults, the sweep is skipped, so it can never wipe real media. | Static checks + browser checklist |
| 7 | L–M | `app.js` | Bulk "Clear all" and "Move all to today" also affected skipped tasks, silently changing tasks the user explicitly skipped (a skipped overdue task became skipped+missed and showed in both filters). | Both filters now require `!t.skipped`. The single-item Clear button was already unreachable for skipped tasks (its rows exclude them) and is unchanged. | audit suite: clearAllMissed; static check for missed-to-today |
| 8 | L | `app.js` | Deleting the currently viewed task list navigated to the dead `lists` view (removed in the menu cleanup), falling through to Today. | Navigates to `tasks`. | audit suite: deleteList navigation |
| 9 | L | `app.js` | New-event start-date auto-end never ran: the handler required an empty `eventId`, but `openEvent` pre-fills a uuid for new events. | Gate on "no existing event has this id" instead, so new events auto-fill the end date and editing an existing event never moves its end date. | Static check + browser checklist |
| 10 | L | `app.js` | `deleteFolder` blocked the `lists` folder but not the `secret` folder (defense in depth; unreachable in practice because the secret folder has no edit UI outside its isolated view). | Same guard for `secret`. | audit suite: deleteFolder |
| 11 | L | `app.js` | `parseData` kept garbage `createdAt`/`updatedAt` strings. Garbage `updatedAt` breaks Merge comparison (any garbage string compares greater than ISO strings, so crafted incoming items always win) and garbage `createdAt` breaks date sorting. | New `validStamp` helper: only ISO-like prefixes (`YYYY-MM-DDTHH:MM…`) are kept, otherwise now — applied to tasks, events, and notes. `completedAt` is intentionally left unvalidated (it only feeds streak math, where garbage never matches a real date). | audit suite: validStamp + parseData |
| 12 | L | `app.js` | Imported timed event without DTEND got `endTime` 10:00 regardless of start time. | Defaults to the event's start time (zero-length event); all-day without DTEND still gets 00:00; explicit DTEND is honored. | audit suite: parseICS (3 cases) |
| 13 | L | `app.js` | Workout sessions use task list `workouts`, but fresh profiles have no such list (default lists are inbox/personal/work), so session tasks showed the fallback "Inbox" label and could not be filtered by list. (Adam's own data has the list; this affects new users.) | `ensureWorkoutsList()` creates the list (same name/color as the shipped workout import file) when a session is created and when any task is saved with that list. | audit suite: ensureWorkoutsList |
| 14 | L | `app.js`, `index.html` | Task-category wording was half-migrated: the dialog said "New category" but the task editor said "List", the All-tasks filter said "Filter by list / Every list", the color label said "List color", and toasts said "List updated/created/removed". | Wording unified to "Category" in the editor label, filter, color label, toasts, and the Settings row. (The Notes "Note / List" picker is a different feature — checklist note lists — and is intentionally unchanged.) | Skipfix suite re-run against audit code (includes the category wiring check) |
| 15 | L | `styles.css`, `index.html` | Dead code from the menu cleanup: CSS rules `.side-divider`, `.side-list-label`, `.menu-divider`, `.list-card-grid`, `.list-card` (+ variants), `.list-card-add`, `.list-toolbar`, `.menu-item .list-dot`, `.desktop-search-button`, and SVG symbols `i-layers` (the old My-lists icon), `i-sun`, `i-moon`, `i-dots`, `i-info` — all verified with zero emitters/uses before removal. | Removed (19 CSS rules, 5 symbols). | grep verification (0 remaining references) + full suite re-runs |
| 16 | L | `index.html` | No `<noscript>` fallback: with JavaScript disabled the app rendered an empty shell with no explanation. | Added a plain `<noscript>` message. | Static check |
| — | — | `README.md` | Stale docs: import cap said 250 MB (actual 500 MB); mobile menu "plus your lists" (lists left the menu); "floating + button on mobile" (removed); missing 2026-10-30 features (Skip, checklist Lists, categories, auto-set date, collapsed subtasks, hidden missed section, undo-restores-media, erase-erases-media). | Fixed in place; new behavior documented in the feature list. | — |

### Stale test repaired (not weakened)

`test_sniff.js` failed at baseline (exit 1, "converterToFile is not defined").
Its extracted fixture predated the 2026-10-29 converter redesign
(Text→file from picked `.txt` files only, no pasted text), so it drove an
interface that no longer exists. The test was updated to the current
interface — same assertions (PNG→`.png`, JPEG→`.jpg`, unknown→extensionless,
explicit name untouched, plus a combined-`.txt` section case) — and its
extracted code regenerated from current `app.js`. It now passes. No
assertion was dropped or loosened.

### Checked and found sound (not changed)

- `parseData` validation overall (ids, caps, enums, colors, dates,
  attachment types, lock fields, settings whitelist); Merge never touches
  settings; Replace clears media first, then restores referenced blobs only.
- Escaping: all user values through `escapeHtml`; `webLinks` http/https
  only, credentials stripped, length capped, `rel="noopener"`; YouTube
  embeds use fixed `youtube.com/embed/<11-char-id>` URLs only.
- Locks are UI gates, not encryption (already told to the user plainly);
  secret-folder invisibility holds (locked `secret` returns no row, no
  search hits, no counts; hash boot cannot deep-link into it; visibility
  hide re-locks and resets the view).
- ICS: exclusive DTEND export, FREQ-only RRULE (unbounded by design),
  stable `icsId` dedup, 2,500-per-file cap, TZID/UTC→local conversion with
  unknown timezones rejected rather than shifted.
- Timers: timestamp engine, persisted to `dayloom:timer` (not in backups),
  restores running/paused/finished states, finish-only notification.
- Reminders: boot + 60 s checks, due-today only, skips completed/skipped,
  once per day via `reminderNotified`.
- Service worker: network-first + cache fallback, relative paths, old
  `dayloom-static-*` caches purged on activate, `.nojekyll` present.
- Roll math: daily/weekly (strictly next week)/monthly (clamped)/custom
  (strictly future weekday); `bulkMove` bumps `updatedAt`, so moved rolled
  instances count as touched; `removeRolled`'s pristine guard is sound for
  human timing (skip and a later mutation cannot land in the same
  millisecond in real use).
- Multi-select, dialogs (native `<dialog>`, Esc guard during fullscreen),
  `render()` settings re-application, YouTube re-render only on ID-set
  change, focus-visible outlines, `prefers-reduced-motion`.
- Every `el('…')` id used by `app.js` resolves to static markup or a JS
  template (the initial static-only cross-check flagged 22 ids; all 22 were
  found in `app.js` templates).

### Known limitations (documented, not changed)

- **Monthly/yearly event repeats skip short months** (Jan 31 has no
  February occurrence; Feb 29 skips non-leap years). No code change: this
  matches the "same day-of-month" rule the UI implies.
- **Undo lasts "8 seconds or until the next toast"**: `notify()` clears the
  undo slot, so any toast inside the window ends undo early. Documented
  behavior; the orphan sweep now bounds its cost (orphaned blobs are
  cleaned at next open instead of living forever).
- **Fresh-profile Workouts plan notes**: the Workouts view shows plan notes
  from the `workouts` note folder, but a fresh profile has no such folder
  and no in-view button creates one — so the section stays empty until a
  backup containing the folder is merged. The task-list side is fixed
  (finding 13); the folder side needs a product decision (an in-view "New
  plan note" button, or ensuring the folder when the view opens) and is
  left for the owner rather than invented here.
- **Pre-existing duplicate pairs are not retro-fixed**: if a user already
  has two next instances from the old bugs (for example the duplicate
  tomorrow pair from skip→unskip→complete before this audit), this audit
  prevents new ones but does not delete the old pair — the user deletes
  one copy manually, as before.

## Tests

All suites use stubbed data only; nothing ran against real user data.

| Suite | Command | Result |
| --- | --- | --- |
| New audit regression suite (27 checks: roll tracking ×8, skipped exclusion, undo media ×3, timestamps ×2, Workouts list, navigation, folder guards ×2, ICS ×3, static checks ×6) | `node test_audit.js` (in `~/workspace/.tmp/dayloom-audit/`, extracts from the audit `app.js` at runtime) | 27 passed, 0 failed |
| Skipfix suite re-run against audit code (skip→unskip→complete, + Category wiring) | `node test_skipfix_audit.js` | 24 passed, 0 failed |
| Autodate suite re-run against audit code | `node test_autodate_audit.js` | 15 passed, 0 failed |
| Repaired sniff suite (picked-file converter interface) | `node test_sniff.js` (in `~/workspace/.tmp/dayloom/`) | passed (5 cases) |
| Full existing-suite baseline (all `test_*.js` in `~/workspace/.tmp/dayloom/`, before changes) | `node <suite>` each | All green except `test_sniff.js` (stale fixture, repaired above). Counts on record: menu 33, lists 22, skipfix 24, skip 22, autodate 15, missed 22, viewer 31, gallery 34, install 30, lock 30, media 18, multi all-pass, converter all-pass, backup/crypto all-pass, secret all-pass, secretmode 25, fab 14, relock all-pass, preview all-pass, per-file all-pass, chunk all-pass, audio all-pass, filename all-pass, choice all-pass, escguard all-pass, mobile all-pass, timernotif all-pass, loop/loop-render all-pass, lockedcolor all-pass. |
| Syntax | `node --check app.js` (before push) | pass |
| Blob-SHA baseline | `git hash-object` on all five files vs `main@7d58d572` | all five matched before editing |

Test files live in the workspace (`~/workspace/.tmp/dayloom-audit/`,
`~/workspace/.tmp/dayloom/`), not in the repo — the repo has deliberately
shipped only the app itself, and adding a test harness was judged out of
scope for this audit. `CONTRIBUTING.md` documents the extraction-and-stub
pattern so a future suite can be built the same way.

## Documentation written (audit branch)

- `README.md` — stale facts fixed + 2026-10-30 features documented (see
  finding 16).
- `ARCHITECTURE.md` (new) — files, runtime shape, data model, repeat-roll
  invariant, storage integrity, locks, timers/reminders, ICS, performance.
- `CONTRIBUTING.md` (new) — hard constraints (Pages-only, $0, no backend),
  style, pre-push checklist, automation limits.
- `AUDIT_REPORT.md` (this file).

## Commits pushed to `audit/dayloom-comprehensive-review`

1. `bad0b740272770fc7017ea29b40ba11eb8262f46` — "Audit: fix
   roll-duplicate bugs, undo media loss, erase-media gap, skipped-task
   batch actions, and dead code" (`app.js`, `index.html`, `styles.css`).
2. `dc8a677cc50afff5d9e5a6fdfaa836053c286416` — "Audit: document
   architecture, contributing rules, and current features (fix stale
   README facts)" (`README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`).
3. This report (`AUDIT_REPORT.md`) — pushed as its own commit so the
   report's commit list is accurate.

## Browser verification checklist (for the parent — not yet performed)

Run against the audit branch preview (or a local serve of the branch
files). Use the browser test profile, never Adam's phone data. Note:
native `confirm()` dialogs cannot be pressed in automation, so delete and
Replace-import steps need a live tap; if a delete "does nothing" in
automation, that is the unpressed dialog, not a bug.

1. **Complete → un-complete → complete (daily task):** complete a daily
   task (one tomorrow instance appears), un-complete it (tomorrow instance
   disappears), complete again (exactly one tomorrow instance). Then:
   complete, edit the tomorrow instance's title, un-complete the original
   (edited instance stays).
2. **Mark-missed → Restore:** mark an overdue repeating task missed via
   Clear (one next instance appears), open All tasks → Missed → Restore
   (next instance disappears, original back on its list). Repeat with the
   next instance edited first (edited instance stays after Restore).
3. **Complete a missed task / skip a missed task:** each must leave exactly
   one next instance, not two.
4. **Undo restores media:** attach a photo to a task, delete the task,
   tap Undo within 8 s — the restored task still shows the photo. Delete
   again and let the toast expire — the photo blob is gone (re-opening the
   restored item is impossible; verify via a fresh backup export not
   containing the photo).
5. **Erase local data:** attach a photo, Settings → Erase local data
   (confirm + type ERASE) — data is gone, a subsequent backup export
   contains no media, and a running workout timer is stopped.
6. **Skipped exclusion:** skip an overdue task, then Today → What you
   missed → Clear all and Move all to today — the skipped task is untouched
   by both (still skipped, still due on its old date).
7. **Delete viewed category:** open a category via its URL (`#list:<id>`),
   delete it from its dialog — lands on All tasks, tasks moved to Inbox.
8. **Event auto-end:** create a new event, set a start date with an empty
   end date — the end date auto-fills to the start date. Edit an existing
   event's start date — its end date does not move.
9. **ICS import:** import a timed event with no DTEND — its end time equals
   its start time (not 10:00).
10. **Workouts on a fresh profile:** open Workouts, "Add to today's
    session" — a Workouts category now exists and the session task carries
    it (no "Inbox" fallback label).
11. **Category wording:** task editor label says "Category", All-tasks
    filter says "Filter by category / Every category", toasts say
    "Category updated/created/removed".
12. **No-regression spot checks:** sidebar shows exactly 7 entries;
    secret folder flow (5 taps) still works; viewer Previous/Next and
    slideshow Stop-only UI unchanged; converter round-trip still works;
    install/offline panel unchanged.

## Remaining issues, risks, and recommendations

1. **No browser verification was possible in this audit.** The checklist
   above must run before merge — especially items 1–6, which are the
   data-integrity fixes.
2. **Do not merge without reviewing the diff** against `main@7d58d572`
   (71 changed lines in `app.js`, 10 in `index.html`, 19 dead CSS rules
   removed). Nothing else changed; no secrets, generated files, or
   unrelated edits are in the diff.
3. **Fresh-profile Workouts plan-notes folder** (see Known limitations):
   decide whether the Workouts view should offer a "New plan note" button
   or ensure the folder on open. Recommend the button — it is explicit and
   does not mutate data on a read-only render.
4. **Consider shipping the audit node suites with the repo** in a future
   pass (for example under `tests/` with a small runner). The extraction
   pattern works, but it was out of scope here and the repo currently
   ships app-only.
5. **Long-term:** the single-file style is sustainable at this size, but
   any future split (for example extracting the converter or ICS code
   into modules) needs a build step decision first — Pages serves static
   files, so ES modules via relative `./` imports would work without a
   build, but the service-worker asset list must gain the new files.
