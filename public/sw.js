/* 5H13 Plans service worker: the app works offline after the first visit.
   Navigations: network first (to pick up new versions), cached copy when offline.
   Assets: cache first (file names carry a content hash). */
const CACHE = "5h13-plans-v4";
self.addEventListener("install", (e) => {
  // Cache the shell and the hashed bundles index.html points to, so the app opens offline after one visit.
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"]);
      // Everything the build produced (listed by the build), so the app and its lazy parts work offline.
      const list = await fetch("./precache.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      const files = list.length ? list : [...(await (await fetch("./index.html", { cache: "no-store" })).text()).matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1]);
      await c.addAll(files.map((f) => `./${f}`));
    }).then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return res; })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
