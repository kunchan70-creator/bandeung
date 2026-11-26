// 설치형 웹앱용. 화면 파일은 새 것 먼저(안 되면 저장본), 자료는 항상 새로(안 되면 저장본).
const C = "bd-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(["./", "app.css", "app.js", "chart.js", "manifest.json", "icons/icon-192.png"]).catch(() => {}))); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, {ignoreSearch: true})));
});
