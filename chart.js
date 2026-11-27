"use strict";
// 차트 엔진(외부 라이브러리 없음, 캔버스). 증권사 앱식: 캔들/선, 십자선+값 상자(마우스·손가락), 두 손가락·휠 확대, 여러 칸(가격·VIX·공포탐욕·RSI) 같은 날짜축.
// new FChart(el, {x:[날짜...], range:[i0,i1], panes:[{h, log, fmt, series:[...], hlines:[...], bands:[...], vbands:[...], markers:[...]}], tip:(i)=>html, onRange})
(function () {
  const cv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const AX = 56, BOT = 20, GAP = 10, TOP = 4;

  function ticks(lo, hi, n) {
    const span = hi - lo; if (!(span > 0)) return [lo];
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    const step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function logTicks(lo, hi, px) {   // 눈금 간격이 26px 보다 좁아지면 1·2·5 → 1·3 → 1 → 10배수 건너뛰기
    const e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi)), dec = Math.log10(hi / lo) || 1;
    for (const ms of [[1, 2, 5], [1, 3], [1]]) {
      if (px / (dec * ms.length) < 26) continue; const out = [];
      for (let e = e0; e <= e1; e++) for (const m of ms) { const v = m * Math.pow(10, e); if (v >= lo && v <= hi) out.push(v); }
      if (out.length >= 2) return out;
    }
    const step = Math.ceil(dec * 26 / px), out = [];
    for (let e = e0; e <= e1; e++) if (e % step === 0) { const v = Math.pow(10, e); if (v >= lo && v <= hi) out.push(v); }
    return out.length >= 2 ? out : ticks(lo, hi, 3);
  }
  const defFmt = (v) => v == null ? "-" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("ko-KR") : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2);

  class FChart {
    constructor(el, o) {
      this.el = el; el.classList.add("fchart"); el.innerHTML = "";
      this.cv = document.createElement("canvas"); this.tipEl = document.createElement("div"); this.tipEl.className = "ctip";
      el.append(this.cv, this.tipEl); this.ptrs = new Map(); this.hover = null;
      this.cv.addEventListener("pointerdown", (e) => this.down(e));
      this.cv.addEventListener("pointermove", (e) => this.move(e));
      ["pointerup", "pointercancel"].forEach((t) => this.cv.addEventListener(t, (e) => this.up(e)));
      this.cv.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { this.hover = null; this.draw(); } });
      this.cv.addEventListener("wheel", (e) => this.wheel(e), {passive: false});
      this.cv.addEventListener("dblclick", () => this.setRange(...this.home));
      if (window.ResizeObserver) { this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(el); }
      this.set(o);
    }
    set(o) {
      this.o = o; this.n = o.x.length;
      this.r = o.range ? [Math.max(0, o.range[0]), Math.min(this.n - 1, o.range[1])] : [0, this.n - 1];
      this.home = [...this.r]; this.hover = null; this.draw();
    }
    setRange(a, b) {
      const min = Math.min(this.o.minBars || 10, this.n - 1);
      a = Math.round(a); b = Math.round(b);
      if (b - a < min) { const c = (a + b) / 2; a = Math.round(c - min / 2); b = a + min; }
      if (a < 0) { b -= a; a = 0; } if (b > this.n - 1) { a -= b - (this.n - 1); b = this.n - 1; } a = Math.max(0, a);
      this.r = [a, b]; this.draw(); if (this.o.onRange) this.o.onRange(a, b);
    }
    // ── 입력 ──
    idxAt(px) { const [a, b] = this.r, w = this.W - AX; return Math.max(a, Math.min(b, Math.round(a + (px / w) * (b - a)))); }
    pos(e) { const rc = this.cv.getBoundingClientRect(); return [e.clientX - rc.left, e.clientY - rc.top]; }
    // 11-27 사용자 '그래프가 손으로 안 움직여짐': 손가락 좌우 끌기 = 기간 이동, 두 손가락 = 확대·축소, 꾹 누르기(0.25초)·탭 = 그 날 값 보기.
    // 마우스: 누른 채 끌기 = 이동, 휠 = 확대, 올려두기 = 값. 세로 끌기는 화면 스크롤(touch-action: pan-y).
    down(e) {
      this.ptrs.set(e.pointerId, this.pos(e));
      if (e.pointerType !== "mouse") this.cv.setPointerCapture(e.pointerId);
      clearTimeout(this.hold);
      if (this.ptrs.size === 2) { const [p, q] = [...this.ptrs.values()]; this.pinch = {d: Math.abs(p[0] - q[0]) || 1, r: [...this.r], c: this.idxAt((p[0] + q[0]) / 2)}; this.drag = null; this.hover = null; this.draw(); return; }
      const p = this.pos(e), touch = e.pointerType !== "mouse";
      this.drag = {x0: p[0], y0: p[1], r: [...this.r], mode: null, touch};
      if (!touch) { this.hover = p; this.draw(); }
      else this.hold = setTimeout(() => { if (this.drag && !this.drag.mode) { this.drag.mode = "cross"; this.hover = this.drag.last || p; this.draw(); } }, 250);
    }
    move(e) {
      if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, this.pos(e));
      if (this.ptrs.size === 2 && this.pinch) {
        const [p, q] = [...this.ptrs.values()], d = Math.abs(p[0] - q[0]) || 1, k = this.pinch.d / d, [a, b] = this.pinch.r, c = this.pinch.c;
        this.setRange(c - (c - a) * k, c + (b - c) * k); return;
      }
      const p = this.pos(e), d = this.drag;
      if (d && this.ptrs.has(e.pointerId)) {
        d.last = p;
        if (!d.mode && Math.abs(p[0] - d.x0) > 6) { d.mode = "pan"; clearTimeout(this.hold); this.hover = null; }
        if (d.mode === "pan") { const [a, b] = d.r, w = (this.W - AX) || 1, sh = -(p[0] - d.x0) / w * (b - a); this.setRange(a + sh, b + sh); return; }
        if (d.mode === "cross" || !d.touch) { this.hover = p; this.draw(); }
        return;
      }
      if (e.pointerType === "mouse") { this.hover = p; this.draw(); }
    }
    up(e) {
      this.ptrs.delete(e.pointerId); if (this.ptrs.size < 2) this.pinch = null;
      clearTimeout(this.hold); const d = this.drag; this.drag = null;
      if (e.pointerType !== "mouse" && !this.ptrs.size) {
        if (d && !d.mode && e.type === "pointerup") { this.hover = this.pos(e); this.draw(); }   // 탭: 그 날 값을 다음 터치까지 보여 줌
        else if (!(d && d.mode === "cross" && e.type === "pointerup")) { this.hover = null; this.draw(); }
      }
    }
    wheel(e) {
      e.preventDefault(); const [a, b] = this.r, c = this.idxAt(this.pos(e)[0]), k = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      this.setRange(c - (c - a) * k, c + (b - c) * k);
    }
    // ── 그리기 ──
    layout() {
      const ps = this.o.panes, tot = ps.reduce((s, p) => s + (p.h || 1), 0), H = this.H - BOT - TOP - GAP * (ps.length - 1);
      let y = TOP; return ps.map((p) => { const h = H * (p.h || 1) / tot, box = {y0: y, y1: y + h}; y += h + GAP; return box; });
    }
    yrange(p, a, b) {
      let lo = Infinity, hi = -Infinity;
      const take = (v) => { if (v != null && isFinite(v) && (!p.log || v > 0)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
      for (const s of p.series) {
        if (s.hidden || s.nofit) continue;   // nofit: 범위 계산에서 뺌(사는 구간 선처럼 멀리 있는 참고선)
        if (s.type === "candle") for (let i = a; i <= b; i++) { take(s.h[i]); take(s.l[i]); }
        else for (let i = a; i <= b; i++) take(s.y[i]);
      }
      (p.hlines || []).forEach((h) => { if (h.fit) take(h.y); });
      (p.fix || []).forEach(take);
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (p.log) { const L = Math.log(lo), H = Math.log(hi), pad = (H - L || .1) * .07; return [Math.exp(L - pad), Math.exp(H + pad)]; }
      const pad = (hi - lo || Math.abs(hi) || 1) * .08; return [p.min0 ? Math.min(0, lo) : lo - pad, hi + pad];
    }
    draw() {
      const el = this.el, W = el.clientWidth, H = this.o.height || 300; if (!W) return;
      const dpr = window.devicePixelRatio || 1; this.W = W; this.H = H;
      this.cv.width = W * dpr; this.cv.height = H * dpr; this.cv.style.height = H + "px";
      const g = this.cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const C = {ink: cv("--ink"), sub: cv("--sub"), mute: cv("--mute"), line: cv("--line"), up: cv("--up"), down: cv("--down"), card: cv("--card"), soft: cv("--soft")};
      const font = cv("--font"); g.font = `11px ${font}`;
      const [a, b] = this.r, pw = W - AX, n = b - a, bw = pw / Math.max(n + 1, 1);
      const X = (i) => (i - a + .5) * bw;
      // 기간 수익률 모드: 화면 왼쪽 끝 값을 0%로 다시 맞춤
      this.o.panes.forEach((p) => { if (!p.rebase) return; p.series.forEach((s) => { if (!s.raw) return; let base = null;
        for (let i = a; i <= b; i++) if (s.raw[i] != null) { base = s.raw[i]; break; }
        if (s._ra !== a || s._rb !== base) { s.y = s.raw.map((v, i) => v == null || i < a || base == null ? null : (v / base - 1) * 100); s._ra = a; s._rb = base; } }); });
      const boxes = this.layout(); this.boxes = boxes;
      const hi = this.hover ? this.idxAt(this.hover[0]) : null; this.hi = hi;
      this.o.panes.forEach((p, k) => {
        // 범례를 먼저 배치(넘치면 줄바꿈)하고, 그 아래부터 그래프 영역 → 범례가 선을 가리지 않음
        const B0 = boxes[k], li = hi ?? b; g.font = `600 11px ${font}`;
        const items = p.legend || p.series.filter((s) => s.name && !s.hidden && !s.noleg).map((s) => ({name: s.name, color: s.type === "candle" ? C.ink : s.color, v: (s.type === "candle" ? s.c : s.y)[li], fmt: s.fmt}));
        const lay = []; let lx = 4, ly = B0.y0 + 1;
        items.forEach((it) => { const t = "v" in it ? `${it.name} ${it.v != null ? (it.fmt || p.fmt || defFmt)(it.v) : "-"}` : it.name, w = g.measureText(t).width + 15;
          if (lx > 4 && lx + w > pw) { lx = 4; ly += 16; } lay.push([it, t, lx, ly, w]); lx += w + 8; });
        const legH = lay.length ? ly - B0.y0 + 17 : 0; g.font = `11px ${font}`;
        const bx = {y0: B0.y0 + legH, y1: B0.y1}; p._box = bx;
        const [lo, top] = this.yrange(p, a, b), fmt = p.fmt || defFmt;
        const Y = p.log ? (v) => bx.y1 - (Math.log(v) - Math.log(lo)) / (Math.log(top) - Math.log(lo)) * (bx.y1 - bx.y0)
                        : (v) => bx.y1 - (v - lo) / (top - lo) * (bx.y1 - bx.y0);
        p._Y = Y; p._lo = lo; p._hi = top;
        g.save(); g.beginPath(); g.rect(0, bx.y0, pw, bx.y1 - bx.y0); g.clip();
        // 세로 띠(보유 구간 등)
        (p.vbands || []).forEach((v) => { if (v.i1 < a || v.i0 > b) return; g.fillStyle = v.color; g.fillRect(X(v.i0) - bw / 2, bx.y0, (v.i1 - v.i0 + 1) * bw, bx.y1 - bx.y0); });
        // 가로 띠(매수 구간 등)
        (p.bands || []).forEach((v) => {
          g.fillStyle = v.color;
          if (v.ya) { g.beginPath(); for (let i = a; i <= b; i++) if (v.ya[i] != null) g.lineTo(X(i), Y(v.ya[i])); for (let i = b; i >= a; i--) if (v.yb[i] != null) g.lineTo(X(i), Y(v.yb[i])); g.closePath(); g.fill(); }
          else { const y0 = Y(v.y0), y1 = Y(v.y1); g.fillRect(0, Math.min(y0, y1), pw, Math.abs(y1 - y0)); }
        });
        // 격자
        g.strokeStyle = C.line; g.lineWidth = 1; g.fillStyle = C.mute; g.textAlign = "left"; g.textBaseline = "middle";
        const tk = p.log ? logTicks(lo, top, bx.y1 - bx.y0) : ticks(lo, top, Math.max(2, Math.round((bx.y1 - bx.y0) / 42)));
        g.restore();
        tk.forEach((v) => { const y = Y(v); if (y < bx.y0 + 4 || y > bx.y1 - 6) return; g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, y + .5); g.lineTo(pw, y + .5); g.stroke(); g.fillStyle = C.mute; g.fillText(fmt(v), pw + 6, y); });
        g.save(); g.beginPath(); g.rect(0, bx.y0, pw, bx.y1 - bx.y0); g.clip();
        // 기준선
        (p.hlines || []).forEach((h) => {
          if (h.y == null) return; const y = Y(h.y); g.strokeStyle = h.color || C.mute; g.lineWidth = h.w || 1; g.setLineDash(h.dash || [4, 4]);
          g.beginPath(); g.moveTo(0, y); g.lineTo(pw, y); g.stroke(); g.setLineDash([]);
          if (h.label) { g.font = `600 10px ${font}`; const tw = g.measureText(h.label).width + 8, ty = Math.max(bx.y0 + 7, y - 8);
            g.fillStyle = C.card; g.globalAlpha = .9; g.fillRect(pw - tw - 2, ty - 7, tw, 14); g.globalAlpha = 1;
            g.fillStyle = h.color || C.mute; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(h.label, pw - 6, ty); g.font = `11px ${font}`; }
        });
        // 계열
        for (const s of p.series) {
          if (s.hidden) continue;
          if (s.type === "candle" && bw >= 3.2) {
            for (let i = a; i <= b; i++) {
              const o = s.o[i], h = s.h[i], l = s.l[i], c = s.c[i]; if (c == null) continue;
              const up = c >= (o ?? c), col = s.flat ? s.color : up ? C.up : C.down, x = X(i);
              g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
              g.beginPath(); g.moveTo(x, Y(h ?? c)); g.lineTo(x, Y(l ?? c)); g.stroke();
              const y0 = Y(o ?? c), y1 = Y(c), cw = Math.max(1, bw * .7);
              g.fillRect(x - cw / 2, Math.min(y0, y1), cw, Math.max(1, Math.abs(y1 - y0)));
            }
          } else {
            const ys = s.type === "candle" ? s.c : s.y; g.strokeStyle = s.color || C.ink; g.lineWidth = s.w || 1.6; g.setLineDash(s.dash || []); g.lineJoin = "round";
            g.beginPath(); let pen = false, first = null, last = null;
            for (let i = a; i <= b; i++) { const v = ys[i]; if (v == null || (p.log && v <= 0)) { pen = false; continue; } const x = X(i), y = Y(v); if (!pen) { g.moveTo(x, y); pen = true; if (!first) first = [x, y]; } else g.lineTo(x, y); last = [x, y]; }
            g.stroke(); g.setLineDash([]);
            if (s.fill && first && last) {
              g.lineTo(last[0], bx.y1); g.lineTo(first[0], bx.y1); g.closePath();
              const gr = g.createLinearGradient(0, bx.y0, 0, bx.y1); gr.addColorStop(0, s.fill); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fill();
            }
          }
        }
        // 매수·매도 표시
        (p.markers || []).forEach((m) => {
          if (m.i < a || m.i > b || m.y == null) return; const x = X(m.i), y = Y(m.y), buy = m.kind === "buy", sz = bw > 6 ? 6 : 4.5;
          g.fillStyle = m.color || (buy ? C.up : C.down); g.beginPath();
          if (buy) { g.moveTo(x, y + 4); g.lineTo(x - sz, y + 4 + sz * 1.6); g.lineTo(x + sz, y + 4 + sz * 1.6); }
          else { g.moveTo(x, y - 4); g.lineTo(x - sz, y - 4 - sz * 1.6); g.lineTo(x + sz, y - 4 - sz * 1.6); }
          g.closePath(); g.fill();
          if (m.label && bw > 3) { g.font = `700 10px ${font}`; g.textAlign = "center"; g.textBaseline = buy ? "top" : "bottom"; g.fillText(m.label, x, buy ? y + 6 + sz * 1.6 : y - 6 - sz * 1.6); g.font = `11px ${font}`; }
        });
        g.restore();
        // 마지막 값 꼬리표
        const s0 = p.series.find((s) => !s.hidden);
        if (s0 && p.tag !== false) {
          const ys = s0.type === "candle" ? s0.c : s0.y; let li = b; while (li > a && ys[li] == null) li--;
          const v = ys[li]; if (v != null) { const y = Math.max(bx.y0 + 8, Math.min(bx.y1 - 8, Y(v))); g.fillStyle = s0.type === "candle" ? (v >= (ys[li - 1] ?? v) ? C.up : C.down) : (s0.color || C.ink);
            g.font = `700 11px ${font}`; const tw = Math.max(AX - 2, g.measureText(fmt(v)).width + 8);
            g.fillRect(W - tw, y - 8, tw, 16); g.fillStyle = "#fff"; g.textBaseline = "middle"; g.textAlign = "left"; g.fillText(fmt(v), W - tw + 4, y); g.font = `11px ${font}`; }
        }
        // 칸 범례(이름 값) — 십자선 위치 값, 없으면 마지막 값
        g.textBaseline = "top"; g.textAlign = "left"; g.font = `600 11px ${font}`;
        lay.forEach(([it, t, x0, y0]) => { g.fillStyle = it.color || C.ink; g.fillRect(x0, y0 + 5, 9, 3); g.fillStyle = C.sub; g.fillText(t, x0 + 12, y0 + 1); });
        g.font = `11px ${font}`;
      });
      // 날짜 축
      const xs = this.o.x, xf = this.o.xfmt; g.fillStyle = C.mute; g.textBaseline = "alphabetic"; g.textAlign = "center";
      const tickIdx = this.xticks(a, b, pw); tickIdx.forEach(([i, t]) => { const x = X(i); if (x < 14 || x > pw - 14) return; g.fillText(t, x, H - 5);
        g.strokeStyle = C.line; g.beginPath(); g.moveTo(x + .5, TOP); g.lineTo(x + .5, H - BOT); g.globalAlpha = .5; g.stroke(); g.globalAlpha = 1; });
      // 십자선
      if (hi != null && this.hover) {
        const x = X(hi); g.strokeStyle = C.sub; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x + .5, TOP); g.lineTo(x + .5, H - BOT); g.stroke();
        const hy = this.hover[1], k = boxes.findIndex((bx) => hy >= bx.y0 && hy <= bx.y1);
        if (k >= 0 && hy >= this.o.panes[k]._box.y0) { const p = this.o.panes[k], bx = p._box; g.beginPath(); g.moveTo(0, hy + .5); g.lineTo(pw, hy + .5); g.stroke(); g.setLineDash([]);
          const v = p.log ? Math.exp(Math.log(p._lo) + (bx.y1 - hy) / (bx.y1 - bx.y0) * (Math.log(p._hi) - Math.log(p._lo))) : p._lo + (bx.y1 - hy) / (bx.y1 - bx.y0) * (p._hi - p._lo);
          const t = (p.fmt || defFmt)(v), tw = Math.max(AX - 2, g.measureText(t).width + 8);
          g.fillStyle = C.ink; g.fillRect(W - tw, hy - 8, tw, 16); g.fillStyle = C.card; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(t, W - tw + 4, hy); }
        g.setLineDash([]);
        this.o.panes.forEach((p) => p.series.forEach((s) => { if (s.hidden || s.noleg || s.type === "candle") return; const v = s.y[hi]; if (v == null) return; g.fillStyle = s.color || C.ink; g.beginPath(); g.arc(x, p._Y(v), 3.2, 0, 7); g.fill(); }));
        const d = xs[hi]; g.font = `700 11px ${font}`; const t = xf ? xf(d, true) : d, tw = g.measureText(t).width + 12;
        g.fillStyle = C.ink; g.fillRect(Math.max(0, Math.min(pw - tw, x - tw / 2)), H - BOT + 2, tw, 17); g.fillStyle = C.card; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(t, Math.max(tw / 2, Math.min(pw - tw / 2, x)), H - BOT + 10.5); g.font = `11px ${font}`;
        this.showTip(hi, x);
      } else this.tipEl.style.display = "none";
    }
    xticks(a, b, pw) {
      const xs = this.o.x, out = [], maxN = Math.max(2, Math.floor(pw / 56));
      const intraday = String(xs[a]).length > 10;
      const key = intraday ? (s) => s.slice(11, 13) : null;
      if (intraday) { let last = null; for (let i = a; i <= b; i++) { const h = key(xs[i]); if (h !== last && xs[i].slice(14, 16) === "00") { out.push([i, xs[i].slice(11, 16)]); } last = h; } }
      else {
        const days = (new Date(xs[b]) - new Date(xs[a])) / 864e5;
        const unit = days > 365 * 2.5 ? "y" : days > 60 ? "m" : "d"; let last = null;
        if (unit === "y") { const yrs = days / 365, step = [1, 2, 5, 10].find((st) => yrs / st <= maxN) || 10;
          for (let i = a; i <= b; i++) { const y = +xs[i].slice(0, 4); if (y !== last) { if (y % step === 0 && i > a) out.push([i, String(y)]); last = y; } } return out; }
        if (unit === "m") { const mos = days / 30.4, step = [1, 2, 3, 6].find((st) => mos / st <= maxN) || 12;
          for (let i = a; i <= b; i++) { const m = xs[i].slice(0, 7); if (m !== last) { const mm = +m.slice(5); if ((mm - 1) % step === 0 && i > a) out.push([i, mm === 1 ? m.slice(0, 4) : mm + "월"]); last = m; } } return out; }
        for (let i = a; i <= b; i++) out.push([i, (+xs[i].slice(5, 7)) + "/" + (+xs[i].slice(8, 10))]);
      }
      if (out.length <= maxN) return out;
      const step = Math.ceil(out.length / maxN); return out.filter((_, j) => j % step === 0);
    }
    showTip(i, x) {
      const html = this.o.tip ? this.o.tip(i) : null; if (!html) { this.tipEl.style.display = "none"; return; }
      const t = this.tipEl; t.innerHTML = html; t.style.display = "block";
      const w = t.offsetWidth, pw = this.W - AX; let left = x + 14; if (left + w > pw) left = x - 14 - w; t.style.left = Math.max(0, left) + "px"; t.style.top = "6px";
    }
  }
  window.FChart = FChart;
})();
