# Dayloom

**Your days, your way.** A customizable, mobile-friendly task manager you can host free on GitHub Pages.

No build step, account, tracking, API key, or database required. Tasks, calendar events, notes, and settings live in **this browser's localStorage**. GitHub hosts the app files, **not your personal task, event or note data**.

## Features

- Today dashboard with overdue, due-today and upcoming tasks, plus completion progress
- Interactive **month/week/day** calendar (Sunday/Monday start) with dated tasks and standalone events, plus event search
- Create, edit, complete and delete tasks; notes, priority and due dates
- Create, edit, and delete calendar events (all-day or timed, multi-day, colored, recurring daily/weekly/monthly/yearly)
- Daily, weekly and monthly repeats: completing a repeating task creates its next occurrence (weekly repeats always land on the same weekday, even if you complete the task late)
- Custom categories for tasks, with names and colors (create one from the Calendar agenda's **+ Category** button); task search, and status/category/priority filters
- What you missed: overdue tasks on the Today dashboard and a Missed filter in All tasks, so you can check off, reschedule, or delete them. Clearing a missed repeating task rolls a fresh next instance, and Restore (under Missed) brings the original back and removes that rolled instance again unless you already edited it.
- Checklists inside tasks: break a task into steps, tick them off right from the task row, and see progress at a glance. Today cards with checklists start collapsed ("▸ n/m steps"); tap to expand. The What-you-missed section hides entirely when nothing is overdue.
- Skip: a task can be skipped instead of completed — it leaves Today, never counts as missed or toward streaks, and lives under All tasks → Skipped with Unskip. Skipping, completing, or clearing a repeating task rolls exactly one next instance; undoing that action removes the rolled instance again unless you already edited it.
- Repeating tasks saved without a due date get one automatically: today, or the next matching weekday for custom repeats.
- Checklist lists in Notes: Add → List creates a tickable list, always kept in the built-in Lists folder.
- Undo for deletes: the confirmation popup after any delete lets you restore what you just removed — including its photos and videos, which are only permanently deleted once the undo window ends.
- Streaks: your day streak and weekly completions on the Today dashboard.
- What you missed actions: move everything overdue to today in one tap, or clear them all (Clear all) — cleared tasks stay under All tasks → Missed with Restore. Skipped tasks are never touched by these batch actions.
- Reminders: set a time on a task and get a ping when it's due. Works while Dayloom is open — no account or server needed.
- Photos & videos: attach pictures and clips to tasks, events, and notes. They live in this browser only, and they ARE included in JSON backups (encoded as text inside the same file), so they come back when you restore. Backups with lots of media can get big — imports accept files up to 500 MB.
- Workouts tab: a dedicated view for training — this week's sessions with Done / Today / Missed states, week-by-week browsing, today's session with tickable checklists, plan notes, and timers that live only on this tab.
- Timers: Cardio intervals (5 min warm up, 8 rounds of 30 sec hard / 60 sec easy, 3 min cool down), Rest (60 sec), and Plank (40 sec), with a beep and a buzz on every phase change. A timer keeps counting if you leave the tab and survives a reload. When a timer finishes it also sends a system notification if notifications are on in Settings (the same switch as reminders); if it finished while the app was closed, it tells you on the next open.
- Custom weekday repeats: repeat a task on specific weekdays (for example Mon, Wed, Fri) instead of one task per day.
- Repeat end dates: set a task to stop repeating after a date.
- Global search: the header search button now searches tasks, events, and notes together, on phone and desktop.
- Workouts section: the Workouts tab is now a full section with its own tabs — Sessions (week view, today's session, timers), Videos (one searchable exercise library with All, Strength, Core, and Cardio filters and playable demo videos, each with an "Add to today's session" button), and Kegel (a timed pelvic-floor routine: 10 slow holds plus 10 quick flicks, about 2 minutes, runnable any number of times a day, with YouTube videos or your own uploaded videos above the buttons, the routine description behind a Show description button, and a quiet timer — beeps only, no system notification or vibration).
- Start today's workout: a guided player that walks through today's session step by step, with Start, Skip, and Finish controls. Each step has its demo video, its own timer, and a Done button that checks it off.
- Per-workout videos and timers: every workout in the Workouts list gets a Videos button (a popup playing that workout's demo videos) and a Timer button right on it, so you never have to scroll to the top of the page for a timer.
- Password locks: notes and note folders can each be locked with their own password from their editor. A locked note shows only "Locked note" — no title, text, photos, or links — and locked notes never appear in search results. A locked note still shows its color (the top border of its card), so you can tell locked notes apart without opening them. Confirmed on the user's phone 2026-10-29. A locked folder hides its name, its note count, and all its notes until you unlock it. Unlocks last only until you leave the app or tap Lock all; locks travel with JSON backups. There is no password reset — a forgotten password cannot be recovered.
- App lock (Settings): when on, Dayloom asks for your password every time it opens and every time you come back to it, until you turn it off in Settings.
- Fullscreen photos: tap a photo in a note (or task, or event) editor to view it fullscreen; if the browser can't do fullscreen, it opens in a full-screen viewer instead.
- Auto-relock everything: leaving the app (or switching away and back) re-locks notes, folders, and the app itself — no matter which locks you use. If you were editing a locked note, you get the unlock prompt again when you return. Lists and folder rows refresh immediately on return, so a re-locked item never stays visible until the next tap.
- Converter: a Converter tab turns any photo or video into base64 text (downloaded as a .txt file) and turns base64 text or a .txt file back into the original files in your Downloads folder. Pick one file or several at once: several can download as one combined .txt or one .txt per file — you choose after picking. Restore works from picked .txt files only (no pasting, no base64 text shown anywhere); large files are encoded and decoded in chunks to keep memory use down. Pick several .txt files at once to restore them all; an older combined .txt still restores every file in it. Text → file also has a Preview button — it shows the restored photo, video (with a Loop switch), or audio right in the Converter tab from a temporary in-memory link, without saving anything to the app. Picking a new .txt file updates the file-name field to that file (a name you typed yourself is kept). Up to 100 MB per conversion.
- Video loop switch: every attached video in an editor has a Loop on/off switch — when on, the video replays automatically. The setting is saved with the video. Every attached video also has a fullscreen button (same spot as the photo fullscreen button) that fills the screen with that video; tapping it again exits. Pressing Esc while a video or photo is fullscreen only exits fullscreen — it no longer closes the editor underneath. When you paste raw text with no file name, the converter detects the file type from the file itself, so the restored download still gets the right extension.
- Press and hold to select: long-press a task, event, or note to select it, tap more to add them, then move or delete the whole batch at once
- Adjustable light/dark/system themes, accent colors and compact density
- Dedicated **Notes** tab with custom colored folders (create, rename, delete), cross-folder search, pinned notes and color-coded note cards
- iCalendar **`.ics` event export/import** for transfer with other calendar applications
- JSON download backup includes tasks, events, notes, note folders, lists and settings; import by **merge** or **replace**. Erase local data (Settings → Start over) also erases attached photos/videos and stops any running timer.
- Responsive mobile interface with bottom navigation and optional installable PWA/offline support

## Publish on GitHub Pages

1. Place all the included files in the **root** of your `Dayloom` repository's `main` branch.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Select **`main`** and **`/(root)`**, then choose **Save**.
5. Visit `https://YOUR-USERNAME.github.io/Dayloom/` after GitHub finishes deploying.

These files use relative paths, so they also work when the repository is served from a subpath.

## Add calendar events

Open **Calendar**, select a date, then choose **+ Event** (or the agenda header's **+ Event** button). Give the event a title, dates, optional times, color, notes, and repeat schedule. Events appear on the month, week and day calendar views, in the selected day's agenda, and on Today. To edit or delete one, tap the event. Repeating events are edited or deleted as one series.

## Calendar transfer (.ics)

Open **Calendar → Export .ics** to download your calendar events. **Calendar → Import .ics** accepts standard iCalendar `VEVENT` entries, including all-day events and time-zone-aware timestamps. Matching event IDs are updated so repeated imports do not duplicate them. `.ics` files transfer **events only**, not tasks, notes, or settings.

Dayloom supports basic daily, weekly, monthly, and yearly recurring rules. More complex recurrence rules (such as exceptions, end limits, or custom weekday combinations) are imported as a **single event** with a warning. The export uses floating local times, which destination apps interpret in their own local timezone. Unsupported or unknown time zones are skipped on import. For a **complete backup**, use JSON instead.

## Notes

Open **Notes** in the navigation. Tap **Folder** to create your own folders (for example Work, Ideas or Journal). Select a folder and add a note; change a note's folder from its editor. You can rename folders or delete them; deleting a folder moves its notes to **Unfiled** rather than deleting the notes. Search looks across **all** folders, no matter which folder is selected. Optionally pin notes and choose colors. Notes and folders stay in local browser storage and are included in JSON backups.

## Back up and restore

Go to **Settings → Download backup** to save `dayloom-backup-YYYY-MM-DD.json`. Keep the file in a safe location. To restore, select **Settings → Import backup**, choose the file and select:

- **Merge:** keep current data and add items in the backup, with newer edits winning for matching task, event, or note IDs. Current preferences remain unchanged.
- **Replace:** replace all tasks, events, notes, folders, lists, and preferences with the backup.

**Important:** Local storage is **per browser, per origin, per device**. It does not automatically sync between a phone and computer, or between browsers. Private browsing and clearing website data can erase tasks, events and notes. Always export backups before changing devices or browsers. GitHub repo updates do **not** back up tasks or events.

## Development

Open `index.html` in a browser for a quick preview; for full PWA/offline behavior, serve over HTTP (for example `python3 -m http.server 8000`) and visit `http://localhost:8000/`. No dependencies are needed.

Main code is in `app.js`; appearance is in `styles.css`. The service worker caches static files for offline use when hosted via HTTPS, but local data still relies on browser storage.

## Privacy

Dayloom does not send task, event or note data to GitHub or to any external server. A backup is a plain JSON file and is **not encrypted**; store it accordingly. This app uses local browser storage without authentication, so avoid sensitive tasks on shared devices.

### Backup compatibility

New exports are Dayloom JSON backup **version 4**, including calendar events, notes and note folders. The importer still accepts Dayloom **versions 1, 2 and 3**. Older notes without folders appear in Unfiled.

## Clickable web links

Paste `https://example.com` or `www.example.com` into task notes, regular notes, or calendar event notes. Dayloom displays tappable links below task rows, note cards and calendar event entries, as well as inside each editor. Links open in a new tab, plain text stays editable, and only HTTP/HTTPS addresses are linked. Your stored notes, tasks and events and backup format are unchanged.

## Mobile navigation + no keyboard popups (2026-10-29)

- On phones the bottom tab bar is replaced by a single Menu button showing the current section. Tapping it opens a sheet with all sections; picking one navigates and closes the sheet. The desktop sidebar is unchanged.
- Opening an existing note, task, event, folder or list no longer focuses the title field, so the keyboard stays down until you tap a field. New items still focus the title on desktop only; on touch devices nothing autofocuses. Password dialogs, search, and empty-title error refocuses still focus as before.
- Bigger touch targets on phones: media buttons 32px, color swatches 36px, task checkboxes 28px. Buttons use touch-action:manipulation to avoid double-tap zoom delays.

## Converter audio support (2026-10-29)

- File → text now accepts audio files too (mp3, wav, ogg, m4a), same 100 MB cap as photos/videos. Text → file and Preview already handled audio by name (audio player with Loop switch); the byte-sniffer now also recognizes mp3 files (ID3 tag or MPEG frame sync), so a restore from a .txt without an .mp3 name still gets the extension and previews as audio.

## Secret folder (2026-10-29)

- A small lock icon sits next to the "App lock" heading in Settings. It carries no label, title, or hint about what it does. Tap it 5 times in quick succession (taps more than 2 seconds apart restart the count) to open the secret folder flow.
- First time: a setup dialog asks if you want a secret folder — the only setup is a password. The folder is a normal note folder (id "secret", named "Secret") with a salted SHA-256 lock, session-unlocked on setup, and it travels in JSON backups like other locked folders.
- When locked, the folder is invisible, not just locked: no row in the Notes folder list, no locked panel, no notes in search or counts, and it is excluded from editor/move dropdowns (existing locked-folder rules). Relock (app hide, Lock all, reload) also resets the Notes view away from it. Five taps while locked opens the normal unlock dialog; after unlocking it navigates to Notes.
- Same no-reset rule as every other lock: forget the password and the folder cannot be recovered.

## Optional password-protected backups + 500 MB import cap (2026-10-29)

- Download backup now opens a choice dialog: "Download plain" (as before) or "Download protected" (password + confirm). Protected backups are AES-GCM encrypted in the browser (PBKDF2, 100k iterations, SHA-256); the file is named `dayloom-backup-<date>.protected.json` and its envelope is `{format:'dayloom-backup-encrypted', version:1, salt, iv, data}` (all base64). Import detects the envelope and asks for the password; a wrong password (or damaged file) shows "Wrong password or damaged backup file." Plain backups still import exactly as before. Nothing is stored: the backup password is asked at export and at import, never saved. Forget it and that backup cannot be opened.
- Backup import size cap raised 250 MB → 500 MB (import only; export never had a cap). The 200 MB per-file attach cap and the 1000-item media cap are unchanged, and very large imports can still strain phone memory.
