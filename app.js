"use strict";
// 공포 단타 봇 화면 v3 — app_data.json(지금 상태, 15분마다) + app_hist.json(차트·성적표, 하루 한 번). 외부 라이브러리 없음.
// 11-24 사용자: 합니다체·증권사 용어("~보다 낫다" 금지), 성적표는 빠짐없이·단위 통일, 차트는 증권사 수준(캔들/선·십자선·실시간).
// 공개 페이지(github.io/bandeung)는 봇이 폰 앱 자료와 같은 파일을 data/ 에 같이 올린다(publish.py) — 앱과 페이지가 한 몸.
const WEB = location.protocol.startsWith("http") && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);   // 11-28 공개 주소가 github.io → 새 주소로 이사(어느 공개 주소든 data/ 에서 읽음)
// 11-27 사용자: 한 묶음 비중은 각자 정함(5~20%, 최대 5묶음이라 25%는 뺌) → 그 비중으로 계산한 자료 묶음을 통째로 바꿔 읽음(20 = 기본, 나머지 = s{N}/).
const LOTS = [5, 10, 15, 20];
const CAPN = () => D?.accounts?.[S.prof]?.plan?.signals?.max_regular_lots || 5;   // 최대 묶음 수(11-27 4 -> 5)
// 11-27 대기 자금 설정: cash(기본) = 추세 아래에선 현금으로 대기(SGOV 안 삼) / sgov = 단기국채 SGOV 로 대기 → 자료 기본 = 20%·현금, c{N}/ = 현금, s{N}/ = SGOV
const lotDir = () => (S.wait === "sgov" ? `s${S.lot}/` : S.lot && S.lot !== 20 ? `c${S.lot}/` : "");
const WAITS = [["cash", "현금"], ["sgov", "단기국채(SGOV)"]];
const waitWord = () => S.wait === "sgov" ? "단기국채 대기" : "현금 대기";
const dataUrl = () => (WEB ? "data/" : "../out/") + lotDir() + "app_data.json", histUrl = () => (WEB ? "data/" : "../out/") + lotDir() + "app_hist.json";
const RISK_URL = WEB ? "data/size_risk.json" : "../out/size_risk.json";
const ORDER = ["B"];   // 11-26 사용자: 균형형(200일선 추세 + 공포 단타) 하나만. 단타 종목만 선택
const P = {B: {name: "추세+단타", v: "--B"},
           qqq: {name: "QQQ 보유", v: "--Q"}, dep: {name: "예금(세후)", v: "--dep"}};
const col = (k) => `var(${P[k].v})`;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
let D = null, H = null, rawData = null, rawHist = null;
// 11-28 사용자 'QQQ 는 신호용이고 거래는 QQQM': 1배 단타 종목 = QQQM(QQQ 는 신호·200일선 차트에만)
const PRODUCTS = {QQQM: {title:"1배 · 나스닥100", target:2.5}, QLD: {title:"일간 2배", target:5}, TQQQ: {title:"일간 3배", target:7.5}};
const productOptions = Object.entries(PRODUCTS).map(([s,p])=>[s,`${s} · ${p.title.match(/\d배/)[0]}`]);
const S = load({prof: "B", tab: "home", h: "5", myKrw: "", year: "all", assume: true, view: "krw", cmode: "log",
                lsym: "TQQQ", ltype: "candle", lrange: "3m", srange: "1y", stype: "line", frange: "5y", fee: "0.001", simd: "", sima: "", guideSeen: false,
                inst:"TQQQ", tourSeen:false, compSet:"duel", folds:{}, cashUsd:"", lot:20, wait:"cash"});
if (S.inst === "QQQ") S.inst = "QQQM"; if (S.dgSym === "QQQ") S.dgSym = "QQQM";
if (!LOTS.includes(Number(S.lot))) S.lot = 20; S.lot = Number(S.lot); if (!S.wait2) { S.wait = "cash"; S.wait2 = 1; }   // 11-27 밤 기본값을 현금으로 바꿈 → 예전 기본(sgov)이 저장된 사람도 한 번 현금으로
if (S.wait !== "sgov") S.wait = "cash";
// 묶음 크기 말: 계좌 대비 w 가 내 한 묶음의 3/4 미만이면 반 묶음(느린 하락)
const lotWord = (w) => w == null ? "" : `${w < S.lot / 100 * .75 ? "반 묶음" : "한 묶음"} ${pctu(w, 0)}`;
if (!S.simd) S.simd = new Date().getFullYear() + "-01-01";
S.prof = "B"; if (S.compSet === "all") S.compSet = "duel";
function load(d) { try { return Object.assign({}, d, JSON.parse(localStorage.getItem("ui3") || "{}")); } catch (e) { return d; } }
(() => { const q = new URLSearchParams(location.search); if (q.get("tab")) S.tab = q.get("tab"); if (q.get("prof")) S.prof = q.get("prof"); })();   // 미리보기·캡처용 주소 지정
// 11-28 알림 v2: 폰(sw.js)이 알림 글을 '내 종목·한 묶음 비중'으로 만들도록 설정을 캐시에 같이 둠(서비스 워커는 localStorage 를 못 읽음)
let _setKey = "";
function saveSet() { const v = JSON.stringify({inst: S.inst, lot: Number(S.lot)}); if (v === _setKey) return; _setKey = v; try { caches.open("bd-set").then((c) => c.put("./__set", new Response(v))).catch(() => {}); } catch (e) {} }
function save() { try { localStorage.setItem("ui3", JSON.stringify(S)); } catch (e) {} saveSet(); window.Android?.setSelection?.(S.prof,S.inst); }
saveSet();
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function selectModels() {
  const alt = rawData?.variants?.[S.inst];
  D = alt ? {...rawData, ...alt, accounts:{...rawData.accounts, ...alt.accounts}} : rawData;
  const hist = rawHist?.variants?.[S.inst];
  H = hist ? {...rawHist, ...hist, rolling:hist.rolling || null} : S.inst === "TQQQ" ? rawHist : null;
}
function chooseInstrument(v) {
  if (!PRODUCTS[v]) return;
  S.inst=v; S.lsym=v; save(); selectModels(); if (D) render();
}
function histReady(h) { rawHist=h; selectModels(); flushHist(); }

// ── 숫자 표기 ──
function won(n) {
  if (n == null || !isFinite(n)) return "-";
  const neg = n < 0; n = Math.round(Math.abs(n) / 1e4) * 1e4;   // 만원 단위로 먼저 반올림(9,999.7만 → 1억)
  const eok = Math.floor(n / 1e8), man = Math.round((n % 1e8) / 1e4);
  const s = eok ? eok + "억" + (man ? " " + man.toLocaleString("ko-KR") + "만" : "") : man.toLocaleString("ko-KR") + "만";
  return (neg ? "-" : "") + s + "원";
}
const usd2 = (n) => n == null || !isFinite(n) ? "-" : "$" + Number(n).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const pct = (x, d = 1) => x == null || !isFinite(x) ? "-" : (x > 0 ? "+" : "") + (Math.abs(x) >= 10 ? Math.round(x * 100).toLocaleString("ko-KR") : (x * 100).toFixed(d)) + "%";
const pctu = (x, d = 1) => x == null || !isFinite(x) ? "-" : (x * 100).toFixed(d) + "%";
const num = (x, d = 2) => x == null || !isFinite(x) ? "-" : Number(x).toFixed(d);
const cls = (x) => x > 0 ? "up" : x < 0 ? "down" : "mute";
const months = (days) => days == null ? "-" : days >= 365 ? `${Math.floor(days / 365)}년 ${Math.round((days % 365) / 30.4)}개월` : `${Math.round(days / 30.4)}개월`;
function dlabel(ds) { const d = new Date(ds + "T12:00:00"); return `${d.getMonth() + 1}월 ${d.getDate()}일(${WD[d.getDay()]})`; }
const ymd = (ds) => ds ? ds.replace(/-/g, ".") : "-";
function usDST(ds) {
  const d = new Date(ds + "T12:00:00"), y = d.getFullYear();
  const nth = (m, n) => { const x = new Date(y, m, 1); return new Date(y, m, 1 + (7 - x.getDay()) % 7 + 7 * (n - 1)); };
  return d >= nth(2, 2) && d < nth(10, 1);
}
const openKst = (ds) => `${dlabel(ds)} ${usDST(ds) ? "22:30" : "23:30"}`;
const nyDate = (ts) => new Intl.DateTimeFormat("en-CA", {timeZone: "America/New_York"}).format(new Date(ts * 1000));
const kst = (ts) => new Date(ts * 1000 + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");

// ── 공통 조각 ──
function pills() {   // 11-27 머리글: 앱 이름 · 단타 종목 고르기 · 알림 종
  $("#instBtn").innerHTML = `${S.inst}<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>`; $("#instBtn").onclick = openInst;
  $("#moreBtn").onclick = () => { if (S.tab !== "more") { S.prevTab = S.tab; go("more"); } };
  $("#bellBtn").classList.toggle("dot", WEB && PUSHST === "off"); $("#bellBtn").onclick = openBell;
  document.documentElement.style.setProperty("--toph", $(".top").offsetHeight + "px");
}
function seg(opts, val, attr, cls_ = "") {
  return `<div class="seg ${cls_}">${opts.map(([v, t]) => `<button data-${attr}="${v}" class="${String(v) === String(val) ? "on" : ""}">${t}</button>`).join("")}</div>`;
}
function bindSeg(attr, fn) { document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.onclick = () => fn(b.dataset[attr])); }
const HSEG = [["1", "1년"], ["3", "3년"], ["5", "5년"], ["10", "10년"]];
const wait = (t) => `<div class="loading">${t}</div>`;

// 자료 불러오기(큰 자료는 필요할 때 한 번)
let histWaiters = [];
function needHist(cb) {
  if (H) return true;
  if (rawHist) return false;
  histWaiters.push(cb);
  if (histWaiters.length === 1) {
    if (AND) { const s = AND.getHist && AND.getHist(); if (s) { try { histReady(JSON.parse(s)); } catch (e) {} } }
    else fetch(histUrl(), {cache: "no-cache"}).then((r) => r.json()).then(histReady).catch(() => { histWaiters=[]; });
  }
  return false;
}
function flushHist() { const w = histWaiters; histWaiters = []; w.forEach((f) => f()); }

// 실시간 시세: 폰=Android.live(비동기 콜백), PC 미리보기=/live
const LQ = {}; const liveCb = {}; let liveSeq = 0;
function liveGet(sym, range) {
  return new Promise((res) => {
    if (AND) {
      if (!AND.live) return res(null);
      const id = ++liveSeq; liveCb[id] = res; AND.live(id, sym, range);
      setTimeout(() => { if (liveCb[id]) { delete liveCb[id]; res(null); } }, 20000);
    } else if (WEB) res(null); else fetch(`/live?sym=${encodeURIComponent(sym)}&range=${range}`, {cache: "no-store"}).then((r) => r.json()).then(res).catch(() => res(null));
  });
}
window.onLive = (id, s) => { const f = liveCb[id]; if (f) { delete liveCb[id]; try { f(JSON.parse(s)); } catch (e) { f(null); } } };
function parseY(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.timestamp) return null;
  const q = r.indicators.quote[0], m = r.meta, reg = m.currentTradingPeriod && m.currentTradingPeriod.regular;
  return {meta: m, t: r.timestamp, o: q.open, h: q.high, l: q.low, c: q.close, reg};
}
// 오늘(뉴욕 날짜) 정규장 봉 하나로 요약
function todayBar(p) {
  if (!p) return null; const m = p.meta, day = nyDate(m.regularMarketTime); let o = null, h = -Infinity, l = Infinity;
  for (let i = 0; i < p.t.length; i++) {
    if (p.c[i] == null || nyDate(p.t[i]) !== day) continue; if (p.reg && (p.t[i] < p.reg.start || p.t[i] >= p.reg.end)) continue;
    if (o == null) o = p.o[i]; h = Math.max(h, p.h[i]); l = Math.min(l, p.l[i]);
  }
  const c = m.regularMarketPrice; if (o == null) return {day, o: c, h: c, l: c, c, prev: m.chartPreviousClose ?? m.previousClose, time: m.regularMarketTime};
  return {day, o, h: Math.max(h, c), l: Math.min(l, c), c, prev: m.chartPreviousClose ?? m.previousClose, time: m.regularMarketTime};
}
async function refreshQuote(sym) { const p = parseY(await liveGet(sym, "1d")); if (p) LQ[sym] = Object.assign(todayBar(p), {intra: p}); return LQ[sym]; }
async function refreshFG() { const j = await liveGet("FG", "1d"); if (j && j.fg != null) LQ.FG = {v: j.fg, at: j.at}; }

// 계좌 구성
function composition(a) {
  const g = {[S.inst]: 0, QQQM: 0, GLDM: 0, IEF: 0, SGOV: 0, "현금": a.cash_usd || 0};
  for (const [k, v] of Object.entries(a.holdings || {})) {
    const [lane,s] = k.split("|");
    if (lane === "swing" || lane === "run") g[S.inst] += v; else if (s === "QQQM") g.QQQM += v; else if (s === "IEF") g.IEF += v;
    else if (s === "GLDM") g.GLDM += v; else if (s === "SGOV" || s === "BIL") g.SGOV += v; else g["현금"] += v;
  }
  const tot = Object.values(g).reduce((x, y) => x + y, 0) || 1;
  return {g, tot};
}
const COMP = {TQQQ: ["TQQQ", "나스닥100 3배 레버리지 · 공포 단타", "var(--tq)"], QQQM: ["QQQM", "나스닥100 · 추세 추종", "var(--qm)"],
              QQQ: ["QQQ", "나스닥100 1배 · 공포 단타", "var(--tq)"], QLD: ["QLD", "나스닥100 일간 2배 · 공포 단타", "var(--tq)"],
              GLDM: ["GLDM", "금 · 자산배분", "#e0a500"], IEF: ["IEF", "미국 중기 국채 · 자산배분", "var(--A)"],
              SGOV: ["SGOV", "미국 단기국채 · 현금성 대기", "var(--sg)"], "현금": ["현금", "달러 예수금", "var(--cash)"]};

// ── 운용 유형 설명 ──

// ── 설정·안내 시트 ──
const FEES = [["0.0007", "0.07%"], ["0.001", "0.10%"], ["0.0015", "0.15%"], ["0.0025", "0.25%"]];
const feeTxt = () => (+S.fee * 100).toFixed(2).replace(/0$/, "") + "%";
const myAmt = () => { const v = Number(String(S.myKrw || "").replace(/[^0-9]/g, "")); return v > 0 ? v : null; };
function sheet(html, onBind, o = {}) {
  const sh = $("#sheet"); $("#sheetBody").innerHTML = (o.noX ? "" : `<button class="sheet-x" id="shx" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`) + html; sh.hidden = false; document.body.style.overflow = "hidden";
  const close = () => { sh.hidden = true; document.body.style.overflow = ""; render(); };
  if ($("#shx")) $("#shx").onclick = close; sh.querySelector(".sheet-bg").onclick = () => { o.onBg?.(); close(); }; if (onBind) onBind(close);
}
// 9단계 사용 안내(11-27): 증권 앱 '자주 묻는 질문'처럼 질문 하나에 답 몇 줄. 숫자는 지금 자료에서
const TGT = () => PRODUCTS[S.inst].target;
function faqItems() {   // 11-27 밤 사용자 '핵심만' → 6개, 답은 한두 줄
  const sc = H?.bt?.assume?.score?.krw?.B, k = ({QQQM: 1, QLD: 2, TQQQ: 3})[S.inst];
  return [
    ["이 앱은 무엇입니까", `나스닥 급락일에만 ${S.inst}를 매수하고 반등 시 매도합니다. 평소에는 200일선 추세에 따라 QQQM 보유 또는 현금 대기입니다.`],
    ["사용 방법", `<ol class="faq-ol"><li>알림 수신</li><li>할 일 탭에서 가격·수량 복사</li><li>증권사 앱에서 정규장 지정가 주문</li></ol>`],
    ["매수 조건", `공포 지표(VIX·공포탐욕지수), 나스닥 하락 폭, 과매도 여부, 남은 한도를 함께 봅니다. 조건이 맞으면 알림과 주문표로 알려 드립니다.`],
    ["매도 조건", `평균 단가 +${TGT()}% 목표가 지정가 매도. 마지막 매수일부터 10거래일 경과 시 장 마감 매도.`],
    ["위험", `${S.inst}는 나스닥100 일간 ${k}배입니다.${sc ? ` 과거 보유 중 계좌 최대 평가손실 ${pct(sc.sw_acc_worst, 0)}.` : ""} 한 묶음 비중을 낮추면 손실도 줄어듭니다.`],
    ["계산 기준", `2000년부터 일별 재계산 · 원화·세후(양도소득세 22%) · 수수료 ${feeTxt()} 반영 · ${S.inst} 상장 전은 가정 가격. 과거 성과는 미래 수익을 보장하지 않습니다.`],
  ];
}
function openGuide() {
  needHist(() => {});
  sheet(`<div class="pk-t">사용 안내</div>${faqItems().map(([q, a], i) => `<details class="faq"${i === 0 ? " open" : ""}><summary>${q}<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg></summary><div class="faq-a">${a}</div></details>`).join("")}
    <button class="btn ghost" id="gok">처음 안내 다시 보기</button><button class="btn ghost" id="gco">화면 안내 다시 보기</button>`, (close) => { $("#gok").onclick = () => { close(); openTour(0, true); }; $("#gco").onclick = () => { coachReset(); close(); }; });
}
// 처음 안내 3장: 결과 → 방식 → 종목 고르기, 끝나면 '앱으로 받기' 창(maybeEntry)
const TOUR = [
  {title: "공포 구간에만 매수하고<br>반등에 매도합니다", desc: "나스닥이 크게 하락한 날의 주문을 매일 계산합니다.", art: () => {
    const sc = H?.bt?.assume?.score?.krw?.B, b = H ? jstats(vals("assume", "B", "krw")) : null, q = H ? jstats(vals("assume", "qqq", "krw")) : null;
    return `<div class="tour-stat"><small>2000년부터 공포 단타</small><b>${sc ? `${sc.sw_n}번 중 ${Math.round(sc.sw_n * sc.sw_win)}번 수익` : "…"}</b>
      <div class="tour-vs"><span><small>1억 원 투자</small><em style="color:#6d5df6">${b ? eokTxt(b.mult) : "…"}</em></span><span><small>QQQ 보유</small><em>${q ? eokTxt(q.mult) : "…"}</em></span></div><small>원화·세후 · 과거 계산</small></div>`; }},
  {title: "평소에는 추세를,<br>공포에는 반등을", desc: "판단은 장 마감 숫자로만 합니다.", art: () => `<div class="tour-checklist"><div style="--i:0"><b>200일선 위</b><span>QQQM 보유</span></div><div style="--i:1"><b>200일선 아래</b><span>현금으로 대기</span></div><div style="--i:2"><b>공포 + 급락</b><span>${S.inst} 매수 · +${TGT()}% 매도</span></div></div>`},
  {title: "단타 종목을<br>고르십시오", desc: "배수가 클수록 수익도 손실도 커집니다. 나중에 머리글에서 바꿀 수 있습니다.", art: () => `<div class="tour-options">${Object.entries(PRODUCTS).map(([s, p], i) => `<button data-tour-product="${s}" class="${S.inst === s ? "selected" : ""}" style="--i:${i};--accent:#3182f6"><b>${s}</b><span>${p.title} · 목표 +${p.target}%</span></button>`).join("")}</div>`},
];
let tourPage = -1, tourNo = false;
// 11-27 사용자: 예전 안내를 본 사람은 새 안내가 안 보임 → 안내 판 번호(TOUR_V). '다시 보지 않기'를 체크해야 그 판은 다시 안 보임, 안 하면 다음 방문 때 또 보임
const TOUR_V = 2;   // 11-27 밤: 이야기는 따로 한 화면(story), 처음 안내는 3장 그대로
const tourShown = () => { try { return !!sessionStorage.getItem("tourShown"); } catch (e) { return false; } };
const tourDue = () => (S.tourV || 0) < TOUR_V && !tourShown();
function openTour(step=0,restart=false) {
  const i=Math.max(0,Math.min(TOUR.length-1,step)), direction=i<tourPage&&!restart?"back":"forward";
  tourPage=i;
  const el=$("#tour"), x=TOUR[i];
  const finish=()=>{tourPage=-1; el.hidden=true; document.body.classList.remove("tour-open"); if(tourNo)S.tourV=TOUR_V; S.tourSeen=true; save(); try{sessionStorage.setItem("tourShown","1");}catch(e){} if(D)render(); maybeEntry();};
  el.hidden=false; document.body.classList.add("tour-open");
  el.innerHTML=`<div class="tour-inner ${direction} ${i===0?'intro':''}"><div class="tour-top"><span>${x.tag || "시작 안내"}</span><button id="tourSkip">건너뛰기</button></div>
  <div class="tour-steps" aria-label="${i+1} / ${TOUR.length} 단계">${TOUR.map((_,p)=>`<i class="${p<=i?'on':''}"></i>`).join("")}</div>
  <div class="tour-copy"><h1>${x.title}</h1><p>${x.desc}</p></div><div class="tour-art">${x.art()}</div>
  <label class="tour-no"><input type="checkbox" id="tourNo" ${tourNo?"checked":""}>다시 보지 않기</label><div class="tour-nav">${i?'<button id="tourPrev">이전</button>':''}<button class="btn" id="tourNext">${i===TOUR.length-1?'시작하기':'다음'}</button></div></div>`;
  if(!H)needHist(()=>{if(tourPage===i)openTour(i,true);});
  $("#tourNo").onchange=(e)=>{tourNo=e.target.checked;};
  $("#tourSkip").onclick=finish;
  $("#tourNext").onclick=i===TOUR.length-1?finish:()=>openTour(i+1);
  if(i)$("#tourPrev").onclick=()=>openTour(i-1);
  el.querySelectorAll("[data-tour-profile]").forEach(b=>b.onclick=()=>{S.prof=b.dataset.tourProfile;save();el.querySelectorAll("[data-tour-profile]").forEach(x=>x.classList.toggle("selected",x===b));});
  el.querySelectorAll("[data-tour-product]").forEach(b=>b.onclick=()=>{chooseInstrument(b.dataset.tourProduct);el.querySelectorAll("[data-tour-product]").forEach(x=>x.classList.toggle("selected",x===b));});
  let touch=null;
  el.ontouchstart=e=>{touch=e.touches[0].clientX;};
  el.ontouchend=e=>{if(touch===null)return; const d=e.changedTouches[0].clientX-touch; touch=null;if(Math.abs(d)>70)openTour(i+(d<0?1:-1));};
}
// 한 묶음 비중 바꾸기: 그 비중으로 계산한 자료를 새로 받아 화면 전체를 다시 그림
function setLot(n, w) {
  w = w || S.wait; if (n === S.lot && w === S.wait) return; S.lot = n; S.wait = w; save();
  D = null; H = null; rawData = null; rawHist = null; histWaiters = [];
  $("#view").innerHTML = wait(`한 묶음 ${n}%${w === "sgov" ? " · SGOV 대기" : ""} 자료를 불러오는 중입니다`); loadData();
}
// ── 전략 교육(11-27 밤 사용자 '교육이 중요하다, 활성화한 사람만 모든 기능'): 수업 6장 + 퀴즈 3문제(모두 정답이어야 활성화). 활성화 전엔 할 일(주문표)·알림 받기 잠금 ──
const EDU_V = 1;
// 11-28 사용자 '교육이 끝나고 조건을 정해야 주문표가 열려야' → 활성화 = 교육(확인 문제) + 내 거래 조건(종목·한 묶음 비중·대기 자금·운용 금액)
const COND_V = 1;
const eduDone = () => (S.edu || 0) >= EDU_V, condOn = () => (S.cond || 0) >= COND_V;
const eduOn = () => eduDone() && condOn();
let CD = null;   // 조건 고르는 중인 값(확인을 눌러야 적용)
function openCond(still) {
  const el = $("#tour"); el.hidden = false; document.body.classList.add("tour-open"); eduPage = -1;
  if (!CD) CD = {inst: S.inst, lot: Number(S.lot), wait: S.wait, amt: S.myKrw || ""};
  if (!RISK) needRisk(() => { if (!el.hidden && CD) openCond(true); });
  const amtN = Number(String(CD.amt).replace(/[^0-9]/g, "")), ok = amtN >= 1e6;
  const r = (n, w, i) => RISK?.[i || CD.inst]?.[w === "cash" ? "c" + n : n]?.krw;
  const opt = (key, v, t, sub) => `<button data-cd="${key}" data-v="${v}" class="${String(CD[key]) === String(v) ? "on" : ""}"><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</button>`;
  const sec = (n, h, body) => `<div class="cd-s"><div class="cd-h"><em>${n}</em>${h}</div>${body}</div>`;
  const rr = r(CD.lot, CD.wait);
  el.innerHTML = `<div class="tour-inner forward cd${still ? " still" : ""}"><div class="tour-top"><span>내 거래 조건</span><button id="cdX">나중에</button></div>
    <div class="tour-copy"><h1>내 거래 조건을<br>정하십시오</h1><p>주문표의 종목·수량이 이 조건으로 계산됩니다. 나중에 전체 메뉴에서 바꿀 수 있습니다.</p></div>
    <div class="tour-art cd-a">
      ${sec(1, "단타 종목", `<div class="cd-o c3">${Object.entries(PRODUCTS).map(([s, p]) => opt("inst", s, s, `목표 +${p.target}%`)).join("")}</div>`)}
      ${sec(2, "한 묶음 비중", `<div class="cd-o c4">${LOTS.map((n) => opt("lot", n, n + "%", "")).join("")}</div>`)}
      ${sec(3, "대기 자금", `<div class="cd-o c2">${WAITS.map(([v, t]) => opt("wait", v, t.replace("(SGOV)", ""), v === "sgov" ? "SGOV" : "달러 예수금")).join("")}</div>`)}
      <div class="cd-r">${rr ? `2000년부터 이 조건: 연 <b>${pct(rr.cagr)}</b> · 최대 낙폭 <b class="down">${pct(rr.mdd, 0)}</b>` : "과거 성과를 불러오는 중입니다"}<small>원화·세후 · 과거 계산 · 한 번 매수 = 계좌의 ${CD.lot}%(느린 하락은 ${CD.lot / 2}%) · 최대 ${CD.lot * 5}%</small></div>
      ${sec(4, "운용 금액", `<input class="money" id="cdAmt" inputmode="numeric" placeholder="예: 30,000,000" value="${esc(CD.amt ? Number(String(CD.amt).replace(/[^0-9]/g, "")).toLocaleString() : "")}"><small class="cd-n" id="cdAmtN">${amtN ? won(amtN) : "주문 수량을 이 금액으로 계산합니다(원)"}</small>`)}
    </div>
    <div class="tour-nav"><button id="cdP">교육</button><button class="btn" id="cdN" ${ok ? "" : "disabled"}>${ok ? "이 조건으로 시작하기" : "운용 금액을 입력하십시오"}</button></div></div>`;
  el.querySelectorAll("[data-cd]").forEach((b) => b.onclick = () => { const k = b.dataset.cd; CD[k] = k === "lot" ? +b.dataset.v : b.dataset.v; openCond(true); });
  const inp = $("#cdAmt");
  inp.oninput = () => { const n = Number(inp.value.replace(/[^0-9]/g, "")); CD.amt = n ? String(n) : ""; $("#cdAmtN").textContent = n ? won(n) : "주문 수량을 이 금액으로 계산합니다(원)";
    const b = $("#cdN"), good = n >= 1e6; b.disabled = !good; b.textContent = good ? "이 조건으로 시작하기" : n ? "100만 원 이상 입력하십시오" : "운용 금액을 입력하십시오"; };
  inp.onblur = () => { const n = Number(inp.value.replace(/[^0-9]/g, "")); inp.value = n ? n.toLocaleString() : ""; };
  const close = () => { el.hidden = true; document.body.classList.remove("tour-open"); if (D) render(); };
  $("#cdX").onclick = () => { CD = null; close(); };
  $("#cdP").onclick = () => { openEdu(0); };
  $("#cdN").onclick = () => {
    const c = CD; if (Number(c.amt) < 1e6) return; CD = null;
    S.myKrw = Number(c.amt).toLocaleString(); if (!S.sima) S.sima = S.myKrw; S.cond = COND_V; S.edu = EDU_V; save();
    if (c.inst !== S.inst) chooseInstrument(c.inst);
    el.hidden = true; document.body.classList.remove("tour-open");
    if (c.lot !== S.lot || c.wait !== S.wait) setLot(c.lot, c.wait); else if (D) render();
    toast("모든 기능이 활성화되었습니다");
  };
}
// 11-27 밤 사용자 '가장 복잡한 실제 거래를 차트로, 하루하루 넘어가며 알림·매수·평단 낮춰 매도가 다시 정하기를 보여 줘' → 2025-04 관세 폭락 거래 재생
const RP_FIRST = "2025-04-03";
let RP = null;
function rpBuild() {
  const rd = H?.bt?.assume?.acc?.B?.rounds?.find((r) => r.buys[0].d === RP_FIRST); if (!rd) return null;
  const px = H.px.TQQQ, d = H.dates, i0 = d.indexOf(RP_FIRST), i1 = d.indexOf(rd.sell.d); if (i0 < 0 || i1 < 0) return null;
  const a = i0 - 6, b = Math.min(d.length - 1, i1 + 2), tp = PRODUCTS.TQQQ.target / 100;
  const lotsOf = (k) => rd.buys.filter((x) => x.d <= d[k]);
  const line = (L) => { if (!L.length) return null; const p = L.map((x) => x.px), avg = p.length / p.reduce((z, v) => z + 1 / v, 0), top = Math.max(...p); return {avg, tgt: Math.round((top > p[0] ? top : avg) * (1 + tp) * 100) / 100}; };
  const units = (L) => L.reduce((z, x) => z + ((x.sig?.w ?? .2) < .15 ? .5 : 1), 0);
  const days = [];
  for (let k = a; k <= b; k++) {
    const today = rd.buys.filter((x) => x.d === d[k]), L = lotsOf(k), ln = line(L), prev = line(lotsOf(k - 1)), sold = d[k] >= rd.sell.d;
    let t = "", s = "";
    if (d[k] < RP_FIRST) { const nx = d[k + 1] === RP_FIRST; t = nx ? "마감 후 공포 조건 충족" : "나스닥 하락이 이어집니다"; s = nx ? `알림: <b class="up">▲ TQQQ 매수 $${rd.buys[0].px.toFixed(2)}</b> 지정가(반 묶음)` : "아직 매수 조건이 모두 맞지 않아 기다립니다"; }
    else if (today.length) {
      const g = {}; today.forEach((x) => { const u = (x.sig?.w ?? .2) < .15 ? "반 묶음" : "한 묶음", key = x.px.toFixed(2) + "|" + u; g[key] = (g[key] || 0) + 1; });
      t = `<b class="up">▲ 매수 체결</b> ${Object.entries(g).map(([kk, n]) => { const [p, u] = kk.split("|"); return `$${p} ${u}${n > 1 ? ` ×${n}` : ""}`; }).join(" · ")}`;
      s = `보유 ${units(L)}묶음 · 평균 단가 <b>$${ln.avg.toFixed(2)}</b><br>매도 주문을 <b class="down">▼ $${ln.tgt.toFixed(2)}</b>${prev ? `(전 $${prev.tgt.toFixed(2)})` : ""}로 ${prev ? "고칩니다" : "겁니다"}`;
    } else if (!sold) { t = "추가 매수 없음"; s = `매도 주문 <b class="down">▼ $${ln.tgt.toFixed(2)}</b> 그대로 유지 · 기다립니다`; }
    else if (d[k] === rd.sell.d) { t = `<b class="down">▼ 목표가 $${rd.sell.px.toFixed(2)} 매도 체결</b>`; s = `평균 단가 $${line(rd.buys).avg.toFixed(2)} 대비 <b class="up">${pct(rd.ret)}</b> · 거래 종료`; }
    else { t = "거래가 끝났습니다"; s = "다음 공포가 올 때까지 다시 기다립니다"; }
    days.push({k, t, s, ln: d[k] <= rd.sell.d ? ln : null, buys: today, sell: d[k] === rd.sell.d ? rd.sell : null});
  }
  return {rd, a, b, days, px};
}
function rpChart(st, upto) {
  const {a, b, days, px} = st, W = 340, Hh = 190, pl = 6, pr = 46, n = b - a + 1, cw = (W - pl - pr) / n;
  let lo = Infinity, hi = -Infinity; for (let k = a; k <= b; k++) { lo = Math.min(lo, px.l[k]); hi = Math.max(hi, px.h[k]); }
  days.forEach((x) => { if (x.ln) hi = Math.max(hi, x.ln.tgt); }); const pad = (hi - lo) * .08; lo -= pad; hi += pad;
  const Y = (v) => 8 + (hi - v) / (hi - lo) * (Hh - 16), X = (k) => pl + (k - a + .5) * cw;
  let g = `<svg viewBox="0 0 ${W} ${Hh}" class="rp-c">`;
  for (let k = a; k <= a + upto; k++) {
    const o = px.o[k], c = px.c[k], up = c >= o, col = up ? "#f04452" : "#3182f6", x = X(k);
    g += `<line x1="${x}" x2="${x}" y1="${Y(px.h[k])}" y2="${Y(px.l[k])}" stroke="${col}" stroke-width="1.2"/><rect x="${x - cw * .32}" y="${Y(Math.max(o, c))}" width="${cw * .64}" height="${Math.max(1, Math.abs(Y(o) - Y(c)))}" fill="${col}" rx="1"/>`;
  }
  const cur = days[upto];
  if (cur.ln) { const y = Y(cur.ln.tgt); g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="#3182f6" stroke-dasharray="4 3" stroke-width="1.4"/><text x="${W - pr + 4}" y="${y + 4}" class="rp-t" fill="#3182f6">▼${cur.ln.tgt.toFixed(2)}</text>`;
    const ya = Y(cur.ln.avg); g += `<line x1="${pl}" x2="${W - pr}" y1="${ya}" y2="${ya}" stroke="#8b95a1" stroke-dasharray="2 3" stroke-width="1"/><text x="${W - pr + 4}" y="${ya + 4}" class="rp-t" fill="#6b7684">평단</text>`; }
  for (let u = 0; u <= upto; u++) {
    const dd = days[u], x = X(dd.k);
    [...new Set(dd.buys.map((z) => z.px))].forEach((p) => { g += `<path d="M${x} ${Y(p) + 3} l-5 9 h10 z" fill="#f04452"/>`; });
    if (dd.sell) g += `<path d="M${x} ${Y(dd.sell.px) - 3} l-5 -9 h10 z" fill="#3182f6"/>`;
  }
  const [hx] = [X(cur.k)]; g += `<line x1="${hx}" x2="${hx}" y1="4" y2="${Hh - 4}" stroke="#191f28" stroke-opacity=".12" stroke-width="${cw}"/>`;
  return g + `</svg>`;
}
function rpRender(el, onDone) {
  if (!RP) RP = {st: rpBuild(), u: 0};
  const st = RP.st; if (!st) { el.innerHTML = `<div class="ed-cap">차트 자료를 불러오는 중입니다</div>`; return; }
  const u = RP.u, dd = st.days[u], last = u >= st.days.length - 1;
  el.innerHTML = `<div class="rp"><div class="rp-d">${ymd(H.dates[dd.k])} <small>${u + 1} / ${st.days.length}일</small></div>${rpChart(st, u)}
    <div class="rp-p"><div>${dd.t}</div><small>${dd.s}</small></div>
    <div class="rp-b"><button id="rpP" ${u ? "" : "disabled"}>이전 날</button><button id="rpN" class="go">${last ? "처음부터" : "다음 날 ›"}</button></div></div>`;
  $("#rpP").onclick = () => { RP.u = Math.max(0, u - 1); rpRender(el, onDone); };
  $("#rpN").onclick = () => { RP.u = last ? 0 : u + 1; rpRender(el, onDone); if (u + 1 === st.days.length - 1) onDone?.(); };
  if (last) onDone?.();
}
function eduLessons() {
  const L = S.lot, T = PRODUCTS[S.inst].target, sc = H?.bt?.assume?.score?.krw?.B;
  const box = (n, half) => `<div class="ed-box">${Array.from({length: 5}, (_, i) => `<i class="${i < n ? "on" : ""}${half && i === n ? " half" : ""}"></i>`).join("")}</div>`;
  return [
    {h: "한 번에 다<br>매수하지 않습니다", p: `한 번 매수할 때 쓰는 돈을 <b>한 묶음</b>이라고 합니다. 지금 설정은 한 묶음 = 계좌의 <b>${L}%</b>, 최대 <b>5묶음어치</b>까지입니다. 공포가 이어지면 여러 날에 나눠 매수합니다.`,
      art: `${box(2)}<div class="ed-cap">예: 두 번 매수 = 계좌의 ${L * 2}%</div>`},
    {h: "반 묶음은<br>천천히 빠질 때입니다", p: `하락이 천천히 진행되는 날은 한 묶음의 <b>절반(${L / 2}%)</b>만 매수합니다. 남은 한도는 더 깊은 공포에 씁니다.`,
      art: `<div class="ed-two"><div><b>빠른 하락</b>${box(1)}<small>한 묶음 ${L}%</small></div><div><b>느린 하락</b>${box(0, true)}<small>반 묶음 ${L / 2}%</small></div></div>`},
    {h: "매수하자마자<br>매도 주문을 겁니다", p: `기다리면 오르는 것이 아닙니다. 매수가 체결되면 바로 평균 단가 <b>+${T}%</b>에 지정가 매도 주문을 걸어 둡니다. 체결될 때까지 유지합니다.`,
      art: `<div class="ed-flow"><div><em class="up">▲</em><b>$100.00</b><small>매수 체결</small></div><i>→</i><div><em class="down">▼</em><b>$${(100 * (1 + T / 100)).toFixed(2)}</b><small>바로 매도 주문</small></div></div>`},
    {h: "10거래일 안에<br>정리합니다", p: `마지막 매수일부터 <b>10거래일</b> 안에 목표가에 닿지 않으면, 그날 장 마감에 손익과 관계없이 전량 매도합니다. 레버리지는 오래 들고 있을수록 손실이 커질 수 있습니다.`,
      art: `<div class="ed-days">${Array.from({length: 10}, (_, i) => `<i class="${i === 9 ? "end" : ""}">${i + 1}</i>`).join("")}</div><div class="ed-cap">10일째 장 마감 = 정리</div>`},
    {h: "실제 거래로<br>따라가 보십시오", p: `2025년 4월 관세 폭락 때, <b>TQQQ를 고른 경우</b>의 실제 거래입니다(목표 +7.5%). ${S.inst !== "TQQQ" ? `${S.inst}는 날짜와 순서는 같고 가격과 목표(+${PRODUCTS[S.inst].target}%)만 다릅니다. ` : ""}<b>다음 날</b>을 눌러 하루씩 넘겨 보십시오.`, replay: true},
    {h: "평소에는<br>200일선을 따릅니다", p: `QQQ가 200일선 위로 확실히 올라서면 <b>QQQM 매수</b>, 확실히 내려가면 <b>매도 후 현금 대기</b>입니다. 공포 단타가 끝나도 <b>10거래일</b>은 현금으로 기다렸다가 QQQM을 다시 매수합니다. 이 주문도 알림으로 옵니다.`,
      art: `<div class="tour-checklist"><div style="--i:0"><b>200일선 위</b><span>QQQM 보유</span></div><div style="--i:1"><b>200일선 아래</b><span>현금 대기</span></div></div>`},
    {h: "손실도<br>날 수 있습니다", p: `과거 성적은 미래를 보장하지 않습니다.${sc ? ` 과거 공포 단타를 보유하는 동안 계좌는 최대 <b>${pct(sc.sw_acc_worst, 0)}</b>까지 평가손실이 났습니다.` : ""} 감당할 수 있는 비중으로 시작하십시오.`,
      art: `<div class="ed-warn">비중은 전체 > 한 묶음 비중에서 바꿀 수 있습니다</div>`},
  ];
}
function eduQuiz() {
  const L = S.lot, T = PRODUCTS[S.inst].target, sell = (100 * (1 + T / 100)).toFixed(2);
  return [
    {q: `${S.inst}를 $100.00에 매수했습니다.<br>바로 할 일은?`, o: ["오를 때까지 기다린다", `$${sell} 지정가 매도 주문을 건다`, "더 하락하면 추가로 매수한다"], a: 1, why: `매수 체결 직후 평균 단가 +${T}%에 매도 주문을 걸어 둡니다.`},
    {q: `한 묶음이 계좌의 ${L}%입니다.<br>'반 묶음 매수'는?`, o: [`계좌의 ${L / 2}%`, `계좌의 ${L}%`, `계좌의 ${L * 2}%`], a: 0, why: "반 묶음은 한 묶음의 절반입니다."},
    {q: "마지막 매수 후 10거래일이 지나도<br>목표가에 닿지 않았습니다.", o: ["계속 보유한다", "그날 장 마감에 매도한다", "한 묶음 더 매수한다"], a: 1, why: "보유 기한이 지나면 손익과 관계없이 매도합니다."},
  ];
}
let eduPage = -1, eduAns = [];
function openEdu(i = 0) {
  const L = eduLessons(), Q = eduQuiz(), N = L.length + Q.length, el = $("#tour"); eduPage = i; if (i === 0) eduAns = [];
  if (!H) needHist(() => { if (eduPage === i) openEdu(i); });
  const close = () => { eduPage = -1; el.hidden = true; document.body.classList.remove("tour-open"); if (D) render(); };
  el.hidden = false; document.body.classList.add("tour-open");
  const top = `<div class="tour-top"><span>전략 교육 · ${i < L.length ? "수업" : "확인 문제"}</span><button id="edX">나중에</button></div><div class="tour-steps">${Array.from({length: N}, (_, p) => `<i class="${p <= i ? "on" : ""}"></i>`).join("")}</div>`;
  if (i < L.length) {
    const x = L[i];
    el.innerHTML = `<div class="tour-inner forward${x.replay ? " rp-on" : ""}">${top}<div class="tour-copy"><h1>${x.h}</h1><p>${x.p}</p></div><div class="tour-art">${x.replay ? '<div id="rpBox"></div>' : x.art}</div>
      <div class="tour-nav">${i ? '<button id="edP">이전</button>' : ""}<button class="btn" id="edN" ${x.replay && !RP?.done ? "disabled" : ""}>${i === L.length - 1 ? "확인 문제 풀기" : x.replay && !RP?.done ? "끝까지 넘겨 보십시오" : "다음"}</button></div></div>`;
    if (i) $("#edP").onclick = () => openEdu(i - 1); $("#edN").onclick = () => { if (x.replay && !RP?.done) return; openEdu(i + 1); };
    if (x.replay) rpRender($("#rpBox"), () => { RP.done = true; const b = $("#edN"); if (b) { b.disabled = false; b.textContent = "다음"; } });
  } else if (i < N) {
    const k = i - L.length, x = Q[k], picked = eduAns[k];
    el.innerHTML = `<div class="tour-inner forward">${top}<div class="tour-copy"><h1 class="ed-q">${x.q}</h1></div>
      <div class="tour-art"><div class="ed-opts">${x.o.map((t, j) => `<button data-o="${j}" class="${picked == null ? "" : j === x.a ? "ok" : j === picked ? "no" : ""}">${t}</button>`).join("")}</div>
      ${picked == null ? "" : `<div class="ed-why ${picked === x.a ? "ok" : "no"}">${picked === x.a ? "정답입니다. " : "다시 생각해 보십시오. "}${x.why}</div>`}</div>
      <div class="tour-nav"><button id="edP">이전</button><button class="btn" id="edN" ${picked === x.a ? "" : "disabled"}>${k === Q.length - 1 ? "내 거래 조건 정하기" : "다음 문제"}</button></div></div>`;
    el.querySelectorAll("[data-o]").forEach((b) => b.onclick = () => { if (eduAns[k] === x.a) return; eduAns[k] = +b.dataset.o; openEdu(i); });
    $("#edP").onclick = () => openEdu(i - 1);
    $("#edN").onclick = () => { if (eduAns[k] !== x.a) return; if (k < Q.length - 1) return openEdu(i + 1); S.edu = EDU_V; save(); openCond(); };
  }
  $("#edX").onclick = close;
}
const eduLock = (what) => `<div class="card ed-lock"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/></svg>
  ${eduDone() ? `<b>${what}은 내 거래 조건을 정한 뒤 열립니다</b><small>단타 종목·한 묶음 비중·대기 자금·운용 금액을 정하면 그 조건으로 주문이 계산됩니다</small><button class="btn blue" onclick="openCond()">조건 정하기</button>`
    : `<b>${what}은 전략 교육 뒤에 열립니다</b><small>전략 교육 3분 · 확인 문제 3개 · 내 거래 조건을 마치면 활성화됩니다</small><button class="btn blue" onclick="openEdu(0)">교육 시작</button>`}</div>`;
// ── 전체 탭(11-27): 설정은 증권 앱 설정 화면처럼 '이름 + 지금 값 ›' 목록, 누르면 그 항목 하나만 고르는 창 ──
let RISK = null;
function needRisk(cb) {
  if (RISK) return cb();
  fetch(RISK_URL, {cache: "no-store"}).then((r) => r.json()).then((x) => { RISK = x; cb(); }).catch(() => {});
}
const riskOf = (n, w) => RISK?.[S.inst]?.[(w || S.wait) === "cash" ? "c" + n : n]?.[S.view === "usd" ? "usd" : "krw"];
const riskSub = (r) => r ? `연 ${pct(r.cagr)} · 최대 낙폭 ${pct(r.mdd, 0)}` : "";
function pick(title, opts, cur, onPick, foot) {   // 한 항목 고르기 창: 누르면 바로 적용
  sheet(`<div class="pk-t">${title}</div><div class="pk">${opts.map(([v, t, sub]) => `<button data-pk="${v}" class="${String(v) === String(cur) ? "on" : ""}"><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</span><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`).join("")}</div>${foot ? `<div class="pk-f">${foot}</div>` : ""}`,
    (close) => document.querySelectorAll("[data-pk]").forEach((b) => b.onclick = () => { const v = b.dataset.pk; close(); if (String(v) !== String(cur)) onPick(v); }));
}
const openLot = () => needRisk(() => pick("한 묶음 비중", LOTS.map((n) => [n, `${n}%`, riskSub(riskOf(n))]), S.lot, (v) => setLot(+v), `공포 구간 1회 매수 비중 · 최대 ${CAPN()}묶음 · 2000년부터 계산`));
const openWait = () => needRisk(() => pick("대기 자금", WAITS.map(([v, t]) => [v, t, riskSub(riskOf(S.lot, v))]), S.wait, (v) => setLot(S.lot, v), "200일선 아래에서 기다리는 돈"));
const openFee = () => pick("매매 수수료", FEES.map(([v, t]) => [v, t]), S.fee, (v) => { S.fee = v; save(); render(); }, "증권사 한쪽 수수료 · 모든 과거 성과에 반영");
const openView = () => pick("금액 기준", [["krw", "원화·세후", "양도소득세 22%·환율 반영"], ["usd", "달러·세전", "세금·환율 제외"]], S.view, (v) => { S.view = v; save(); render(); });
function openAmt() {
  sheet(`<div class="pk-t">내 운용 금액</div>
    <label class="form-label" for="setamt">운용 금액(원)</label><input class="money" id="setamt" inputmode="numeric" placeholder="30,000,000" value="${esc(S.myKrw)}">
    <label class="form-label" for="setcash">주문 가능 달러(선택)</label><input class="money" id="setcash" inputmode="decimal" placeholder="$0" value="${esc(S.cashUsd)}">
    <div class="pk-f">할 일의 주문 수량을 이 금액으로 바꿔 계산</div><button class="btn blue" id="sok">저장</button>`, (close) => {
    $("#sok").onclick = () => { S.myKrw = $("#setamt").value; S.cashUsd = $("#setcash").value; if (!S.sima) S.sima = S.myKrw; save(); close(); };
  });
}
function openInst() {
  pick("단타 종목", Object.entries(PRODUCTS).map(([s, p]) => [s, s, `나스닥100 ${p.title.replace(" · 나스닥100", "")} · 목표 +${p.target}%`]), S.inst, chooseInstrument);
}
const pushWord = () => !WEB ? "웹 앱 전용" : PUSHST === "on" ? "켜짐" : PUSHST === "off" ? "꺼짐" : "";
function more() {
  const row = (id, t, v) => `<button class="li" data-li="${id}"><span>${t}</span><span class="v">${v}<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></span></button>`;
  $("#view").innerHTML = `<button class="back" onclick="go(S.prevTab || 'home')"><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>전체</button><div class="card lst"><div class="lh">내 설정</div>${row("lot", "한 묶음 비중", S.lot + "%")}${row("wait", "대기 자금", S.wait === "sgov" ? "단기국채" : "현금")}${row("fee", "매매 수수료", feeTxt())}${row("view", "금액 기준", S.view === "usd" ? "달러·세전" : "원화·세후")}${row("amt", "내 운용 금액", myAmt() ? won(myAmt()) : "미입력")}</div>
    <div class="card lst"><div class="lh">앱</div>${row("bell", "알림", pushWord())}${WEB && !STANDALONE ? row("install", "앱 설치", "") : ""}</div>
    <div class="card lst"><div class="lh">공유·도구</div>${row("diag", "내 보유 진단", "")}${row("report", "오늘의 공포 리포트", "공유")}${row("record", "실시간 기록", "")}${row("invite", "지인에게 앱 공유", "")}</div>
    <div class="card lst"><div class="lh">안내</div>${row("edu", "전략 교육", eduDone() ? "완료" : "미완료")}${eduDone() ? row("cond", "내 거래 조건", condOn() ? `${S.inst} · ${S.lot}%` : "미설정") : ""}${row("guide", "사용 안내", "")}</div>`;
  const F = {lot: openLot, wait: openWait, fee: openFee, view: openView, amt: openAmt, bell: openBell, install: () => openEntry(true), cmp: () => go("compare"), guide: openGuide, edu: () => openEdu(0), cond: () => { CD = null; openCond(); }, diag: () => goSub("diag"), record: () => goSub("record"), report: openReport, invite: inviteShare};
  document.querySelectorAll("[data-li]").forEach((b) => b.onclick = F[b.dataset.li]);
}
// 수수료 반영: 날마다 거래 비율(turn) x (내 수수료 - 모델 수수료)만큼 그날부터 곱으로 깎음
const _mulCache = {};
function feeMul(btName, k) {
  const key = btName + k + S.fee; if (_mulCache[key]) return _mulCache[key];
  const acc = H.bt[btName].acc[k], n = acc.usd.length, out = new Array(n), turn = acc.turn || [], f = +S.fee; let m = 1, j = 0;
  for (let i = 0; i < n; i++) { while (j < turn.length && turn[j][0] === i) { m *= 1 - (f - .00065) * turn[j][1] - (f - .001) * turn[j][2]; j++; } out[i] = m; }
  return (_mulCache[key] = out);
}
function vals(btName, k, view) {   // 수수료 반영한 평가금액 배열(원화는 만원 단위)
  const acc = H.bt[btName].acc[k], src = view === "krw" ? acc.krw : acc.usd; if (k === "qqq") return src;
  const m = feeMul(btName, k); return src.map((v, i) => v * m[i]);
}
function jstats(v, a = 0, b = v.length - 1) {
  let pk = -Infinity, mdd = 0; for (let i = a; i <= b; i++) { pk = Math.max(pk, v[i]); mdd = Math.min(mdd, v[i] / pk - 1); }
  const yrs = (b - a + 1) / 252; return {mult: v[b] / v[a], cagr: Math.pow(v[b] / v[a], 1 / yrs) - 1, mdd};
}
const xmult = (m) => m == null ? "-" : m >= 100 ? `${Math.round(m).toLocaleString("ko-KR")}배` : m >= 10 ? `${m.toFixed(0)}배` : `${m.toFixed(2)}배`;

// ── 홈 ──
// ── 장 시계(11-27 사용자 '홈에 있어야 할 건 시계'): 한국 시간, 나스닥 지금 구간, 알림 시각 ──
const NIGHT_FROM = "2026-12-06";   // 나스닥 23/5 밤 세션 첫날(ET 일요일 21:00 시작). 일정이 바뀌면 여기만 고침
const ETF = new Intl.DateTimeFormat("en-US", {timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short"});
function etParts(ms) { const o = {}; ETF.formatToParts(new Date(ms)).forEach((p) => o[p.type] = p.value); return {ds: `${o.year}-${o.month}-${o.day}`, h: +o.hour % 24, mi: +o.minute, wd: o.weekday}; }
function etMs(ds, h, mi) {   // 뉴욕 벽시계 시각 → 실제 시각(ms). 서머타임 자동
  const [y, m, d] = ds.split("-").map(Number), want = Date.UTC(y, m - 1, d, h, mi), g = want + 5 * 3600e3, p = etParts(g), [py, pm, pd] = p.ds.split("-").map(Number);
  return g - (Date.UTC(py, pm - 1, pd, p.h, p.mi) - want);
}
const dayAdd = (ds, n) => { const d = new Date(ds + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const CAL = () => D?.cal || {holidays: [], early: []};
const isSess = (ds) => { const w = new Date(ds + "T12:00:00Z").getUTCDay(); return w > 0 && w < 6 && !CAL().holidays.includes(ds); };
const SEGC = {night: "#c4bdf6", pre: "#b7d4fb", reg: "#3182f6", aft: "#b7d4fb"};
function sessDay(ds) {   // 거래일 ds 하루: 전날 20:00 ET ~ 그날 20:00 ET(밤 세션은 전날 21:00부터)
  const early = CAL().early.includes(ds), ch = early ? 13 : 16, pv = dayAdd(ds, -1), segs = [];
  if (pv >= NIGHT_FROM) segs.push({k: "night", n: "밤 세션", a: etMs(pv, 21, 0), b: etMs(ds, 4, 0)});
  segs.push({k: "pre", n: "프리마켓", a: etMs(ds, 4, 0), b: etMs(ds, 9, 30)}, {k: "reg", n: "정규장", a: etMs(ds, 9, 30), b: etMs(ds, ch, 0)},
            {k: "aft", n: "애프터마켓", a: etMs(ds, ch, 0), b: etMs(ds, early ? 17 : 20, 0)});
  return {ds, early, segs, reg: segs.find((x) => x.k === "reg"), w0: etMs(pv, 20, 0), w1: etMs(ds, 20, 0),
          alarms: [{n: "개장 전 알림", sub: "걸 주문이 있을 때", t: etMs(ds, 7, 0)}, {n: "마감 후 알림", sub: "새 주문이 생겼을 때", t: etMs(ds, 16, 20), from: true}]};
}
function sessFrom(now, cond) { let ds = etParts(now).ds; for (let i = 0; i < 14; i++, ds = dayAdd(ds, 1)) { if (!isSess(ds)) continue; const x = sessDay(ds); if (cond(x)) return x; } return null; }
const kIso = (ms) => new Date(ms + 9 * 3600e3).toISOString();
const kHM = (ms) => kIso(ms).slice(11, 16);
function kDay(ms, now) { const d = kIso(ms).slice(0, 10); return d === kIso(now).slice(0, 10) ? "오늘" : d === kIso(now + 864e5).slice(0, 10) ? "내일" : WD[new Date(d + "T12:00:00Z").getUTCDay()] + "요일"; }
function dur(ms) { const m = Math.max(0, Math.round(ms / 6e4)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = m % 60; return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${mi}분` : `${mi}분`; }
// 11-27 밤 사용자 '24시간 시계는 직관성이 떨어진다, 12시간 시계 두 개로, 구간 이름은 시계 안에' → 낮 12시~밤 12시 / 밤 12시~낮 12시 두 문자판. 바늘은 지금이 속한 쪽에만
// 11-27 밤 사용자 '공포 구간이면 시계도 붉게' → 공포(신호의 fear)일 때 빨강 계열
let CLOCK_FEAR = false;
const SEGF0 = {night: "#cdc6fa", pre: "#b7d4fb", reg: "#3182f6", aft: "#b7d4fb"}, SEGF1 = {night: "#ffd6da", pre: "#ffc2c8", reg: "#f04452", aft: "#ffc2c8"};
const SEGT0 = {night: "#5b4ce0", pre: "#1b64da", reg: "#1b64da", aft: "#1b64da"}, SEGT1 = {night: "#d22d3c", pre: "#d22d3c", reg: "#d22d3c", aft: "#d22d3c"};
const SEGF = new Proxy({}, {get: (_, k) => (CLOCK_FEAR ? SEGF1 : SEGF0)[k]}), SEGT = new Proxy({}, {get: (_, k) => (CLOCK_FEAR ? SEGT1 : SEGT0)[k]});
const SEGN = {night: "밤", pre: "프리", reg: "정규장", aft: "애프터"};
const kHour = (ms) => { const s = kIso(ms); return +s.slice(11, 13) + +s.slice(14, 16) / 60; };
function clip12(a, b, s) {   // 한국 시각 [a,b)(자정 넘김 가능)를 문자판 [s, s+12) 안으로 자른 조각들
  if (b <= a) b += 24; const out = [];
  [s, s + 24].forEach((w) => { const x = Math.max(a, w), y = Math.min(b, w + 12); if (y > x) out.push([x - w, y - w]); });
  return out;
}
function dial12(s, M, now, cur, nightPh) {
  const C = 80, R = 54, W = 18, ang = (h) => (h / 12) * 2 * Math.PI - Math.PI / 2, pt = (h, r) => [C + r * Math.cos(ang(h)), C + r * Math.sin(ang(h))];
  const arc = (h1, h2, r) => { const [x1, y1] = pt(h1, r), [x2, y2] = pt(h2, r); return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${h2 - h1 > 6 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };
  let g = `<svg class="dl" viewBox="0 0 160 160" aria-hidden="true"><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#eef1f4" stroke-width="${W}"/>`, lab = "";
  if (nightPh) clip12(...nightPh, s).forEach(([x, y]) => { g += `<path d="${arc(x, y, R)}" fill="none" stroke="#c9cfd6" stroke-width="2" stroke-dasharray="3 4"/>`; });
  M.segs.forEach((sg) => clip12(kHour(sg.a), kHour(sg.b), s).forEach(([x, y]) => {
    g += `<path d="${arc(x, y, R)}" fill="none" stroke="${SEGF[sg.k]}" stroke-width="${cur === sg ? W + 3 : W}"/>`;
    if (y - x >= 1.6) { const [lx, ly] = pt((x + y) / 2, R - W / 2 - 15); lab += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" class="dl-l" fill="${SEGT[sg.k]}">${SEGN[sg.k]}</text>`; }
  }));
  for (let h = 0; h < 12; h++) { const [x1, y1] = pt(h, R + W / 2 + 2), [x2, y2] = pt(h, R + W / 2 + (h % 3 ? 4 : 7)); g += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#c9cfd6" stroke-width="${h % 3 ? 1 : 1.6}"/>`; }
  [[0, "12"], [3, "3"], [6, "6"], [9, "9"]].forEach(([h, t]) => { const [x, y] = pt(h, R + W / 2 + 14); g += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" class="dl-h">${t}</text>`; });
  g += lab;
  M.alarms.forEach((al) => clip12(kHour(al.t), kHour(al.t) + .01, s).forEach(([x]) => { const [bx, by] = pt(x, R); g += `<g transform="translate(${(bx - 8).toFixed(1)} ${(by - 8).toFixed(1)})"><circle cx="8" cy="8" r="8.5" fill="#fff" stroke="#f08a00" stroke-width="1.4"/><path d="M4.6 10.4V7.6a3.4 3.4 0 016.8 0v2.8l.9 1.1H3.7z M6.9 12.6a1.2 1.2 0 002.2 0" fill="none" stroke="#f08a00" stroke-width="1.3" stroke-linejoin="round"/></g>`; }));
  const hn = kHour(now), on = hn >= s && hn < s + 12;
  if (on) { const h = hn - s, [hx, hy] = pt(h, R - W / 2 - 22), [mx, my] = [C + (R - W / 2 - 6) * Math.cos(((hn % 1) * 60 / 60) * 2 * Math.PI - Math.PI / 2), C + (R - W / 2 - 6) * Math.sin(((hn % 1) * 60 / 60) * 2 * Math.PI - Math.PI / 2)];
    g += `<line x1="${C}" y1="${C}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="#4e5968" stroke-width="2" stroke-linecap="round"/><line x1="${C}" y1="${C}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#191f28" stroke-width="3.6" stroke-linecap="round"/><circle cx="${C}" cy="${C}" r="3.6" fill="#191f28"/>`; }
  return {svg: g + `</svg>`, on};
}
function clockHTML() {
  const now = Date.now(), M = sessFrom(now, (x) => now < x.segs.at(-1).b), R = sessFrom(now, (x) => now < x.reg.b);
  if (!M || !R) return `<div class="t2">장 달력을 확인할 수 없습니다.</div>`;
  const cur = M.segs.find((x) => now >= x.a && now < x.b), et = etParts(now), wkend = !cur && (et.wd === "Sat" || et.wd === "Sun");
  const st = cur ? cur.n + " 거래 중" : wkend ? "주말 휴장" : !isSess(et.ds) && now < M.w0 ? "휴장일" : "장 닫힘";
  const open = now >= R.reg.a, ki = kIso(now), night0 = etMs(NIGHT_FROM, 21, 0);
  const ph = M.segs.some((x) => x.k === "night") ? null : [kHour(etMs(dayAdd(M.ds, -1), 21, 0)), kHour(etMs(M.ds, 4, 0))];
  const half = kHour(now) >= 12 ? 12 : 0, d = dial12(half, M, now, cur, ph);   // 11-27 밤 사용자: 시계는 하나 — 지금이 오전이면 오전 12시간, 오후면 오후 12시간
  return `<div class="dl-w"><div class="dl-one">${d.svg}<span>${half ? "오후" : "오전"}</span></div>
    <div class="dl-r"><span class="mk-st ${cur ? cur.k : "off"}">${st}</span><div class="dl-now">${ki.slice(11, 16)}<small>:${ki.slice(17, 19)}</small></div>
      <div class="t2">뉴욕 ${String(et.h).padStart(2, "0")}:${String(et.mi).padStart(2, "0")}</div>
      <div class="dl-cd">${open ? "정규장 마감까지" : "정규장 개장까지"}<b>${dur((open ? R.reg.b - now : R.reg.a - now))}</b><small>${open ? kHM(R.reg.b) : `${kDay(R.reg.a, now)} ${kHM(R.reg.a)}`}${R.early ? " · 조기 마감" : ""}</small></div></div></div>
    <div class="dl-al"><i></i>알림 ${M.alarms.map((a) => kHM(a.t)).join(" · ")}${now < night0 ? `<em>밤 세션 ${+kIso(night0).slice(5, 7)}/${+kIso(night0).slice(8, 10)}부터</em>` : ""}</div>`;
}
let clockT = null;
function startClock() {
  clearInterval(clockT);
  const f = () => { const el = $("#clockIn"); if (!el) { clearInterval(clockT); clockT = null; return; } el.innerHTML = clockHTML(); };
  f(); clockT = setInterval(f, 1000);
}
const LOGO = {TQQQ: "TQ", QLD: "QL", QQQ: "Q", QQQM: "QM", SGOV: "SG", GLDM: "금", IEF: "IE", "현금": "$"};
// 11-27 밤 사용자 '극심한 공포가 파란색이 맞냐, 점점 붉어지게' → 공포는 빨강, 중립 노랑, 탐욕 초록(속도계처럼 띠 전체를 보여 주고 지금 값을 짚음)
const FGS = [[0, [200, 30, 30]], [25, [240, 68, 82]], [45, [255, 140, 50]], [55, [245, 196, 60]], [75, [120, 196, 110]], [100, [18, 161, 80]]];
function fgCol(v) { v = Math.max(0, Math.min(100, v)); for (let i = 1; i < FGS.length; i++) if (v <= FGS[i][0]) { const [a, ca] = FGS[i - 1], [b, cb] = FGS[i], t = (v - a) / (b - a); return "#" + ca.map((c, k) => Math.round(c + (cb[k] - c) * t).toString(16).padStart(2, "0")).join(""); } return "#12a150"; }
function home() {
  const k = S.prof, a = D.accounts[k], plan = a.plan || {}, my = myAmt(), tr = D.trend;
  const {g, tot} = composition(a), shown = Object.entries(g).filter(([, x]) => x / tot > .0005).sort((p, q) => q[1] - p[1]);
  const n = (plan.swing || []).length + (plan.alloc || []).length;
  let html = "";
  // 0) 공포·탐욕지수 게이지(11-27 밤 '피어바이' 시안) + 매수 조건 요약
  { const sg = plan.signals || {}, fgv = LQ.FG?.v ?? sg.fg, live = LQ.FG?.v != null, room = sg.room ?? (sg.max_regular_lots || 5);
    const lab = fgv == null ? ["자료 없음", "na"] : fgv < 25 ? ["극심한 공포", "xf"] : fgv < 45 ? ["공포", "f"] : fgv <= 55 ? ["중립", "n"] : fgv <= 75 ? ["탐욕", "g"] : ["극심한 탐욕", "xg"];
    const C = 110, Y = 112, Rr = 88, pt = (v, r) => { const a = Math.PI * (1 - v / 100); return [C + r * Math.cos(a), Y - r * Math.sin(a)]; };
    const arc = (v0, v1) => { const [x0, y0] = pt(v0, Rr), [x1, y1] = pt(v1, Rr); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${Rr} ${Rr} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    const [t1x, t1y] = pt(30, Rr + 14), [t2x, t2y] = pt(30, Rr - 14), [lx, ly] = pt(30, Rr + 26);
    const cs = [sg.fear, sg.band, sg.rsi == null ? null : sg.rsi < 30, room > 0], nm = cs.filter((c) => c === true).length;
    html += `<div class="card fg-card"><div class="fg-h"><b>공포·탐욕지수</b><span class="${live ? "lv" : ""}">${live ? "실시간" : ymd(sg.date).slice(5) + " 종가"}</span><button class="fg-sh" id="fgShare" aria-label="오늘의 공포 리포트 공유"><svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M5 12.5V19a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 19v-6.5"/></svg></button></div>
      <div class="fg-g"><svg viewBox="0 0 220 128" aria-hidden="true">
        ${Array.from({length: 60}, (_, i) => `<path d="${arc(i * 100 / 60, (i + 1) * 100 / 60 + .4)}" fill="none" stroke="${fgCol((i + .5) * 100 / 60)}" stroke-width="18"/>`).join("")}
        ${(() => { const [ax, ay] = pt(0, Rr), [bx, by] = pt(100, Rr); return `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="9" fill="${fgCol(0)}"/><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="9" fill="${fgCol(100)}"/>`; })()}
        ${fgv != null ? (() => { const [mx, my] = pt(Math.max(0, Math.min(100, fgv)), Rr); return `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="13" fill="#fff" stroke="${fgCol(fgv)}" stroke-width="5"/><circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="4" fill="#191f28"/>`; })() : ""}</svg>
        <div class="fg-v"><b style="color:${fgv == null ? "var(--ink)" : fgCol(fgv)}">${fgv == null ? "-" : Math.round(fgv)}</b><span class="fg-l" style="${fgv == null ? "" : `background:${fgCol(fgv)}1f;color:${fgCol(fgv)}`}">${lab[0]}</span></div></div>
      <div class="fg-s">VIX ${num(sg.vix, 1)}</div>
      <button class="fg-go" data-go="signal"><i class="${sg.fear ? "on" : ""}"><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg></i><span><b>${sg.fear ? "공포 구간" : "공포 구간 아님"} · 매수 조건 ${nm}/4</b><small>${nm === 4 ? "다음 거래일 매수 주문이 나갑니다" : "남은 조건은 신호에서 확인"}</small></span><svg class="ch" viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button></div>`; }
  // 1) 장 시계 + 다음 주문
  CLOCK_FEAR = !!(plan.signals || {}).fear;
  html += `<div class="card mk${CLOCK_FEAR ? " fear" : ""}"><div id="clockIn"></div>
    <button class="mk-go" data-go="todo"><span>다음 거래일 주문</span><b>${n ? `${n}건` : "없음"} ›</b></button></div>`;
  // 2) 보유 현황: 증권 앱 보유 종목 목록처럼(로고 · 이름 · 한 줄 설명 | 비중 · 내 금액)
  const sell = (plan.swing || []).find((o) => o.how === "목표가"), due = (plan.swing || []).find((o) => o.how === "보유기한");
  const wait = tr && !tr.next_in ? `200일선 아래 · ${waitWord()}` : null;   // 11-28 기준선 가격은 공개하지 않음
  const desc = (nm) => nm === "QQQM" && tr?.next_in ? `200일선 위 · 추세 보유` : (nm === "현금" || nm === "SGOV") && wait ? wait : COMP[nm][1];
  let sw = null;
  if (sell && g[S.inst] > 0) {
    const avg = parseFloat((sell.why.match(/\$([\d.]+)/) || [])[1]), q = LQ[S.inst], lots = dedupLots(plan.lots), c = q ? q.c : null;
    const r = c && avg ? c / avg - 1 : null, f = c && avg && sell.limit > avg ? Math.max(0, Math.min(1, (c - avg) / (sell.limit - avg))) : 0;
    sw = {r, html: `<div class="hl-sw"><div class="hl-pg"><i style="width:${f * 100}%"></i></div>
      <div class="hl-pgl"><span>평균 ${usd2(avg)}</span>${c ? `<b>현재 ${usd2(c)}</b>` : ""}<span>목표 ${usd2(sell.limit)}</span></div>
      <div class="t2">${lots.length}회 매수 · 보유 기한 ${due ? ymd(due.session).slice(5) + " 장 마감" : "-"}</div></div>`};
  }
  const row = ([nm, x]) => {
    const s = nm === S.inst && sw;
    return `<div class="hl-row"><i class="hl-lg" style="background:${COMP[nm][2]}">${LOGO[nm] || nm[0]}</i>
      <div class="hl-m"><b>${COMP[nm][0]}</b><small>${s ? "공포 단타 보유 중" : desc(nm)}</small></div>
      <div class="hl-r"><b>${pctu(x / tot)}</b>${s && sw.r != null ? `<small class="${cls(sw.r)}">${pct(sw.r, 1)}</small>` : my ? `<small>${won(my * x / tot)}</small>` : ""}</div></div>${s ? sw.html : ""}`;
  };
  html += `<div class="card hold"><div class="hl-h"><div class="title">보유 현황</div><span class="t2">${ymd(D.last_close)} 종가</span></div>
    <div class="stack hl-stack">${shown.map(([nm, x]) => `<span style="width:${x / tot * 100}%;background:${COMP[nm][2]}"></span>`).join("")}</div>
    ${shown.map(row).join("")}<button class="mk-go" onclick="goSub('diag')"><span>내 보유 진단 · 산 가격을 넣어 보십시오</span><b>›</b></button>`;
  html += `</div>${D.health.length ? `<div class="foot"><b class="warn">자료 확인 필요 ${D.health.length}건(신호 탭)</b></div>` : ""}`;
  $("#view").innerHTML = html;
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => go(b.dataset.go));
  $("#fgShare").onclick = openReport;
  startClock();
  if (!tickT) liveTick();
}
// 이 날 시작했다면(11-27 홈 → 비교 탭 맨 위로)
function simCard() {
  return `<div class="card"><div class="title">이 날 시작했다면</div><div class="desc">과거 자료 모의 · 수수료 ${feeTxt()} 반영</div>
    <div class="simf"><label>시작일<input type="date" id="simd" min="2000-01-03" value="${S.simd}"></label><label>금액(선택)<input id="sima" inputmode="numeric" placeholder="비우면 %로 표시" value="${esc(S.sima)}"></label></div>
    <div class="chips">${QUICK().map(([d, t]) => `<button class="chipb ${S.simd === d ? "on" : ""}" data-qd="${d}">${t}</button>`).join("")}</div>
    <div id="simsum"></div><div id="simchart"></div><div class="chart-cap" id="simcap"></div></div>`;
}
function bindSim() {
  if (!$("#simd") || !H) return;
  const reSim = () => { S.simd = $("#simd").value || S.simd; S.sima = $("#sima").value; save(); drawSim(); };
  $("#simd").onchange = reSim; $("#sima").oninput = () => { clearTimeout(window._st); window._st = setTimeout(reSim, 500); };
  document.querySelectorAll("[data-qd]").forEach((b) => b.onclick = () => { S.simd = b.dataset.qd; $("#simd").value = S.simd; save(); document.querySelectorAll("[data-qd]").forEach((x) => x.classList.toggle("on", x === b)); drawSim(); });
  $("#simd").max = H.last; drawSim();
}
function QUICK() {
  const y = (H ? H.last : D.last_close).slice(0, 4), ago = (n) => { const d = new Date((H ? H.last : D.last_close) + "T12:00:00"); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10); };
  return [[`${y}-01-01`, "올해 초"], [ago(1), "1년 전"], [ago(3), "3년 전"], [ago(5), "5년 전"], [ago(10), "10년 전"], ["2000-01-03", "2000년"]];
}
// 세후 추정: 전략은 해마다 이익을 실현했다고 보고 22%(연 250만원 공제)를 해마다 냄 / QQQ 보유는 끝에 한 번
function afterTax(dates, amt, rel, yearly) {
  if (!yearly) { const gain = amt * rel.at(-1) - amt; return amt * rel.at(-1) - .22 * Math.max(0, gain - 2.5e6); }
  let f = 1, base = amt, tax = 0;
  for (let i = 0; i < rel.length; i++) {
    const end = i === rel.length - 1 || dates[i + 1].slice(0, 4) !== dates[i].slice(0, 4);
    if (!end) continue; const v = amt * rel[i] * f, t = .22 * Math.max(0, v - base - 2.5e6); tax += t; if (i < rel.length - 1) { f *= (v - t) / v; base = v - t; } else return v - t;
  }
  return amt * rel.at(-1) * f;
}
function drawSim() {
  const k = S.prof, bt = H.bt.assume, i0 = bt.i0, xs = H.dates.slice(i0);
  let j = xs.findIndex((d) => d >= S.simd); if (j < 0) j = xs.length - 2; if (j >= xs.length - 1) j = xs.length - 2;
  const fx = H.fx.slice(i0), su = vals("assume", k, "usd"), qu = bt.acc.qqq.usd;
  const sk = su.map((v, i) => v * (fx[i] || fx[i - 1])), qk = qu.map((v, i) => v * (fx[i] || fx[i - 1]));
  const rel = sk.slice(j).map((v) => v / sk[j]), qrel = qk.slice(j).map((v) => v / qk[j]), x = xs.slice(j);
  const amt = Number(String(S.sima || "").replace(/[^0-9]/g, "")) || null;
  const a = jstats(rel), q = jstats(qrel), yrs = x.length / 252;
  let sum = `<div class="simres"><div><span class="t2">${P[k].name}</span><b class="${cls(a.mult - 1)}">${pct(a.mult - 1)}</b>${amt ? `<span>${won(amt * a.mult)}</span>` : ""}</div>
    <div><span class="t2">QQQ 보유</span><b class="${cls(q.mult - 1)}">${pct(q.mult - 1)}</b>${amt ? `<span>${won(amt * q.mult)}</span>` : ""}</div></div>
    <div class="kv2"><div>기간</div><div>${ymd(x[0])} ~ ${ymd(x.at(-1))} (${yrs >= 1 ? yrs.toFixed(1) + "년" : Math.round(yrs * 12) + "개월"})</div>
    ${yrs >= 1 ? `<div>연평균 수익률</div><div>${pct(a.cagr)} · QQQ ${pct(q.cagr)}</div>` : ""}
    <div>최대 낙폭</div><div><span class="down">${pct(a.mdd)}</span> · QQQ ${pct(q.mdd)}</div>
    ${amt ? `<div>세후 금액(추정)</div><div><b>${won(afterTax(x, amt, rel, true))}</b> · QQQ ${won(afterTax(x, amt, qrel, false))}</div>` : ""}</div>`;
  $("#simsum").innerHTML = sum;
  const fmt = amt ? (y) => won(y).replace("원", "") : (y) => (y > 0 ? "+" : "") + Math.round(y) + "%";
  const ys = amt ? [rel.map((r) => r * amt), qrel.map((r) => r * amt)] : [rel.map((r) => (r - 1) * 100), qrel.map((r) => (r - 1) * 100)];
  mkChart($("#simchart"), {x, height: 240, xfmt: (d) => ymd(d), minBars: 5,
    panes: [{fmt, log: x.length > 252 * 4 && !!amt, series: [{type: "line", name: P[k].name, y: ys[0], color: css(P[k].v), w: 2, fill: css(P[k].v) + "22"}, {type: "line", name: "QQQ 보유", y: ys[1], color: css("--Q"), w: 1.4}],
      hlines: [{y: amt ? amt : 0, label: amt ? "원금" : "0%", color: css("--mute"), dash: [3, 3], fit: true}]}],
    tip: (i) => `<b>${ymd(x[i])}</b><div class="tr"><i style="background:${css(P[k].v)}"></i>${P[k].name}<b>${amt ? won(ys[0][i]) : ""}</b><span class="${cls(rel[i] - 1)}">${pct(rel[i] - 1)}</span></div><div class="tr"><i style="background:${css("--Q")}"></i>QQQ 보유<b>${amt ? won(ys[1][i]) : ""}</b><span class="${cls(qrel[i] - 1)}">${pct(qrel[i] - 1)}</span></div>`});
  const listed=H.px[S.inst]?.real_from;
  $("#simcap").innerHTML = `원화·세전${amt ? " · 세후 금액은 매년 실현 가정 추정치" : ""}${listed&&x[0]<listed?" · ":""}${listed&&x[0]<listed?`${ymd(listed)} 이전 ${S.inst} 가정 가격`:""}`;
}

function dedupLots(lots) {   // 칸이 둘(안정형)이면 같은 차수가 칸마다 한 번씩 → 첫 칸 것만(같은 날 같은 값 2·3차는 실제로 두 번 산 것)
  lots = lots || []; return lots.filter((l) => l.part === (lots[0] || {}).part);
}
function rollStats(k, h) {
  const R = H?.rolling, sm = R?.summary?.[k]?.[h], pts = R?.points?.[k]?.[h] || [];
  if(!sm)return null;
  return Object.assign({}, sm, {loss: pts.length ? pts.filter((p) => p[1] < 1).length / pts.length : null});
}
function rolling(kel, cel, keys, h) {
  const R = H.rolling, k = keys[0], a = rollStats(k, h), q = rollStats("qqq", h);
  kel.innerHTML = `<div class="kpis">
    <div class="kpi"><div class="l">예금 금리 초과 비율</div><div class="v" style="color:${col(k)}">${pctu(a.beat_deposit, 0)}</div><div class="s">QQQ 보유 ${pctu(q.beat_deposit, 0)}</div></div>
    <div class="kpi"><div class="l">원금 손실 비율</div><div class="v" style="color:${col(k)}">${pctu(a.loss, 0)}</div><div class="s">QQQ 보유 ${pctu(q.loss, 0)}</div></div>
    <div class="kpi"><div class="l">연평균 수익률(중앙값)</div><div class="v" style="color:${col(k)}">${pct(a.median_ann)}</div><div class="s">QQQ 보유 ${pct(q.median_ann)}</div></div>
    <div class="kpi"><div class="l">최저 결과(원금 대비)</div><div class="v" style="color:${col(k)}">${pct(a.worst - 1, 0)}</div><div class="s">QQQ 보유 ${pct(q.worst - 1, 0)}</div></div></div>`;
  const xs = (R.points[k][h] || []).map((p) => p[0]); if (!xs.length) { cel.innerHTML = `<div class="desc">이 기간은 사례가 부족합니다.</div>`; return; }
  const ser = (kk) => { const m = Object.fromEntries(R.points[kk][h] || []); return xs.map((d) => m[d] ?? null); };
  const dep = Object.fromEntries(R.deposit[h] || []);
  const series = [...keys.map((kk) => ({type: "line", name: P[kk].name, y: ser(kk), color: css(P[kk].v), w: kk === k ? 2.2 : 1.6})),
                  {type: "line", name: P.dep.name, y: xs.map((d) => dep[d] ?? null), color: css("--dep"), dash: [5, 4], w: 1.4}];
  cel.innerHTML = `<div class="chart-cap">가로축: 투자 시작 시점 · 세로축: ${h}년 뒤 원금 대비 배수(로그 눈금) · 점선: 원금(×1)</div><div id="rollchart"></div>`;
  mkChart($("#rollchart"), {x: xs, height: 230, xfmt: (d) => ymd(d), minBars: 4,
    panes: [{log: true, fmt: (x) => "×" + (x >= 10 ? Math.round(x) : x.toFixed(1)), series, hlines: [{y: 1, label: "원금", color: css("--sub"), dash: [3, 3], fit: true}], tag: false}],
    tip: (i) => `<b>${ymd(xs[i])} 시작 → ${h}년 뒤</b>${series.map((s) => s.y[i] == null ? "" : `<div class="tr"><i style="background:${s.color}"></i>${s.name}<b>${pct(s.y[i] - 1, 0)}</b><span class="mute">연 ${pct(Math.pow(s.y[i], 1 / h) - 1)}</span></div>`).join("")}`});
}

// ── 비교 ──
const histOptions = () => [["1","가정 가격 포함"],["0","단타 상품 상장 후"]];
const fold = (id,title,summary,contents) => `<details class="card section-fold" data-fold="${id}" ${S.folds[id]?"open":""}><summary><b>${title}</b><span>${summary}</span></summary><div class="fold-body">${contents}</div></details>`;
// 8단계 성적(11-27 사용자 '성적을 자랑해야지, 표는 아무도 못 본다'): 펀드 상세처럼 한 문장 숫자 → 성장 차트 → 적립식 → 언제 시작해도 → 덜 잃음 → 단타 116번. 표는 맨 아래 접기
const CPER = [["all", "전체"], ["10", "10년"], ["5", "5년"], ["3", "3년"], ["1", "1년"]];
const eokTxt = (m) => { const v = m; return v >= 100 ? Math.round(v).toLocaleString() + "억" : v >= 1 ? (+v.toFixed(1)) + "억" : Math.round(v * 1e4).toLocaleString() + "만"; };
const wonC = (n) => eokTxt(n / 1e8) + "원";
function cmpRow(t, b, q, fmt, sub) {   // 추세+단타 / QQQ 두 막대
  const mx = Math.max(Math.abs(b || 0), Math.abs(q || 0)) || 1, w = (v) => Math.max(4, Math.abs(v || 0) / mx * 100);
  return `<div class="pf-c"><div class="pf-ct">${t}${sub ? `<small>${sub}</small>` : ""}</div>
    <div class="pf-cb"><span>${P.B.name}</span><i><b style="width:${w(b)}%;background:var(--B)"></b></i><em style="color:var(--B)">${fmt(b)}</em></div>
    <div class="pf-cb"><span>QQQ 보유</span><i><b style="width:${w(q)}%;background:#b0b8c1"></b></i><em>${fmt(q)}</em></div></div>`;
}
function openBasis() {
  sheet(`<div class="pk-t">계산 기준</div><div class="sub-h">금액</div>${seg([["krw", "원화·세후"], ["usd", "달러·세전"]], S.view, "cv")}
    <div class="pk-f">원화·세후 = 양도소득세 22%·배당 원천징수·환율 반영</div><div class="sub-h">${S.inst} 상장 전</div>${seg(histOptions(), S.assume ? "1" : "0", "ca")}
    <div class="pk-f">${S.inst} 상장 전은 나스닥100 하루 움직임 × ${({QQQM: 1, QLD: 2, TQQQ: 3})[S.inst]}배로 만든 가정 가격</div>`, (close) => {
    bindSeg("cv", (v) => { S.view = v; save(); close(); });
    bindSeg("ca", (v) => { S.assume = v === "1"; save(); close(); });
  });
}
function compare() {
  if (!needHist(() => S.tab === "compare" && render())) { $("#view").innerHTML = wait("성과를 불러오는 중입니다"); return; }
  const btn = S.assume ? "assume" : "real", bt = H.bt[btn], view = S.view, xs = H.dates.slice(bt.i0), N = xs.length;
  const vb = vals(btn, "B", view), vq = vals(btn, "qqq", view), per = CPER.some(([v]) => v === S.cper) ? S.cper : "all";
  const a = per === "all" ? 0 : Math.max(0, N - 252 * +per), sb = jstats(vb, a), sq = jstats(vq, a), yrs = (N - a) / 252;
  const sc = bt.score[view].B, scq = bt.score[view].qqq, real = H.px[S.inst]?.real_from;
  // 1) 한 문장 숫자 + 성장 차트 + 기간
  let html = `<div class="card pf-hero"><div class="pf-top"><span class="t2">${+xs[a].slice(0, 4)}년 ${+xs[a].slice(5, 7)}월부터 ${yrs >= 1 ? (+yrs.toFixed(Math.abs(yrs - Math.round(yrs)) < .06 || yrs >= 10 ? 0 : 1)) + "년" : Math.round(yrs * 12) + "개월"}</span>
      <button class="pf-basis" id="pfBasis">${view === "krw" ? "원화·세후" : "달러·세전"}<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg></button></div>
    <div class="pf-big">1억 원 → <b>${eokTxt(sb.mult)} 원</b></div>
    <div class="pf-vs">같은 기간 QQQ 보유 ${eokTxt(sq.mult)} 원</div>
    <div class="pf-kpi"><div><small>연평균</small><b style="color:var(--B)">${pct(sb.cagr)}</b><span>QQQ ${pct(sq.cagr)}</span></div>
      <div><small>최대 낙폭</small><b>${pct(sb.mdd, 0)}</b><span>QQQ ${pct(sq.mdd, 0)}</span></div></div>
    <div id="pfchart"></div>${seg(CPER, per, "cp", "sm")}</div>`;
  // 2) 적립식
  const dca = (v) => { let u = 0, put = 0, m0 = ""; for (let i = a; i < N; i++) { const m = xs[i].slice(0, 7); if (m !== m0) { m0 = m; u += 100 / v[i]; put += 100; } } return {put, end: u * v[N - 1]}; };
  const db = dca(vb), dq = dca(vq);
  html += `<div class="card pf"><div class="title">매월 100만 원 적립 투자</div><div class="t2">같은 기간 · 매월 첫 거래일 매수 기준</div>
    <div class="pf-d">${[["투자 원금", db.put * 1e4, "#d5dbe1"], ["QQQ 적립", dq.end * 1e4, "#b0b8c1"], [P.B.name, db.end * 1e4, "var(--B)"]].map(([t, v, c]) => `<div><span>${t}</span><i><b style="width:${Math.max(3, v / Math.max(db.end, dq.end, db.put) / 1e4 * 100)}%;background:${c}"></b></i><em>${wonC(v)}</em></div>`).join("")}</div>
    ${db.end > dq.end ? `<div class="pf-note">QQQ 적립 대비 <b>+${wonC((db.end - dq.end) * 1e4)}</b></div>` : ""}</div>`;
  // 3) 언제 시작해도
  const h = HSEG.some(([v]) => v === S.h) ? S.h : "5", rb = rollStats("B", h), rq = rollStats("qqq", h);
  if (rb && rq) html += `<div class="card pf"><div class="title">시작 시점별 성과</div>${seg(HSEG.map(([v, t]) => [v, t + " 보유"]), h, "h", "sm")}
    <div class="pf-big2">QQQ 대비 초과 수익 <b>${pctu(rb.beat_qqq, 0)}</b></div><div class="t2">2000년부터 시작일 ${rb.n}곳 중 ${Math.round(rb.n * rb.beat_qqq)}곳</div>
    ${cmpRow("연평균 수익률(중앙값)", rb.median_ann, rq.median_ann, (v) => pct(v))}
    ${cmpRow("최저 성과 시작일", rb.worst - 1, rq.worst - 1, (v) => pct(v, 0), "원금 대비")}</div>`;
  // 4) 덜 잃음
  html += `<div class="card pf"><div class="title">하락장 손실 비교</div>
    ${cmpRow("최대 낙폭", sb.mdd, sq.mdd, (v) => pct(v, 0), "직전 고점 대비")}
    ${per === "all" && sc.uw_days && scq.uw_days ? cmpRow("고점 회복까지 가장 오래 걸린 기간", sc.uw_days / 365.25, scq.uw_days / 365.25, (v) => v.toFixed(1) + "년") : ""}</div>`;
  // 5) 공포 단타
  html += `<div class="card pf"><div class="title">공포 단타 ${sc.sw_n}번</div><div class="pf-big2"><b>${Math.round(sc.sw_n * sc.sw_win)}번</b> 수익</div>
    <div class="pf-g"><div><small>평균 수익</small><b class="up">${pct(sc.sw_avg)}</b></div><div><small>최악 거래</small><b>${pct(sc.sw_worst)}</b></div><div><small>연평균 거래</small><b>${sc.sw_per_year.toFixed(1)}회</b></div></div>
    <div class="pf-note">보유 중 계좌 최대 평가손실 ${pct(sc.sw_acc_worst, 0)}</div>
    <button class="mk-go" id="pfTrades"><span>모든 거래 보기</span><b>›</b></button></div>`;
  // 5-1) 11-28 알림 없던 해 · 실시간 기록
  { const qy = quietYears(); if (qy.length) { const av = (k) => qy.reduce((z, x) => z + x[k], 0) / qy.length;
    html += `<div class="card pf"><div class="title">공포 단타가 없던 해 ${qy.length}번</div><div class="t2">알림이 거의 없던 해에도 200일선 위에서 QQQM을 보유했습니다</div>
      <div class="pf-g"><div><small>계좌 평균</small><b class="${cls(av("b"))}">${pct(av("b"))}</b></div><div><small>나스닥 보유 평균</small><b>${pct(av("q"))}</b></div></div>
      <div class="qy">${qy.map((x) => `<span><b>${x.y}</b><em class="${cls(x.b)}">${pct(x.b, 0)}</em><small>나스닥 ${pct(x.q, 0)}</small></span>`).join("")}</div></div>`; } }
  html += `<div class="card pf"><div class="title">실시간 기록</div><div class="t2">${ymd(D.start)}부터 보낸 알림과 가상 계좌 체결을 그대로 공개합니다</div>
    <button class="mk-go" onclick="goSub('record')"><span>실시간 기록 보기</span><b>›</b></button></div>`;
  // 6) 자세히(접기)
  const rbs = H.robust || [];
  // 11-28 '조건 변경 시 성과'는 기준값(RSI 등)이 드러나 숨김
  if (false && rbs.length) { const mx = Math.max(...rbs.map((r) => r.cagr));
    html += fold("robust", "조건 변경 시 성과", `목표·기한·RSI 기준 변경 후 재계산`, rbs.map((r, i) => `<div class="pf-rb${i === 0 ? " on" : ""}"><span>${esc(r.label)}</span><i><b style="width:${Math.max(3, r.cagr / mx * 100)}%"></b></i><em>${pct(r.cagr)}</em></div>`).join("") + `<div class="pk-f">2000년부터 연평균 · 달러·세전</div>`); }
  html += fold("sim", "기간·금액 직접 계산", "시작일과 금액을 지정해 재계산", simCard().replace(/^<div class="card">/, "<div>"))
    + fold("score", "전체 성과표", "변동성·샤프·월별 등 모든 지표", `<div id="sctable"></div>`);
  html += `<div class="foot">과거 계산이며 앞으로를 보장하지 않습니다 · 수수료 한쪽 ${feeTxt()} 반영${S.assume && real && xs[a] < real ? ` · ${ymd(real).slice(0, 4)}년 이전 ${S.inst}는 가정 가격` : ""}</div>`;
  $("#view").innerHTML = html;
  $("#pfBasis").onclick = openBasis; $("#pfTrades").onclick = () => { S.lview = "past"; go("log"); };
  bindSeg("cp", (v) => { S.cper = v; save(); render(); });
  bindSeg("h", (v) => { S.h = v; save(); render(); });
  // 성장 차트: 1억 시작, 로그 눈금(긴 기간)
  const x = xs.slice(a), yb = vb.slice(a).map((v) => v / vb[a]), yq = vq.slice(a).map((v) => v / vq[a]);
  const ef = (y) => y >= 1 ? (y >= 100 ? Math.round(y) : y >= 10 ? y.toFixed(0) : y.toFixed(1)) + "억" : Math.round(y * 1e4).toLocaleString() + "만";
  mkChart($("#pfchart"), {x, height: 220, float: true, range: [0, x.length - 1], xfmt: (d) => ymd(d), minBars: 20,
    panes: [{log: yrs > 4, fmt: ef, series: [{type: "line", name: P.B.name, y: yb, color: css("--B"), w: 2.2, fill: css("--B") + "18"}, {type: "line", name: "QQQ 보유", y: yq, color: "#b0b8c1", w: 1.6}],
      hlines: [{y: 1, label: "1억", color: css("--mute"), dash: [3, 3], fit: true}]}],
    tip: (i) => `<b>${ymd(x[i])}</b><div class="tr"><i style="background:${css("--B")}"></i>${P.B.name}<b>${eokTxt(yb[i])}</b></div><div class="tr"><i style="background:#b0b8c1"></i>QQQ 보유<b>${eokTxt(yq[i])}</b></div>`});
  const fs = $('[data-fold="sim"]'), fsc = $('[data-fold="score"]');
  const onF = (el, f) => { if (el.open) f(); el.addEventListener("toggle", () => { S.folds[el.dataset.fold] = el.open; save(); if (el.open) f(); }); };
  onF(fs, () => { if (!$("#simsum").firstChild) bindSim(); });
  onF(fsc, () => { if (!$("#sctable").firstChild) scoreTable($("#sctable"), bt.score[view], bt.score[view].dep, view); });
  const fr = $('[data-fold="robust"]'); if (fr) fr.addEventListener("toggle", () => { S.folds.robust = fr.open; save(); });
}
function bindCompare() {
  bindSeg("as", (v) => { S.assume = v === "1"; save(); render(); });
  bindSeg("vw", (v) => { S.view = v; save(); render(); });
  bindSeg("h", (v) => { S.h = v; save(); render(); });
}
// 성적표: [항목, 설명, 값, 표기, 유리한 방향(+1 높을수록, -1 낮을수록, 0 없음)]
const SC = [
  ["수익", [
    ["누적 수익률", "시작일부터 마지막 거래일까지", (s) => s.total, (v) => pct(v, 0), 1],
    ["연환산 수익률(CAGR)", "해마다 같은 비율로 불었다고 볼 때의 연 수익률", (s) => s.cagr, (v) => pct(v), 1],
    ["12개월 수익률 최고", "어느 날이든 12개월 보유 시 가장 좋았던 결과", (s) => s.best12, (v) => pct(v, 0), 1],
    ["12개월 수익률 최저", "어느 날이든 12개월 보유 시 가장 나빴던 결과", (s) => s.worst12, (v) => pct(v, 0), 1],
    ["12개월 보유 시 수익 확률", "12개월 수익률이 0%를 넘은 날의 비율", (s) => s.pos12, (v) => pctu(v, 0), 1],
    ["월간 수익 발생 비율", "수익으로 끝난 달의 비율", (s) => s.pos_month, (v) => pctu(v, 0), 1],
    ["월간 수익률 최고", "가장 좋았던 한 달", (s) => s.best_month, (v) => pct(v, 0), 1],
    ["월간 수익률 최저", "가장 나빴던 한 달", (s) => s.worst_month, (v) => pct(v, 0), 1]]],
  ["위험", [
    ["최대 낙폭(MDD)", "직전 고점 대비 가장 크게 하락한 폭", (s) => s.mdd, (v) => pct(v), 1],
    ["최대 낙폭 구간", "고점 → 저점", (s) => [s.mdd_peak, s.mdd_trough], (v) => `${v[0].slice(0, 7).replace("-", ".")}<br>→${v[1].slice(0, 7).replace("-", ".")}`, 0],
    ["최대 낙폭 회복", "고점을 다시 넘은 날", (s) => s.mdd_recover, (v) => v ? v.slice(0, 7).replace("-", ".") : "미회복", 0],
    ["최장 고점 회복 기간", "고점 아래에 머문 가장 긴 기간", (s) => s.uw_days, (v) => months(v), -1],
    ["연환산 변동성", "일간 수익률 표준편차의 연환산 값", (s) => s.vol, (v) => pctu(v), -1]]],
  ["위험 대비 수익", [
    ["샤프 지수", "변동성 1단위당 무위험 금리 초과 수익(예금·단기국채 기준)", (s) => s.sharpe, (v) => num(v), 1],
    ["소르티노 지수", "하락 변동성만 위험으로 볼 때의 샤프 지수", (s) => s.sortino, (v) => num(v), 1],
    ["칼마 비율", "연환산 수익률 ÷ 최대 낙폭", (s) => s.calmar, (v) => num(v), 1],
    ["상승장 수익 반영률", "QQQ 상승월 평균 수익 대비 반영 비율", (s) => s.up_capture, (v) => pctu(v, 0), 1, "기준"],
    ["하락장 손실 반영률", "QQQ 하락월 평균 손실 대비 반영 비율(낮을수록 방어)", (s) => s.down_capture, (v) => pctu(v, 0), -1, "기준"],
    ["QQQ 대비 월간 초과 비율", "QQQ보다 수익률이 높았던 달의 비율", (s) => s.beat_qqq_months, (v) => pctu(v, 0), 1, "기준"]]],
  ["보유 구성", [
    ["평균 QQQM 비중", "", (s) => s.avg_qqqm, (v) => pctu(v, 0), 0],
    ["평균 현금성 비중", "단기국채·현금(QQQ 보유는 배당금)", (s) => s.avg_cash, (v) => pctu(v, 0), 0],
    ["평균 금·국채 비중", "자산배분 모델", (s) => s.avg_other, (v) => pctu(v, 0), 0],
    ["평균 단타 상품 비중", "공포 단타", (s) => s.avg_tqqq, (v) => pctu(v, 1), 0],
    ["현금성 50% 이상 보유 기간", "전체 거래일 중 비율", (s) => s.days_cash50, (v) => pctu(v, 0), 0],
    ["최장 연속 현금성 보유", "현금성 50% 이상이 이어진 가장 긴 기간", (s) => s.longest_cash50_days, (v) => months(v), 0],
    ["단타 상품 보유 기간", "전체 거래일 중 비율", (s) => s.days_tqqq, (v) => pctu(v, 1), 0]]],
  ["공포 단타", [
    ["완료 거래", "", (s) => s.sw_n, (v) => v + "회", 0],
    ["연평균 거래", "", (s) => s.sw_per_year, (v) => v.toFixed(1) + "회", 0],
    ["승률", "수익으로 끝난 거래 비율", (s) => s.sw_win, (v) => pctu(v, 0), 1],
    ["거래 평균 수익률", "수수료 반영", (s) => s.sw_avg, (v) => pct(v), 1],
    ["거래 중앙 수익률", "", (s) => s.sw_med, (v) => pct(v), 1],
    ["거래 최대 수익", "", (s) => s.sw_best, (v) => pct(v), 1],
    ["거래 최대 손실", "", (s) => s.sw_worst, (v) => pct(v), 1],
    ["평균 보유 거래일", "1차 매수부터 전량 매도까지", (s) => s.sw_hold, (v) => v.toFixed(1) + "일", 0],
    ["평균 매수 차수", "", (s) => s.sw_lots, (v) => v.toFixed(1) + "차", 0]]]];
function scHead(keys) { return `<div class="scg-h"><span></span>${keys.map((k) => `<b style="color:${col(k)}">${P[k].name}</b>`).join("")}</div>`; }
function scRow(name, desc, vs, fmt, dir, qbase) {
  const nums = vs.map((v) => typeof v === "number" && isFinite(v) ? v : null), ok = nums.filter((v) => v != null);
  const same = ok.length > 1 && ok.every((v) => Math.abs(v - ok[0]) < 1e-9), best = dir && ok.length > 1 && !same ? (dir > 0 ? Math.max(...ok) : Math.min(...ok)) : null;
  return `<div class="scr"><div class="nm">${name}${desc ? ` <span class="ds">${desc}</span>` : ""}</div><div class="vals">${vs.map((v, i) => `<span class="${nums[i] != null && nums[i] === best ? "best" : ""}">${v == null ? (qbase && i === vs.length - 1 ? qbase : "-") : fmt(v)}</span>`).join("")}</div></div>`;
}
function scoreTable(el, sc, dep, view) {
  const keys = [...ORDER, "qqq"];
  let t = `<div class="scg">${scHead(keys)}`;
  SC.forEach(([sec, rows]) => {
    t += `<div class="scs">${sec}</div>`;
    rows.forEach(([name, desc, f, fmt, dir, qbase]) => {
      const vs = keys.map((k) => { try { const v = f(sc[k]); return v == null || (Array.isArray(v) && v.some((x) => x == null)) ? null : v; } catch (e) { return null; } });
      t += scRow(name, desc, vs, fmt, dir, qbase);
    });
  });
  t += `</div><div class="t2" style="margin-top:8px">같은 기간 예금(세후, ${view === "krw" ? "한국 3개월 금리 기준" : "미국 3개월 국채 기준"}): 누적 ${pct(dep.total, 0)}, 연환산 ${pct(dep.cagr)}.</div>`;
  el.innerHTML = t;
}
function rollTable(el, h) {
  const keys = [...ORDER, "qqq"], st = Object.fromEntries(keys.map((k) => [k, rollStats(k, h)]));
  if(keys.some(k=>!st[k])) { el.innerHTML=wait("시작일별 비교 자료를 계산 중입니다"); return; }
  const rows = [["사례 수", "", (s) => s.n, (v) => v + "개", 0], ["예금 금리 초과 비율", "", (s) => s.beat_deposit, (v) => pctu(v, 0), 1], ["QQQ 보유 대비 초과 비율", "", (s) => s.beat_qqq, (v) => pctu(v, 0), 1, "기준"],
    ["연환산 수익률(중앙값)", "", (s) => s.median_ann, (v) => pct(v), 1], ["최고 결과", "원금 대비", (s) => s.best - 1, (v) => pct(v, 0), 1], ["최저 결과", "원금 대비", (s) => s.worst - 1, (v) => pct(v, 0), 1],
    ["원금 손실로 끝난 비율", "", (s) => s.loss, (v) => pctu(v, 0), -1], ["보유 중 원금 -10% 하회 경험", "", (s) => s.dd10, (v) => pctu(v, 0), -1], ["보유 중 원금 대비 최저", "", (s) => s.worst_low, (v) => pct(v, 0), 1]];
  el.innerHTML = `<div class="scg">${scHead(keys)}${rows.map(([n, d, f, fmt, dir, qb]) => scRow(n, d, keys.map((k) => k === "qqq" && qb ? null : f(st[k])), fmt, dir, qb)).join("")}</div>`
    + (st.B.beat_deposit === 1 ? `<div class="t2" style="margin-top:6px">${h}년 보유 시에는 모든 사례에서 예금 금리를 넘었습니다. 차이는 최저 결과와 보유 중 하락 폭에서 나타납니다.</div>` : "");
}

// ── 할 일 ──
const WHY = [
  ["목표가", "목표가 매도", "평균 매수단가 대비 고른 종목의 목표 수익률에 지정가로 전량 매도합니다. 공포 구간 직후의 단기 반등 폭을 노리는 규칙이며, 주문은 체결될 때까지 유지(GTC)합니다."],
  ["보유기한", "보유 기한 매도", "마지막 매수일로부터 10거래일 안에 목표가에 도달하지 못하면 손익과 관계없이 기한일 장 마감에 전량 매도합니다. 반등이 늦어질 때 레버리지 상품을 오래 보유하면 생기는 변동성 손실을 막기 위한 규칙입니다."],
  ["전일 종가 지정가", "신규 매수(전일 종가 지정가)", "매수 조건이 모두 충족된 채 마감했습니다. 다음 거래일에 전일 종가 이하에서 체결되도록 한 묶음(내 설정 비중, 느린 하락이면 절반)을 지정가 매수합니다."],
  ["RSI30 지정가", "신규 매수(과매도 지정가)", "공포 구간이지만 아직 충분히 과매도되지 않았습니다. QQQ가 과매도 가격까지 내려와야 체결되도록 그 가격을 이 종목 가격으로 환산해 지정가 매수합니다."],
  ["RSI26 지정가", "신규 매수(대기 지정가)", "공포 구간이 아닐 때는 더 낮은 가격에서만 체결되도록 대기 주문을 겁니다."],
  ["단타 자금 마련", "단타 자금 마련 매도", "200일선 위라 현금이 없을 때, 단타 매수에 쓸 만큼 QQQM을 장 시작에 시가로 매도합니다. 단타 매수와 같이 장 시작 전에 걸어 두면 됩니다. 단타가 체결되지 않으면 그 돈은 현금으로 두고, 단타가 끝나거나 체결이 없으면 10거래일 뒤 QQQM을 다시 매수합니다."],
  ["대기자금 매도", "대기자금 매도", "추세 매수(QQQM)에 쓸 자금을 마련하기 위해 대기 중인 단기국채를 매도합니다."],
  ["추세 매수", "추세 매수", "QQQ가 200일 이동평균선 위로 확실히 올라서 상승 추세로 전환되었습니다. 다음 거래일에 QQQM을 목표 비중까지 매수합니다(전일 종가 +2% 이내 지정가)."],
  ["추세 매도", "추세 매도", "QQQ가 200일 이동평균선 아래로 확실히 내려가 하락 추세로 전환되었습니다. 다음 거래일에 QQQM을 매도하고 단기국채로 대기합니다(전일 종가 -2% 이내 지정가)."],
  ["단기국채 매수", "단기국채 매수", "하락 추세 구간에는 주식 대신 단기국채(SGOV)로 이자를 받으며 대기합니다."],
  ["자산배분 리밸런싱", "자산배분 리밸런싱", "안정형의 자산배분 모델(계좌의 50%)이 목표 비중을 바꿨습니다. 전일 종가 ±2% 이내 지정가로 비중을 조정합니다."]];
const whyOf = (how) => WHY.find(([k]) => String(how).startsWith(k)) || [how, how, ""];
// 과거 체결 기록의 사유(봇 내부 이름) → 표시 이름
const TRADE_WHY = {"목표가": "목표가 매도", "보유 기한": "보유 기한 매도", "시가 익절": "시가 매도(목표가 이상 출발)", "종가 지정가": "전일 종가 지정가 매수", "RSI30 지정가": "과매도 지정가 매수",
  "RSI26 지정가": "대기 지정가 매수", "마감": "장 마감 매수(시간외)", "예비": "예비 매수", "급락": "급락 예외 매수", "추세 위: QQQM": "추세 매수(QQQM)", "추세 아래: 대기": "추세 매도(단기국채 대기)",
  "단타 끝, 자산배분 되사기": "단타 종료 후 재매수", "남는 돈 맞추기": "잔여 자금 재배분", "자산배분": "자산배분 리밸런싱", "단타 자금 마련": "단타 자금 마련 매도"};
const tw = (w) => TRADE_WHY[w] || w;
// 5단계 할 일(11-27): 증권사 앱에 주문 넣는 순서(구분·종목 → 주문 유형 → 가격 → 수량 → 주문 시간) 그대로, 가격·수량은 눌러서 복사
let toastT = null;
function toast(t) {
  let el = $("#toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 1400);
}
async function copyTxt(v, label) {
  try { await navigator.clipboard.writeText(v); toast(`${label} ${v} 복사됨`); }
  catch (e) { const ta = document.createElement("textarea"); ta.value = v; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(`${label} ${v} 복사됨`); } catch (e2) { toast("복사하지 못했습니다"); } ta.remove(); }
}
const CP = `<svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 5.5h-8a2 2 0 00-2 2v8"/></svg>`;
function todo() {
  if (!eduOn()) { $("#view").innerHTML = eduLock("주문표"); return; }
  const k = S.prof, a = D.accounts[k], plan = a.plan || {};
  const f = myAmt() && D.usdkrw && a.equity_usd ? myAmt() / (a.equity_usd * D.usdkrw) : null;
  const cashText = String(S.cashUsd || "").replace(/,/g, "").trim(), cash = Number(cashText);
  let buyingCash = cashText && Number.isFinite(cash) && cash >= 0 ? cash : null;
  const hold = (plan.hold || []).length > 0;
  const currentAfter = (plan.after || []).filter((o) => Date.parse(o.expires_at) > Date.now());
  const os = [...currentAfter, ...(plan.swing || []), ...(plan.alloc || [])].filter((o) => o.qty > 0);
  // 11-27 밤 사용자 '알림을 누르면 자료를 보고 판단할 화면으로' → 할 일 맨 위에 근거 카드(공포·탐욕 · 조건 n/4 · 과거 같은 매수 성적 · 차트 바로 가기)
  const sgw = plan.signals || {}, fgw = sgw.fg, roomw = sgw.room ?? (sgw.max_regular_lots || 5), nmw = [sgw.fear, sgw.band, sgw.rsi == null ? null : sgw.rsi < 30, roomw > 0].filter((c) => c === true).length;
  const scw = H?.bt?.assume?.score?.krw?.B; if (!H) needHist(() => S.tab === "todo" && render());
  const whyCard = `<div class="card tw"><div class="tw-g"><div><small>공포·탐욕</small><b style="color:${fgw == null ? "var(--ink)" : fgCol(fgw)}">${fgw == null ? "-" : Math.round(fgw)}</b></div>
      <div><small>매수 조건</small><b>${nmw}/4</b></div><div><small>과거 같은 매수</small><b>${scw ? `${Math.round(scw.sw_n * scw.sw_win)}/${scw.sw_n}` : "…"}</b></div></div>
    <div class="tw-s">${scw ? `과거 공포 단타 ${scw.sw_n}번 중 ${Math.round(scw.sw_n * scw.sw_win)}번 수익 · 평균 ${pct(scw.sw_avg)}` : "과거 성과를 불러오는 중입니다"}</div>
    <div class="tw-b"><button data-twg="signal">조건 자세히</button><button data-twg="log">차트로 확인</button></div></div>`;
  let html = whyCard + `<div class="card td-h"><div><div class="title">주문 ${os.length}건</div><div class="t2">${D.next_session ? openKst(D.next_session) + " 개장" : "다음 개장 확인 중"} · ${ymd(D.last_close).slice(5)} 종가 기준</div></div>
    <button class="td-amt" id="orderSize"><small>수량 기준</small>${f ? won(myAmt()) : "가상 계좌"}<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button></div>`;
  if (hold) html += `<div class="card"><div class="alert" style="margin:0"><b>주문 보류</b><br>${esc(plan.hold.join(" · "))}</div></div>`;
  if (!os.length) html += `<div class="card td-empty"><div class="title">예정된 주문이 없습니다</div><div class="t2">장 마감 뒤 새 주문이 생기면 알림이 옵니다</div>${WEB && PUSHST === "off" ? `<button class="btn blue" id="todoPush">알림 받기</button>` : ""}</div>`;
  os.forEach((o, i) => {
    const [, title, theory] = whyOf(o.how), buy = o.side === "buy", q = LQ[o.symbol];
    const planned = f ? Math.floor(o.qty * f) : o.qty, unit = o.limit * (1 + Number(S.fee));
    const mine = buy && f && buyingCash !== null && unit > 0 ? Math.min(planned, Math.floor(buyingCash / unit)) : planned;
    if (buy && f && buyingCash !== null && unit > 0) buyingCash = Math.max(0, buyingCash - mine * unit);
    const px = o.limit ? o.limit.toFixed(2) : null;
    const when = `${ymd(o.session).slice(5)}${o.expires_at ? " 오늘" : ""} · ${esc(o.until)}`;
    html += `<div class="card tk ${o.side}"><div class="tk-h"><span class="badge ${buy ? "b" : "s"}">${buy ? "매수" : "매도"}</span><b>${esc(o.symbol)}</b><span class="tk-w">${esc(title.match(/\((.+)\)$/)?.[1] || title.replace(/ 매도$/, ""))}</span></div>
      <div class="tk-g">
        <div><span>주문 유형</span><b>${o.limit ? "지정가" : "시장가"}</b></div>
        <div><span>가격</span>${px ? `<b class="tk-big">$${px}</b><button class="tk-cp" data-cp="${px}" data-cl="가격" aria-label="가격 복사">${CP}</button>` : `<b>${o.how === "단타 자금 마련" ? "시가" : "장 마감 전"}</b>`}</div>
        <div><span>수량</span>${hold ? `<b>보류</b>` : `<b class="tk-big">${mine.toLocaleString()}주</b><button class="tk-cp" data-cp="${mine}" data-cl="수량" aria-label="수량 복사">${CP}</button>`}</div>
        <div><span>주문 시간</span><b>${when}</b></div>
        ${px && !hold ? `<div><span>예상 금액</span><b>${usd2(mine * o.limit)}</b></div>` : ""}
      </div>
      ${mine < planned && !hold ? `<div class="t2">계획 ${planned}주 중 주문 가능 달러 한도만큼</div>` : ""}
      ${!o.limit ? `<div class="t2">${o.how === "단타 자금 마련" ? "장 시작 시가로 매도합니다 · 단타가 체결되지 않아도 현금으로 둡니다" : "목표가 매도 주문을 취소한 뒤 넣습니다"}</div>` : ""}
      ${q && o.limit ? `<div class="tk-q">현재가 ${usd2(q.c)} · 주문가까지 <b class="${cls(o.limit / q.c - 1)}">${pct(o.limit / q.c - 1)}</b></div>` : ""}
      <details class="more"><summary>왜 이 주문인가</summary><div class="desc">${theory || esc(title)}</div></details></div>`;
  });
  html += `<div class="foot">실제 체결과 잔고는 증권사에서 확인하십시오.</div>`;
  $("#view").innerHTML = html;
  $("#orderSize").onclick = openAmt;
  document.querySelectorAll("[data-twg]").forEach((b) => b.onclick = () => { if (b.dataset.twg === "log") { S.lsym = S.inst; S.lrange = "6m"; save(); } go(b.dataset.twg); });
  if ($("#todoPush")) $("#todoPush").onclick = openBell;
  document.querySelectorAll("[data-cp]").forEach((b) => b.onclick = () => copyTxt(b.dataset.cp, b.dataset.cl));
}
// ── 기록(차트) ──
const LSYM = [["TQQQ", "TQQQ"], ["QLD", "QLD"], ["QQQ", "QQQ"], ["QQQM", "QQQM"], ["ACC", "계좌"]];
const LR = [["1d", "1일"], ["5d", "1주"], ["1m", "1개월"], ["3m", "3개월"], ["6m", "6개월"], ["1y", "1년"], ["5y", "5년"], ["all", "전체"]];
const BARS = {"1m": 21, "3m": 63, "6m": 126, "1y": 252, "5y": 1260, all: 1e9};
const NAMES = {TQQQ: "TQQQ · 나스닥100 일간 3배", QLD:"QLD · 나스닥100 일간 2배", QQQ: "QQQ · 나스닥100", QQQM: "QQQM · 나스닥100(저보수)", ACC: "계좌 평가금액"};
let logChart = null, sigChart = null;
function log() {   // 6단계(11-27): 종목 상세처럼 가격 → 차트 → 기간, 아래는 거래 내역 목록(과거 시험 / 가상 계좌)
  let html = `<div class="card lg-c">${seg(LSYM, S.lsym, "ls", "sm")}<div id="qhead"></div>
    <div id="logchart"></div>
    <div class="lg-ctl">${seg(LR, S.lrange, "lr", "sm lg-r")}${S.lsym !== "ACC" ? `<button class="lg-t" id="ltBtn">${S.ltype === "line" ? "라인" : "캔들"}</button>` : ""}</div>
    <div class="lg-leg" id="logcap"></div></div><div id="rounds"></div>`;
  $("#view").innerHTML = html;
  bindSeg("ls", (v) => { S.lsym = v; save(); render(); });
  bindSeg("lr", (v) => { S.lrange = v; save(); render(); });
  if ($("#ltBtn")) $("#ltBtn").onclick = () => { S.ltype = S.ltype === "line" ? "candle" : "line"; save(); render(); };
  if (!needHist(() => S.tab === "log" && render())) { $("#logchart").innerHTML = wait("차트 자료를 불러오는 중입니다"); return; }
  drawLog(); liveTick();
  const k = S.prof, bt = H.bt[S.assume ? "assume" : "real"], rounds = (bt.acc[k].rounds || []).slice().reverse(), done = rounds.filter((r) => r.ret != null);
  const lt = (D.accounts[k].trades || []).slice().reverse(), lv = S.lview === "acc" ? "acc" : "past";
  let body;
  if (lv === "acc") {
    body = lt.length ? lt.map((t) => `<div class="tr-row"><div class="tr-l"><b><span class="badge ${t.side === "buy" ? "b" : "s"}">${t.side === "buy" ? "매수" : "매도"}</span> ${esc(t.symbol)}</b><small>${ymd(t.date).slice(2)} · ${esc(tw(t.why))}</small></div>
      <div class="tr-r"><b>${usd2(t.price)}</b><small>${t.qty.toLocaleString()}주</small></div></div>`).join("") : `<div class="desc tr-none">아직 체결 내역이 없습니다.</div>`;
  } else {
    const years = [...new Set(rounds.map((r) => r.buys[0].d.slice(0, 4)))], shown = S.year === "all" ? rounds : rounds.filter((r) => r.buys[0].d.startsWith(S.year));
    body = `<div class="tr-f"><select id="yr"><option value="all">전체 연도</option>${years.map((y) => `<option ${S.year === y ? "selected" : ""}>${y}</option>`).join("")}</select>${seg(histOptions(), S.assume ? "1" : "0", "as", "sm")}</div>`
      + (shown.map((r, j) => { const ex = r.buys.some((b) => b.how === "급락");
        return `<button class="tr-row" data-rd="${j}"><div class="tr-l"><b>${ymd(r.buys[0].d).slice(2)} → ${r.sell ? ymd(r.sell.d).slice(5) : "보유 중"}</b>
          <small>${r.buys.length}회 매수${r.sell ? " · " + esc(tw(r.sell.why)) : ""}${ex ? ` <em class="tr-ex">급락 예외</em>` : ""}</small></div>
          <div class="tr-r"><b class="${cls(r.ret)}">${r.ret == null ? "진행 중" : pct(r.ret)}</b></div></button>`; }).join("") || `<div class="desc tr-none">해당 연도에는 거래가 없었습니다.</div>`);
    window._rounds = shown;
  }
  $("#rounds").innerHTML = `<div class="card tr-c">${seg([["past", `과거 거래 ${done.length}번`], ["acc", `가상 계좌 체결 ${lt.length}건`]], lv, "lv")}
    ${lv === "past" ? `<div class="tr-sum">수익 ${done.filter((r) => r.ret > 0).length}번 · 손실 ${done.filter((r) => r.ret <= 0).length}번 · 눌러서 차트로 보기</div>` : `<div class="tr-sum">${ymd(D.start)}부터 가상 계좌</div>`}${body}</div>`;
  bindSeg("lv", (v) => { S.lview = v; save(); render(); });
  bindSeg("as", (v) => { S.assume = v === "1"; save(); render(); });
  if ($("#yr")) $("#yr").onchange = (e) => { S.year = e.target.value; save(); render(); };
  document.querySelectorAll("[data-rd]").forEach((tr) => tr.onclick = () => {
    const r = window._rounds[+tr.dataset.rd]; S.lsym = S.inst; S.lrange = "3m"; save();
    const di = H.dates.indexOf(r.buys[0].d), dj = r.sell ? H.dates.indexOf(r.sell.d) : H.dates.length - 1;
    render(); if (logChart) logChart.setRange(di - 25, dj + 15); window.scrollTo({top: 0, behavior: "smooth"});
  });
}
function qhead(sym, bar, intraday) {
  const el = $("#qhead"); if (!el) return;
  if (!bar) { el.innerHTML = ""; return; }
  const ch = bar.c - bar.prev, live = bar.time && nyDate(bar.time) === bar.day && Date.now() / 1000 - bar.time < 1800;
  el.innerHTML = `<div class="qh"><div class="t2">${NAMES[sym]}</div><div class="qp">${usd2(bar.c)}</div>
    <div class="${cls(ch)} t1">${ch >= 0 ? "▲" : "▼"} ${usd2(Math.abs(ch)).slice(1)} (${pct(ch / bar.prev, 2)})</div>
    <div class="t2">${bar.time ? `${live ? '<span class="livedot"></span>실시간 · ' : ""}${kst(bar.time)} KST 기준` : `${ymd(bar.day)} 종가`} · 전일 종가 ${usd2(bar.prev)}</div></div>`;
}
function drawLog() {
  const sym = S.lsym, k = S.prof, intraday = S.lrange === "1d" || S.lrange === "5d";
  const cap = $("#logcap"), el = $("#logchart");
  if (intraday && sym !== "ACC") { drawIntraday(sym); return; }
  const n0 = H.dates.length; let x = H.dates.slice(), price;
  const vix = H.vix.c.slice(), fg = H.fg.slice(), bt=H.bt[S.assume ? "assume" : "real"]; let rounds_ = [];
  const rsi = (H.rsi || []).slice(), rhi = (H.rsi_hi || []).slice(), rlo = (H.rsi_lo || []).slice(), qdd = (H.qdd || []).slice();
  if (sym === "ACC") {
    const v = Array(n0).fill(null), q = Array(n0).fill(null);
    bt.acc[k].krw.forEach((y, i) => v[bt.i0 + i] = y); bt.acc.qqq.krw.forEach((y, i) => q[bt.i0 + i] = y);
    const b0 = v[bt.i0], q0 = q[bt.i0]; for (let i = 0; i < n0; i++) { if (v[i] != null) v[i] /= b0; if (q[i] != null) q[i] /= q0; }
    price = {pane: {log: S.lrange === "all" || S.lrange === "5y", fmt: (y) => "×" + (y >= 10 ? Math.round(y) : y.toFixed(2)), h: 3,
      series: [{type: "line", name: P[k].name, y: v, color: css(P[k].v), w: 2}, {type: "line", name: P.qqq.name, y: q, color: css("--Q"), w: 1.4}],
      vbands: bt.acc[k].swing.map(([a, b]) => ({i0: bt.i0 + a, i1: bt.i0 + b, color: css("--tq") + "40"}))}};
    qhead(sym, null);
  } else {
    const px = H.px[sym]; const o = px.o.slice(), h = px.h.slice(), l = px.l.slice(), c = px.c.slice(); const tb = LQ[sym];
    if (tb && tb.day > H.last) { x.push(tb.day); o.push(tb.o); h.push(tb.h); l.push(tb.l); c.push(tb.c); vix.push(LQ["^VIX"] ? LQ["^VIX"].c : null); fg.push(LQ.FG ? LQ.FG.v : null); }
    qhead(sym, tb || {day: H.last, c: c[c.length - 1], prev: c[c.length - 2]});
    // 11-27 사용자 '5번 샀다는데 4번으로 보임': 같은 날 같은 가격 묶음(마감 2묶음 등)이 한 표시로 겹쳤음 → 하루·방향별로 한 표시 + 묶음 수 숫자, 값 칸엔 가격별로.
    // 시험 기록과 가상 계좌 기록에 같은 매매가 둘 다 있을 수 있어 출처별로 세고 큰 쪽을 씀.
    const di = Object.fromEntries(x.map((d, i) => [d, i])), mk = [], byDay = {}, cnt = {};
    const addT = (d, side, s, p, why, src, w) => { if (s !== sym || di[d] == null) return;
      const kd = d + side, kp = kd + "|" + p, c = (cnt[kp] = cnt[kp] || {n: 0, why}); c[src] = (c[src] || 0) + 1; c.n = Math.max(c.n, c[src]); if (w != null) c.w = w;
      let m = byDay[kd]; if (!m) { m = byDay[kd] = {i: di[d], y: side === "b" ? l[di[d]] ?? p : h[di[d]] ?? p, kind: side === "b" ? "buy" : "sell", rows: {}}; mk.push(m); }
      m.rows[p] = c; m.p = p; m.why = why; if (why === "급락") m.color = "#f08a00"; m.y = side === "b" ? Math.min(m.y, p) : Math.max(m.y, p);
      const tot = Object.values(m.rows).reduce((z, r) => z + r.n, 0); m.label = side === "b" && tot > 1 ? String(tot) : ""; };
    // 11-27: 보고 있는 차트 종목(QQQ·QLD·TQQQ)의 모델 기록으로 매수·매도 표시(예전엔 고른 단타 상품 것만 → TQQQ 외엔 표시 없음)
    const own = PRODUCTS[sym] ? (sym === "TQQQ" ? rawHist : rawHist?.variants?.[sym]) : null;
    const sbt = own?.bt?.[S.assume ? "assume" : "real"] || bt;
    const sacc = PRODUCTS[sym] ? ((sym === "TQQQ" ? rawData?.accounts : rawData?.variants?.[sym]?.accounts) || D.accounts) : D.accounts;
    // 11-28: 200일선(추세) 매매는 QQQ 차트에만 → 여기서는 단타 매매만(QQQM 차트에 추세·되사기·자금 마련 표시 안 함)
    const swOnly = (why) => !/^(추세|남는 돈|단타 끝|단타 자금|시작 기준)/.test(String(why || ""));
    sbt.acc[k].trades.forEach((t) => swOnly(t[5]) && addT(t[0], t[1], t[2], t[3], t[5], "bt", t[7]));
    (sacc[k]?.trades || []).forEach((t) => swOnly(t.why) && addT(t.date, t.side[0], t.symbol, t.price, t.why, "acc", t.info?.w));
    const plan = sacc[k]?.plan || {}, sell = (plan.swing || []).find((z) => z.how === "목표가" && z.symbol === sym);
    const vb = own ? sbt.acc[k].swing.map(([a, b]) => ({i0: sbt.i0 + a, i1: sbt.i0 + b, color: css("--tq") + "26"})) : [];
    // 11-28 사용자 '200일선 매매는 QQQ 차트에만(신호 판단이 QQQ, TQQQ·QLD 는 200일선과 무관)' → QQQ 차트에 200일선 + 매수·매도 마름모 + 현금 대기 회색
    let ma200 = null;
    if (sym === "QQQ") { let off = null, sum = 0; ma200 = c.map((v, i) => { sum += v; if (i >= 200) sum -= c[i - 200]; return i >= 199 ? sum / 200 : null; });
      sbt.acc[k].trades.filter((t) => t[2] === "QQQM" && /^추세 (위|아래)/.test(t[5])).forEach((t) => { const i = di[t[0]]; if (i == null) return; const buy = t[1] === "b";
        mk.push({i, y: buy ? l[i] : h[i], kind: buy ? "buy" : "sell", shape: "dia", color: buy ? "#0ca678" : "#8b95a1", trend: true, rows: {}});
        if (!buy) off = i; else if (off != null) { vb.push({i0: off, i1: i, color: "#8b95a126"}); off = null; } });
      if (off != null) vb.push({i0: off, i1: x.length - 1, color: "#8b95a126"}); }
    rounds_ = (sbt.acc[k].rounds || []);
    price = {pane: {h: 3, log: S.lrange === "all" || S.lrange === "5y", fmt: (y) => "$" + (y >= 100 ? y.toFixed(0) : y.toFixed(2)),
      series: [{type: S.ltype === "line" ? "line" : "candle", name: sym, o, h, l, c, y: c, color: css("--ink"), w: 1.6},
        ...(ma200 ? [{type: "line", name: "200일선", y: ma200, color: css("--B"), w: 1.6}] : [])],
      markers: mk, vbands: vb, hlines: sell ? [{y: sell.limit, label: `목표가 ${usd2(sell.limit)}`, color: css("--up"), dash: [6, 4]}] : []}, mk};
  }
  const N = x.length, rg = BARS[S.lrange] || 126, real = sym !== "ACC" ? H.px[sym].real_from : null;
  const tip = (i) => {
    let s = `<b>${ymd(x[i])}${i >= n0 ? " (장중)" : ""}</b>`;
    if (sym === "ACC") price.pane.series.forEach((z) => { s += `<div class="tr"><i style="background:${z.color}"></i>${z.name}<b>${xmult(z.y[i])}</b></div>`; });
    else { const z = price.pane.series[0], pc = z.c[i - 1]; if (pc) s += ` <span class="${cls(z.c[i] - pc)}">전일 대비 ${pct(z.c[i] / pc - 1, 2)}</span>`;
      s += `<div class="g4"><span>시가</span><b>${usd2(z.o[i])}</b><span>고가</span><b class="up">${usd2(z.h[i])}</b><span>저가</span><b class="down">${usd2(z.l[i])}</b><span>종가</span><b>${usd2(z.c[i])}</b></div>`;
      if (real && x[i] < real) s += `<div class="warn">상장 전 가정 가격</div>`;
      price.mk.filter((m) => m.i === i && m.trend).forEach((m) => { s += `<div style="color:${m.color}">◆ ${m.kind === "buy" ? "200일선 위 · QQQM 매수" : "200일선 아래 · 매도 후 " + waitWord()}</div>`; });
      price.mk.filter((m) => m.i === i && !m.trend).forEach((m) => Object.entries(m.rows).forEach(([p, r]) => { s += `<div class="${m.kind === "buy" ? "up" : "down"}">${m.kind === "buy" ? "▲ 매수" : "▼ 매도"} ${usd2(+p)}${r.n > 1 ? ` × ${r.n}묶음` : ""}${m.kind === "buy" && r.w != null ? ` (${r.n > 1 ? "각 " : ""}${lotWord(r.w)})` : ""} · ${esc(tw(r.why))}</div>`; })); }
    s += `<div class="t2">VIX ${num(vix[i], 1)} · 공포탐욕 ${fg[i] != null ? Math.round(fg[i]) : "-"}</div>`;
    if (i < n0 && rsi[i] != null) s += `<div class="t2">RSI 마감 ${num(rsi[i], 1)} · 장중 ${num(rlo[i], 1)}~${num(rhi[i], 1)} · QQQ 고점 대비 ${pct(qdd[i])}</div>` + buyWhy(i);
    return s;
  };
  // 11-27 사용자: '저점 같은데 왜 안 샀지?' — 그날 마감 판정(다음 날 주문)을 툴팁에 한 줄로
  const [B0_, B1_] = H.band || [-0.10, -0.25], capN = H.cap || 5;
  function buyWhy(i) {
    const f = (vix[i] != null && vix[i] >= 30) || (fg[i] != null && fg[i] <= 30), inb = qdd[i] != null && qdd[i] <= B0_ && qdd[i] >= B1_;
    const d = x[i], r = rounds_.find((z) => z.buys[0].d <= d && (!z.sell || z.sell.d >= d)), bb = r ? r.buys.filter((b) => b.d <= d) : [], held = bb.reduce((z, b) => z + (b.sig?.w != null ? b.sig.w / (S.lot / 100) : 1), 0);
    const ok = (t, v) => `<span class="${v ? "up" : "mute"}">${t} ${v ? "충족" : "아님"}</span>`;
    return `<div class="t2">마감 판정: ${ok("공포", f)} · ${ok("하락 폭", inb)} · ${ok("과매도", rsi[i] < 30)}${sym !== "ACC" && held ? ` · ${bb.length}회 매수 · ${+held.toFixed(1)}/${capN}묶음어치${held >= capN - 1e-6 ? " 다 참" : ""}` : ""}</div>`;
  }
  const pad = (a) => { while (a.length < N) a.push(null); return a; }; pad(rsi); pad(rhi); pad(rlo); pad(qdd);
  logChart = mkChart(el, {x, height: 540, range: [N - Math.min(rg, N), N - 1], xfmt: (d) => ymd(d), tip,
    panes: [price.pane,
      {h: 1, fmt: (y) => y.toFixed(0), fix: [20, 80], series: [{type: "line", name: "QQQ RSI(마감)", y: rsi, color: css("--ink"), w: 1.3}],
        bands: [{ya: rhi, yb: rlo, color: css("--B") + "40"}]},
      {h: 1, fmt: (y) => y.toFixed(0), series: [{type: "line", name: "VIX", y: vix, color: css("--warn"), w: 1.3}]},
      {h: 1, fmt: (y) => y.toFixed(0), fix: [0, 100], series: [{type: "line", name: "공포탐욕지수", y: fg, color: css("--B"), w: 1.3}]}]});
  cap.innerHTML = sym === "ACC" ? `<span><i style="background:${css(P[k].v)}"></i>${P[k].name}</span><span><i style="background:${css("--Q")}"></i>QQQ 보유</span><span><i class="sq" style="background:${css("--tq")}40"></i>단타 보유</span><span class="mute">2000년=1 배수</span>`
    : `${sym !== "QQQ" ? `<span><b class="up">▲</b>매수</span><span><b style="color:#f08a00">▲</b>급락 예외 매수</span><span><b class="down">▼</b>매도</span>` : ""}${sym === "QQQ" ? `<span><i style="background:var(--B)"></i>200일선</span><span><b style="color:#0ca678">◆</b>200일선 매수</span><span><b style="color:#8b95a1">◆</b>200일선 매도</span><span><i class="sq" style="background:#8b95a140"></i>현금 대기</span>` : ""}${sym === S.inst ? `<span><i class="sq" style="background:${css("--tq")}26"></i>단타 보유</span>` : ""}${real && real > H.dates[0] ? `<span class="mute">${ymd(real).slice(0, 4)}년 이전 가정 가격</span>` : ""}`;
}
async function drawIntraday(sym) {
  const el = $("#logchart"); if (!logChart || !el.querySelector("canvas")) el.innerHTML = wait("실시간 시세를 불러오는 중입니다");
  const [p, pv] = await Promise.all([liveGet(sym, S.lrange).then(parseY), liveGet("^VIX", S.lrange).then(parseY)]);
  if (S.tab !== "log" || S.lsym !== sym) return;
  if (!p) { el.innerHTML = `<div class="desc">실시간 시세를 받지 못했습니다. 잠시 후 다시 시도하십시오.</div>`; return; }
  const ix = p.t.map((t, i) => p.c[i] != null ? i : -1).filter((i) => i >= 0), x = ix.map((i) => kst(p.t[i]));
  const step = S.lrange === "1d" ? 300 : 900, vm = {}; if (pv) pv.t.forEach((t, i) => { if (pv.c[i] != null) vm[Math.round(t / step)] = pv.c[i]; });
  const vix = ix.map((i) => vm[Math.round(p.t[i] / step)] ?? null); for (let i = 1; i < vix.length; i++) if (vix[i] == null) vix[i] = vix[i - 1];
  const prev = p.meta.chartPreviousClose ?? p.meta.previousClose, reg = (i) => !p.reg || S.lrange !== "1d" || (p.t[i] >= p.reg.start && p.t[i] < p.reg.end);
  const pre = ix.map((i) => reg(i) ? null : 1), vb = []; let st = null;
  pre.forEach((v, j) => { if (v && st == null) st = j; if (!v && st != null) { vb.push({i0: st, i1: j - 1, color: css("--soft")}); st = null; } }); if (st != null) vb.push({i0: st, i1: pre.length - 1, color: css("--soft")});
  const tb = todayBar(p); LQ[sym] = Object.assign(tb, {intra: p}); qhead(sym, tb, true);
  const o = ix.map((i) => p.o[i]), h = ix.map((i) => p.h[i]), l = ix.map((i) => p.l[i]), c = ix.map((i) => p.c[i]);
  const keep = logChart && logChart._intra === sym + S.lrange ? logChart.r : null;
  logChart = mkChart(el, {x, height: 380, range: keep || [0, x.length - 1], xfmt: (d) => d.slice(5), minBars: 6,
    tip: (i) => `<b>${x[i]} KST</b><div class="g4"><span>시가</span><b>${usd2(o[i])}</b><span>고가</span><b class="up">${usd2(h[i])}</b><span>저가</span><b class="down">${usd2(l[i])}</b><span>종가</span><b>${usd2(c[i])}</b></div><div class="${cls(c[i] - prev)}">전일 종가 대비 ${pct(c[i] / prev - 1, 2)}</div><div class="t2">VIX ${num(vix[i], 2)}${reg(ix[i]) ? "" : " · 시간외"}</div>`,
    panes: [{h: 3, fmt: (y) => "$" + y.toFixed(2), series: [{type: S.ltype === "line" ? "line" : "candle", name: sym, o, h, l, c, y: c, color: css("--ink")}], hlines: [{y: prev, label: `전일 종가 ${usd2(prev)}`, color: css("--mute")}], vbands: vb},
            {h: 1, fmt: (y) => y.toFixed(1), series: [{type: "line", name: "VIX", y: vix, color: css("--warn"), w: 1.3}]}]});
  if (logChart) logChart._intra = sym + S.lrange;
  $("#logcap").innerHTML = `${S.lrange === "1d" ? "5분" : "15분"} 봉 · 한국시간 · 회색 음영 = 시간외 거래 · 1분마다 자동 갱신(야후 파이낸스 시세)`;
}

// ── 신호 ──
// 7단계 신호(11-27): 조건마다 '지금 값 · 기준 · 기준까지 QQQ 가격'을 막대로. 설명 문장 대신 숫자와 거리
const OKI = `<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg>`;
function sgRow(ok, name, val, sub, bar) {
  return `<div class="sg-r"><span class="sg-s ${ok === true ? "ok" : ok === false ? "no" : "na"}">${ok === true ? OKI : ""}</span>
    <div class="sg-m"><div class="sg-t"><b>${name}</b><span>${val}</span></div>${bar || ""}${sub ? `<small>${sub}</small>` : ""}</div></div>`;
}
// 가로 눈금 막대: [lo..hi] 범위, 칠할 구간 zone=[a,b], 지금 값 v
function sgBar(lo, hi, v, zone, ticks) {
  const p = (x) => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100)), z = zone ? [p(zone[0]), p(zone[1])].sort((a, b) => a - b) : null;
  return `<div class="sg-b">${z ? `<i class="sg-z" style="left:${z[0]}%;width:${z[1] - z[0]}%"></i>` : ""}${v != null ? `<b style="left:${p(v)}%"></b>` : ""}</div>
    <div class="sg-k">${(ticks || []).map(([x, t]) => `<span style="left:${p(x)}%">${t}</span>`).join("")}</div>`;
}
function signal() {
  const plan = D.accounts[S.prof].plan || {}, g = plan.signals || {}, w = plan.watch || {}, tr = D.trend || {}, fx = D.fx || {};
  const cap = g.max_regular_lots || 5, room = g.room ?? cap, q = g.qqq, toQ = (p) => p && q ? ` · 지금보다 ${pct(p / q - 1)}` : "";
  const fear = g.fear === true ? true : g.fear === false ? false : null, rsiOk = g.rsi == null ? null : g.rsi < 30, met = [fear, g.band, rsiOk, room > 0];
  const nMet = met.filter((x) => x === true).length, ready = nMet === 4;
  // 무엇이 남았나: 가격으로 말할 수 있으면 가격으로
  // 11-28 사용자 '매수 기준 숫자는 공개하지 않음' → 기준값·기준선 없이 지금 값과 충족 여부만
  const need = ready ? "다음 장 주문이 나갑니다" : fear === false ? "공포 구간을 기다립니다"
    : g.band === false ? "하락 폭이 매수 범위 밖입니다"
    : rsiOk === false ? `과매도 가격(QQQ ${usd2(w.close_buy_qqq || g.rsi30_qqq)}) 이하로 마감하면 매수합니다` : room <= 0 ? "한도를 다 썼습니다" : "";
  let html = `<div class="card sg"><div class="sg-h"><div><div class="t2">${ymd(g.date)} 종가 · ${S.inst}</div><div class="sg-v ${ready ? "up" : ""}">매수 조건 ${nMet}/4</div></div>
      <button class="secondary" id="signalTodo">주문 보기</button></div>
    <div class="sg-need">${need}${!ready && rsiOk === false && fear !== false && g.band ? `<span>${toQ(w.close_buy_qqq || g.rsi30_qqq).slice(3)}</span>` : ""}</div>
    ${sgRow(fear, "공포", `VIX ${num(g.vix, 1)} · 공포탐욕 ${g.fg != null ? Math.round(g.fg) : "-"}`, "")}
    ${sgRow(g.band, "하락 폭", `1년 고점 대비 ${pct(g.dd)}`, "")}
    ${sgRow(rsiOk, "과매도", `RSI ${num(g.rsi, 1)}`, "")}
    ${sgRow(room > 0, "남은 한도", `${+room.toFixed(1)}/${cap}묶음`, g.units ? `${+(+g.units).toFixed(1)}묶음어치 보유 중` : "")}
    <div class="sg-sub">매수 크기</div>
    ${sgRow(g.slow ? null : true, g.slow ? "절반 묶음" : "한 묶음", `QQQ 3일 ${pct(g.speed)}`, g.slow ? "하락이 느려 절반만 매수합니다" : "")}
    <div class="sg-sub">하락 범위와 별개</div>
    ${sgRow(g.crash === true && room > 0 ? true : g.crash == null ? null : false, "급락 예외", `하루 ${pct(g.day_return)} · 5일 ${pct(g.five_return)}`, "급락일에는 하락 폭과 관계없이 매수합니다")}
    ${fear === false ? sgRow(g.band && g.rsi >= 30 && room > 0 ? null : false, "대기 지정가", "공포 아닐 때", "하락 폭 안이면 더 낮은 가격에 대기 주문") : ""}
  </div>`;
  // 추세(200일선)
  html += `<div class="card sg"><div class="sg-h"><div class="title">추세</div><span class="sg-chip ${tr.next_in ? "up" : "down"}">${tr.next_in === true ? "상승 · QQQM 보유" : tr.next_in === false ? `하락 · ${waitWord()}` : "-"}</span></div>
    ${sgRow(null, "QQQ와 200일선", `${pct(tr.gap)}`, tr.next_in ? "추세가 꺾이면 매도 알림이 옵니다" : "추세가 살아나면 QQQM 매수 알림이 옵니다")}
  </div>`;
  html += `<div class="card"><div class="title">QQQ 차트</div>${seg(LR.slice(2), S.srange, "sr", "sm")}${seg([["candle", "캔들"], ["line", "라인"]], S.stype, "st", "sm tiny")}
    <div id="sigchart"></div><div class="lg-leg"><span><i style="background:var(--B)"></i>200일선</span></div></div>`;
  const rate = (v) => v == null ? "—" : Math.round(v).toLocaleString("ko-KR") + "원";
  html += fold("fx", "달러 → 원화 환전", fx.on ? "환전 검토 신호" : `1달러 ${rate(fx.rate)} · 신호 없음`, `<div class="kv2"><div>지금 1달러</div><div><b>${rate(fx.rate)}</b></div><div>5년 평균</div><div>${rate(fx.avg5y)} (${pct(fx.gap)})</div><div>신호 발생</div><div>${rate(fx.on_line)} 이상에서 고점 -5%</div><div>최근 65일 고점</div><div>${rate(fx.high65)} (${pct(fx.drop)})</div></div>
    ${seg([["1y", "1년"], ["5y", "5년"], ["all", "전체"]], S.frange, "fr", "sm")}<div id="fxchart"></div>`);
  html += `<div class="foot">${D.health.length ? D.health.map((x) => `<b class="warn">${esc(x)}</b>`).join("<br>") : "자료 정상"} · 산출 ${kst(new Date(D.made_at).getTime() / 1000).slice(5)}</div>`;
  $("#view").innerHTML = html;
  $("#signalTodo").onclick = () => go("todo");
  bindSeg("sr", (v) => { S.srange = v; save(); render(); });
  bindSeg("st", (v) => { S.stype = v; save(); render(); });
  bindSeg("fr", (v) => { S.frange = v; save(); render(); });
  if (!needHist(() => S.tab === "signal" && render())) { $("#sigchart").innerHTML = wait("차트 자료를 불러오는 중입니다"); return; }
  drawSignal(); liveTick();
  const fe = $('[data-fold="fx"]'); if (fe.open) drawFx(); fe.addEventListener("toggle", () => { S.folds.fx = fe.open; save(); if (fe.open && !$("#fxchart").firstChild) drawFx(); });
}
function drawSignal() {
  const px = H.px.QQQ, x = H.dates.slice(), o = px.o.slice(), h = px.h.slice(), l = px.l.slice(), c = px.c.slice(), rsi = H.rsi.slice(), vix = H.vix.c.slice(), fg = H.fg.slice();
  const tb = LQ.QQQ; if (tb && tb.day > H.last) { x.push(tb.day); o.push(tb.o); h.push(tb.h); l.push(tb.l); c.push(tb.c); rsi.push(null); vix.push(LQ["^VIX"] ? LQ["^VIX"].c : null); fg.push(LQ.FG ? LQ.FG.v : null); }
  const N = x.length, ma = Array(N).fill(null), hi = Array(N).fill(null); let sum = 0;
  for (let i = 0; i < N; i++) { sum += c[i]; if (i >= 200) sum -= c[i - 200]; if (i >= 199) ma[i] = sum / 200; let m = -Infinity; for (let j = Math.max(0, i - 251); j <= i; j++) m = Math.max(m, c[j]); hi[i] = m; }
    const rg = BARS[S.srange] || 252;
  const keep = sigChart && sigChart.el.isConnected && sigChart._k === S.srange ? sigChart.r : null;
  sigChart = mkChart($("#sigchart"), {x, height: 520, range: [N - Math.min(rg, N), N - 1], xfmt: (d) => ymd(d),
    tip: (i) => `<b>${ymd(x[i])}${i >= H.dates.length ? " (장중)" : ""}</b><div class="tr">QQQ 종가<b>${usd2(c[i])}</b></div><div class="tr">200일선<b>${usd2(ma[i])}</b><span class="${cls(c[i] / ma[i] - 1)}">${pct(c[i] / ma[i] - 1)}</span></div><div class="tr">1년 고점 대비<b>${pct(c[i] / hi[i] - 1)}</b></div><div class="tr">RSI(14)<b>${num(rsi[i], 1)}</b></div><div class="tr">VIX<b>${num(vix[i], 1)}</b></div><div class="tr">공포탐욕<b>${fg[i] != null ? Math.round(fg[i]) : "-"}</b></div>`,
    panes: [{h: 3, fmt: (y) => "$" + y.toFixed(0), series: [{type: S.stype === "line" ? "line" : "candle", name: "QQQ", o, h, l, c, y: c, color: css("--ink"), w: 1.6},
        {type: "line", name: "200일선", y: ma, color: css("--B"), w: 1.6}]},
      {h: 1, fmt: (y) => y.toFixed(0), fix: [20, 80], series: [{type: "line", name: "RSI(14)", y: rsi, color: css("--B"), w: 1.3}]},
      {h: 1, fmt: (y) => y.toFixed(0), series: [{type: "line", name: "VIX", y: vix, color: css("--warn"), w: 1.3}]},
      {h: 1, fmt: (y) => y.toFixed(0), fix: [0, 100], series: [{type: "line", name: "공포탐욕지수", y: fg, color: css("--C"), w: 1.3}]}]});
  if (!sigChart) return; sigChart._k = S.srange; if (keep) sigChart.setRange(keep[0], keep[1] + (N > H.dates.length && keep[1] === H.dates.length - 1 ? 1 : 0));
}
function drawFx() {
  const x = H.dates, fx = H.fx, av = H.fxavg, on = av.map((v) => v && v * 1.10), off = av.map((v) => v && v * 1.05), N = x.length, rg = {"1y": 252, "5y": 1260, all: N}[S.frange] || 1260;
  mkChart($("#fxchart"), {x, height: 240, range: [N - Math.min(rg, N), N - 1], xfmt: (d) => ymd(d),
    tip: (i) => `<b>${ymd(x[i])}</b><div class="tr">원·달러<b>${fx[i] ? Math.round(fx[i]).toLocaleString() + "원" : "-"}</b></div><div class="tr">5년 평균<b>${av[i] ? Math.round(av[i]).toLocaleString() + "원" : "-"}</b></div><div class="tr">신호 발생선<b>${on[i] ? Math.round(on[i]).toLocaleString() + "원" : "-"}</b></div>`,
    panes: [{fmt: (y) => Math.round(y).toLocaleString(), series: [{type: "line", name: "원·달러", y: fx, color: css("--ink"), w: 1.6}, {type: "line", name: "5년 평균", y: av, color: css("--B"), w: 1.3},
      {type: "line", name: "발생선", y: on, color: css("--up"), w: 1, dash: [4, 3]}, {type: "line", name: "해제선", y: off, color: css("--down"), w: 1, dash: [4, 3]}],
      vbands: H.fxon.map(([a, b]) => ({i0: a, i1: b, color: css("--up") + "1c"}))}]});
}

// 실시간 갱신(1분): 기록·신호·할 일·홈에서 보이는 동안
let tickT = null;
async function liveTick() {
  clearTimeout(tickT); tickT = setTimeout(liveTick, 60000);
  if (document.visibilityState === "visible" && D) {
    const t = S.tab, syms = t === "log" ? [S.lsym, "^VIX"] : t === "signal" ? ["QQQ", "^VIX"] : [S.inst];
    await Promise.all(syms.filter((s) => s !== "ACC").map(refreshQuote)); if (t === "log" || t === "signal") await refreshFG();
    if (S.tab === t && H) {
      if (t === "signal" && $("#sigchart")) drawSignal();
      if ((t === "home" || t === "todo") && LQ[S.inst] && LQ[S.inst].c !== liveTick._last) { liveTick._last = LQ[S.inst].c; render(); return; }
      if (t === "log" && S.lsym !== "ACC") { if (S.lrange === "1d" || S.lrange === "5d") drawIntraday(S.lsym); else { const r = logChart && logChart.r; drawLog(); if (r && logChart) logChart.setRange(r[0], r[1] + (logChart.n > H.dates.length && r[1] === H.dates.length - 1 ? 1 : 0)); } }
    }
  }
}

// 차트 만들기: 차트 하나가 실패해도 화면 전체는 계속 보이게(그 칸에만 안내)
function mkChart(el, o) {
  if (!el) return null;
  if (typeof FChart === "undefined") { needChartJs(); el.innerHTML = wait("차트를 준비하는 중입니다"); return null; }
  try { return new FChart(el, o); } catch (e) { console.error(e); el.innerHTML = `<div class="desc">차트를 그리지 못했습니다. 자료가 갱신되면 다시 그립니다.</div>`; return null; }
}
let chartJsLoading = false;
function needChartJs() {   // 옛 index.html(차트 파일 없음)이 캐시에 남아 있어도 스스로 불러와 다시 그림
  if (chartJsLoading) return; chartJsLoading = true;
  const sc = document.createElement("script"); sc.src = "chart.js?t=" + Date.now(); sc.onload = () => render(); document.head.appendChild(sc);
}

// ── 11-28 마케팅 기능(사용자 '무료판은 지인에게, 유료판은 구글 플레이 — 지금은 마케팅 기능 채우기') ──
// 판 구분: 같은 코드. 무료판(지인용·공개 페이지) = 전부 열림. 유료판 = PASS 표시한 기능만 '공포 이용권'이 있을 때 열림(결제는 유료판에서 붙임).
const EDITION = "free";   // "free" | "paid"
const passOn = () => EDITION === "free" || !!S.pass;   // PASS: 공포 구간 주문표 · 보유 진단 확률
const APP_URL = window.NEW_HOME || (WEB ? location.origin + location.pathname.replace(/[^/]*$/, "") : "https://kunchan70-creator.github.io/bandeung/");
const ALOG_URL = (WEB ? "data/" : "../out/") + "alert_log.json";
const backBtn = (t) => `<button class="back" onclick="go(S.prevTab || 'home')"><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>${t}</button>`;
const goSub = (t) => { if (S.tab !== t) S.prevTab = S.tab; go(t); };
window.goSub = goSub;
const fgLabel = (v) => v == null ? "자료 없음" : v < 25 ? "극심한 공포" : v < 45 ? "공포" : v <= 55 ? "중립" : v <= 75 ? "탐욕" : "극심한 탐욕";
async function shareIt(title, text, file) {   // 폰: 공유 창(카카오톡 등) / 안 되면 글 복사
  try {
    if (file && navigator.canShare?.({files: [file]})) { await navigator.share({title, text, files: [file]}); return; }
    if (navigator.share) { await navigator.share({title, text, url: APP_URL}); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text + "\n" + APP_URL); toast("공유 문구가 복사되었습니다"); } catch (e) { toast("복사하지 못했습니다"); }
}
function inviteShare() { shareIt("피어바이", "나스닥이 공포에 빠질 때만 매수하고, 반등에 매도하는 원칙을 알려 주는 앱입니다.\n열광이 아닌 공포에 매수하다. - 피어바이"); }

// ① 오늘의 공포 리포트(글 + 이미지 공유)
function reportData() {
  const g = D.accounts[S.prof].plan?.signals || {}, fg = LQ.FG?.v ?? g.fg, room = g.room ?? 5;
  const nm = [g.fear, g.band, g.rsi == null ? null : g.rsi < 30, room > 0].filter((x) => x === true).length;
  let ytd = null;
  if (H) { const bt = H.bt.assume, xs = H.dates.slice(bt.i0), y = xs.at(-1).slice(0, 4), j = xs.findIndex((d) => d.startsWith(y)), p = Math.max(0, j - 1), vb = vals("assume", "B", "krw"), vq = bt.acc.qqq.krw;
    ytd = {y, b: vb.at(-1) / vb[p] - 1, q: vq.at(-1) / vq[p] - 1}; }
  return {date: g.date, fg, vix: g.vix, fear: !!g.fear, nm, ytd};
}
function reportText(r) {
  return `[피어바이] ${ymd(r.date).slice(5)} 마감 나스닥 공포 리포트\n공포·탐욕 ${r.fg == null ? "-" : Math.round(r.fg)} (${fgLabel(r.fg)}) · VIX ${num(r.vix, 1)}\n${r.fear ? "공포 구간" : "공포 구간 아님"} · 매수 조건 ${r.nm}/4`
    + (r.ytd ? `\n${r.ytd.y}년 전략 ${pct(r.ytd.b)} · 나스닥 보유 ${pct(r.ytd.q)} (원화·세후, 과거 계산)` : "") + `\n열광이 아닌 공포에 매수하다.`;
}
function reportImage(r) {   // 1080x1350 카드(인스타·카카오톡 공유용)
  const W = 1080, Hh = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = Hh; const c = cv.getContext("2d");
  const F = (w, s) => `${w} ${s}px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
  const gr = c.createRadialGradient(W / 2, 380, 40, W / 2, 380, 900); gr.addColorStop(0, "#16233d"); gr.addColorStop(1, "#0b1220"); c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
  c.textAlign = "center"; c.font = F(900, 92); const w1 = c.measureText("FEAR").width, w2 = c.measureText("BUY").width, x0 = W / 2 - (w1 + w2) / 2;
  c.textAlign = "left"; c.fillStyle = "#fff"; c.fillText("FEAR", x0, 170); c.fillStyle = "#4a9eff"; c.fillText("BUY", x0 + w1, 170);
  c.textAlign = "center"; c.fillStyle = "#9aa7b8"; c.font = F(600, 36); c.fillText(`${ymd(r.date)} 마감 · 나스닥 공포 리포트`, W / 2, 245);
  const col = r.fg == null ? "#fff" : fgCol(r.fg);   // 게이지 반원
  for (let i = 0; i < 60; i++) { c.beginPath(); c.strokeStyle = fgCol((i + .5) * 100 / 60); c.lineWidth = 46; c.arc(W / 2, 640, 300, Math.PI + i / 60 * Math.PI, Math.PI + (i + 1.05) / 60 * Math.PI); c.stroke(); }
  if (r.fg != null) { const a = Math.PI + Math.max(0, Math.min(100, r.fg)) / 100 * Math.PI, mx = W / 2 + 300 * Math.cos(a), my = 640 + 300 * Math.sin(a); c.beginPath(); c.fillStyle = "#fff"; c.arc(mx, my, 34, 0, 7); c.fill(); c.beginPath(); c.fillStyle = col; c.arc(mx, my, 18, 0, 7); c.fill(); }
  c.fillStyle = col; c.font = F(900, 170); c.fillText(r.fg == null ? "-" : Math.round(r.fg), W / 2, 620);
  c.font = F(800, 46); c.fillText(fgLabel(r.fg), W / 2, 690);
  c.fillStyle = "#e8edf4"; c.font = F(700, 44); c.fillText(`${r.fear ? "공포 구간" : "공포 구간 아님"} · 매수 조건 ${r.nm}/4`, W / 2, 820);
  c.fillStyle = "#9aa7b8"; c.font = F(500, 34); c.fillText(`VIX ${num(r.vix, 1)}`, W / 2, 875);
  if (r.ytd) { c.fillStyle = "#121c2f"; c.beginPath(); c.roundRect(110, 935, W - 220, 170, 28); c.fill();
    c.font = F(600, 32); c.fillStyle = "#8a97aa"; c.fillText(`${r.ytd.y}년 · 원화·세후 · 과거 계산`, W / 2, 990);
    c.font = F(800, 46); c.fillStyle = "#4a9eff"; c.fillText(`전략 ${pct(r.ytd.b)}`, W / 2 - 200, 1065); c.fillStyle = "#c9d2de"; c.fillText(`나스닥 ${pct(r.ytd.q)}`, W / 2 + 200, 1065); }
  c.fillStyle = "#fff"; c.font = F(800, 44); c.fillText("열광이 아닌 공포에 매수하다.", W / 2, 1210);
  c.fillStyle = "#6f7d91"; c.font = F(500, 28); c.fillText(APP_URL.replace(/^https:\/\//, "").replace(/\/$/, ""), W / 2, 1270);
  return new Promise((res) => cv.toBlob((b) => res(new File([b], `fearbuy-${r.date}.png`, {type: "image/png"})), "image/png"));
}
function openReport() {
  if (!H) needHist(() => { if (!$("#sheet").hidden) openReport(); });
  const r = reportData(), t = reportText(r);
  sheet(`<div class="pk-t">오늘의 공포 리포트</div><div class="rp-card">${esc(t).replace(/\n/g, "<br>")}</div>
    <button class="btn blue" id="rpImg">이미지로 공유</button><button class="btn ghost" id="rpTxt">글로 공유</button>
    <div class="pk-f">카카오톡·인스타그램에 바로 올릴 수 있습니다</div>`, () => {
    $("#rpImg").onclick = async () => { const f = await reportImage(r); if (navigator.canShare?.({files: [f]})) return shareIt("피어바이 공포 리포트", t, f);
      const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); toast("이미지를 저장했습니다"); };
    $("#rpTxt").onclick = () => shareIt("피어바이 공포 리포트", t);
  });
}

// ② 내 보유 진단(11-28 라씨 '매수가 넣으면 맞춤 매도' 벤치마크): 내 평균 매수가 → 지금 손익 · 전략 목표가 · 과거 비슷한 하락에서 목표가/원금까지 간 비율
function dgStats(sym, need, win) {
  const px = H.px[sym], c = px.c, h = px.h, q = H.qdd || [], n = H.dates.length, dd = q[n - 1];
  let tot = 0, hit = 0; const days = [];
  if (dd == null) return null;
  for (let i = 250; i < n - win; i++) {
    if (q[i] == null || c[i] == null || Math.abs(q[i] - dd) > .03) continue;
    tot++; const tg = c[i] * (1 + need);
    for (let k = 1; k <= win; k++) if (h[i + k] != null && h[i + k] >= tg) { hit++; days.push(k); break; }
  }
  days.sort((a, b) => a - b);
  return {tot, p: tot ? hit / tot : null, med: days.length ? days[days.length >> 1] : null, dd};
}
function diag() {
  if (!needHist(() => S.tab === "diag" && render())) { $("#view").innerHTML = backBtn("내 보유 진단") + wait("과거 자료를 불러오는 중입니다"); return; }
  const sym = PRODUCTS[S.dgSym] ? S.dgSym : S.inst, avg = Number(String(S.dgAvg || "").replace(/[^0-9.]/g, "")) || 0;
  const px = H.px[sym], cur = LQ[sym]?.c ?? px.c.at(-1), T = PRODUCTS[sym].target / 100, tgt = avg * (1 + T);
  let html = backBtn("내 보유 진단") + `<div class="card dg"><div class="title">내가 산 가격을 넣어 보십시오</div><div class="t2">과거 26년 자료로 지금 상황을 진단합니다</div>
    ${seg(Object.keys(PRODUCTS).map((s) => [s, s]), sym, "dgs", "sm")}
    <label class="form-label" for="dgAvg">평균 매수가($)</label><input class="money" id="dgAvg" inputmode="decimal" placeholder="예: ${(cur * 1.1).toFixed(2)}" value="${esc(S.dgAvg || "")}">
    <div class="t2">현재가 ${usd2(cur)}</div></div>`;
  if (avg > 0 && cur) {
    const r = cur / avg - 1, a = dgStats(sym, Math.max(0, tgt / cur - 1), 60), b = r < 0 ? dgStats(sym, avg / cur - 1, 250) : null, sg = D.accounts[S.prof].plan?.signals || {};
    const swSell = sym === S.inst ? (D.accounts[S.prof].plan?.swing || []).find((o) => o.how === "목표가") : null;
    html += `<div class="card dg-r"><div class="dg-pl"><small>내 손익</small><b class="${cls(r)}">${pct(r, 1)}</b><span>${usd2(avg)} → ${usd2(cur)}</span></div>
      <div class="kv2"><div>전략 목표가(+${PRODUCTS[sym].target}%)</div><div><b>${usd2(tgt)}</b> · 현재가 대비 ${pct(tgt / cur - 1)}</div>
      <div>지금 나스닥</div><div>1년 고점 대비 ${pct(a?.dd)} · ${sg.fear ? "공포 구간" : "공포 구간 아님"}</div>
      ${swSell ? `<div>전략 매도 주문</div><div>${usd2(swSell.limit)} (전략도 보유 중)</div>` : ""}</div></div>`;
    if (passOn() && a) html += `<div class="card dg-r"><div class="title">과거 비슷한 하락에서는</div><div class="t2">나스닥이 지금처럼 고점 대비 ${pct(a.dd - .03, 0)}~${pct(a.dd + .03, 0)}였던 날 ${a.tot.toLocaleString()}일 기준</div>
      ${tgt <= cur ? `<div class="dg-big up">이미 전략 목표가 위입니다</div>` : `<div class="dg-big">${a.p == null ? "-" : Math.round(a.p * 100) + "%"}<small>3개월(60거래일) 안에 목표가 ${usd2(tgt)}에 닿은 비율${a.med ? ` · 중간값 ${a.med}거래일 걸림` : ""}</small></div>`}
      ${b ? `<div class="dg-big">${b.p == null ? "-" : Math.round(b.p * 100) + "%"}<small>1년(250거래일) 안에 내 매수가 ${usd2(avg)}를 회복한 비율${b.med ? ` · 중간값 ${b.med}거래일 걸림` : ""}</small></div>` : ""}
      <div class="pk-f">${H.px[sym].real_from && H.px[sym].real_from > H.dates[0] ? `${ymd(H.px[sym].real_from).slice(0, 4)}년 이전 ${sym}는 가정 가격 · ` : ""}과거 계산이며 앞으로를 보장하지 않습니다</div></div>`;
    html += `<div class="card"><div class="title">피어바이 원칙이라면</div><div class="desc">매수가 체결되면 바로 평균 단가 +${PRODUCTS[sym].target}%에 지정가 매도 주문을 걸어 둡니다. 더 빠지면 공포 구간에서 묶음 단위로 나눠 매수하고 평균 단가와 매도 주문을 함께 낮춥니다. 10거래일 안에 안 되면 정리합니다.</div>
      <button class="mk-go" onclick="go('todo')"><span>지금 주문표 보기</span><b>›</b></button><button class="mk-go" id="dgShare"><span>이 진단 공유하기</span><b>›</b></button></div>`;
  }
  $("#view").innerHTML = html;
  bindSeg("dgs", (v) => { S.dgSym = v; save(); render(); });
  const inp = $("#dgAvg"); inp.onchange = () => { S.dgAvg = inp.value; save(); render(); };
  inp.onkeydown = (e) => { if (e.key === "Enter") inp.blur(); };
  if ($("#dgShare")) $("#dgShare").onclick = () => shareIt("피어바이 보유 진단", `${sym} 평균 ${usd2(avg)} → 지금 ${pct(cur / avg - 1)}\n피어바이로 과거 26년 비슷한 하락을 확인해 보세요.`);
}

// ③ 실시간 기록(알림 기록 공개 · 가상 계좌 체결) — 신뢰는 기준 공개 대신 결과 공개로
let ALOG = null;
function alertRows(p) {
  const L = (p.per || {})[S.inst] || [], md = (d) => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "";
  return L.map(([k, s, px, v]) => k === "b" ? `<span class="up">▲ ${s} 매수 ${usd2(px)}</span> · ${v === .5 ? "반 묶음" : v === 1 ? "한 묶음" : v + "묶음"}`
    : k === "s" ? `<span class="down">▼ ${s} 매도 ${usd2(px)}</span> · 보유 전량` : k === "fs" ? `<span class="down">▼ ${s} 시가 매도</span> · 단타 자금 마련` : k === "e" ? `<span class="down">▼ ${s} ${md(v)} 장 마감 매도</span> · 보유 기한`
    : k === "tb" ? `<span class="up">▲ QQQM 매수 ${usd2(px)}</span> · 200일선 위` : `<span class="down">▼ QQQM 매도 ${usd2(px)}</span> · 200일선 아래`);
}
function record() {
  if (ALOG == null) { $("#view").innerHTML = backBtn("실시간 기록") + wait("기록을 불러오는 중입니다"); fetch(ALOG_URL, {cache: "no-cache"}).then((r) => r.json()).catch(() => []).then((x) => { ALOG = Array.isArray(x) ? x : []; if (S.tab === "record") render(); }); return; }
  const tr = (D.accounts[S.prof].trades || []).slice().reverse(), al = ALOG.slice().reverse().filter((x) => ((x.per || {})[S.inst] || []).length);
  let html = backBtn("실시간 기록") + `<div class="card rc-h"><div class="title">피어바이 실시간 기록</div><div class="t2">${ymd(D.start)}부터 · ${S.inst} 기준 · 지우거나 고치지 않습니다</div>
    <div class="pf-g"><div><small>보낸 알림</small><b>${al.length}번</b></div><div><small>체결</small><b>${tr.length}건</b></div><div><small>시작</small><b>${ymd(D.start).slice(2)}</b></div></div></div>`;
  html += `<div class="card"><div class="title">보낸 알림</div>${al.length ? al.map((x) => `<div class="rc-a"><small>${kst(Date.parse(x.t) / 1000)} 발송 · ${ymd(x.sess).slice(5)} 장 주문</small>${alertRows(x).map((l) => `<div>${l}</div>`).join("")}</div>`).join("")
    : `<div class="desc">새 주문이 생기면 보낸 알림이 시각과 함께 여기에 쌓입니다.</div>`}</div>`;
  html += `<div class="card"><div class="title">가상 계좌 체결</div>${tr.length ? tr.map((t) => `<div class="tr-row"><div class="tr-l"><b><span class="badge ${t.side === "buy" ? "b" : "s"}">${t.side === "buy" ? "매수" : "매도"}</span> ${esc(t.symbol)}</b><small>${ymd(t.date).slice(2)} · ${esc(tw(t.why))}</small></div>
      <div class="tr-r"><b>${usd2(t.price)}</b><small>${t.qty.toLocaleString()}주</small></div></div>`).join("") : `<div class="desc">아직 체결 내역이 없습니다.</div>`}</div>
    <div class="foot">가상 계좌 1억 원 기준 · 알림과 같은 규칙으로 자동 체결</div>`;
  $("#view").innerHTML = html;
}

// ④ 알림 없던 해(11-28 '몇 년 깜깜 무소식이면 구독이 아깝다' → 그동안에도 시장 수익을 받았다는 근거)
function quietYears() {
  const bt = H.bt.assume, xs = H.dates.slice(bt.i0), vb = vals("assume", "B", "krw"), vq = bt.acc.qqq.krw, ry = new Set((bt.acc.B.rounds || []).map((r) => r.buys[0].d.slice(0, 4)));
  const ys = {}; xs.forEach((d, i) => { (ys[d.slice(0, 4)] = ys[d.slice(0, 4)] || [i, i])[1] = i; });
  const thisY = xs.at(-1).slice(0, 4);
  return Object.entries(ys).filter(([y]) => !ry.has(y) && y !== thisY).map(([y, [a, b]]) => ({y, b: vb[b] / vb[Math.max(0, a - 1)] - 1, q: vq[b] / vq[Math.max(0, a - 1)] - 1}));
}

// ── 뼈대 ──
const PAGES = {home, compare, todo, log, signal, more, diag, record};
function go(t) { S.tab = t; save(); render(); window.scrollTo(0, 0); }
window.go = go;
function render() {
  if (!PAGES[S.tab]) S.tab = "home";   // 없어진 화면(예: 11-27 폐기한 이야기)을 기억하고 있으면 홈으로
  pills();
  document.querySelectorAll("#tabs button").forEach((b) => { b.classList.toggle("on", b.dataset.tab === S.tab); b.onclick = () => go(b.dataset.tab); });
  if(S.inst!=="TQQQ"&&!rawData?.variants?.[S.inst]) { $("#view").innerHTML=wait(`${S.inst} 조합 자료를 기다리고 있습니다. 자료가 갱신되면 다시 표시됩니다.`); return; }
  try { (PAGES[S.tab] || home)(); setTimeout(maybeCoach, 700); }
  catch (e) {   // 오류 문구 대신 다시 그리기(1회), 그래도 안 되면 홈으로
    console.error(e);
    if (!render._retry) { render._retry = true; setTimeout(() => { render(); render._retry = false; }, 800); }
    else if (S.tab !== "home") { render._retry = false; S.tab = "home"; save(); render(); }
  }
}
// 폰 앱(APK): 자료는 앱이 비공개 저장소에서 받아 둔 파일(Android.getData/getHist). PC 브라우저: 봇 폴더의 파일.
const AND = window.Android;
function tokenCard(err) {
  $("#view").innerHTML = `<div class="card"><div class="title">최초 1회: 읽기 전용 토큰 입력</div>
    <div class="desc">GitHub에서 발급한 읽기 전용 토큰(github_pat_…)을 입력하십시오. 이 기기에만 저장됩니다.</div>
    ${err ? `<div class="alert"><b>자료 수신 실패</b> ${esc(err)}</div>` : ""}
    <input id="tok" class="money" type="password" placeholder="github_pat_...">
    <button id="tokSave" class="btn">저장 후 자료 받기</button></div>`;
  $("#tokSave").onclick = () => { const t = $("#tok").value.trim(); if (t) { AND.saveToken(t); $("#view").innerHTML = wait("자료를 받는 중입니다"); } };
  firstGuide();
}
function fromAndroid() {
  const s = AND.getData();
  if (s) { try { rawData = JSON.parse(s); selectModels(); if(AND.consumeOrdersEntry?.())S.tab="todo"; save(); render(); firstGuide(); return; } catch (e) {} }
  if (!AND.hasToken()) tokenCard("");
}
function firstGuide() { if (tourDue() && tourPage < 0) openTour(); else maybeEntry(); }
window.onAndroidData = (ok) => { if (ok) return fromAndroid(); if (!D) tokenCard(AND.lastError()); };
window.onAndroidHist = () => { const s = AND.getHist && AND.getHist(); if (s) { try { histReady(JSON.parse(s)); render(); } catch (e) {} } };
window.goBackTab = () => { if(tourPage>0){openTour(tourPage-1);return true;} if(tourPage===0){$("#tourSkip").click();return true;} if (S.tab !== "home") { go("home"); return true; } return false; };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && D) liveTick(); });
// ── 화면 안내(11-27 밤 사용자 '집셈 결과표 안내처럼'): 실제 칸을 밝게 비추고 한 문장 + 쓰는 법. '다시 보지 않기'를 눌러야만 그 화면 안내가 사라짐(방문마다 한 번) ──
let COACH = null; const cmDone = new Set();
const HL = (t) => `<em class="hl">${t}</em>`;
const cmKeyOf = (k) => "bdCoach_" + k;
const cmNever = (k) => { try { return localStorage.getItem(cmKeyOf(k)) === "x"; } catch (e) { return false; } };
const cmFind = (q) => typeof q === "function" ? q() : document.querySelector(q);
const rowWith = (sel, txt) => () => [...document.querySelectorAll(sel)].find((r) => r.textContent.includes(txt));
const COACHES = {   // 11-27 밤 사용자 '설명이 너무 길다, 핵심만' → 탭마다 2~3장, 한 문장 + 짧은 보조 한 줄
  home: () => [
    {q: ".fg-g", lb: "공포·탐욕지수", t: "시장의 공포 정도입니다", g: `${HL("붉을수록")} 공포가 깊습니다. 매수 조건 중 하나입니다.`},
    {q: ".dl-one", lb: "시계", t: "미국 장 시간을 한국 시간 시계에 표시합니다", g: `${HL("파란 칸")} 정규장 · ${HL("주황 종")} 알림 시각`},
    {q: ".hold .hl-row", lb: "보유 현황", t: "전략의 현재 보유 비중입니다", g: "내 계좌도 같은 비중으로 맞춥니다."},
    {q: '#tabs [data-tab="compare"]', lb: "성과", t: "먼저 지난 성과를 확인하십시오", g: "2000년부터의 결과를 QQQ 보유와 비교합니다.", go: ["성과 보러 가기", "compare"]}],
  compare: () => [
    {q: ".pf-hero", lb: "성과", t: "1억 원 투자 시 현재 평가금액입니다", g: `기간을 바꿔 ${HL("10년·5년")} 기준도 확인하십시오.`},
    {q: '#tabs [data-tab="log"]', lb: "차트", t: "모든 매수·매도 내역은 차트에 있습니다", g: "", go: ["차트 보기", "log"]}],
  todo: () => document.querySelector(".tk") ? [
    {q: ".tk-g", lb: "주문표", t: "증권사 앱에 이 순서대로 주문합니다", g: `가격·수량은 ${HL("복사")} 버튼으로 붙여 넣으십시오.`},
    {q: ".td-amt", lb: "수량", t: "운용 금액을 넣으면 내 수량으로 바뀝니다", g: ""}]
    : [{q: ".td-empty", lb: "할 일", t: "주문이 생기면 여기에 표시됩니다", g: "알림도 함께 옵니다."}],
  signal: () => [
    {q: ".sg-need", lb: "신호", t: "지금 매수 조건이 몇 개 맞았는지 보여 줍니다", g: ""},
    {q: rowWith(".sg-r", "급락 예외"), lb: "급락 예외", t: "급락일에는 하락 폭과 관계없이 매수합니다", g: ""}],
  log: () => [
    {q: "#logchart", lb: "차트", t: "▲ 매수, ▼ 매도 시점입니다", g: `${HL("주황 ▲")} 급락 예외 매수`},
    {q: ".tr-row", lb: "거래", t: "거래를 누르면 해당 기간 차트로 이동합니다", g: ""}],
};
function maybeCoach() {
  const k = S.tab; if (!D || !COACHES[k] || COACH || tourPage >= 0 || !$("#sheet").hidden || cmDone.has(k) || cmNever(k)) return;
  const steps = COACHES[k]().filter((s) => { const e = cmFind(s.q); return e && e.getBoundingClientRect().height > 0; });
  if (!steps.length) return; cmDone.add(k);
  const bg = document.createElement("div"); bg.className = "cm-bg"; const hole = document.createElement("div"); hole.className = "cm-hole"; const tip = document.createElement("div"); tip.className = "cm-tip";
  document.body.append(bg, hole, tip); COACH = {k, steps, i: 0, bg, hole, tip, raf: 0};
  ["wheel", "touchmove"].forEach((t) => addEventListener(t, cmBlock, {passive: false}));
  coachShow(); const tr = () => { if (!COACH) return; cmPlace(); COACH.raf = requestAnimationFrame(tr); }; COACH.raf = requestAnimationFrame(tr);
}
function cmBlock(e) { if (COACH && !(e.target.closest && e.target.closest(".cm-tip"))) e.preventDefault(); }
function cmPlace() {
  const C = COACH; if (!C || !C.ready) return; const e = cmFind(C.steps[C.i].q); if (!e) return; const r = e.getBoundingClientRect(), pd = 6;
  const key = [r.left, r.top, r.width, r.height].map(Math.round).join(); if (key === C.lk) return; C.lk = key;
  Object.assign(C.hole.style, {left: (r.left - pd) + "px", top: (r.top - pd) + "px", width: (r.width + pd * 2) + "px", height: (r.height + pd * 2) + "px"});
  const th = C.tip.offsetHeight || 170, below = r.bottom + pd + 12 + th < innerHeight - 8, above = r.top - pd - 12 - th >= 8;
  C.tip.style.top = below ? (r.bottom + pd + 12) + "px" : ""; C.tip.style.bottom = below ? "" : above ? Math.max(8, innerHeight - r.top + pd + 12) + "px" : "84px";
}
function coachShow() {
  const C = COACH; if (!C) return; const s = C.steps[C.i], last = C.i + 1 >= C.steps.length; C.ready = false; C.lk = "";
  const e = cmFind(s.q), r = e.getBoundingClientRect(); if (!e.closest("#tabs, .top")) window.scrollTo({top: Math.max(0, scrollY + r.top - Math.max(90, (innerHeight - r.height) / 2 - 80))});
  C.tip.innerHTML = `<div class="cm-lb">${s.lb}${C.steps.length > 1 ? `<span>${C.i + 1} / ${C.steps.length}</span>` : ""}</div><b>${s.t}</b>${s.g ? `<p>${s.g}</p>` : ""}
    <div class="cm-ft"><button class="cm-no" id="cmNo">다시 보지 않기</button><button class="cm-go" id="cmGo">${s.go ? s.go[0] : last ? "알겠습니다" : "다음"}</button></div>`;
  $("#cmNo").onclick = () => coachEnd(true); C.bg.onclick = coachNext;
  $("#cmGo").onclick = s.go ? () => { coachEnd(false); go(s.go[1]); } : coachNext;
  C.tip.classList.remove("in"); setTimeout(() => { if (COACH !== C) return; C.ready = true; cmPlace(); void C.tip.offsetWidth; C.tip.classList.add("in"); }, 260);
}
function coachNext() { if (!COACH) return; COACH.i++; if (COACH.i < COACH.steps.length) return coachShow(); coachEnd(false); }
function coachEnd(never) {
  const C = COACH; if (!C) return; COACH = null; cancelAnimationFrame(C.raf); ["wheel", "touchmove"].forEach((t) => removeEventListener(t, cmBlock, {passive: false}));
  if (never) try { localStorage.setItem(cmKeyOf(C.k), "x"); } catch (e) {}
  C.bg.remove(); C.hole.remove(); C.tip.remove(); maybeEntry();
}
function coachReset() { Object.keys(COACHES).forEach((k) => { try { localStorage.removeItem(cmKeyOf(k)); } catch (e) {} cmDone.delete(k); }); }
// 11-27 진입: 웹으로 처음 들어오면 아래에서 '앱 설치하고 알림 받기 / 웹으로 계속 볼게요' 창(웹으로 계속 = 7일 뒤 다시). 머리글 종 = 알림 켜고 끄기
if (WEB && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
const STANDALONE = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
const IOS = /iPhone|iPad/.test(navigator.userAgent);
let installEv = null, PUSHST = "?";
const pageAgain = () => { if (D && (S.tab === "more" || S.tab === "todo")) render(); else if (D) pills(); };
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEv = e; });
window.addEventListener("appinstalled", () => { installEv = null; pageAgain(); });
const PUSH = "https://bandeung-push.kunchan70.workers.dev";
const pushOK = () => WEB && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function pushState() { if (!pushOK()) return "no"; const r = await navigator.serviceWorker.ready; return (await r.pushManager.getSubscription()) ? "on" : "off"; }
const u8 = (b) => { const raw = atob((b + "=".repeat((4 - b.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
const IOS_STEPS = `<ol class="ios"><li>사파리 아래 <b>공유</b> 버튼</li><li><b>홈 화면에 추가</b></li><li>홈 화면 아이콘으로 열고 <b>알림 받기</b></li></ol>`;
async function pushOn() {   // 성공이면 "", 아니면 안내 문구
  if (!eduOn()) { $("#sheet").hidden = true; document.body.style.overflow = ""; eduDone() ? openCond() : openEdu(0); return "edu"; }   // 11-27 밤: 교육 마친 사람만 알림
  if (IOS && !STANDALONE) return "아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있습니다.";
  if (!pushOK()) return "이 브라우저는 알림을 지원하지 않습니다. 크롬에서 열어 주십시오.";
  try {
    if (await Notification.requestPermission() !== "granted") return "알림이 차단되어 있습니다. 브라우저 사이트 설정에서 허용해 주십시오.";
    const reg = await navigator.serviceWorker.ready, {pub} = await fetch(PUSH + "/key").then((r) => r.json());
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: u8(pub)});
    const r = await fetch(PUSH + "/subscribe", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(sub)});
    if (!r.ok) return "알림 등록에 실패했습니다. 잠시 뒤 다시 눌러 주십시오.";
  } catch (e) { return "알림 등록에 실패했습니다. " + esc(e.message); }
  await updateBell(); return "";
}
async function pushOff() {
  const reg = await navigator.serviceWorker.ready, s = await reg.pushManager.getSubscription();
  if (s) { await fetch(PUSH + "/unsubscribe", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({endpoint: s.endpoint})}).catch(() => {}); await s.unsubscribe(); }
  await updateBell();
}
async function updateBell() { PUSHST = await pushState().catch(() => "no"); pageAgain(); maybeEntry(); }
function openBell() {
  const now = Date.now(), M = sessFrom(now, (x) => now < x.reg.b), on = PUSHST === "on";
  const when = M ? [["개장 전", "걸 주문이 있을 때", kHM(M.alarms[0].t)], ["마감 후", "새 주문이 생겼을 때", kHM(M.alarms[1].t) + "부터"], ["장중", "주문가에 닿았을 때", ""]] : [];
  sheet(`<div class="pk-t">알림</div>
    <div class="bl-st"><span>이 기기</span><b class="${on ? "on" : ""}">${pushWord() || "확인 중"}</b></div>
    <div class="bl">${when.map(([a, b, c]) => `<div><b>${a}</b><span>${b}</span><em>${c}</em></div>`).join("")}</div>
    ${IOS && !STANDALONE && !on ? IOS_STEPS : ""}
    ${!WEB ? "" : on ? `<button class="btn ghost" id="bOff">알림 끄기</button>` : IOS && !STANDALONE ? "" : `<button class="btn blue" id="bOn">${eduOn() ? "알림 받기" : "교육 받고 알림 받기"}</button>`}
    <div class="pk-f" id="bMsg"></div>`, (close) => {
    if ($("#bOn")) $("#bOn").onclick = async () => { const m = await pushOn(); if (m === "edu") return; if (m) $("#bMsg").textContent = m; else close(); };
    if ($("#bOff")) $("#bOff").onclick = async () => { await pushOff(); close(); };
  });
}
// 진입 창: force = 전체 탭 '앱 설치'에서 직접 열 때
function maybeEntry() {
  // 11-28 주소 이사: 옛 주소에서 알림을 받던 사람 → 새 주소에서 알림만 한 번 다시 켜게(설정은 이미 옮겨 옴)
  try { if (WEB && D && localStorage.getItem("bdMigPush") && PUSHST === "off" && $("#sheet").hidden && tourPage < 0) { localStorage.removeItem("bdMigPush"); toast("새 주소로 옮겼습니다. 알림만 다시 켜 주십시오"); openBell(); return; } } catch (e) {}
  if (!WEB || !D || COACH || tourPage >= 0 || !$("#sheet").hidden || PUSHST === "?" || (S.entryNext || 0) > Date.now()) return;
  if (STANDALONE && PUSHST !== "off") return;
  openEntry(false);
}
function openEntry(force) {
  const later = () => { if (!force) { S.entryNext = Date.now() + 7 * 864e5; save(); } };
  const pushStep = (note) => { $("#enStep").innerHTML = `<button class="btn blue" id="enPush">알림 받기</button>${note ? `<div class="pk-f">${note}</div>` : ""}<div class="pk-f" id="enMsg"></div>`;
    $("#enPush").onclick = async () => { const m = await pushOn(); if (m === "edu") return; if (m) $("#enMsg").textContent = m; else { S.entryNext = Date.now() + 365 * 864e5; save(); $("#sheet").hidden = true; document.body.style.overflow = ""; render(); } }; };
  sheet(`<div class="entry"><svg class="entry-i" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 004 0"/></svg>
    <div class="entry-t">주문할 때를<br>알림으로 받으세요</div><div class="entry-d">장 마감 뒤 새 주문이 생기면 바로 알려 드립니다</div>
    <div id="enStep"><button class="btn blue" id="enGo">${STANDALONE ? "알림 받기" : IOS ? "홈 화면에 추가하기" : "앱 설치하고 알림 받기"}</button></div>
    <button class="entry-web" id="enWeb">${STANDALONE ? "나중에 할게요" : "웹으로 계속 볼게요"}</button></div>`, (close) => {
    $("#enWeb").onclick = () => { later(); close(); };
    $("#enGo").onclick = async () => {
      S.entryNext = Date.now() + 30 * 864e5; save();
      if (STANDALONE) return pushStep(""), $("#enPush").click();
      if (IOS) { $("#enStep").innerHTML = IOS_STEPS; return; }
      if (installEv) { const ev = installEv; installEv = null; ev.prompt(); await ev.userChoice.catch(() => null); pushStep(""); }
      else pushStep("홈 화면에 두려면 크롬 ⋮ 메뉴 → 앱 설치");
    };
  }, {noX: true, onBg: later});
}
updateBell();
if (AND) fromAndroid();
else loadData();
function loadData() { fetch(dataUrl(), {cache: "no-cache"}).then((r) => r.json()).then((d) => { rawData=d; selectModels(); render(); firstGuide(); refreshQuote(S.inst).then(() => S.tab === "home" || S.tab === "todo" ? render() : 0); })
  .catch((e) => { $("#view").innerHTML = `<div class="card"><div class="alert"><b>자료를 읽지 못했습니다</b> ${esc(e.message)}</div></div>`; }); }
