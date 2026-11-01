// Guarda la app en el móvil para que abra rápido y sin conexión. Las llamadas a Claude nunca se guardan.
const CACHE = "estilista-v3";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "js/app.js?v=3", "js/ai.js", "js/db.js", "js/figura.js", "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname === "api.anthropic.com") return;
  const sameOrigin = url.origin === self.location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  // Primero la red (para recibir actualizaciones), y la copia guardada si no hay conexión.
  e.respondWith(
    fetch(sameOrigin ? new Request(e.request, { cache: "no-cache" }) : e.request).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});
