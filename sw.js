// 설치형 웹앱용. 화면 파일은 새 것 먼저(안 되면 저장본), 자료는 항상 새로(안 되면 저장본).
const C = "bd-v7";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(["./", "app.css", "app.js", "chart.js", "manifest.json", "icons/icon-192.png"]).catch(() => {}))); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// 11-27 푸시: 서버(Cloudflare bandeung-push)는 내용 없이 깨우기만 → 최신 알림을 받아서 띄움
const PUSH = "https://bandeung-push.kunchan70.workers.dev";
// 11-28 상태 표시줄 작은 아이콘(badge)은 안드로이드가 흰색 실루엣만 씀 → 투명 배경 흰 로고(badge-96.png). 색 아이콘을 넣으면 흰 네모로 보임
// 11-28 알림 v2: msg 가 종목별 주문 JSON 이면 '내 종목'만 골라 짧게(▲매수·▼매도, 계좌 n%) + 내 설정 한 줄. 자세한 건 앱 '할 일'
const usd = (v) => "$" + Number(v).toFixed(2);
const unitW = (u) => u === .5 ? "반 묶음" : u === 1 ? "한 묶음" : `${u}묶음`;
function v2text(p, set) {
  const inst = (set.inst === "QQQM" ? "QQQ" : set.inst) || "TQQQ", lot = Number(set.lot) || 20, L = (p.per || {})[inst] || [];
  const md = (d) => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "";
  const rows = L.map(([k, s, px, v]) => k === "b" ? `▲ ${s} 매수 ${usd(px)} · 계좌 ${+(v * lot).toFixed(1)}%(${unitW(v)})`
    : k === "s" ? `▼ ${s} 매도 ${usd(px)} · 보유 전량`
    : k === "e" ? `▼ ${s} ${md(v)} 장 마감 매도 · 보유 기한`
    : k === "fs" ? `▼ ${s} 시가 매도 · 단타 자금 마련`
    : k === "tb" ? `▲ ${s} 매수 ${usd(px)} · 200일선 위${v != null ? ` · 목표 비중 ${v}%` : ""}`
    : `▼ ${s} 매도 ${usd(px)} · 200일선 아래${v != null ? ` · 목표 비중 ${v}%` : ""}`);
  const title = rows.length ? `피어바이 · ${md(p.sess)} 주문 ${rows.length}건` : "피어바이 · 내 종목 주문 없음";
  return {title, body: (rows.length ? rows.join("\n") : `${inst}는 새 주문이 없습니다`) + `\n내 설정: ${inst} · 한 묶음 ${lot}%`};
}
const mySet = () => caches.open("bd-set").then((c) => c.match("./__set")).then((r) => r ? r.json() : {}).catch(() => ({}));
self.addEventListener("push", (e) => e.waitUntil(
  Promise.all([fetch(PUSH + "/latest", {cache: "no-store"}).then((r) => r.json()), mySet()])
    .then(([m, set]) => { let p = null; try { p = String(m.msg || "").startsWith("{") ? JSON.parse(m.msg) : null; } catch (x) {}
      const t = p && p.v === 2 ? v2text(p, set) : {title: m.title || "피어바이", body: m.msg || ""};
      return self.registration.showNotification(t.title, {body: t.body, icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag: "bd-" + (m.t || 0), data: {url: m.url || "./?tab=todo"}}); })
    .catch(() => self.registration.showNotification("피어바이", {body: "새 알림이 있습니다. 눌러서 확인하십시오.", icon: "icons/icon-192.png", badge: "icons/badge-96.png", data: {url: "./?tab=todo"}}))));
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
  // 11-27: 화면 파일은 매번 서버에 새 버전 확인(no-cache) — 고친 화면이 설치된 앱에도 바로 반영되게
  const fresh = e.request.mode === "navigate" ? fetch(e.request.url, {cache: "no-cache"}) : fetch(new Request(e.request, {cache: "no-cache"}));
  e.respondWith(fresh.then((r) => { if (r.ok) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, {ignoreSearch: true})));
});
