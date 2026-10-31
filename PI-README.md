# Dayloom — Pi version (shared data + shared Gallery)

This branch (`pi`) is the Pi-hosted, shared version of Dayloom.
`main` stays the browser-only version served by GitHub Pages — nothing
here changes Pages.

## What is shared, and what is not

Shared on the Pi: tasks, lists, events, notes, folders, albums, and
settings — the whole text dataset, as one common copy for everyone
opening the Pi address — plus the Gallery (see below).

Gallery: a Gallery tab in the app is the only place pictures and videos
are uploaded on the Pi version. Gallery files are stored on the Pi
itself, in `/data/media` (index in `/data/media.json`), and served from
`/api/media/<id>`, so a video uploaded from a phone plays on a PC too.
In a task, note, or event, the photo/video button is "Add from Gallery"
and only picks files already in the Gallery — it does not upload a new
file. The Kegel tab can also pick a video from the Gallery.

NOT in the shared Gallery: Secret-folder pictures and videos. Secret
notes still attach files the old way, per-device in that browser's
IndexedDB, and they never go into the shared Gallery. Secret notes
themselves still travel in the shared dataset, so do not put truly
private Secret notes in the Pi shared copy.

Pi version has no passwords: note, folder, and app lock options are
removed on this branch, and the Secret folder opens with no password.
The Pages/main version still has passwords, unchanged.

Timers and reminder permissions also stay per-device. Older
per-device photos/videos (attached before the Gallery, or in secret
notes) still stay in each browser's IndexedDB and are not shared.

## How it works

- `app.js` on this branch keeps localStorage as a cache, but on load it
  tries `GET /api/data`. If the Pi answers with shared data, it uses
  that; if the Pi file is empty and this browser has data, it seeds the
  Pi from this browser once. If no Pi server answers (for example on
  GitHub Pages), it falls back to this browser only.
- Every save also POSTs the dataset to `/api/data` (debounced).
- `server.py` is stdlib-only Python (no dependencies). It serves the
  static files and `GET/POST /api/data`, `GET /api/health`, and the
  Gallery API: `GET /api/media`, `POST /api/media` (JSON with base64
  file data, 200 MB max per file), `GET /api/media/<id>` (Range
  supported for video), `DELETE /api/media/<id>`.
- Shared data lives in `/data/dayloom.json`, Gallery files in
  `/data/media`. Mount a Docker volume at `/data` so both survive
  restarts and rebuilds.
- Last write wins: if two people edit at the same time, the later save
  replaces the earlier one. Reload the page to see other people's
  latest changes.

## Run it in Portainer

1. Export a Dayloom backup from your current copy first (Settings →
   Export), so you can seed the shared copy. Keep the `dayloom-data`
   volume — it now holds both the shared data and the Gallery files.
2. Build an image from this branch. The reliable method on this setup
   is an explicit checkout on the Pi, not the Portainer Images
   `#pi` URL build (that build was found to silently build `main`
   instead of `pi`):
   ```
   git clone -b pi https://github.com/bobuildington/Dayloom.git dayloom-pi-src
   docker build -t dayloom-pi:latest .
   ```
   To update an existing checkout: `cd dayloom-pi-src`, `git pull origin pi`,
   then rebuild with the same `docker build` command.
3. Remove the old Dayloom container (not the volume), then create a
   container from `dayloom-pi:latest`, host port `8080` (or any free
   port) to container `80`, TCP.
4. In Volumes, map a volume (e.g. `dayloom-data`) to container path
   `/data`.
5. Restart policy: Unless stopped. Deploy.
   Terminal equivalent: `docker run -d --name dayloom-pi --restart unless-stopped -p 8080:80 -v dayloom-data:/data dayloom-pi:latest`
6. Open `http://<Pi IP>:8080`. The first browser with your real data
   will seed the shared copy automatically; other browsers will then
   load that shared copy. If seeding does not happen, import your
   exported backup into the Pi version — that import becomes the
   shared copy.
7. Check it: container logs should say `Dayloom (Pi) listening on port
   80`, and `http://<Pi IP>:8080/api/health` should return
   `{"ok": true}`. A `404 Not Found / nginx` on `/api/data` means the
   old static version is answering, not the Pi version.

## Notes

- No login in v1. Anyone on your home network who opens the app can
  see and change the shared data and the Gallery. Do not expose this
  port to the internet.
- Back up the whole `dayloom-data` volume (not just
  `/data/dayloom.json`) if the shared data and Gallery files matter to
  you — a Dayloom JSON export alone does not include Gallery files.
