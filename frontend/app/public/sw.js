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

// round 28: phone notifications (Planner reminders). The message arrives encrypted for this phone; the browser decrypts it.
self.addEventListener("push", e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { title: "Hyperplane", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "Hyperplane", {
    body: m.body || "", icon: "/app/icons/icon-192.png", badge: "/app/icons/badge-96.png",
    tag: m.tag || undefined, renotify: !!m.tag, data: { url: m.url || "/app/inbox" },
  }));
});

// a tap opens the item: in the app when it is already open (it moves there), else a new window
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/app/inbox", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const win = list.find(c => c.url.startsWith(self.location.origin + "/app"));
    if (win) return win.focus().then(w => (w || win).navigate(url));
    return self.clients.openWindow(url);
  }));
});

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.mode !== "navigate" || new URL(r.url).pathname.startsWith("/app/api/")) return;
  e.respondWith(fetch(r).catch(() => caches.match(OFFLINE)));   // no internet → the offline page
});
