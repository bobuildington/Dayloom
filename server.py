#!/usr/bin/env python3
"""Dayloom (Pi version) — tiny stdlib-only server.

Serves the static app files and a shared-data API:
  GET  /api/data   -> the shared Dayloom dataset as JSON (default empty dataset)
  POST /api/data   -> replace the shared Dayloom dataset (JSON body, validated)
  GET  /api/health -> {"ok": true}

Data is stored in DATA_FILE (default /data/dayloom.json). Text data only in v1;
photos/videos stay in each browser's IndexedDB and are NOT shared yet. Mount a Docker
volume at /data so the shared list survives container restarts and rebuilds.
No login in v1: anyone on your home network who opens the app can see and
change the shared list. Do not expose this port to the internet.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

STATIC_DIR = Path(__file__).resolve().parent
DATA_FILE = Path(os.environ.get("DATA_FILE", "/data/dayloom.json"))
PORT = int(os.environ.get("PORT", "80"))

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}

DEFAULT_DATA = {"lists": [], "tasks": [], "events": [], "notes": [], "noteFolders": [], "secretAlbums": [], "kegelVideos": [], "settings": {}}


def read_data():
    try:
        parsed = json.loads(DATA_FILE.read_text())
        if isinstance(parsed, dict) and isinstance(parsed.get("lists"), list) \
                and isinstance(parsed.get("tasks"), list):
            return parsed
    except (FileNotFoundError, ValueError, OSError):
        pass
    return dict(DEFAULT_DATA)


def write_data(data):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data))
    tmp.replace(DATA_FILE)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep logs quiet
        pass

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.send_json({"ok": True})
        if path == "/api/data":
            return self.send_json(read_data())
        if path == "/":
            path = "/index.html"
        # Serve only files inside STATIC_DIR (no path traversal).
        target = (STATIC_DIR / unquote(path.lstrip("/"))).resolve()
        if target.suffix == ".py" or not target.is_relative_to(STATIC_DIR) or not target.is_file():
            self.send_response(404)
            self.end_headers()
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(target.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        # Never cache the app shell or the service worker, so Pi updates show up.
        if target.name in ("index.html", "app.js", "styles.css", "sw.js"):
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlparse(self.path).path != "/api/data":
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self.send_json({"error": "invalid JSON"}, status=400)
        if not isinstance(data, dict) or not isinstance(data.get("lists"), list) \
                or not isinstance(data.get("tasks"), list):
            return self.send_json({"error": "expected lists and tasks"}, status=400)
        try:
            write_data(data)
        except OSError as exc:
            return self.send_json({"error": str(exc)}, status=500)
        return self.send_json({"ok": True})


if __name__ == "__main__":
    print(f"Dayloom (Pi) listening on port {PORT}, data file {DATA_FILE}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
