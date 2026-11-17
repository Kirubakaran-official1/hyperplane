// Hyperplane as a phone app (round 26): this helper makes /app installable (Chrome → Install app: own icon, full screen).
// It keeps nothing but the small offline page. Pages always come from the server first, so a deploy shows at the next open;
// files and data (/app/api) are never touched — they load exactly as on the website.
const CACHE = "hp-offline-v2";
const OFFLINE = "/app/offline.html";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.add(OFFLINE)));
  self.skipWaiting();                                   // a new version takes over at once
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.mode !== "navigate" || new URL(r.url).pathname.startsWith("/app/api/")) return;
  e.respondWith(fetch(r).catch(() => caches.match(OFFLINE)));   // no internet → the offline page
});
