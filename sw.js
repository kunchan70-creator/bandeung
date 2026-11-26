// 설치형 웹앱용. 화면 파일은 새 것 먼저(안 되면 저장본), 자료는 항상 새로(안 되면 저장본).
const C = "bd-v2";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(["./", "app.css", "app.js", "chart.js", "manifest.json", "icons/icon-192.png"]).catch(() => {}))); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// 11-27 푸시: 서버(Cloudflare bandeung-push)는 내용 없이 깨우기만 → 최신 알림을 받아서 띄움
const PUSH = "https://bandeung-push.kunchan70.workers.dev";
self.addEventListener("push", (e) => e.waitUntil(
  fetch(PUSH + "/latest", {cache: "no-store"}).then((r) => r.json())
    .then((m) => self.registration.showNotification(m.title || "반등 매매", {body: m.msg || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "bd-" + (m.t || 0), data: {url: m.url || "./?tab=todo"}}))
    .catch(() => self.registration.showNotification("반등 매매", {body: "새 알림이 있습니다. 눌러서 확인하십시오.", icon: "icons/icon-192.png", data: {url: "./?tab=todo"}}))));
self.addEventListener("notificationclick", (e) => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "./?tab=todo";
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then((ws) => {
    for (const w of ws) if ("focus" in w) { w.navigate(url); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, {ignoreSearch: true})));
});
