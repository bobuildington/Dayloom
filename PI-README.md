# Dayloom — Pi version (shared text data)

This branch (`pi`) is the Pi-hosted, shared version of Dayloom.
`main` stays the browser-only version served by GitHub Pages — nothing
here changes Pages.

## What is shared, and what is not (v1)

Shared on the Pi: tasks, lists, events, notes, folders, albums, and
settings — the whole text dataset, as one common copy for everyone
opening the Pi address.

NOT shared in v1: photos and videos. Those stay in each browser's
IndexedDB. A photo added on one device will not show on another device
yet, and its reference is kept (not deleted) if you open that item on a
device without the photo — do not remove it there expecting it to stay
elsewhere. Timers and reminder permissions also stay per-device.

Also shared, so be careful: Secret-folder notes and any app/note/folder
locks travel in the shared dataset. Locks in Dayloom are UI gates, not
encryption, and the shared JSON is readable by anyone who can reach the
Pi server. Do not put truly private Secret notes in the Pi shared copy.
Erasing on the Pi version erases the shared copy for everyone.

## How it works

- `app.js` on this branch keeps localStorage as a cache, but on load it
  tries `GET /api/data`. If the Pi answers with shared data, it uses
  that; if the Pi file is empty and this browser has data, it seeds the
  Pi from this browser once. If no Pi server answers (for example on
  GitHub Pages), it falls back to this browser only.
- Every save also POSTs the dataset to `/api/data` (debounced).
- `server.py` is stdlib-only Python (no dependencies). It serves the
  static files and `GET/POST /api/data` plus `GET /api/health`.
- Shared data lives in `/data/dayloom.json`. Mount a Docker volume at
  `/data` so it survives restarts and rebuilds.
- Last write wins: if two people edit at the same time, the later save
  replaces the earlier one. Reload the page to see other people's
  latest changes.

## Run it in Portainer

1. Export a Dayloom backup from your current copy first (Settings →
   Export), so you can seed the shared copy.
2. Build an image from this branch: build URL
   `https://github.com/bobuildington/Dayloom.git#pi`, Dockerfile
   field `Dockerfile`, image name e.g. `dayloom-pi:latest`.
3. Add a container from that image, host port `8080` (or any free port)
   to container `80`, TCP. If you already have a static Dayloom
   container on 8080, stop and remove that one first, then reuse 8080.
4. In Volumes, map a volume (e.g. `dayloom-data`) to container path
   `/data`.
5. Restart policy: Unless stopped. Deploy.
6. Open `http://<Pi IP>:8080`. The first browser with your real data
   will seed the shared copy automatically; other browsers will then
   load that shared copy. If seeding does not happen, import your
   exported backup into the Pi version — that import becomes the
   shared copy.

## Notes

- No login in v1. Anyone on your home network who opens the app can
  see and change the shared data. Do not expose this port to the
  internet.
- Back up `/data/dayloom.json` (and keep Dayloom's own export backups)
  if the shared data matters to you.
