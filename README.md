# Dayloom

**Your days, your way.** A customizable, mobile-friendly task manager you can host free on GitHub Pages.

No build step, account, tracking, API key, or database required. Tasks, calendar events, notes, and settings live in **this browser's localStorage**. GitHub hosts the app files, **not your personal task, event or note data**.

## Features

- Today dashboard with overdue, due-today and upcoming tasks, plus completion progress
- Interactive **month/week/day** calendar (Sunday/Monday start) with dated tasks and standalone events, plus event search
- Create, edit, complete and delete tasks; notes, priority and due dates
- Create, edit, and delete calendar events (all-day or timed, multi-day, colored, recurring daily/weekly/monthly/yearly)
- Daily, weekly and monthly repeats: completing a repeating task creates its next occurrence (weekly repeats always land on the same weekday, even if you complete the task late)
- Custom task lists with names and colors, task search, and status/list/priority filters
- What you missed: overdue tasks on the Today dashboard and a Missed filter in All tasks, so you can check off, reschedule, or delete them
- Checklists inside tasks: break a task into steps, tick them off right from the task row, and see progress at a glance.
- Undo for deletes: the confirmation popup after any delete lets you restore what you just removed.
- Streaks: your day streak and weekly completions on the Today dashboard.
- What you missed actions: move everything overdue to today in one tap, or select and delete the batch.
- Reminders: set a time on a task and get a ping when it's due. Works while Dayloom is open — no account or server needed.
- Photos & videos: attach pictures and clips to tasks, events, and notes. They live in this browser only and aren't included in JSON backups.
- Workouts tab: a dedicated view for training — this week's sessions with Done / Today / Missed states, week-by-week browsing, today's session with tickable checklists, plan notes, and timers that live only on this tab.
- Timers: Cardio intervals (5 min warm up, 8 rounds of 30 sec hard / 60 sec easy, 3 min cool down), Rest (60 sec), and Plank (40 sec), with a beep and a buzz on every phase change. A timer keeps counting if you leave the tab and survives a reload.
- Custom weekday repeats: repeat a task on specific weekdays (for example Mon, Wed, Fri) instead of one task per day.
- Repeat end dates: set a task to stop repeating after a date.
- Global search: the header search button now searches tasks, events, and notes together, on phone and desktop.
- Workouts section: the Workouts tab is now a full section with its own tabs — Sessions (week view, today's session, timers), Strength, Core, and Cardio. Each kind tab has a searchable exercise library with playable demo videos and an "Add to today's session" button.
- Start today's workout: a guided player that walks through today's session step by step, with Start, Skip, and Finish controls. Each step has its demo video, its own timer, and a Done button that checks it off.
- Per-workout videos and timers: every workout in the Workouts list gets a Videos button (a popup playing that workout's demo videos) and a Timer button right on it, so you never have to scroll to the top of the page for a timer.
- Press and hold to select: long-press a task, event, or note to select it, tap more to add them, then move or delete the whole batch at once
- Adjustable light/dark/system themes, accent colors and compact density
- Dedicated **Notes** tab with custom colored folders (create, rename, delete), cross-folder search, pinned notes and color-coded note cards
- iCalendar **`.ics` event export/import** for transfer with other calendar applications
- JSON download backup includes tasks, events, notes, note folders and settings; import by **merge** or **replace**
- Responsive mobile interface with bottom navigation and optional installable PWA/offline support

## Publish on GitHub Pages

1. Place all the included files in the **root** of your `Dayloom` repository's `main` branch.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Select **`main`** and **`/(root)`**, then choose **Save**.
5. Visit `https://YOUR-USERNAME.github.io/Dayloom/` after GitHub finishes deploying.

These files use relative paths, so they also work when the repository is served from a subpath.

## Add calendar events

Open **Calendar**, select a date, then choose **+ Event** (or tap the floating **+** button on mobile while on Calendar). Give the event a title, dates, optional times, color, notes, and repeat schedule. Events appear on the month, week and day calendar views, in the selected day's agenda, and on Today. To edit or delete one, tap the event. Repeating events are edited or deleted as one series.

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
