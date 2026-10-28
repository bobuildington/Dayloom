# Dayloom

**Your days, your way.** A customizable, mobile-friendly task manager you can host free on GitHub Pages.

No build step, account, tracking, API key, or database required. Tasks and settings live in **this browser's localStorage**. GitHub hosts the app files, **not your personal task data**.

## Features

- Today dashboard with overdue, due-today and upcoming tasks, plus completion progress
- Interactive monthly calendar (Sunday/Monday start) with dated tasks
- Create, edit, complete and delete tasks; notes, priority and due dates
- Daily, weekly and monthly repeats: completing a repeating task creates its next occurrence
- Custom task lists with names and colors, task search, and status/list/priority filters
- Adjustable light/dark/system themes, accent colors and compact density
- JSON download backup; import by **merge** or **replace**
- Responsive mobile interface with bottom navigation and optional installable PWA/offline support

## Publish on GitHub Pages

1. Place all the included files in the **root** of your `Dayloom` repository's `main` branch.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Select **`main`** and **`/(root)`**, then choose **Save**.
5. Visit `https://YOUR-USERNAME.github.io/Dayloom/` after GitHub finishes deploying.

These files use relative paths, so they also work when the repository is served from a subpath.

## Back up and restore

Go to **Settings → Download backup** to save `dayloom-backup-YYYY-MM-DD.json`. Keep the file in a safe location. To restore, select **Settings → Import backup**, choose the file and select:

- **Merge:** keep current data and add items in the backup, with newer edits winning for matching task IDs. Current preferences remain unchanged.
- **Replace:** replace all tasks, lists, and preferences with the backup.

**Important:** Local storage is **per browser, per origin, per device**. It does not automatically sync between a phone and computer, or between browsers. Private browsing and clearing website data can erase tasks. Always export backups before changing devices or browsers. GitHub repo updates do **not** back up tasks.

## Development

Open `index.html` in a browser for a quick preview; for full PWA/offline behavior, serve over HTTP (for example `python3 -m http.server 8000`) and visit `http://localhost:8000/`. No dependencies are needed.

Main code is in `app.js`; appearance is in `styles.css`. The service worker caches static files for offline use when hosted via HTTPS, but local data still relies on browser storage.

## Privacy

Dayloom does not send task data to GitHub or to any external server. A backup is a plain JSON file and is **not encrypted**; store it accordingly. This app uses local browser storage without authentication, so avoid sensitive tasks on shared devices.