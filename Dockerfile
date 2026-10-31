# Dayloom — static app served with nginx.
# Build from the repo root (e.g. from its Git URL in a Docker build UI).
# Dayloom itself stores everything in the browser (localStorage / IndexedDB);
# this image only serves the static files, it does not store your data.
FROM nginx:alpine
COPY index.html app.js styles.css sw.js manifest.webmanifest icon.svg icon-192.png icon-512.png /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
