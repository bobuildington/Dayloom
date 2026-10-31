#!/usr/bin/env python3
"""Dayloom (Pi version) — tiny stdlib-only server.

Serves the static app files and shared APIs:
  GET  /api/data   -> the shared Dayloom dataset as JSON (default empty dataset)
  POST /api/data   -> replace the shared Dayloom dataset (JSON body, validated)
  GET  /api/health -> {"ok": true}
  GET  /api/media  -> shared Gallery list [{id, name, type, mime, size, createdAt}]
  POST /api/media  -> upload one Gallery file as JSON {name, mime, data: base64}
  GET  /api/media/<id> -> the Gallery file itself (Range supported for video)
  DELETE /api/media/<id> -> delete a Gallery file

Data is stored in DATA_FILE (default /data/dayloom.json). Gallery files live in
MEDIA_DIR (default /data/media) with an index at MEDIA_INDEX (/data/media.json),
so both survive container restarts and rebuilds when a Docker volume is mounted
at /data. Gallery media is shared: anyone on your home network who opens the app
can see it. Secret notes/media are NOT put in the Gallery — they stay per-device.
No login in v1: do not expose this port to the internet.
"""
import base64
import binascii
import json
import os
import re
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

STATIC_DIR = Path(__file__).resolve().parent
DATA_FILE = Path(os.environ.get("DATA_FILE", "/data/dayloom.json"))
MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", "/data/media"))
MEDIA_INDEX = Path(os.environ.get("MEDIA_INDEX", "/data/media.json"))
PORT = int(os.environ.get("PORT", "80"))
MAX_MEDIA_BYTES = 200 * 1024 * 1024
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,120}$")

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


def read_media_index():
    try:
        parsed = json.loads(MEDIA_INDEX.read_text())
        if isinstance(parsed, list):
            out = []
            for item in parsed:
                if isinstance(item, dict) and ID_RE.match(str(item.get("id", ""))) \
                        and item.get("type") in ("image", "video"):
                    out.append(item)
            return out
    except (FileNotFoundError, ValueError, OSError):
        pass
    return []


def write_media_index(items):
    MEDIA_INDEX.parent.mkdir(parents=True, exist_ok=True)
    tmp = MEDIA_INDEX.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(items))
    tmp.replace(MEDIA_INDEX)


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

    def send_media_file(self, item):
        target = (MEDIA_DIR / item["id"]).resolve()
        if not target.is_relative_to(MEDIA_DIR.resolve()) or not target.is_file():
            self.send_response(404)
            self.end_headers()
            return
        try:
            size = target.stat().st_size
        except OSError:
            self.send_response(404)
            self.end_headers()
            return
        range_header = self.headers.get("Range", "")
        start, end = 0, size - 1
        status = 200
        if range_header.startswith("bytes="):
            try:
                spec = range_header[6:].split(",", 1)[0].strip()
                if spec.startswith("-"):
                    start = max(0, size - int(spec[1:]))
                elif spec.endswith("-"):
                    start = int(spec[:-1])
                else:
                    a, b = spec.split("-", 1)
                    start, end = int(a), int(b)
                start = max(0, min(start, size - 1)) if size else 0
                end = max(start, min(end, size - 1)) if size else 0
                status = 206
            except (ValueError, IndexError):
                start, end = 0, size - 1
                status = 200
        length = end - start + 1 if size else 0
        self.send_response(status)
        self.send_header("Content-Type", item.get("mime") or "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-cache")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if size and self.command != "HEAD":
            with target.open("rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.send_json({"ok": True})
        if path == "/api/data":
            return self.send_json(read_data())
        if path == "/api/media":
            items = read_media_index()
            items.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
            return self.send_json({"items": items})
        if path.startswith("/api/media/"):
            media_id = unquote(path[len("/api/media/"):])
            if not ID_RE.match(media_id):
                self.send_response(404)
                self.end_headers()
                return
            item = next((x for x in read_media_index() if x["id"] == media_id), None)
            if not item:
                self.send_response(404)
                self.end_headers()
                return
            return self.send_media_file(item)
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
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0") or 0)
        if path == "/api/media":
            if length <= 0 or length > MAX_MEDIA_BYTES * 2:
                return self.send_json({"error": "file too large"}, status=400)
            try:
                data = json.loads(self.rfile.read(length) or b"{}")
            except ValueError:
                return self.send_json({"error": "invalid JSON"}, status=400)
            mime = str(data.get("mime", ""))
            if not (mime.startswith("image/") or mime.startswith("video/")):
                return self.send_json({"error": "only pictures and videos are allowed"}, status=400)
            try:
                raw = base64.b64decode(str(data.get("data", "")), validate=True)
            except (binascii.Error, ValueError):
                return self.send_json({"error": "invalid file data"}, status=400)
            if not raw or len(raw) > MAX_MEDIA_BYTES:
                return self.send_json({"error": "file too large"}, status=400)
            media_id = uuid.uuid4().hex
            item = {
                "id": media_id,
                "name": str(data.get("name", "Gallery file"))[:120] or "Gallery file",
                "type": "video" if mime.startswith("video/") else "image",
                "mime": mime[:100],
                "size": len(raw),
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }
            try:
                MEDIA_DIR.mkdir(parents=True, exist_ok=True)
                (MEDIA_DIR / media_id).write_bytes(raw)
                items = read_media_index()
                items.append(item)
                write_media_index(items)
            except OSError as exc:
                return self.send_json({"error": str(exc)}, status=500)
            return self.send_json({"ok": True, "item": item})
        if path != "/api/data":
            self.send_response(404)
            self.end_headers()
            return
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

    def do_DELETE(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/media/"):
            self.send_response(404)
            self.end_headers()
            return
        media_id = unquote(path[len("/api/media/"):])
        if not ID_RE.match(media_id):
            self.send_response(404)
            self.end_headers()
            return
        items = read_media_index()
        if not any(x["id"] == media_id for x in items):
            self.send_response(404)
            self.end_headers()
            return
        items = [x for x in items if x["id"] != media_id]
        try:
            write_media_index(items)
            target = MEDIA_DIR / media_id
            if target.is_file():
                target.unlink()
        except OSError as exc:
            return self.send_json({"error": str(exc)}, status=500)
        return self.send_json({"ok": True})


if __name__ == "__main__":
    print(f"Dayloom (Pi) listening on port {PORT}, data file {DATA_FILE}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
