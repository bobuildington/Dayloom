# Dayloom — Pi version (shared text data).
# This Dockerfile is for the `pi` branch only. `main` keeps the nginx-only
# Dockerfile for the GitHub Pages / browser-only version.
# The Pi image serves the app AND a tiny Python backend (server.py) that
# stores the shared text dataset in /data/dayloom.json. Mount a Docker
# volume at /data so the shared data survives container restarts and rebuilds.
# Photos/videos are NOT shared in v1: they stay in each browser's IndexedDB.
FROM python:3-alpine
WORKDIR /app
COPY index.html styles.css app.js sw.js manifest.webmanifest icon.svg icon-192.png icon-512.png server.py ./
RUN mkdir -p /data
VOLUME ["/data"]
ENV DATA_FILE=/data/dayloom.json PORT=80
EXPOSE 80
CMD ["python", "server.py"]
