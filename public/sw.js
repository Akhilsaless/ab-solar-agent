// AB SOLAR AGENT — Service Worker
var CACHE = "ab-solar-v2";
var ASSETS = ["/", "/index.html", "/style.css", "/script.js"];

self.addEventListener("install", function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }));
});

self.addEventListener("fetch", function(e) {
  if (e.request.url.includes("/api/")) return; // Never cache API calls
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});
