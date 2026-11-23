// 무량 · 바둑판 그리기 (대국 · 관전 · 기보 · 썸네일에서 같이 쓴다)
import { BLACK, WHITE } from "./engine.js";

export const COLS = "ABCDEFGHJKLMNOPQRST";
const STARS = { 9: [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]], 13: [[3, 3], [9, 3], [3, 9], [9, 9], [6, 6]], 19: [3, 9, 15].flatMap(x => [3, 9, 15].map(y => [x, y])) };
export const COORD = (p, n) => p ? COLS[p[0]] + (n - p[1]) : "패스";

// opt: { coords, numbers(Map pos→번호), score, marks, hover, me, noLast, mini }
export function paintBoard(cv, b, opt = {}) {
  const r = cv.getBoundingClientRect(); if (!r.width) return null;
  const dpr = Math.min(2.5, devicePixelRatio || 1), W = Math.round(r.width * dpr); if (cv.width !== W || cv.height !== W) { cv.width = cv.height = W; }
  const x = cv.getContext("2d"), n = b.n, coords = opt.coords !== false && !opt.mini, o = W * (opt.mini ? .045 : coords ? (n >= 19 ? .055 : .075) : .04), s = (W - 2 * o) / (n - 1);
  const g = x.createLinearGradient(0, 0, W, W); g.addColorStop(0, "#e6c07c"); g.addColorStop(.55, "#dcb06a"); g.addColorStop(1, "#cf9f58"); x.fillStyle = g; x.fillRect(0, 0, W, W);
  if (!opt.mini) { x.save(); x.globalAlpha = .08; let sd = 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 52; i++) { x.strokeStyle = rnd() < .5 ? "#7a4c18" : "#fff3d0"; x.lineWidth = .6 + rnd() * 2 * dpr; x.beginPath(); const y0 = rnd() * W; x.moveTo(0, y0); x.bezierCurveTo(W * .3, y0 + (rnd() - .5) * 40 * dpr, W * .7, y0 + (rnd() - .5) * 40 * dpr, W, y0 + (rnd() - .5) * 30 * dpr); x.stroke(); }
    x.restore(); }
  x.strokeStyle = "rgba(38,24,8,.82)"; x.lineWidth = Math.max(1, dpr * (opt.mini ? .5 : .9));
  for (let i = 0; i < n; i++) { const p = o + i * s; x.beginPath(); x.moveTo(o, p); x.lineTo(W - o, p); x.moveTo(p, o); x.lineTo(p, W - o); x.stroke(); }
  x.lineWidth = Math.max(1.2, dpr * (opt.mini ? 1 : 1.6)); x.strokeRect(o, o, W - 2 * o, W - 2 * o);
  x.fillStyle = "rgba(38,24,8,.9)"; for (const [a, c] of STARS[n] || []) { x.beginPath(); x.arc(o + a * s, o + c * s, Math.max(1.2, s * .11), 0, 7); x.fill(); }
  if (coords) { x.fillStyle = "rgba(58,36,12,.72)"; x.font = `600 ${Math.max(8, Math.min(o * .4, s * .42))}px Pretendard Variable, Pretendard, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    for (let i = 0; i < n; i++) { x.fillText(COLS[i], o + i * s, o * .42); x.fillText(COLS[i], o + i * s, W - o * .42); x.fillText(String(n - i), o * .42, o + i * s); x.fillText(String(n - i), W - o * .42, o + i * s); } }
  const sv = opt.score, dead = new Set(sv ? sv.dead.map(([a, c]) => a + "," + c) : []);
  if (sv && sv.terr) for (let i = 0; i < n * n; i++) { const t = sv.terr[i]; if (!t) continue; const a = i % n, c = Math.floor(i / n); x.fillStyle = t > 0 ? "rgba(18,18,18,.78)" : "rgba(252,250,244,.92)"; const q = s * .28; x.fillRect(o + a * s - q / 2, o + c * s - q / 2, q, q); }
  const stone = (a, c, col, alpha = 1) => {
    const cx = o + a * s, cy = o + c * s, R = s * .485; x.save(); x.globalAlpha = alpha;
    if (!opt.mini) { x.fillStyle = "rgba(0,0,0,.3)"; x.beginPath(); x.arc(cx + R * .1, cy + R * .15, R, 0, 7); x.fill(); }
    const gr = x.createRadialGradient(cx - R * .35, cy - R * .4, R * .08, cx, cy, R);
    if (col === BLACK) { gr.addColorStop(0, "#6c6c6c"); gr.addColorStop(.35, "#252525"); gr.addColorStop(1, "#050505"); } else { gr.addColorStop(0, "#ffffff"); gr.addColorStop(.6, "#efede7"); gr.addColorStop(1, "#bab6ad"); }
    x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill(); x.restore();
  };
  for (let c = 0; c < n; c++) for (let a = 0; a < n; a++) { const v = b.c[b.pos(a, c)]; if (v === BLACK || v === WHITE) stone(a, c, v, dead.has(a + "," + c) ? .42 : 1); }
  for (const k of dead) { const [a, c] = k.split(",").map(Number), cx = o + a * s, cy = o + c * s, q = s * .2; x.strokeStyle = "#d6453d"; x.lineWidth = Math.max(1.5, s * .07); x.beginPath(); x.moveTo(cx - q, cy - q); x.lineTo(cx + q, cy + q); x.moveTo(cx + q, cy - q); x.lineTo(cx - q, cy + q); x.stroke(); }
  if (opt.numbers) { x.textAlign = "center"; x.textBaseline = "middle"; x.font = `700 ${s * .4}px Pretendard Variable, Pretendard, sans-serif`;
    for (const [p, no] of opt.numbers) { const v = b.c[p]; if (v !== BLACK && v !== WHITE) continue; const [a, c] = b.xy(p); x.fillStyle = v === BLACK ? "#f3efe4" : "#1b1b1b"; x.fillText(String(no), o + a * s, o + c * s + s * .02); } }
  if (opt.marks) for (const [a, c, txt, col] of opt.marks) { const cx = o + a * s, cy = o + c * s; if (txt === "○") { x.strokeStyle = col || "#2f7de0"; x.lineWidth = Math.max(2, s * .1); x.beginPath(); x.arc(cx, cy, s * .32, 0, 7); x.stroke(); } else { x.fillStyle = col || "#d6453d"; x.font = `700 ${s * .5}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, cx, cy); } }
  if (b.last > 0 && !opt.noLast && !opt.numbers) { const [a, c] = b.xy(b.last), v = b.c[b.last]; if (v === BLACK || v === WHITE) { x.fillStyle = "#c8432f"; const q = s * (opt.mini ? .3 : .2); x.beginPath(); x.moveTo(o + a * s, o + c * s - q); x.lineTo(o + a * s + q, o + c * s); x.lineTo(o + a * s, o + c * s + q); x.lineTo(o + a * s - q, o + c * s); x.closePath(); x.fill(); } }
  if (opt.hover && opt.me) stone(opt.hover[0], opt.hover[1], opt.me, .45);
  return { o, s, k: dpr };
}
// 판 위 좌표 (마우스 → 교차점)
export function boardPoint(cv, geo, n, e) { if (!geo) return null; const r = cv.getBoundingClientRect(); const x = Math.round(((e.clientX - r.left) * geo.k - geo.o) / geo.s), y = Math.round(((e.clientY - r.top) * geo.k - geo.o) / geo.s); return x >= 0 && y >= 0 && x < n && y < n ? [x, y] : null; }
// 기보 문자열 ↔ 수 배열 ("pd" 두 글자 = 한 수, "--" = 패스)
export const packMoves = ms => ms.map(m => m ? String.fromCharCode(97 + m[0], 97 + m[1]) : "--").join("");
export const unpackMoves = s => (String(s || "").match(/../g) || []).map(t => t === "--" ? null : [t.charCodeAt(0) - 97, t.charCodeAt(1) - 97]);
export function toSGF(r) {
  const esc = s => String(s ?? "").replace(/[\\\]]/g, "\\$&"), c = v => String.fromCharCode(97 + v);
  let s = `(;GM[1]FF[4]CA[UTF-8]AP[Muryang]SZ[${r.size}]KM[${r.komi ?? 6.5}]PB[${esc(r.pb)}]PW[${esc(r.pw)}]BR[${esc(r.br || "")}]WR[${esc(r.wr || "")}]DT[${esc((r.date || "").slice(0, 10))}]RE[${esc(r.result)}]GN[${esc(r.title || "")}]PC[무량 · MURYANG]`;
  r.moves.forEach((m, i) => { s += `;${i % 2 ? "W" : "B"}[${m ? c(m[0]) + c(m[1]) : ""}]`; }); return s + ")";
}
// 간단한 SGF 읽기 (주 수순만)
export function parseSGF(t) {
  t = String(t || ""); const prop = k => { const m = t.match(new RegExp("[;\\s]" + k + "\\[((?:\\\\.|[^\\]])*)\\]")); return m ? m[1].replace(/\\(.)/g, "$1") : ""; };
  const size = parseInt(prop("SZ") || "19", 10), moves = [];
  const re = /;\s*([BW])\[([a-t]{0,2})\]/g; let m, i = 0;
  while ((m = re.exec(t))) { if ((m[1] === "B") !== (i % 2 === 0)) break; const v = m[2]; moves.push(v.length === 2 && !(v === "tt" && size <= 19) ? [v.charCodeAt(0) - 97, v.charCodeAt(1) - 97] : null); i++; }
  return { size: [9, 13, 19].includes(size) ? size : 19, komi: parseFloat(prop("KM")) || 6.5, pb: prop("PB") || "흑", pw: prop("PW") || "백", result: prop("RE"), date: prop("DT"), title: prop("GN") || prop("EV"), moves };
}
