"use strict";
// 공포 단타 봇 화면 v3 — app_data.json(지금 상태, 15분마다) + app_hist.json(차트·성적표, 하루 한 번). 외부 라이브러리 없음.
// 11-24 사용자: 합니다체·증권사 용어("~보다 낫다" 금지), 성적표는 빠짐없이·단위 통일, 차트는 증권사 수준(캔들/선·십자선·실시간).
// 공개 페이지(github.io/bandeung)는 봇이 폰 앱 자료와 같은 파일을 data/ 에 같이 올린다(publish.py) — 앱과 페이지가 한 몸.
const WEB = location.hostname.endsWith("github.io");
// 11-27 사용자: 한 묶음 비중은 각자 정함(5~20%, 최대 5묶음이라 25%는 뺌) → 그 비중으로 계산한 자료 묶음을 통째로 바꿔 읽음(20 = 기본, 나머지 = s{N}/).
const LOTS = [5, 10, 15, 20];
const CAPN = () => D?.accounts?.[S.prof]?.plan?.signals?.max_regular_lots || 5;   // 최대 묶음 수(11-27 4 -> 5)
const lotDir = () => (S.lot && S.lot !== 20 ? `s${S.lot}/` : "");
const dataUrl = () => (WEB ? "data/" : "../out/") + lotDir() + "app_data.json", histUrl = () => (WEB ? "data/" : "../out/") + lotDir() + "app_hist.json";
const RISK_URL = WEB ? "data/size_risk.json" : "../out/size_risk.json";
const ORDER = ["B"];   // 11-26 사용자: 균형형(200일선 추세 + 공포 단타) 하나만. 단타 종목만 선택
const P = {B: {name: "추세+단타", v: "--B"},
           qqq: {name: "QQQ 보유", v: "--Q"}, dep: {name: "예금(세후)", v: "--dep"}};
const col = (k) => `var(${P[k].v})`;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
let D = null, H = null, rawData = null, rawHist = null;
const PRODUCTS = {QQQ: {title:"1배 · 나스닥100", target:2.5}, QLD: {title:"일간 2배", target:5}, TQQQ: {title:"일간 3배", target:7.5}};
const productOptions = Object.entries(PRODUCTS).map(([s,p])=>[s,`${s} · ${p.title.match(/\d배/)[0]}`]);
const S = load({prof: "B", tab: "home", h: "5", myKrw: "", year: "all", assume: true, view: "krw", cmode: "log",
                lsym: "TQQQ", ltype: "candle", lrange: "3m", srange: "1y", stype: "line", frange: "5y", fee: "0.001", simd: "", sima: "", guideSeen: false,
                inst:"TQQQ", tourSeen:false, compSet:"duel", folds:{}, cashUsd:"", lot:20});
if (!LOTS.includes(Number(S.lot))) S.lot = 20; S.lot = Number(S.lot);
if (!S.simd) S.simd = new Date().getFullYear() + "-01-01";
S.prof = "B"; if (S.compSet === "all") S.compSet = "duel";
function load(d) { try { return Object.assign({}, d, JSON.parse(localStorage.getItem("ui3") || "{}")); } catch (e) { return d; } }
(() => { const q = new URLSearchParams(location.search); if (q.get("tab")) S.tab = q.get("tab"); if (q.get("prof")) S.prof = q.get("prof"); })();   // 미리보기·캡처용 주소 지정
function save() { try { localStorage.setItem("ui3", JSON.stringify(S)); } catch (e) {} window.Android?.setSelection?.(S.prof,S.inst); }
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
function pills() {
  $("#pills").innerHTML = ""; $("#pills").style.display = "none";   // 유형은 하나뿐 → 단타 종목만 고름
  $("#asof").textContent = D ? `${ymd(D.last_close)} 종가 기준` : "";
  $("#mylot").textContent = `내 설정 · ${S.lot}%`; $("#mylot").onclick = openSettings;
  $("#ptag").innerHTML = `<span>공포 단타 상품</span>${seg(productOptions,S.inst,"instrument","sm")}`;
  bindSeg("instrument",chooseInstrument); $("#bGuide").onclick = openGuide;
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
    else fetch(histUrl(), {cache: "no-store"}).then((r) => r.json()).then(histReady).catch(() => { histWaiters=[]; });
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
const INFO = {
  B: {tag: "200일선 추세 추종 + 공포 단타", mix: [["추세 추종(QQQM ↔ 단기국채)", 100, "var(--qm)"]],
      body: "나스닥100(QQQ) 종가를 200일 이동평균선과 비교해 보유 여부를 정합니다. 종가가 200일선보다 3% 이상 높게 마감하면 QQQM을 전부 매수하고, 3% 이상 낮게 마감하면 전량 매도한 뒤 단기국채(SGOV)로 대기합니다. ±3% 완충 구간은 200일선 부근에서 매매가 잦아지는 것을 막습니다."},
};
const swingRule = () => `일반 매수는 공포(VIX 30 이상 또는 CNN 공포탐욕 30 이하), 1년 고점 대비 하락률 −10%~−25%, RSI 30 미만, 남은 차수를 함께 봅니다. RSI 26 지정가·급락 매수는 별도 조건입니다. ${S.inst}는 한 묶음이 계좌의 ${S.lot}%(내 설정), 최대 ${CAPN()}묶음입니다. 단, 하락이 느리면(QQQ 3거래일 하락이 4%에 못 미치면) 그 묶음은 절반(${S.lot / 2}%)만 매수합니다. 빠르고 깊은 하락이 반등도 컸고, 천천히 흘러내리는 하락에서 크게 사면 손실이 길어졌기 때문입니다. 목표 +${PRODUCTS[S.inst].target}%와 마지막 매수 후 10거래일 기한을 함께 관리합니다. 더 사면 기한도 그날부터 다시 셉니다. 실제 주문 전에 결제된 현금과 체결 주 수를 확인하십시오.`;

// ── 설정·안내 시트 ──
const FEES = [["0.0007", "0.07%"], ["0.001", "0.10%"], ["0.0015", "0.15%"], ["0.0025", "0.25%"]];
const feeTxt = () => (+S.fee * 100).toFixed(2).replace(/0$/, "") + "%";
const myAmt = () => { const v = Number(String(S.myKrw || "").replace(/[^0-9]/g, "")); return v > 0 ? v : null; };
function sheet(html, onBind) {
  const sh = $("#sheet"); $("#sheetBody").innerHTML = `<button class="sheet-x" id="shx">닫기</button>` + html; sh.hidden = false; document.body.style.overflow = "hidden";
  const close = () => { sh.hidden = true; document.body.style.overflow = ""; render(); };
  $("#shx").onclick = close; sh.querySelector(".sheet-bg").onclick = close; if (onBind) onBind(close);
}
function typeCards(withStats) {
  return ORDER.map((x) => {
    const sc0 = withStats && H ? H.bt.assume.score.krw[x] : null, js = sc0 ? jstats(vals("assume", x, "krw")) : null, sc = sc0 ? {...sc0, cagr: js.cagr, mdd: js.mdd} : null;   // 11-26 비교 탭과 같은 수수료 반영 수치
    return `<div class="ptype" style="--pc:${col(x)}"><div class="ph"><b style="color:${col(x)}">${P[x].name}</b><span>${INFO[x].tag}</span></div>
      <div class="stack sm">${INFO[x].mix.map(([n, w, c]) => `<span style="width:${w}%;background:${c}"></span>`).join("")}</div>
      <div class="legend">${INFO[x].mix.map(([n, w, c]) => `<span><i style="background:${c}"></i>${n} ${w}%</span>`).join("")}</div>
      <div class="desc" style="margin-top:6px">${INFO[x].body}</div>
      ${sc ? `<div class="pstat"><span>연평균 <b>${pct(sc.cagr)}</b></span><span>최대 낙폭 <b class="down">${pct(sc.mdd)}</b></span><span>현금성 평균 <b>${pctu(sc.avg_cash, 0)}</b></span><span class="mute">2000년~ 원화·세후</span></div>` : ""}</div>`;
  }).join("");
}
function openGuide() {
  needHist(() => {});
  sheet(`<div class="title">이 앱은 무엇입니까</div>
    <div class="desc">이 앱은 추세에 따라 나스닥100 보유를 조절하고 공포 구간의 짧은 반등 주문을 계산합니다. 평소에는 200일선 추세 추종으로 운용하고, 공포 구간에만 단타를 합니다. 고르는 것은 단타 종목(QQQ·QLD·TQQQ) 하나입니다.</div>
    <div class="steps"><div><b>1</b>마감 기준 알림 또는 할 일을 확인합니다.</div><div><b>2</b>실제 결제된 현금과 보유 주 수를 확인하고 증권사에 직접 주문합니다.</div><div><b>3</b>부분 체결과 미체결을 확인한 뒤 목표가·보유 기한 주문을 관리합니다.</div></div>
    <div class="sub-h">운용 방식</div>
    ${typeCards(true)}
    <details class="more"><summary>공포 단타 규칙</summary><div class="desc">${swingRule()}</div></details>
    <button class="btn" id="gok">처음부터 둘러보기</button>`, (close) => { $("#gok").onclick = () => { close(); openTour(0, true); }; });
}
const TOUR = [
  {title:"시장의 흐름과<br>공포를 읽다", desc:"이 앱은 매일의 매수·매도 판단을 규칙으로 정리합니다.", art:()=>`<div class="tour-checklist"><div style="--i:0"><b>평소</b><span>어떤 자산을 보유할까?</span></div><div style="--i:1"><b>시장 급락</b><span>어떤 조건에서 매수할까?</span></div><div style="--i:2"><b>주문 전</b><span>내 현금으로 몇 주를 살 수 있을까?</span></div></div>`},
  {title:"평소에는<br>200일선을 따릅니다", desc:"나스닥100이 200일 이동평균보다 3% 넘게 위로 마감하면 QQQM 보유, 3% 넘게 아래로 마감하면 전량 매도 후 단기국채로 대기합니다.", art:()=>`<div class="tour-checklist"><div style="--i:0"><b>위</b><span>QQQM 보유</span></div><div style="--i:1"><b>아래</b><span>단기국채 대기</span></div><div style="--i:2"><b>공포</b><span>단타로 반등 익절</span></div></div>`},
  {title:"단타의 흔들림을<br>내가 정합니다", desc:"QQQ·QLD·TQQQ는 움직임이 다릅니다. 레버리지의 2배·3배 목표는 하루 기준입니다.", art:()=>`<div class="tour-options">${Object.entries(PRODUCTS).map(([s,p],i)=>`<button data-tour-product="${s}" class="${S.inst===s?'selected':''}" style="--i:${i};--accent:#efab5d"><b>${s}</b><span>${p.title} · 목표 +${p.target}%</span></button>`).join("")}</div>`},
  {title:"알림이 오면<br>할 일부터 봅니다", desc:"정해둔 가격과 살 수 있는 수량을 확인한 다음 증권사에서 직접 주문합니다.", art:()=>`<div class="tour-checklist">${["신호와 알림 상태 확인","지정가와 결제된 현금 확인","체결 수량과 종료 날짜 확인"].map((t,i)=>`<div style="--i:${i}"><span>✓</span>${t}</div>`).join("")}</div>`},
];
let tourPage = -1;
function openTour(step=0,restart=false) {
  const i=Math.max(0,Math.min(TOUR.length-1,step)), direction=i<tourPage&&!restart?"back":"forward";
  tourPage=i;
  const el=$("#tour"), x=TOUR[i];
  const finish=()=>{tourPage=-1; el.hidden=true; document.body.classList.remove("tour-open"); S.tourSeen=true; save(); if(D)render();};
  el.hidden=false; document.body.classList.add("tour-open");
  el.innerHTML=`<div class="tour-inner ${direction} ${i===0?'intro':''}"><div class="tour-top"><span>시작 안내</span><button id="tourSkip">건너뛰기</button></div>
  <div class="tour-steps" aria-label="${i+1} / ${TOUR.length} 단계">${TOUR.map((_,p)=>`<i class="${p<=i?'on':''}"></i>`).join("")}</div>
  <div class="tour-copy"><h1>${x.title}</h1><p>${x.desc}</p></div><div class="tour-art">${x.art()}</div>
  <div class="tour-nav">${i?'<button id="tourPrev">이전</button>':''}<button class="btn" id="tourNext">${i===TOUR.length-1?'홈으로':'다음'}</button></div></div>`;
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
function setLot(n) {
  if (n === S.lot) return; S.lot = n; save();
  D = null; H = null; rawData = null; rawHist = null; histWaiters = [];
  $("#view").innerHTML = wait(`한 묶음 ${n}% 자료를 불러오는 중입니다`); loadData();
}
let RISK = null;
function riskText(n) {
  const r = RISK?.[S.inst]?.[n]?.[S.view === "usd" ? "usd" : "krw"]; if (!r) return "과거 계산을 불러오는 중입니다.";
  return `${S.inst} 기준 2000년부터 계산하면(수수료 빼기 전) 연 ${pct(r.cagr)}, 계좌 최대 낙폭 ${pct(r.mdd)}입니다. 단타 중 계좌 평가손실은 최악 ${pct(r.acc_worst)}(${ymd(r.acc_worst_d).slice(0, 7)}), 단타 상품 비중은 최대 ${pctu(r.w_max, 0)}까지 올라갑니다. 거래 ${r.n}번 중 손실로 끝난 거래 ${r.loss}번.`;
}
function openSettings() {
  if (!RISK) fetch(RISK_URL, {cache: "no-store"}).then((r) => r.json()).then((x) => { RISK = x; const el = $("#lotrisk"); if (el) el.textContent = riskText(Number($("[data-lot].on")?.dataset.lot || S.lot)); }).catch(() => {});
  sheet(`<div class="title">내 설정</div>
    <div class="sub-h">한 묶음 비중</div>${seg(LOTS.map((n) => [String(n), n + "%"]), String(S.lot), "lot")}
    <div class="desc">공포 구간에서 한 번 살 때 계좌의 몇 %를 살지 정합니다. 최대 ${CAPN()}묶음이라 20%면 다 사면 계좌의 100%이고, 하락이 느리면(QQQ 3거래일 하락이 4%에 못 미치면) 그 묶음은 절반만 삽니다. 고른 비중으로 홈·비교·기록·신호의 모든 숫자와 그래프를 다시 계산해 보여 줍니다.</div>
    <div class="alert" id="lotrisk">${riskText(S.lot)}</div>
    <div class="desc">비중을 키우면 과거 수익은 커지지만, 규칙이 맞지 않는 하락이 오면 손실도 같은 배수로 커집니다. 과거 계산은 앞으로의 결과를 보장하지 않습니다.</div>
    <div class="sub-h">매매 수수료(한쪽)</div>
    <div class="sub-h">매매 수수료(한쪽)</div>${seg(FEES, S.fee, "fee")}
    <div class="desc">미국 주식 매매 수수료는 증권사와 우대 조건에 따라 한쪽 0.07%~0.25% 정도로 다릅니다. 이용하는 증권사의 수수료를 고르면 모든 과거 성과에 반영합니다(단타·추세 매매 모두, 체결 미끄러짐 0.02%는 별도 포함). 환전 수수료는 처음 환전할 때 한 번이라 반영하지 않습니다.</div>
    <div class="sub-h">기준</div>${seg([["krw", "원화·세후"], ["usd", "달러·세전"]], S.view, "vw2")}
    <div class="desc">원화·세후: 해외주식 양도소득세 22%(지방세 포함, 연 250만원 공제, 다음 해 5월 신고·납부)와 배당 원천징수 15%를 반영한 매도 시점 금액입니다. 달러·세전: 세금·환율을 빼고 본 금액입니다.</div>
    <div class="sub-h">내 주문 수량 계산</div><label class="form-label" for="setamt">운용 금액 (원)</label><input class="money" id="setamt" inputmode="numeric" placeholder="예: 30000000" value="${esc(S.myKrw)}">
    <label class="form-label" for="setcash">결제 완료 달러 현금 (선택)</label><input class="money" id="setcash" inputmode="decimal" placeholder="증권사 주문가능금액 확인" value="${esc(S.cashUsd)}">
    <div class="desc">운용 금액으로 모델 주 수를 환산합니다. 현금 입력 시 매수 수량에 현금 상한도 적용합니다. 매도 시 실제 보유 주 수를 확인하십시오.</div>
    ${WEB && PUSHST === "on" ? `<div class="sub-h">알림</div><div class="desc">이 기기로 알림을 받고 있습니다.</div><button class="btn ghost" id="pOff">이 기기 알림 끄기</button>` : ""}
    <button class="btn" id="sok">저장</button>`, (close) => {
    if ($("#pOff")) $("#pOff").onclick = async () => { await pushOff(); close(); };
    bindSeg("lot", (v) => { document.querySelectorAll("[data-lot]").forEach((b) => b.classList.toggle("on", b.dataset.lot === v)); $("#lotrisk").textContent = riskText(Number(v)); });
    bindSeg("fee", (v) => { S.fee = v; save(); document.querySelectorAll("[data-fee]").forEach((b) => b.classList.toggle("on", b.dataset.fee === v)); });
    bindSeg("vw2", (v) => { S.view = v; save(); document.querySelectorAll("[data-vw2]").forEach((b) => b.classList.toggle("on", b.dataset.vw2 === v)); });
    $("#sok").onclick = () => { S.myKrw = $("#setamt").value; S.cashUsd=$("#setcash").value; if (!S.sima) S.sima = S.myKrw; save(); const n = Number($("[data-lot].on")?.dataset.lot || S.lot); close(); setLot(n); };
  });
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
function home() {
  const k = S.prof, a = D.accounts[k], plan = a.plan || {}, my = myAmt();
  // 1) 보유 현황
  const s = a.series || [], v0 = s[0] ? (s[0][2] ?? s[0][1] * D.usdkrw) : null, v1 = s.length ? (s.at(-1)[2] ?? s.at(-1)[1] * D.usdkrw) : null;
  const {g, tot} = composition(a), tq = g[S.inst] / tot, shown = Object.entries(g).filter(([, x]) => x / tot > .0005);
  let html = `<button class="card type-context" id="strategyGuide"><span><strong>운용 방식 · ${INFO[k].tag}</strong><small>단타 종목 ${S.inst}</small></span><span>설명 <b>›</b></span></button>
    <div class="card"><div class="row" style="padding:0;border:0"><div class="title">보유 현황</div><div class="r t2">${ymd(D.last_close)} 종가</div></div>
    <div class="t2">가상 계좌 운용 수익률(${ymd(D.start)}~, 원화·세후) <b class="${cls(v1 / v0 - 1)}">${pct(v1 / v0 - 1, 2)}</b></div>
    <div class="stack">${shown.map(([n, x]) => `<span style="width:${x / tot * 100}%;background:${COMP[n][2]}"></span>`).join("")}</div>
    <table class="tbl"><thead><tr><th>종목</th><th class="r">비중</th>${my ? `<th class="r">내 투자금 기준</th>` : ""}</tr></thead><tbody>
    ${shown.map(([n, x]) => `<tr><td><i class="sw" style="background:${COMP[n][2]}"></i><b>${COMP[n][0]}</b><div class="t2">${COMP[n][1]}</div></td><td class="r">${pctu(x / tot)}</td>${my ? `<td class="r">${won(my * x / tot)}</td>` : ""}</tr>`).join("")}
    </tbody></table>`;
  const sell = (plan.swing || []).find((o) => o.how === "목표가"), due = (plan.swing || []).find((o) => o.how === "보유기한");
  if (sell) {
    const avg = parseFloat((sell.why.match(/\$([\d.]+)/) || [])[1]), q = LQ[S.inst], lots = dedupLots(plan.lots);
    html += `<div class="alert"><b>공포 단타 진행 중 · ${S.inst} ${pctu(tq)}</b><br>${tq>=.5 ? "단타 비중이 높습니다. 실제 계좌에서 감당할 수 있는 손실과 남은 현금을 확인하십시오." : "추가 매수에 따라 단타 비중이 커집니다."}</div>
      <div class="kv2"><div>매수</div><div>${lots.map((l, i) => l.how === "예비" ? "예비" : (i + 1) + "차").join("·")} ${lots.length?`(${ymd(lots[0].d).slice(5)}~${ymd(lots.at(-1).d).slice(5)})`:""}</div>
      <div>전략 기준 단가</div><div>${usd2(avg)}</div><div>목표가(+${PRODUCTS[S.inst].target}%)</div><div class="up">${usd2(sell.limit)}</div>
      ${q ? `<div>현재가</div><div><b>${usd2(q.c)}</b> · 목표가까지 ${pct(sell.limit / q.c - 1)}</div>` : ""}
      <div>보유 기한</div><div>${due ? ymd(due.session) + " 장 마감" : "-"}</div></div>`;
  }
  const tr = D.trend;
  if (tr) html += `<div class="t2" style="margin-top:10px">추세: ${tr.next_in ? `<b class="up">상승</b> · QQQM 보유` : `<b class="down">하락</b> · 단기국채 대기`} (QQQ ${usd2(tr.close)}, 200일선 대비 ${pct(tr.gap)}, ${tr.next_in ? "이탈선 " + usd2(tr.exit_line) : "재진입선 " + usd2(tr.entry_line)})</div>`;
  html += `</div>`;
  // 2) 이 날 시작했다면
  const n = (plan.swing || []).length + (plan.alloc || []).length;
  html += `<div class="card"><div class="title">이 날 시작했다면</div><div class="desc">과거 자료 모의 · 수수료 ${feeTxt()} 반영</div>
    <div class="simf"><label>시작일<input type="date" id="simd" min="2000-01-03" value="${S.simd}"></label><label>금액(선택)<input id="sima" inputmode="numeric" placeholder="비우면 %로 표시" value="${esc(S.sima)}"></label></div>
    <div class="chips">${QUICK().map(([d, t]) => `<button class="chipb ${S.simd === d ? "on" : ""}" data-qd="${d}">${t}</button>`).join("")}</div>
    <div id="simsum"></div><div id="simchart"></div><div class="chart-cap" id="simcap"></div></div>
    <div class="card" style="padding:4px 18px"><div class="row" onclick="go('todo')" style="cursor:pointer"><div class="l"><div class="t1">다음 거래일 주문 ${n ? `<span style="color:${col(k)}">${n}건</span>` : "없음"}</div><div class="t2">${D.next_session ? openKst(D.next_session) + " 정규장 개장(한국시간)" : "휴장일 확인 필요"}</div></div><div class="r mute">›</div></div></div>
    <div class="foot">과거 자료로 계산한 모의 결과입니다. ${S.inst!=="QQQ"?`${S.inst} 상장 전 기간에는 가정 가격이 포함됩니다. `:""}${D.health.length ? ` <b class="warn">자료 확인 필요 ${D.health.length}건(신호 탭)</b>` : ""}</div>`;
  $("#view").innerHTML = appCard() + html; bindAppCard();
  $("#strategyGuide").onclick=openGuide;
  const reSim = () => { S.simd = $("#simd").value || S.simd; S.sima = $("#sima").value; save(); drawSim(); };
  $("#simd").onchange = reSim; $("#sima").oninput = () => { clearTimeout(window._st); window._st = setTimeout(reSim, 500); };
  document.querySelectorAll("[data-qd]").forEach((b) => b.onclick = () => { S.simd = b.dataset.qd; $("#simd").value = S.simd; save(); document.querySelectorAll("[data-qd]").forEach((x) => x.classList.toggle("on", x === b)); drawSim(); });
  if (!needHist(() => S.tab === "home" && render())) { $("#simchart").innerHTML = wait("과거 자료를 불러오는 중입니다"); return; }
  $("#simd").max = H.last; drawSim();
  if (!tickT) liveTick();
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
const histOptions = () => [["1",S.inst==="QQQ"?"장기 시험":"가정 가격 포함"],["0",S.inst==="QQQ"?"실물 기준":"단타 상품 상장 후"]];
const fold = (id,title,summary,contents) => `<details class="card section-fold" data-fold="${id}" ${S.folds[id]?"open":""}><summary><b>${title}</b><span>${summary}</span></summary><div class="fold-body">${contents}</div></details>`;
function compare() {
  let html = `<div class="card compare-intro"><div class="title">${P[S.prof].name} · ${S.inst} 비교</div>${seg(histOptions(), S.assume ? "1" : "0", "as")}
    ${seg([["krw", "원화·세후"], ["usd", "달러·세전"]], S.view, "vw")}
    <div class="t2">수수료 한쪽 ${feeTxt()} 반영 · <a href="#" id="feeLink">수수료 바꾸기</a></div></div>`;
  if (!needHist(() => S.tab === "compare" && render())) { $("#view").innerHTML = html + wait("비교 자료를 불러오는 중입니다"); bindCompare(); return; }
  const btn = S.assume ? "assume" : "real", bt = H.bt[btn], view = S.view, xs = H.dates.slice(bt.i0), keys = [...ORDER, "qqq"];
  const V = Object.fromEntries(keys.map((kk) => [kk, vals(btn, kk, view)])), st = Object.fromEntries(keys.map((kk) => [kk, jstats(V[kk])]));
  const sel = S.prof, sq = st.qqq, ss = st[sel], yrs = (xs.length / 252).toFixed(0);
  // 1) 한눈에 보기
  const bar = (title, sub, f, fmt, worse) => { const vs = keys.map((kk) => f(st[kk])), mx = Math.max(...vs.map(Math.abs));
    return `<div class="metric"><div class="h">${title}</div><div class="hs">${sub}</div>${keys.map((kk, i) => `<div class="cmp"><span class="nm" style="color:${col(kk)}">${P[kk].name}</span><div class="tr"><span style="width:${Math.max(3, Math.abs(vs[i]) / mx * 100)}%;background:${worse ? "var(--down)" : col(kk)};opacity:${kk === sel || kk === "qqq" ? 1 : .55}"></span></div><span class="v">${fmt(vs[i])}</span></div>`).join("")}</div>`; };
  html += fold("overview","수익률 · 최대 낙폭",`${P[sel].name} 연 ${pct(ss.cagr)} · 최대 낙폭 ${pct(ss.mdd)}`,`<div class="desc">${ymd(xs[0])}부터 약 ${yrs}년, ${view === "krw" ? "원화·세후" : "달러·세전"}</div>
    <div class="hl"><b style="color:${col(sel)}">${P[sel].name}</b>은 QQQ 보유보다 연평균 수익률이 <b>${(Math.abs(ss.cagr - sq.cagr) * 100).toFixed(1)}%p ${ss.cagr >= sq.cagr ? "높고" : "낮고"}</b>, 최대 낙폭은 <b>${(Math.abs(ss.mdd - sq.mdd) * 100).toFixed(0)}%p ${ss.mdd >= sq.mdd ? "작았습니다" : "컸습니다"}</b>.</div>
    ${bar("연평균 수익률", "해마다 같은 비율로 불었다고 볼 때", (s) => s.cagr, (v) => pct(v))}
    ${bar("최대 낙폭", "직전 고점에서 가장 크게 떨어진 폭", (s) => s.mdd, (v) => pct(v, 0), true)}
    ${bar("원금 대비", "처음 돈이 지금 몇 배가 되었나", (s) => s.mult, xmult)}`);
  // 2) 누적 추이
  html += fold("chart","평가금액 추이",`${P[sel].name}만 또는 QQQ와 나란히`,`${seg([["self",`${P[sel].name}만`],["duel","QQQ와 비교"]],S.compSet,"cmpfilter","sm")}
    ${seg([["amt", "평가금액"], ["log", "원금 대비 배수"], ["ret", "기간 수익률"]], S.cmode, "cm", "sm")}
    ${seg([["all", "전체"], ["10y", "10년"], ["5y", "5년"], ["3y", "3년"], ["1y", "1년"]], S.crange || "all", "cr", "sm")}
    <div id="cmpchart"></div><div class="legend" style="margin-top:6px"><span><i style="background:var(--sg)"></i>${P[sel].name} 현금성 50% 이상</span><span><i style="background:var(--tq)"></i>${P[sel].name} ${S.inst} 단타 보유</span></div>
    <div class="chart-cap">${S.cmode === "amt" ? "시험 원금으로 시작한 일별 평가금액입니다." : S.cmode === "ret" ? "화면 왼쪽 끝 날짜를 0%로 맞춰 다시 계산합니다." : "시작 금액을 1로 둔 배수입니다."} 두 손가락으로 확대, 두 번 누르면 원래대로.</div>`);
  // 3) 성과의 원천과 검증
  const rb = H.robust || [], cur = rb[0], nos = rb[1];
  if (rb.length) html += fold("robust","단타 기여도","단타 제외 · 기준 변경 시험",`
    <div class="desc">추세 추종만 했다면 연 ${pct(nos.cagr)}로 QQQ 보유와 비슷합니다. 차이의 대부분은 공포 단타(TQQQ)에서 나옵니다. 규칙 값을 바꿔 다시 계산해도 결과가 크게 무너지지 않는지 점검했습니다(달러·세전).</div>
    <table class="tbl"><thead><tr><th>규칙</th><th class="r">2000~ 연평균</th><th class="r">최대 낙폭</th><th class="r">2010~ 연평균</th></tr></thead><tbody>
    ${rb.map((r, i) => `<tr class="${i < 2 ? "em" : ""}"><td>${esc(r.label)}</td><td class="r">${pct(r.cagr)}</td><td class="r">${pct(r.mdd, 0)}</td><td class="r">${pct(r.cagr10)}</td></tr>`).join("")}</tbody></table>
    <div class="alert"><b>과거 자료에서 고른 규칙입니다.</b><br>실제 성과에는 주문 지연·미체결·결제 제약이 반영될 수 있습니다.</div>`);
  // 4) TQQQ 변동성
  const sc = bt.score[view][sel], rr = (bt.acc[sel].rounds || []).filter((r) => r.acc != null).slice().sort((p, q) => p.acc - q.acc).slice(0, 5);
  html += fold("risk",`${S.inst} 단타 중 평가손실`,`거래 중 계좌 최대 평가손실(장중 저가) ${pct(sc.sw_acc_worst)}`,`
    <div class="kpis">
      <div class="kpi"><div class="l">계좌 변동성(연환산)</div><div class="v down">${pctu(sc.vol_swing, 0)}</div><div class="s">평소 ${pctu(sc.vol_other, 0)}</div></div>
      <div class="kpi"><div class="l">하루 최대 하락</div><div class="v down">${pct(sc.worst_day_swing)}</div><div class="s">평소 ${pct(sc.worst_day_other)}</div></div>
      <div class="kpi"><div class="l">거래 중 최대 평가손실(계좌·장중 저가)</div><div class="v down">${pct(sc.sw_acc_worst)}</div><div class="s">평균 ${pct(sc.sw_acc_avg)}</div></div>
      <div class="kpi"><div class="l">${S.inst} 단타 보유 기간</div><div class="v">${pctu(sc.days_tqqq, 1)}</div><div class="s">전체 거래일 중</div></div></div>
    <div class="sub-h">평가손실이 컸던 거래</div><table class="tbl"><thead><tr><th>시작일</th><th class="r">최대 평가손실(계좌)</th><th class="r">최종 수익률</th></tr></thead><tbody>
    ${rr.map((r) => `<tr><td>${ymd(r.buys[0].d)}${r.proxy ? ` <span class="chip as">가정</span>` : ""}</td><td class="r down">${pct(r.acc)}</td><td class="r ${cls(r.ret)}">${r.ret == null ? "진행 중" : pct(r.ret)}</td></tr>`).join("")}</tbody></table>`);
  // 5) 따라 하기 쉬운가
  html += fold("practice","주문 빈도",`과거 연평균 ${sc.days_per_year.toFixed(0)}일 주문`, `<div class="desc">미리 예약할 수 있는 주문과 마감 확인 뒤 낼 주문을 함께 봅니다.</div>
    <div class="kpis">
      <div class="kpi"><div class="l">연평균 주문하는 날</div><div class="v">${sc.days_per_year.toFixed(0)}일</div><div class="s">1년 약 250거래일 중</div></div>
      <div class="kpi"><div class="l">미리 걸어 두는 주문</div><div class="v">${pctu(sc.pre, 0)}</div><div class="s">전체 주문 중</div></div>
      <div class="kpi"><div class="l">장 마감 직후 주문이 필요한 날</div><div class="v">연 ${sc.close_days_per_year.toFixed(0)}일</div><div class="s">한국 아침 6~8시 시간외</div></div>
      <div class="kpi"><div class="l">기한일 종가 매도</div><div class="v">연 ${sc.moc_days_per_year.toFixed(1)}일</div><div class="s">마지막 매수 후 10거래일 안에 목표가 미도달 시</div></div></div>
    <table class="tbl"><thead><tr><th>주문</th><th>언제 거나</th></tr></thead><tbody>
      <tr><td>목표가 매도</td><td>매수 직후 한 번 걸어 두면 체결될 때까지 유지(GTC)</td></tr>
      <tr><td>신규 매수(지정가)</td><td>전날 밤 알림을 보고 다음 장 전에 예약</td></tr>
      <tr><td>장 마감 매수</td><td>마감 직후 알림(한국 아침 6시대)을 보고 시간외로 주문</td></tr>
      <tr><td>추세 매수·매도</td><td>전날 밤 다음 장 지정가(전일 종가 ±2%)로 예약</td></tr>
      <tr><td>보유 기한 매도</td><td>목표 주문 취소와 보유 주 수를 확인한 뒤 청산</td></tr></tbody></table>`);
  // 6) 임의 시점 N년 + 7) 세부 성적표
  html += fold("rolling","시작 시점별 성과","1·3·5·10년 · 최악 사례",`<div class="desc">분기별로 다른 날 시작한 원화·세후 과거 사례입니다. 상장 전 가정 가격이 포함될 수 있습니다.</div>${seg(HSEG,S.h,"h")}<div id="rolltable"></div><div id="rollc2"></div>`)
    + fold("score","세부 성적표",`${ymd(bt.start)}부터 · 수익·낙폭·거래 수`,`<div id="sctable"></div>`);
  $("#view").innerHTML = html; bindCompare();
  $("#feeLink").onclick = (e) => { e.preventDefault(); openSettings(); };
  bindSeg("cm", (v) => { S.cmode = v; save(); render(); });
  bindSeg("cr", (v) => { S.crange = v; save(); render(); });
  bindSeg("cmpfilter", (v) => { S.compSet=v; save(); render(); });
  const visibleKeys = S.compSet==="self"?[sel]:S.compSet==="duel"?[sel,"qqq"]:keys;
  const lines = visibleKeys.map((kk) => { const v = V[kk], b0 = v[0]; return {type: "line", name: P[kk].name, raw: v.map((x) => x / b0), y: S.cmode==="amt"?v:v.map((x) => x / b0), color: css(P[kk].v), w: kk === sel ? 2.2 : 1.5}; });
  const dep = bt.dep[view]; if(S.compSet==="all") lines.push({type: "line", name: P.dep.name, raw: dep.map((x) => x / dep[0]), y: S.cmode==="amt"?dep:dep.map((x) => x / dep[0]), color: css("--dep"), dash: [5, 4], w: 1.3});
  const dd = (arr) => { let pk = -Infinity; return arr.map((v) => { pk = Math.max(pk, v); return (v / pk - 1) * 100; }); };
  const ddl = visibleKeys.map((kk) => ({type: "line", name: P[kk].name, y: dd(V[kk]), color: css(P[kk].v), w: kk === sel ? 1.8 : 1.1}));
  const acc = bt.acc[sel], vb = [...acc.cash50.map(([a, b]) => ({i0: a, i1: b, color: css("--sg")})), ...acc.swing.map(([a, b]) => ({i0: a, i1: b, color: css("--tq")}))];
  const rg = {all: xs.length, "10y": 2520, "5y": 1260, "3y": 756, "1y": 252}[S.crange || "all"];
  const amountLabel = (v) => view==="krw"?won(v*1e4):usd2(v);
  function buildChart(){
  if($("#cmpchart").firstChild)return;
  const ch = mkChart($("#cmpchart"), {x: xs, height: 400, range: [Math.max(0, xs.length - rg), xs.length - 1], xfmt: (d) => ymd(d),
    panes: [{h: 3, log: S.cmode === "log", rebase: S.cmode === "ret", fmt: S.cmode === "amt"?amountLabel:S.cmode === "ret" ? (x) => (x > 0 ? "+" : "") + Math.round(x) + "%" : (x) => "×" + (x >= 10 ? Math.round(x) : x.toFixed(1)), series: lines},
            {h: 1.1, fmt: (x) => Math.round(x) + "%", series: ddl, hlines: [{y: 0, color: css("--line"), dash: []}], legend: [{name: "고점 대비 낙폭(%)", color: css("--mute")}], tag: false},
            {h: .25, series: [], vbands: vb, legend: [], tag: false, fmt: () => ""}],
    tip: (i) => { const a0 = ch ? ch.r[0] : 0; return `<b>${ymd(xs[i])}</b>` + lines.map((s) => `<div class="tr"><i style="background:${s.color}"></i>${s.name}<b>${S.cmode==="amt"?amountLabel(s.y[i]):xmult(s.raw[i])}</b><span class="${cls(s.raw[i] / s.raw[a0] - 1)}">${pct(s.raw[i] / s.raw[a0] - 1, 1)}</span></div>`).join("") + `<div class="t2">수익률은 화면 왼쪽 끝(${ymd(xs[a0])}) 대비입니다.</div>`; }});
  }
  const drawFold = (id) => {
    if(id==="chart")buildChart();
    if(id==="rolling"&&!$("#rolltable").firstChild){rollTable($("#rolltable"),S.h); if(H.rolling)rolling(document.createElement("div"),$("#rollc2"),[sel,"qqq"],S.h);}
  };
  $("#view").querySelectorAll("[data-fold]").forEach(el=>{if(el.open)drawFold(el.dataset.fold); el.addEventListener("toggle",()=>{S.folds[el.dataset.fold]=el.open;save();if(el.open)drawFold(el.dataset.fold);});});
  scoreTable($("#sctable"), bt.score[view], bt.score[view].dep, view);
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
  ["목표가", "목표가 매도", "평균 매수단가 대비 +7.5%(QQQ 기준 약 +2.5%에 해당)에 지정가로 전량 매도합니다. 공포 구간 직후의 단기 반등 폭을 노리는 규칙이며, 주문은 체결될 때까지 유지(GTC)합니다."],
  ["보유기한", "보유 기한 매도", "마지막 매수일로부터 10거래일 안에 목표가에 도달하지 못하면 손익과 관계없이 기한일 장 마감에 전량 매도합니다. 반등이 늦어질 때 레버리지 상품을 오래 들고 있으면 생기는 변동성 손실을 막기 위한 규칙입니다."],
  ["전일 종가 지정가", "신규 매수(전일 종가 지정가)", "공포 구간이고, QQQ가 1년 고점 대비 -10%~-25% 범위이며, RSI(14)가 이미 30 미만으로 마감했습니다. 다음 거래일에 전일 종가 이하에서 체결되도록 한 묶음(내 설정 비중, 느린 하락이면 절반)을 지정가 매수합니다."],
  ["RSI30 지정가", "신규 매수(RSI 30 지정가)", "공포 구간이고 고점 대비 하락 범위 안에 있지만 RSI(14)가 아직 30 이상입니다. QQQ가 RSI 30에 해당하는 가격까지 내려와야 체결되도록, 그 가격을 TQQQ 가격으로 환산해 지정가 매수합니다."],
  ["RSI26 지정가", "신규 매수(RSI 26 지정가)", "공포 구간이 아닐 때는 기준을 강화해 RSI 26에 해당하는 가격에서만 매수합니다."],
  ["대기자금 매도", "대기자금 매도", "추세 매수(QQQM)에 쓸 자금을 마련하기 위해 대기 중인 단기국채를 매도합니다."],
  ["추세 매수", "추세 매수", "QQQ 종가가 200일 이동평균선보다 3% 이상 높게 마감해 상승 추세로 전환되었습니다. 다음 거래일에 QQQM을 목표 비중까지 매수합니다(전일 종가 +2% 이내 지정가)."],
  ["추세 매도", "추세 매도", "QQQ 종가가 200일 이동평균선보다 3% 이상 낮게 마감해 하락 추세로 전환되었습니다. 다음 거래일에 QQQM을 매도하고 단기국채로 대기합니다(전일 종가 -2% 이내 지정가)."],
  ["단기국채 매수", "단기국채 매수", "하락 추세 구간에는 주식 대신 단기국채(SGOV)로 이자를 받으며 대기합니다."],
  ["자산배분 리밸런싱", "자산배분 리밸런싱", "안정형의 자산배분 모델(계좌의 50%)이 목표 비중을 바꿨습니다. 전일 종가 ±2% 이내 지정가로 비중을 조정합니다."]];
const whyOf = (how) => WHY.find(([k]) => String(how).startsWith(k)) || [how, how, ""];
// 과거 체결 기록의 사유(봇 내부 이름) → 표시 이름
const TRADE_WHY = {"목표가": "목표가 매도", "보유 기한": "보유 기한 매도", "시가 익절": "시가 매도(목표가 이상 출발)", "종가 지정가": "전일 종가 지정가 매수", "RSI30 지정가": "RSI 30 지정가 매수",
  "RSI26 지정가": "RSI 26 지정가 매수", "마감": "장 마감 매수(시간외)", "예비": "예비 매수", "급락": "급락일 매수", "추세 위: QQQM": "추세 매수(QQQM)", "추세 아래: 대기": "추세 매도(단기국채 대기)",
  "단타 끝, 자산배분 되사기": "단타 종료 후 재매수", "남는 돈 맞추기": "잔여 자금 재배분", "자산배분": "자산배분 리밸런싱", "단타 자금 마련": "단타 자금 마련 매도"};
const tw = (w) => TRADE_WHY[w] || w;
function todo() {
  const k = S.prof, a = D.accounts[k], plan = a.plan || {};
  const f = myAmt() && D.usdkrw && a.equity_usd ? myAmt() / (a.equity_usd * D.usdkrw) : null;
  const cashText=String(S.cashUsd||"").replace(/,/g,"").trim(), cash=Number(cashText);
  let buyingCash=cashText&&Number.isFinite(cash)&&cash>=0?cash:null;
  const hold=(plan.hold||[]).length>0;
  const currentAfter = (plan.after||[]).filter(o=>Date.parse(o.expires_at)>Date.now());
  const os = [...currentAfter,...(plan.swing || []), ...(plan.alloc || [])].filter(o=>o.qty>0);
  const notice=a.notice, nativeStatus=AND?.notificationsEnabled?.();
  let html = `<div class="card notice-card"><div class="notice-status"><div><div class="t2">${P[k].name} · ${S.inst}</div><div class="title">${esc(notice?.title || "알림 상태 확인 중")}</div></div>${notice?`<span class="notice-chip ${notice.level}">${notice.level==="none"?"보낼 알림 없음":notice.action?"주문 알림 대상":"상태 알림 대상"}</span>`:""}</div>
    <div class="desc">${nativeStatus===false?"휴대폰 알림이 꺼져 있습니다.":nativeStatus===true?"휴대폰 알림이 켜져 있습니다. 새 마감 자료 확인 뒤 알림이 표시됩니다.":""}</div>
    ${nativeStatus===false?'<button class="secondary" id="enableNotices">휴대폰 알림 설정</button>':nativeStatus===true?'<button class="secondary" id="testNotice">테스트 알림</button>':""}</div>
    <div class="card order-context"><div><div class="title">주문 계획</div><div class="t2">${D.next_session ? openKst(D.next_session) + " 개장" : "다음 개장 확인 중"} ${ymd(D.last_close)} 종가 기준</div>
    <div class="t2">${f ? `${won(myAmt())} 기준 예상 주 수` : "가상 계좌 기준 주 수"}${buyingCash!==null?` · 결제 현금 ${usd2(buyingCash)}`:""}</div></div><button class="secondary" id="orderSize">내 수량 설정</button></div>`;
  if (hold) html += `<div class="card"><div class="alert" style="margin:0"><b>주문 보류</b><br>${esc(plan.hold.join(" · "))}</div></div>`;
  html += `<div class="card"><div class="title">주문 내역 ${os.length}건</div>`;
  if (!os.length) html += `<div class="desc">예정된 주문이 없습니다.</div>`;
  os.forEach((o) => {
    const [, title, theory] = whyOf(o.how), buy = o.side === "buy", q = LQ[o.symbol];
    const planned=f?Math.floor(o.qty*f):o.qty, unit=o.limit*(1+Number(S.fee));
    const mine=buy&&f&&buyingCash!==null&&unit>0?Math.min(planned,Math.floor(buyingCash/unit)):planned;
    if(buy&&f&&buyingCash!==null&&unit>0)buyingCash=Math.max(0,buyingCash-mine*unit);
    const sizing=hold?"보류":`${mine.toLocaleString()}주${mine<planned?` · 계획 ${planned}주 중 현금 한도`:""}`;
    html += `<div class="order ${o.side}"><div class="h"><span><span class="badge ${buy ? "b" : "s"}">${buy ? "매수" : "매도"}</span> <b>${esc(o.symbol)}</b> · ${esc(title)}</span><span class="px">${o.limit ? usd2(o.limit) : "종가"}</span></div>
      <div class="kv"><div>주문 유형</div><div>${o.limit ? "지정가" : "시장가(장 마감 전) · 목표가 주문 취소 후"}</div>
      <div>${f?"내 예상 수량":"주문 수량"}</div><div><b>${sizing}</b></div>
      <div>주문 일자</div><div>${ymd(o.session)}${o.expires_at?" (오늘 시간외)":o.session !== D.next_session ? " (예약)" : ""}</div><div>주문 기간</div><div>${esc(o.until)}</div>
      <div>산출 근거</div><div>${esc(o.why)}</div>
      ${q && o.limit ? `<div>현재가</div><div>${usd2(q.c)} · 주문가까지 ${pct(o.limit / q.c - 1)} <span class="mute">${kst(q.time).slice(5)} KST</span></div>` : ""}</div>
      ${theory ? `<details class="more"><summary>전략 근거</summary><div class="desc">${theory}</div></details>` : ""}</div>`;
  });
  html += `</div>`;
  html += `<div class="foot">이 앱은 주문표를 제공합니다. 증권사에서 실제 현금·보유량과 체결 상태를 확인한 후 직접 주문하십시오. 표시된 수량은 가상 장부를 기준으로 계산한 값입니다.</div>`;
  $("#view").innerHTML = html;
  $("#orderSize").onclick=openSettings;
  if($("#enableNotices"))$("#enableNotices").onclick=()=>AND.notificationSettings();
  if($("#testNotice"))$("#testNotice").onclick=()=>AND.testOrderNotification?.();
}
function checks(g, lots, reserveLine) {
  const row = (ok, name, val, rule) => `<div class="chk"><span class="st ${ok === true ? "ok" : ok === false ? "no" : "na"}">${ok === true ? "충족" : ok === false ? "미충족" : "보류"}</span><div><div class="t1">${name}</div><div class="t2">${val} · 기준 ${rule}</div></div></div>`;
  const fear = g.fear === true ? true : g.fear === false ? false : null;
  const cap=g.max_regular_lots||5, ready=Boolean(fear&&g.band&&g.rsi<30&&lots<cap), waiting=fear===null||g.rsi==null;
  return `<div class="signal-result ${ready?'ready':''}"><b>${waiting?'자료 확인 중':ready?'일반 매수 조건 충족':'일반 매수 조건 대기'}</b><small>아래 네 줄은 모두 충족 · VIX와 공포탐욕은 둘 중 하나</small></div>`
    + row(fear, "공포 구간", `VIX ${num(g.vix, 1)} / 공포탐욕지수 ${g.fg != null ? Math.round(g.fg) : "-"}`, "VIX 30 이상 또는 공포탐욕지수 30 이하")
    + row(g.band, "고점 대비 하락 범위", `QQQ 1년 고점 대비 ${pct(g.dd)}`, "-10% ~ -25%")
    + row(g.rsi != null ? g.rsi < 30 : null, "과매도(RSI 14)", `RSI ${num(g.rsi, 1)}`, "30 미만")
    + row(lots < cap, "남은 기본 차수", `${lots}차 보유`, `기본 최대 ${cap}차`)
    + (g.speed != null ? `<div class="chk"><span class="st ${g.slow ? "na" : "ok"}">${g.slow ? "절반" : "전액"}</span><div><div class="t1">하락 속도(매수 크기)</div><div class="t2">QQQ ${g.speed_n || 3}거래일 ${pct(g.speed)} · 기준 -4% 이하면 한 묶음 ${S.lot}%, 아니면 절반 ${S.lot / 2}%${g.speed_line ? ` · 다음 장 QQQ ${usd2(g.speed_line)} 이하 마감 시 빠른 하락` : ""}</div></div></div>` : "")
    + `<details class="more"><summary>일반 조건과 별개로 검토하는 매수</summary>
    ${row(g.fear===false && g.band && g.rsi>=30 && lots<cap,"RSI 26 지정가", "공포 구간 밖에서 대기 주문", "하락 범위 안 · 계산한 RSI 26 가격")}
    ${row(g.crash==null?null:g.crash&&lots<cap,"급락 예외", `QQQ 1일 ${pct(g.day_return)} · 5거래일 ${pct(g.five_return)}`, "1일 −2.5%와 5거래일 −7.5% 동시 하회")}
</details>`;
}

// ── 기록(차트) ──
const LSYM = [["TQQQ", "TQQQ"], ["QLD", "QLD"], ["QQQ", "QQQ"], ["QQQM", "QQQM"], ["ACC", "계좌"]];
const LR = [["1d", "1일"], ["5d", "1주"], ["1m", "1개월"], ["3m", "3개월"], ["6m", "6개월"], ["1y", "1년"], ["5y", "5년"], ["all", "전체"]];
const BARS = {"1m": 21, "3m": 63, "6m": 126, "1y": 252, "5y": 1260, all: 1e9};
const NAMES = {TQQQ: "TQQQ · 나스닥100 일간 3배", QLD:"QLD · 나스닥100 일간 2배", QQQ: "QQQ · 나스닥100", QQQM: "QQQM · 나스닥100(저보수)", ACC: "계좌 평가금액"};
let logChart = null, sigChart = null;
function log() {
  let html = `<div class="card">${seg(LSYM, S.lsym, "ls", "sm")}<div id="qhead"></div>
    ${seg(LR, S.lrange, "lr", "sm")}${S.lsym !== "ACC" ? seg([["candle", "캔들"], ["line", "라인"]], S.ltype, "lt", "sm tiny") : ""}
    <div id="logchart"></div><div class="chart-cap" id="logcap"></div></div><div id="trades"></div><div id="rounds"></div>`;
  $("#view").innerHTML = html;
  bindSeg("ls", (v) => { S.lsym = v; save(); render(); });
  bindSeg("lr", (v) => { S.lrange = v; save(); render(); });
  bindSeg("lt", (v) => { S.ltype = v; save(); render(); });
  if (!needHist(() => S.tab === "log" && render())) { $("#logchart").innerHTML = wait("차트 자료를 불러오는 중입니다"); return; }
  drawLog(); liveTick();
  // 실전 체결
  const k = S.prof, lt = (D.accounts[k].trades || []).slice().reverse();
  $("#trades").innerHTML = `<div class="card"><div class="title">실전 체결 내역(가상 계좌, ${ymd(D.start)}~)</div>` + (lt.length ? `<table class="tbl"><thead><tr><th>일자</th><th>구분</th><th class="r">수량</th><th class="r">체결가</th></tr></thead><tbody>${lt.map((t) => `<tr><td>${ymd(t.date).slice(2)}</td><td><span class="badge ${t.side === "buy" ? "b" : "s"}">${t.side === "buy" ? "매수" : "매도"}</span> ${esc(t.symbol)}<div class="t2">${esc(tw(t.why))}</div></td><td class="r">${t.qty.toLocaleString()}주</td><td class="r">${usd2(t.price)}</td></tr>`).join("")}</tbody></table>` : `<div class="desc">아직 체결 내역이 없습니다.</div>`) + `</div>`;
  // 과거 공포 단타 회차
  const bt = H.bt[S.assume ? "assume" : "real"], rounds = (bt.acc[k].rounds || []).slice().reverse(), years = [...new Set(rounds.map((r) => r.buys[0].d.slice(0, 4)))];
  const shown = S.year === "all" ? rounds : rounds.filter((r) => r.buys[0].d.startsWith(S.year)), done = rounds.filter((r) => r.ret != null);
  $("#rounds").innerHTML = `<div class="card"><div class="title">과거 공포 단타 ${done.length}회 · 수익 ${done.filter((r) => r.ret > 0).length}회</div>
    ${seg(histOptions(), S.assume ? "1" : "0", "as")}
    <select id="yr"><option value="all">전체 연도</option>${years.map((y) => `<option ${S.year === y ? "selected" : ""}>${y}</option>`).join("")}</select>
    <table class="tbl rounds"><thead><tr><th>매수 → 매도</th><th>매수 시 지표</th><th class="r">수익률</th></tr></thead><tbody>
    ${shown.map((r, j) => { const g = r.buys[0].sig || {}; return `<tr data-rd="${j}"><td>${ymd(r.buys[0].d).slice(2)}<br><span class="mute">${r.sell ? "→ " + ymd(r.sell.d).slice(2) : "보유 중"} · ${r.buys.length}회 매수</span>${r.proxy ? `<br><span class="chip as">가정 가격</span>` : ""}</td>
      <td class="t2">RSI ${num(g.rsi, 1)} · VIX ${num(g.vix, 1)}<br>공포탐욕 ${g.fg != null ? Math.round(g.fg) : "자료 없음"} · 고점 ${pct(g.dd)}<br>${r.sell ? esc(tw(r.sell.why)) : ""}</td><td class="r"><b class="${cls(r.ret)}">${r.ret == null ? "진행 중" : pct(r.ret)}</b></td></tr>`; }).join("") || `<tr><td colspan="3" class="desc">해당 연도에는 공포 단타가 없었습니다.</td></tr>`}</tbody></table></div>`;
  bindSeg("as", (v) => { S.assume = v === "1"; save(); render(); });
  $("#yr").onchange = (e) => { S.year = e.target.value; save(); render(); };
  document.querySelectorAll("[data-rd]").forEach((tr) => tr.onclick = () => {
    const r = shown[+tr.dataset.rd]; S.lsym = S.inst; S.lrange = "3m"; save();
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
    const di = Object.fromEntries(x.map((d, i) => [d, i])), mk = [], seen = new Set();
    const addT = (d, side, s, p, why) => { const key = d + side + s + p; if (s !== sym || seen.has(key) || di[d] == null) return; seen.add(key);
      mk.push({i: di[d], y: side === "b" ? Math.min(p, l[di[d]] ?? p) : Math.max(p, h[di[d]] ?? p), kind: side === "b" ? "buy" : "sell", p, why}); };
    // 11-27: 보고 있는 차트 종목(QQQ·QLD·TQQQ)의 모델 기록으로 매수·매도 표시(예전엔 고른 단타 상품 것만 → TQQQ 외엔 표시 없음)
    const own = PRODUCTS[sym] ? (sym === "TQQQ" ? rawHist : rawHist?.variants?.[sym]) : null;
    const sbt = own?.bt?.[S.assume ? "assume" : "real"] || bt;
    const sacc = PRODUCTS[sym] ? ((sym === "TQQQ" ? rawData?.accounts : rawData?.variants?.[sym]?.accounts) || D.accounts) : D.accounts;
    sbt.acc[k].trades.forEach((t) => addT(t[0], t[1], t[2], t[3], t[5]));
    (sacc[k]?.trades || []).forEach((t) => addT(t.date, t.side[0], t.symbol, t.price, t.why));
    const plan = sacc[k]?.plan || {}, sell = (plan.swing || []).find((z) => z.how === "목표가" && z.symbol === sym);
    const vb = own ? sbt.acc[k].swing.map(([a, b]) => ({i0: sbt.i0 + a, i1: sbt.i0 + b, color: css("--tq") + "26"})) : [];
    // 11-27 사용자: 사는 구간(QQQ 1년 고점 대비 -10%~-25%)을 이 종목 가격으로 옮겨 흐리게. 레버리지는 '그날 QQQ가 그 선에서 마감했다면' 근사(일간 배수)
    const kx = {QQQ: 1, QQQM: 1, QLD: 2, TQQQ: 3}[sym] || 1, [B0, B1] = H.band || [-0.10, -0.25];
    const bl = (B) => c.map((v, i) => (i < n0 && H.qdd?.[i] != null && v != null) ? v * (1 + kx * ((1 + B) / (1 + H.qdd[i]) - 1)) : null);
    const bTop = bl(B0), bBot = bl(B1), bcol = css("--up");
    rounds_ = (sbt.acc[k].rounds || []);
    price = {pane: {h: 3, log: S.lrange === "all" || S.lrange === "5y", fmt: (y) => "$" + (y >= 100 ? y.toFixed(0) : y.toFixed(2)),
      series: [{type: S.ltype === "line" ? "line" : "candle", name: sym, o, h, l, c, y: c, color: css("--ink"), w: 1.6},
        {type: "line", y: bTop, color: bcol + "55", w: 1, dash: [3, 3], nofit: true, noleg: true},
        {type: "line", y: bBot, color: bcol + "55", w: 1, dash: [3, 3], nofit: true, noleg: true}],
      bands: [{ya: bTop, yb: bBot, color: bcol + "0d"}],
      markers: mk, vbands: vb, hlines: sell ? [{y: sell.limit, label: `목표가 ${usd2(sell.limit)}`, color: css("--up"), dash: [6, 4]}] : []}, mk};
  }
  const N = x.length, rg = BARS[S.lrange] || 126, real = sym !== "ACC" ? H.px[sym].real_from : null;
  const tip = (i) => {
    let s = `<b>${ymd(x[i])}${i >= n0 ? " (장중)" : ""}</b>`;
    if (sym === "ACC") price.pane.series.forEach((z) => { s += `<div class="tr"><i style="background:${z.color}"></i>${z.name}<b>${xmult(z.y[i])}</b></div>`; });
    else { const z = price.pane.series[0], pc = z.c[i - 1]; s += `<div class="g4"><span>시가</span><b>${usd2(z.o[i])}</b><span>고가</span><b class="up">${usd2(z.h[i])}</b><span>저가</span><b class="down">${usd2(z.l[i])}</b><span>종가</span><b>${usd2(z.c[i])}</b></div>${pc ? `<div class="${cls(z.c[i] - pc)}">전일 대비 ${pct(z.c[i] / pc - 1, 2)}</div>` : ""}`;
      if (real && x[i] < real) s += `<div class="warn">상장 전 가정 가격</div>`;
      price.mk.filter((m) => m.i === i).forEach((m) => { s += `<div class="${m.kind === "buy" ? "up" : "down"}">${m.kind === "buy" ? "▲ 매수" : "▼ 매도"} ${usd2(m.p)} · ${esc(tw(m.why))}</div>`; }); }
    s += `<div class="t2">VIX ${num(vix[i], 1)} · 공포탐욕 ${fg[i] != null ? Math.round(fg[i]) : "-"}</div>`;
    if (i < n0 && rsi[i] != null) s += `<div class="t2">RSI 마감 ${num(rsi[i], 1)} · 장중 ${num(rlo[i], 1)}~${num(rhi[i], 1)} · QQQ 고점 대비 ${pct(qdd[i])}</div>` + buyWhy(i);
    return s;
  };
  // 11-27 사용자: '저점 같은데 왜 안 샀지?' — 그날 마감 판정(다음 날 주문)을 툴팁에 한 줄로
  const [B0_, B1_] = H.band || [-0.10, -0.25], capN = H.cap || 5;
  function buyWhy(i) {
    const f = (vix[i] != null && vix[i] >= 30) || (fg[i] != null && fg[i] <= 30), inb = qdd[i] != null && qdd[i] <= B0_ && qdd[i] >= B1_;
    const d = x[i], r = rounds_.find((z) => z.buys[0].d <= d && (!z.sell || z.sell.d >= d)), held = r ? r.buys.filter((b) => b.d <= d).length : 0;
    const ok = (t, v) => `<span class="${v ? "up" : "mute"}">${t} ${v ? "충족" : "아님"}</span>`;
    return `<div class="t2">마감 판정: ${ok("공포", f)} · ${ok("하락 범위", inb)}${qdd[i] < B1_ ? "(-25%보다 깊음)" : ""} · ${ok("RSI 30 미만", rsi[i] < 30)}${!(rsi[i] < 30) && rlo[i] != null && rlo[i] < 30 ? "(장중엔 닿음)" : ""}${sym !== "ACC" && held ? ` · 보유 ${held}/${capN}묶음${held >= capN ? " 다 참" : ""}` : ""}</div>`;
  }
  const pad = (a) => { while (a.length < N) a.push(null); return a; }; pad(rsi); pad(rhi); pad(rlo); pad(qdd);
  logChart = mkChart(el, {x, height: 540, range: [N - Math.min(rg, N), N - 1], xfmt: (d) => ymd(d), tip,
    panes: [price.pane,
      {h: 1, fmt: (y) => y.toFixed(0), fix: [20, 80], series: [{type: "line", name: "QQQ RSI(마감)", y: rsi, color: css("--ink"), w: 1.3}],
        bands: [{ya: rhi, yb: rlo, color: css("--B") + "40"}, {y0: 0, y1: 30, color: css("--up") + "10"}],
        hlines: [{y: 30, label: "매수 기준 30", color: css("--up")}, {y: 26, label: "26", color: css("--up"), dash: [2, 3]}]},
      {h: 1, fmt: (y) => y.toFixed(0), series: [{type: "line", name: "VIX", y: vix, color: css("--warn"), w: 1.3}], hlines: [{y: 30, label: "공포 기준 30", color: css("--up")}]},
      {h: 1, fmt: (y) => y.toFixed(0), fix: [0, 100], series: [{type: "line", name: "공포탐욕지수", y: fg, color: css("--B"), w: 1.3}], hlines: [{y: 30, label: "공포 기준 30", color: css("--up")}], bands: [{y0: 0, y1: 30, color: css("--up") + "14"}]}]});
  cap.innerHTML = sym === "ACC" ? `${P[k].name}·QQQ 보유 모두 2000년 시작 금액을 1로 둔 배수(원화·세후). 음영 = 공포 단타 보유 구간.`
    : `▲ 매수 ▼ 매도(${P[k].name} · ${ymd(bt.start)}부터의 과거 시험과 가상 추적)${sym === S.inst ? ` · 음영 = ${S.inst} 단타 보유` : ""} · 빨간 점선 사이 = 사는 구간(QQQ 1년 고점 -10%~-25%${sym === "QQQ" || sym === "QQQM" ? "" : ", 이 종목 가격으로 환산"}) · RSI 띠 = 그날 장중 범위(고가·저가로 마감했다면)${real && real > H.dates[0] ? ` · ${ymd(real)} 이전은 가정 가격` : ""}`;
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
            {h: 1, fmt: (y) => y.toFixed(1), series: [{type: "line", name: "VIX", y: vix, color: css("--warn"), w: 1.3}], hlines: [{y: 30, label: "공포 기준 30", color: css("--up")}]}]});
  if (logChart) logChart._intra = sym + S.lrange;
  $("#logcap").innerHTML = `${S.lrange === "1d" ? "5분" : "15분"} 봉 · 한국시간 · 회색 음영 = 시간외 거래 · 1분마다 자동 갱신(야후 파이낸스 시세)`;
}

// ── 신호 ──
function signal() {
  const plan = D.accounts[S.prof].plan || {}, g=plan.signals||{}, tr = D.trend || {}, fx = D.fx || {};
  const lots = dedupLots(plan.lots).filter((l) => l.how !== "예비").length;
  const fxHigh=fx.rate!=null&&fx.on_line!=null&&fx.rate>=fx.on_line;
  const fxLabel = fx.on ? "원화 환전 검토 신호" : fxHigh ? "달러가 높은 구간 · 하락 전환 대기" : "원화 환전 검토 신호 없음";
  const rate=(v)=>v==null?"—":Math.round(v).toLocaleString("ko-KR")+"원";
  let html = `<div class="card"><div class="title">공포 단타 신호</div><div class="t2">${P[S.prof].name} · ${S.inst} · ${ymd(g.date)} 종가 기준</div>${checks(g,lots,plan.watch?.reserve_line)}<button class="secondary" id="signalTodo">계산된 주문 확인</button></div>
    <div class="card"><div class="title">QQQ 추세·과매도 차트</div>${seg(LR.slice(2), S.srange, "sr", "sm")}${seg([["candle", "캔들"], ["line", "라인"]], S.stype, "st", "sm tiny")}
    <div id="sigchart"></div><div class="legend" style="margin-top:6px"><span><i style="background:var(--B)"></i>200일 이동평균</span><span><i style="background:var(--down)"></i>이탈선(-3%)</span><span><i style="background:var(--up)"></i>재진입선(+3%)</span><span><i style="background:var(--up);opacity:.3"></i>매수 검토 구간(1년 고점 -10%~-25%)</span></div></div>
    <div class="card"><div class="title">추세 판단</div><div class="kv2"><div>현재 상태</div><div>${tr.next_in === true ? `<b class="up">상승 추세 · QQQM 보유</b>` : tr.next_in === false ? `<b class="down">하락 추세 · 단기국채 대기</b>` : "-"}</div>
      <div>QQQ 종가</div><div>${usd2(tr.close)}</div><div>200일 이동평균</div><div>${usd2(tr.ma200)} (이격 ${pct(tr.gap)})</div>
      <div>이탈선(-3%)</div><div>${usd2(tr.exit_line)} 하회 마감 시 매도</div><div>재진입선(+3%)</div><div>${usd2(tr.entry_line)} 상회 마감 시 매수</div></div>
      <div class="t2" style="margin-top:6px">±3% 완충 구간 안에서는 기존 상태를 유지합니다. 판단은 종가로 하고, 매매는 다음 거래일 정규장에 지정가로 합니다.</div></div>
    <div class="card"><div class="title">달러를 원화로 바꿀 때</div>
      <div class="signal-result ${fx.on?'ready':''}"><b>${fxLabel}</b><small>${fx.on?"가까운 시일에 쓸 원화가 있다면 먼저 필요한 금액과 환전 비용을 확인하십시오.":fxHigh?"달러 매수에는 원화가 더 듭니다. 원화로 바꿀 계획이 있다면 최근 고점에서 얼마나 내려왔는지 보십시오.":"원화 사용 일정이 있다면 그 일정과 실제 적용 환율을 먼저 보십시오."}</small></div>
      <div class="kv2"><div>지금 1달러</div><div><b>${rate(fx.rate)}</b> (${ymd(fx.date)})</div><div>5년 평균과 차이</div><div>${rate(fx.avg5y)} · ${pct(fx.gap)}</div><div>높은 달러 기준</div><div>${rate(fx.on_line)} 이상 · 5년 평균 +10%</div><div>최근 65일 고점</div><div>${rate(fx.high65)} · 현재 ${pct(fx.drop)}</div><div>고점 대비 -5% 가격</div><div>${rate(fx.reversal_line)} 이하 · 고점 −5%</div></div>
      <details class="more"><summary>판단 기준</summary><div class="desc">높은 달러와 고점 대비 -5% 조건이 동시에 맞으면 원화로 바꿀 여유 달러를 검토합니다. 평균 +5% 아래 또는 195일 후 신호가 종료됩니다. 환율 방향에는 불확실성이 있으며 앱 주문표에는 환전 주문이 생성되지 않습니다.</div></details>
      ${seg([["1y", "1년"], ["5y", "5년"], ["all", "전체"]], S.frange, "fr", "sm")}<div id="fxchart"></div></div>
    <div class="card"><div class="title">자료 상태</div>${D.health.length ? D.health.map((x) => `<div class="row"><div class="l warn">${esc(x)}</div></div>`).join("") : `<div class="row"><div class="l">야후·나스닥 종가 일치, 공포탐욕지수·VIX 수신</div><div class="r t1 up">정상</div></div>`}${(D.notes || []).length ? `<div class="t2">참고: 나스닥(두 번째 출처)에 아직 종가가 게시되지 않았습니다. 야후 종가로 산출했으며, 게시되면 다시 대조합니다.</div>` : ""}<div class="t2">산출 ${kst(new Date(D.made_at).getTime()/1000)}</div></div>`;
  $("#view").innerHTML = html;
  $("#signalTodo").onclick=()=>go("todo");
  bindSeg("sr", (v) => { S.srange = v; save(); render(); });
  bindSeg("st", (v) => { S.stype = v; save(); render(); });
  bindSeg("fr", (v) => { S.frange = v; save(); render(); });
  if (!needHist(() => S.tab === "signal" && render())) { $("#sigchart").innerHTML = wait("차트 자료를 불러오는 중입니다"); return; }
  drawSignal(); drawFx(); liveTick();
}
function drawSignal() {
  const px = H.px.QQQ, x = H.dates.slice(), o = px.o.slice(), h = px.h.slice(), l = px.l.slice(), c = px.c.slice(), rsi = H.rsi.slice(), vix = H.vix.c.slice(), fg = H.fg.slice();
  const tb = LQ.QQQ; if (tb && tb.day > H.last) { x.push(tb.day); o.push(tb.o); h.push(tb.h); l.push(tb.l); c.push(tb.c); rsi.push(null); vix.push(LQ["^VIX"] ? LQ["^VIX"].c : null); fg.push(LQ.FG ? LQ.FG.v : null); }
  const N = x.length, ma = Array(N).fill(null), hi = Array(N).fill(null); let sum = 0;
  for (let i = 0; i < N; i++) { sum += c[i]; if (i >= 200) sum -= c[i - 200]; if (i >= 199) ma[i] = sum / 200; let m = -Infinity; for (let j = Math.max(0, i - 251); j <= i; j++) m = Math.max(m, c[j]); hi[i] = m; }
  const ex = ma.map((v) => v && v * .97), en = ma.map((v) => v && v * 1.03), z0 = hi.map((v) => v * .90), z1 = hi.map((v) => v * .75);
  const rg = BARS[S.srange] || 252;
  const keep = sigChart && sigChart.el.isConnected && sigChart._k === S.srange ? sigChart.r : null;
  sigChart = mkChart($("#sigchart"), {x, height: 520, range: [N - Math.min(rg, N), N - 1], xfmt: (d) => ymd(d),
    tip: (i) => `<b>${ymd(x[i])}${i >= H.dates.length ? " (장중)" : ""}</b><div class="tr">QQQ 종가<b>${usd2(c[i])}</b></div><div class="tr">200일선<b>${usd2(ma[i])}</b><span class="${cls(c[i] / ma[i] - 1)}">${pct(c[i] / ma[i] - 1)}</span></div><div class="tr">1년 고점 대비<b>${pct(c[i] / hi[i] - 1)}</b></div><div class="tr">RSI(14)<b>${num(rsi[i], 1)}</b></div><div class="tr">VIX<b>${num(vix[i], 1)}</b></div><div class="tr">공포탐욕<b>${fg[i] != null ? Math.round(fg[i]) : "-"}</b></div>`,
    panes: [{h: 3, fmt: (y) => "$" + y.toFixed(0), series: [{type: S.stype === "line" ? "line" : "candle", name: "QQQ", o, h, l, c, y: c, color: css("--ink"), w: 1.6},
        {type: "line", name: "200일선", y: ma, color: css("--B"), w: 1.6}, {type: "line", y: ex, color: css("--down"), w: 1, dash: [4, 3]}, {type: "line", y: en, color: css("--up"), w: 1, dash: [4, 3]}],
        bands: [{ya: z0, yb: z1, color: css("--up") + "0f"}]},
      {h: 1, fmt: (y) => y.toFixed(0), fix: [20, 80], series: [{type: "line", name: "RSI(14)", y: rsi, color: css("--B"), w: 1.3}], hlines: [{y: 30, label: "매수 기준 30", color: css("--up")}, {y: 26, color: css("--up"), dash: [2, 3]}], bands: [{y0: 0, y1: 30, color: css("--up") + "14"}]},
      {h: 1, fmt: (y) => y.toFixed(0), series: [{type: "line", name: "VIX", y: vix, color: css("--warn"), w: 1.3}], hlines: [{y: 30, label: "공포 기준 30", color: css("--up")}], bands: [{y0: 30, y1: 100, color: css("--up") + "10"}]},
      {h: 1, fmt: (y) => y.toFixed(0), fix: [0, 100], series: [{type: "line", name: "공포탐욕지수", y: fg, color: css("--C"), w: 1.3}], hlines: [{y: 30, label: "공포 기준 30", color: css("--up")}], bands: [{y0: 0, y1: 30, color: css("--up") + "14"}]}]});
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

// ── 뼈대 ──
const PAGES = {home, compare, todo, log, signal};
function go(t) { S.tab = t; save(); render(); window.scrollTo(0, 0); }
window.go = go;
function render() {
  pills();
  document.querySelectorAll("#tabs button").forEach((b) => { b.classList.toggle("on", b.dataset.tab === S.tab); b.onclick = () => go(b.dataset.tab); });
  if(S.inst!=="TQQQ"&&!rawData?.variants?.[S.inst]) { $("#view").innerHTML=wait(`${S.inst} 조합 자료를 기다리고 있습니다. 자료가 갱신되면 다시 표시됩니다.`); return; }
  try { (PAGES[S.tab] || home)(); }
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
function firstGuide() { if (!S.tourSeen&&tourPage<0) openTour(); }
window.onAndroidData = (ok) => { if (ok) return fromAndroid(); if (!D) tokenCard(AND.lastError()); };
window.onAndroidHist = () => { const s = AND.getHist && AND.getHist(); if (s) { try { histReady(JSON.parse(s)); render(); } catch (e) {} } };
window.goBackTab = () => { if(tourPage>0){openTour(tourPage-1);return true;} if(tourPage===0){$("#tourSkip").click();return true;} if (S.tab !== "home") { go("home"); return true; } return false; };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && D) liveTick(); });
// 11-27 앱으로 받기(공개 페이지 전용): 홈 맨 위 카드에서 '앱 설치'·'알림 받기'. 위쪽 머리글은 '사용 안내'·'내 설정'만(좁은 폰에서 글자 줄바꿈 방지).
if (WEB && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
const STANDALONE = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
const IOS = /iPhone|iPad/.test(navigator.userAgent);
let installEv = null, PUSHST = "off";
const homeAgain = () => { if (S.tab === "home" && D) render(); };
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEv = e; homeAgain(); });
window.addEventListener("appinstalled", () => { installEv = null; homeAgain(); });
const PUSH = "https://bandeung-push.kunchan70.workers.dev";
const pushOK = () => WEB && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function pushState() { if (!pushOK()) return "no"; const r = await navigator.serviceWorker.ready; return (await r.pushManager.getSubscription()) ? "on" : "off"; }
const u8 = (b) => { const raw = atob((b + "=".repeat((4 - b.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
const pushMsg = (t) => sheet(`<div class="title">알림 받기</div><div class="desc">${t}</div>`);
async function pushOn() {
  if (IOS && !STANDALONE) return pushMsg("아이폰은 먼저 사파리 공유 버튼 → '홈 화면에 추가'를 한 뒤, 홈 화면 아이콘으로 열어서 '알림 받기'를 누르십시오.");
  if (!pushOK()) return pushMsg("이 브라우저는 알림을 지원하지 않습니다. 안드로이드는 크롬, 아이폰은 홈 화면에 추가한 앱에서 이용하십시오.");
  if (await Notification.requestPermission() !== "granted") return pushMsg("알림이 차단되어 있습니다. 브라우저의 사이트 설정에서 알림을 허용한 뒤 다시 누르십시오.");
  const reg = await navigator.serviceWorker.ready, {pub} = await fetch(PUSH + "/key").then((r) => r.json());
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: u8(pub)});
  const r = await fetch(PUSH + "/subscribe", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(sub)});
  if (!r.ok) throw new Error("등록 실패 " + r.status);
  await updateBell(); pushMsg("이 기기로 알림을 받습니다. 장 마감 뒤 주문할 일이 생기면 알림이 옵니다.");
}
async function pushOff() {
  const reg = await navigator.serviceWorker.ready, s = await reg.pushManager.getSubscription();
  if (s) { await fetch(PUSH + "/unsubscribe", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({endpoint: s.endpoint})}).catch(() => {}); await s.unsubscribe(); }
  await updateBell();
}
async function updateBell() { PUSHST = await pushState().catch(() => "no"); homeAgain(); }
function appCard() {
  if (!WEB) return "";
  const inst = !STANDALONE, push = PUSHST === "off" || (PUSHST === "no" && IOS && !STANDALONE);
  if (!inst && !push) return "";
  return `<div class="card appcard"><div class="title">앱으로 받기</div>
    <div class="desc">${inst ? "앱으로 설치하면 홈 화면 아이콘으로 주소창 없이 열립니다. " : ""}${push ? "알림을 켜면 주문할 일이 생길 때 바로 알려 드립니다." : ""}</div>
    <div class="appbtns">${inst ? `<button class="btn" id="appInst">앱 설치</button>` : ""}${push ? `<button class="btn${inst ? " ghost" : ""}" id="appPush">알림 받기</button>` : ""}</div></div>`;
}
function bindAppCard() {
  const i = $("#appInst"), p = $("#appPush");
  if (i) i.onclick = () => {
    if (installEv) { installEv.prompt(); installEv.userChoice.finally(() => { installEv = null; homeAgain(); }); return; }
    sheet(IOS ? `<div class="title">앱 설치</div><div class="desc">사파리 아래쪽 공유 버튼 → '홈 화면에 추가'를 누르십시오. 홈 화면 아이콘으로 열면 앱으로 열리고, 그 안에서 알림도 켤 수 있습니다.</div>`
              : `<div class="title">앱 설치</div><div class="desc">크롬 오른쪽 위 ⋮ 메뉴 → '앱 설치'(또는 '홈 화면에 추가')를 누르십시오. 카카오톡·삼성 인터넷 안에서 열었다면 크롬으로 다시 열어 주십시오.</div>`);
  };
  if (p) p.onclick = () => pushOn().catch((e) => pushMsg("알림 등록에 실패했습니다. " + esc(e.message)));
}
updateBell();
if (AND) fromAndroid();
else loadData();
function loadData() { fetch(dataUrl(), {cache: "no-store"}).then((r) => r.json()).then((d) => { rawData=d; selectModels(); render(); firstGuide(); refreshQuote(S.inst).then(() => S.tab === "home" || S.tab === "todo" ? render() : 0); })
  .catch((e) => { $("#view").innerHTML = `<div class="card"><div class="alert"><b>자료를 읽지 못했습니다</b> ${esc(e.message)}</div></div>`; }); }
