// 무량 · 無量 바둑 — 방 만들기 · 들어가기 · 관전 · 기보 · 계정
import { Board, fromMoves, ownership, finalScore, PASS, BLACK, WHITE } from "./engine.js";
import { paintBoard, boardPoint, COORD, packMoves, unpackMoves, toSGF, parseSGF } from "./board.js";
import { FAMOUS } from "./famous.js";
import { firebaseConfig } from "./firebase-config.js?v=3";
import { initCloud } from "./cloud.js?v=3";

// =====================================================================
// 공용 도구
// =====================================================================
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rid8 = () => Math.random().toString(36).slice(2, 10);
const now = () => Date.now();
const z2 = n => String(n).padStart(2, "0");
const fmtDate = t => { const d = new Date(t); if (isNaN(d)) return String(t || ""); return `${d.getFullYear()}.${z2(d.getMonth() + 1)}.${z2(d.getDate())} ${z2(d.getHours())}:${z2(d.getMinutes())}`; };
const fmtDay = t => { const d = new Date(t); if (isNaN(d)) return String(t || ""); return `${d.getFullYear()}.${z2(d.getMonth() + 1)}.${z2(d.getDate())}`; };
const ago = t => { const s = (now() - t) / 1000; if (s < 60) return "방금"; if (s < 3600) return `${Math.floor(s / 60)}분 전`; if (s < 86400) return `${Math.floor(s / 3600)}시간 전`; return fmtDay(t); };
const colName = c => c === BLACK ? "흑" : "백";
const LS = { acc: "muryang-accounts", ses: "muryang-session", games: "muryang-games", pub: "muryang-public", set: "muryang-settings" };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast("브라우저 저장 공간이 부족합니다. 기보를 정리해 주세요."); return false; } };
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(v => v.toString(16).padStart(2, "0")).join(""); }

export const RANKS = ["입문", ...Array.from({ length: 18 }, (_, i) => `${18 - i}급`), ...Array.from({ length: 7 }, (_, i) => `아마 ${i + 1}단`)];
const ID_RE = /^[a-z][a-z0-9_]{3,15}$/;
const nickOK = s => typeof s === "string" && s.trim().length >= 2 && s.trim().length <= 12 && !/[<>{}\\]/.test(s);
const STONES = { black: ["#101010", "#5e5e5e"], white: ["#f4f1e8", "#bdb8ad"], jade: ["#2f6b57", "#8fc4a9"], gold: ["#9c7a34", "#e7c983"], ink: ["#25324a", "#7f93b8"], cinnabar: ["#8e2f22", "#e38a6e"] };

function toast(msg, kind = "") { const t = document.createElement("div"); t.className = "toast " + kind; t.textContent = msg; $("#toasts").appendChild(t); setTimeout(() => t.classList.add("out"), 3600); setTimeout(() => t.remove(), 4100); }

// 모달: html 안의 [data-ok] 버튼 → resolve(폼 값), [data-x] → resolve(null)
const modalEl = $("#modal"), modalIn = $("#modal-in");
function modal(html, { onOpen, validate, wide } = {}) {
  return new Promise(res => {
    modalIn.innerHTML = html; modalEl.classList.toggle("wide", !!wide); let done = false;
    const finish = v => { if (done) return; done = true; modalEl.close(); res(v); };
    modalIn.onsubmit = async e => { e.preventDefault(); const fd = Object.fromEntries(new FormData(modalIn)); if (validate) { const err = await validate(fd, modalIn); if (err) { const p = $(".m-err", modalIn); if (p) { p.textContent = err; p.hidden = false; } return; } } finish(fd); };
    $$("[data-x]", modalIn).forEach(b => b.addEventListener("click", e => { e.preventDefault(); finish(null); }));
    modalEl.oncancel = e => { e.preventDefault(); finish(null); };
    modalEl.showModal(); onOpen && onOpen(modalIn, finish);
  });
}
const ask = (title, text, ok = "확인", danger = false) => modal(`<h3>${esc(title)}</h3><p class="m-text">${esc(text)}</p><div class="m-act"><button class="btn ghost" data-x>취소</button><button class="btn ${danger ? "danger" : "gold"}" type="submit">${esc(ok)}</button></div>`).then(v => !!v);

// 소리: 돌 놓는 소리 · 알림
let actx = null, settings = Object.assign({ sound: true, coords: true, numbers: false }, load(LS.set, {}));
function sfx(kind = "stone") {
  if (!settings.sound) return; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const t = actx.currentTime;
    if (kind === "stone") { const len = .09, buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 7); const s = actx.createBufferSource(); s.buffer = buf; const f = actx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 1.4; const g = actx.createGain(); g.gain.value = .9; s.connect(f).connect(g).connect(actx.destination); s.start(t); }
    else { const o = actx.createOscillator(), g = actx.createGain(); o.type = "sine"; o.frequency.setValueAtTime(kind === "warn" ? 520 : 880, t); o.frequency.exponentialRampToValueAtTime(kind === "warn" ? 420 : 1320, t + .15); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .35); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .4); }
  } catch (e) {}
}

// =====================================================================
// 계정 (이 기기 브라우저에 저장 · 비밀번호는 해시로만 보관)
// =====================================================================
let accounts = load(LS.acc, []); if (!Array.isArray(accounts)) accounts = [];
let cloud = null; // Firebase 연결 (firebase-config.js가 채워져 있으면)
let me = accounts.find(a => a.key === load(LS.ses, null)) || null;
const saveAccounts = () => save(LS.acc, accounts);
const fromCloud = p => p ? { ...p, rec: { w: p.w | 0, l: p.l | 0 }, bio: p.bio || "", av: okAv(p.av) ? p.av : { k: "stone", c: "black" } } : null;
const cloudErr = e => toast((e && e.message) || "사이트에 저장하지 못했습니다.", "warn");
function setMe(a) { me = a; if (!cloud) save(LS.ses, a ? a.key : null); renderChip(); sendPres(); }
const rankOf = u => RANKS[u && Number.isInteger(u.rank) ? u.rank : 0] || "입문";
const pubU = () => me ? { key: me.key, id: me.id, nick: me.nick, rank: me.rank, bio: me.bio || "", av: me.av, w: me.rec.w, l: me.rec.l } : null;
function okU(u) {
  return !!u && typeof u.key === "string" && u.key.length <= 40 && typeof u.id === "string" && (ID_RE.test(u.id) || u.id === "muryang_ai") && nickOK(u.nick) && Number.isInteger(u.rank) && u.rank >= 0 && u.rank < RANKS.length &&
    typeof (u.bio ?? "") === "string" && (u.bio || "").length <= 80 && Number.isInteger(u.w ?? 0) && Number.isInteger(u.l ?? 0) && okAv(u.av);
}
const okAv = a => !!a && ((a.k === "stone" && STONES[a.c]) || (a.k === "img" && typeof a.src === "string" && a.src.startsWith("data:image/") && a.src.length < 24000));
const cleanU = u => ({ key: u.key, id: u.id, nick: u.nick.trim(), rank: u.rank, bio: (u.bio || "").slice(0, 80), av: u.av, w: u.w | 0, l: u.l | 0 });
function avatar(u, size = 36) {
  const a = u && u.av; if (a && a.k === "img") return `<span class="av" style="--s:${size}px"><img src="${esc(a.src)}" alt=""></span>`;
  const [c1, c2] = STONES[(a && a.c) || "black"] || STONES.black, ch = u ? esc((u.nick || "?").trim().slice(0, 1)) : "?", light = a && a.c === "white";
  return `<span class="av stone" style="--s:${size}px;--c1:${c1};--c2:${c2};color:${light ? "#2a2723" : "#f6f1e6"}">${ch}</span>`;
}
const AI_U = lv => ({ key: "ai", id: "muryang_ai", nick: "무량 AI", rank: [8, 14, 19][lv - 1] ?? 14, bio: "", av: { k: "stone", c: "ink" }, w: 0, l: 0 });

// =====================================================================
// 기보 저장소: 내 기보 · 공개 기보
// =====================================================================
let games = load(LS.games, []); if (!Array.isArray(games)) games = [];
let pubs = load(LS.pub, []); if (!Array.isArray(pubs)) pubs = [];
const saveGames = () => save(LS.games, games.slice(0, 400));
const savePubs = () => { if (!cloud) save(LS.pub, pubs.slice(0, 300)); };
const pubIdOf = r => cloud && me ? `${r.id}-${me.key.slice(0, 8)}` : r.id;
const recAdd = r => { if (cloud) { if (me) cloud.addRec(me.key, r).catch(cloudErr); } else saveGames(); };
const recUpd = (r, patch) => { Object.assign(r, patch); if (cloud) { if (me) cloud.updRec(me.key, r.id, patch).catch(cloudErr); } else saveGames(); };
const recDel = r => { games = games.filter(g => g !== r); if (cloud) { if (me) cloud.delRec(me.key, r.id).catch(cloudErr); } else saveGames(); };
const okRec = r => !!r && typeof r.id === "string" && r.id.length <= 48 && [9, 13, 19].includes(r.size) && typeof r.m === "string" && r.m.length <= 1800 && /^([a-s]{2}|--)*$/.test(r.m) &&
  ["pb", "pw", "br", "wr", "result", "title", "by", "byNick"].every(k => r[k] === undefined || (typeof r[k] === "string" && r[k].length <= 80)) && typeof (r.komi ?? 6.5) === "number";
const myGames = () => me ? games.filter(g => g.owner === me.key) : games.filter(g => !g.owner);
function recLabel(r) { return r.title || `${r.pb} vs ${r.pw}`; }

// =====================================================================
// 실시간 연결 (Trystero · 접속자끼리 직접 연결)
// =====================================================================
let selfId = "local-" + rid8(), room = null, netState = "connecting";
const peers = new Map();           // peerId → { u, at(어디 있는지), ts }
const rooms = new Map();           // rid → 방 요약 (방장이 알려 준 것)
const lobbyChat = [];
let A = { pres: { send() {} }, lob: { send() {} }, gm: { send() {} }, kb: { send() {} } };
function setNet(s) { netState = s; const n = $("#net"); n.dataset.s = s; $("span", n).textContent = s === "on" ? `접속 ${peers.size + 1}명` : s === "off" ? "혼자 접속 중" : "연결 중"; }
async function connect() {
  let m; try { m = await import("trystero"); } catch (e) { setNet("off"); toast("실시간 연결을 불러오지 못했습니다. 인공지능 대국과 기보실은 그대로 쓸 수 있어요."); return; }
  try { room = m.joinRoom({ appId: "org.muryang.baduk.v1" }, "muryang-lobby"); if (m.selfId) selfId = m.selfId; } catch (e) { setNet("off"); return; }
  const act = n => { const a = room.makeAction(n); return { send: (d, t) => Promise.resolve(a.send(d, t ? { target: t } : undefined)).catch(() => {}), on: fn => { a.onMessage = fn; } }; };
  A = { pres: act("pres"), lob: act("lob"), gm: act("gm"), kb: act("kb") }; setNet("on");
  room.onPeerJoin = pid => { sendPres(pid); if (H) sendSummary(pid); setTimeout(() => sendPubList(pid), 1500); setNet("on"); refreshLive(); };
  room.onPeerLeave = pid => { peers.delete(pid); for (const [k, r] of rooms) if (r.host === pid) rooms.delete(k); if (H) hostPeerLeft(pid); if (cur && cur.S && cur.S.host === pid && !(H && H.rid === cur.rid)) roomGone("방장이 나가서 방이 닫혔습니다."); setNet("on"); refreshLive(); };
  A.pres.on((d, { peerId }) => { if (!d || typeof d !== "object") return; if (d.u && !okU(d.u)) return; peers.set(peerId, { u: d.u ? cleanU(d.u) : null, at: typeof d.at === "string" ? d.at.slice(0, 20) : "", ts: now() }); setNet("on"); refreshLive(); });
  A.lob.on((d, { peerId }) => {
    if (!d) return;
    if (d.t === "room" && okSummary(d.r) && d.r.host === peerId) { rooms.set(d.r.rid, { ...d.r, seen: now() }); refreshLive(); }
    else if (d.t === "close" && typeof d.rid === "string") { const r = rooms.get(d.rid); if (r && r.host === peerId) { rooms.delete(d.rid); refreshLive(); } }
    else if (d.t === "chat" && typeof d.text === "string" && d.text.trim() && d.text.length <= 200 && okU(d.u)) { pushLobbyChat({ u: cleanU(d.u), text: d.text.trim(), ts: now() }); }
  });
  A.gm.on((d, { peerId }) => { if (!d || typeof d !== "object") return; if (H && d.rid === H.rid && d.t !== "st") hostHandle(d, peerId); else clientHandle(d, peerId); });
  A.kb.on((d, { peerId }) => {
    if (!d || cloud) return;
    if (d.t === "pub" && okRec(d.r) && typeof d.r.bk === "string") { if (addPub(d.r)) { savePubs(); refreshLive(); } }
    else if (d.t === "publ" && Array.isArray(d.list)) { let n = 0; for (const r of d.list.slice(0, 80)) if (okRec(r) && typeof r.bk === "string" && addPub(r)) n++; if (n) { savePubs(); refreshLive(); } }
    else if (d.t === "unpub" && typeof d.id === "string" && typeof d.bk === "string") { const i = pubs.findIndex(p => p.id === d.id && p.bk === d.bk); if (i >= 0) { pubs.splice(i, 1); savePubs(); refreshLive(); } }
  });
  setInterval(() => { sendPres(); if (H) sendSummary(); const t = now(); for (const [k, r] of rooms) if (t - r.seen > 16000) rooms.delete(k); for (const [k, p] of peers) if (t - p.ts > 40000) peers.delete(k); setNet("on"); refreshLive(); }, 5000);
}
const where = () => H ? "room:" + H.rid : cur ? "room:" + cur.rid : location.hash.slice(1, 20);
function sendPres(to) { A.pres.send({ u: pubU(), at: where() }, to); }
function addPub(r) { const o = pubs.findIndex(p => p.id === r.id); if (o >= 0) return false; pubs.unshift({ id: r.id, size: r.size, komi: r.komi ?? 6.5, m: r.m, pb: r.pb, pw: r.pw, br: r.br, wr: r.wr, result: r.result, title: r.title, date: typeof r.date === "number" ? r.date : now(), by: r.by, byNick: r.byNick, bk: r.bk, ts: typeof r.ts === "number" ? r.ts : now() }); pubs.sort((a, b) => b.ts - a.ts); if (pubs.length > 300) pubs.length = 300; return true; }
function sendPubList(to) { if (!cloud && pubs.length) A.kb.send({ t: "publ", list: pubs.slice(0, 60) }, to); }
function pushLobbyChat(c) { lobbyChat.push(c); if (lobbyChat.length > 80) lobbyChat.shift(); const box = $("#lobby-chat .chat-log"); if (box) renderLobbyChat(); }

// =====================================================================
// 방 (방장 쪽): 방장이 대국 상태를 쥐고 다른 사람에게 나눠 준다
// =====================================================================
let H = null; // 내가 연 방
const TC_LABEL = tc => !tc || !tc.m ? "무제한" : `${tc.m / 60}분 · 초읽기 ${tc.b}초 ${tc.n}회`;
function okSummary(r) { return !!r && typeof r.rid === "string" && r.rid.length <= 16 && typeof r.title === "string" && r.title.length <= 40 && [9, 13, 19].includes(r.size) && typeof r.host === "string" && ["wait", "play", "end"].includes(r.status) && Array.isArray(r.pl) && typeof r.m === "string" && r.m.length <= 1800; }
const briefU = u => u ? { id: u.id, nick: u.nick, rank: u.rank, av: u.av } : null;
function summary() {
  return { rid: H.rid, title: H.title, host: selfId, size: H.size, komi: H.komi, tc: H.tc, undo: H.undo, priv: H.priv, ai: H.ai, auto: H.auto, status: H.status === "count" ? "play" : H.status,
    pl: [briefU(H.p[1] && H.p[1].u), briefU(H.p[2] && H.p[2].u)], sp: H.specs.length, m: H.priv ? "" : packMoves(H.moves), res: H.result || "", ts: now() };
}
function sendSummary(to) { if (H) A.lob.send({ t: "room", r: summary() }, to); }
function createRoom(o) {
  if (H) closeRoom(true);
  const hostCol = o.color === 0 ? (Math.random() < .5 ? BLACK : WHITE) : o.color;
  H = { rid: o.rid || rid8(), title: o.title, size: o.size, komi: o.komi, tc: o.tc, undo: o.undo, priv: o.priv, pwh: o.pwh || "", auto: o.auto, ai: o.ai, color: o.color,
    host: selfId, p: { 1: null, 2: null }, specs: [], pend: [], chat: [], moves: [], status: "wait", req: null, result: "", win: 0, score: null, cl: null, t0: 0, round: 0, gid: "", b: null, rev: 0 };
  H.p[hostCol] = { pid: selfId, u: pubU() };
  if (o.ai) { H.p[3 - hostCol] = { pid: "ai", u: AI_U(o.ai) }; startGame(); }
  sysChat(`${me.nick}님이 방을 열었습니다.`); pushState(); sendPres();
  location.hash = "#/room/" + H.rid;
}
function closeRoom(silent) {
  if (!H) return; const T = H;
  if (T.status === "play" || T.status === "count") { const myC = T.p[1] && T.p[1].pid === selfId ? 1 : 2, opp = T.p[3 - myC]; if (opp && opp.pid !== "ai") endGame(`${colName(3 - myC)} 기권승 · 방장 퇴장`, 3 - myC); }
  const members = memberIds(); if (members.length) A.gm.send({ t: "closed", rid: T.rid }, members);
  A.lob.send({ t: "close", rid: T.rid }); H = null; if (!silent) toast("방을 닫았습니다."); sendPres(); refreshLive();
}
const memberIds = () => { if (!H) return []; const s = new Set(H.specs.map(x => x.pid)); for (const c of [1, 2]) if (H.p[c] && H.p[c].pid !== selfId && H.p[c].pid !== "ai") s.add(H.p[c].pid); for (const x of H.pend) s.add(x.pid); s.delete(selfId); return [...s]; };
function stateOf() {
  return { rid: H.rid, title: H.title, host: selfId, size: H.size, komi: H.komi, tc: H.tc, undo: H.undo, priv: H.priv, ai: H.ai, auto: H.auto, status: H.status, p: H.p, specs: H.specs, pend: H.pend.map(x => ({ pid: x.pid, u: x.u })),
    chat: H.chat.slice(-60), m: packMoves(H.moves), req: H.req, closeAt: H.closeAt || 0, result: H.result, win: H.win, score: H.score, cl: H.cl, el: H.t0 ? now() - H.t0 : 0, gid: H.gid, rev: ++H.rev };
}
let pushT = 0;
function pushState() {
  if (!H) return; const S = stateOf(), ids = memberIds(); if (ids.length) A.gm.send({ t: "st", rid: H.rid, S }, ids);
  onState(JSON.parse(JSON.stringify(S)), selfId); clearTimeout(pushT); pushT = setTimeout(sendSummary, 120);
}
function sysChat(text) { if (!H) return; H.chat.push({ sys: 1, text, ts: now() }); if (H.chat.length > 120) H.chat.splice(0, H.chat.length - 120); }
function colorOf(pid) { if (!H) return 0; return H.p[1] && H.p[1].pid === pid ? 1 : H.p[2] && H.p[2].pid === pid ? 2 : 0; }
function startGame() {
  H.status = "play"; H.closeAt = 0; H.moves = []; H.b = new Board(H.size); H.req = null; H.result = ""; H.win = 0; H.score = null; H.round++; H.gid = `${H.rid}-${H.round}-${rid8().slice(0, 4)}`;
  H.cl = H.tc && H.tc.m ? { 1: { m: H.tc.m * 1000, n: H.tc.n }, 2: { m: H.tc.m * 1000, n: H.tc.n } } : null; H.t0 = now(); H.started = now();
  sysChat(`대국 시작 — 흑 ${H.p[1].u.nick} · 백 ${H.p[2].u.nick}`); aiMaybe();
  if (!H.ai && !location.hash.startsWith("#/room/" + H.rid)) { sfx("ding"); toast("상대가 앉아 대국이 시작되었습니다!"); setTimeout(() => { if (H) location.hash = "#/room/" + H.rid; }, 300); }
}
function clockOf(cl, tc, side, el) {
  const c = cl[side], b = tc.b * 1000; let m = c.m, n = c.n;
  if (el <= m) return { m: m - el, n, byo: false, left: m - el };
  const over = el - m, used = Math.floor(over / b);
  if (used >= n) return { m: 0, n: 0, lost: true, byo: true, left: 0 };
  return { m: 0, n: n - used, byo: true, left: b - (over % b) };
}
const AUTO_CLOSE = 5 * 60000;
function endGame(result, win, score = null) {
  if (!H) return; H.status = "end"; H.result = result; H.win = win; H.score = score; H.req = null; H.t0 = 0; H.closeAt = now() + AUTO_CLOSE;
  sysChat(`대국 종료 — ${result} · 이 방은 5분 뒤 자동으로 닫힙니다.`); pushState();
  const gid = H.gid, rid = H.rid; setTimeout(() => { if (H && H.rid === rid && H.gid === gid && H.status !== "play" && H.status !== "count") { const here = location.hash.startsWith("#/room/" + rid); closeRoom(true); toast("대국이 끝나고 5분이 지나 방을 닫았습니다."); if (here) { cur = null; location.hash = "#/"; } } }, AUTO_CLOSE + 200);
}
function playMove(col, mv) { // 방장 쪽: 착수 적용
  if (!H || H.status !== "play" || H.b.turn !== col) return false;
  const p = mv ? H.b.pos(mv[0], mv[1]) : PASS; if (mv && !(mv[0] >= 0 && mv[1] >= 0 && mv[0] < H.size && mv[1] < H.size)) return false;
  if (!H.b.legal(p, col)) return false;
  if (H.cl) { const st = clockOf(H.cl, H.tc, col, now() - H.t0); if (st.lost) { endGame(`${colName(3 - col)} 시간승`, 3 - col); return false; } H.cl[col] = { m: st.m, n: st.byo ? st.n : H.tc.n }; if (st.byo) H.cl[col].m = 0; }
  H.b.play(p, col); H.moves.push(mv || null); H.t0 = now(); if (H.req && H.req.type !== "again") H.req = null;
  if (!mv) { sysChat(`${colName(col)} 패스`); if (H.b.passes >= 2) { countGame("양쪽이 연달아 패스했습니다. 계가합니다."); return true; } }
  pushState(); aiMaybe(); return true;
}
// 계가: 사석은 무작위 대국으로 추정해 자동 판정 (한국 규칙)
let worker = null; const wq = new Map(); let wid = 0;
function work(msg) { return new Promise(res => { try { worker = worker || new Worker(new URL("./worker.js", import.meta.url), { type: "module" }); worker.onmessage = e => { const f = wq.get(e.data.id); if (f) { wq.delete(e.data.id); f(e.data); } }; worker.onerror = () => { for (const f of wq.values()) f({ error: "worker" }); wq.clear(); worker = null; }; const id = ++wid; wq.set(id, res); worker.postMessage({ ...msg, id }); } catch (e) { res({ error: String(e) }); } }); }
async function countGame(note) {
  if (!H) return; H.status = "count"; H.req = null; if (note) sysChat(note); pushState(); const gid = H.gid;
  let r = await work({ type: "score", size: H.size, moves: H.moves, komi: H.komi }), sc = r && r.score;
  if (!sc) { const b = fromMoves(H.size, H.moves); sc = finalScore(b, ownership(b, 80), H.komi); }
  if (!H || H.gid !== gid) return;
  const w = sc.winner, res = `${colName(w)} ${sc.margin.toFixed(1).replace(/\.0$/, "")}집 승`;
  endGame(`${res} (흑 ${sc.black} : 백 ${sc.white})`, w, { dead: sc.dead, terr: sc.terr, black: sc.black, white: sc.white });
}
async function aiMaybe() {
  if (!H || !H.ai || H.status !== "play") return; const col = H.b.turn; if (!H.p[col] || H.p[col].pid !== "ai") return;
  const gid = H.gid, n = H.moves.length; await new Promise(r => setTimeout(r, 350));
  const r = await work({ type: "move", size: H.size, moves: H.moves, komi: H.komi, level: H.ai - 1 });
  if (!H || H.gid !== gid || H.moves.length !== n || H.status !== "play") return;
  if (r.move === "resign") { endGame(`${colName(3 - col)} 불계승 (무량 AI 기권)`, 3 - col); return; }
  if (r.error) { playMove(col, null); return; }
  if (!playMove(col, r.move || null)) playMove(col, null);
}
setInterval(() => { if (H && H.status === "play" && H.cl && H.t0) { const side = H.b.turn, st = clockOf(H.cl, H.tc, side, now() - H.t0); if (st.lost) endGame(`${colName(3 - side)} 시간승 · ${H.p[side].u.nick} 시간 초과`, 3 - side); } }, 500);

function seat(pid, u) {
  const free = !H.p[1] ? 1 : !H.p[2] ? 2 : 0; if (!free) return false;
  H.p[free] = { pid, u }; H.pend = H.pend.filter(x => x.pid !== pid); H.specs = H.specs.filter(x => x.pid !== pid);
  sysChat(`${u.nick}님이 ${colName(free)}으로 앉았습니다.`); if (H.p[1] && H.p[2]) startGame(); return true;
}
function hostHandle(d, pid) {
  const myC = colorOf(pid), opp = myC ? 3 - myC : 0, u = d.u && okU(d.u) ? cleanU(d.u) : null;
  switch (d.t) {
    case "join": {
      if (!u) return A.gm.send({ t: "deny", rid: H.rid, why: "로그인한 회원만 도전할 수 있습니다." }, pid);
      if (H.priv && d.pw !== H.pwh) return A.gm.send({ t: "deny", rid: H.rid, why: "비밀번호가 맞지 않습니다." }, pid);
      if (myC) return pushState();
      if (H.ai || (H.p[1] && H.p[2]) || H.status !== "wait") { if (!H.specs.some(x => x.pid === pid)) H.specs.push({ pid, u: u ? briefU(u) : null }); A.gm.send({ t: "note", rid: H.rid, text: "빈 자리가 없어 관전으로 들어왔습니다." }, pid); return pushState(); }
      if (H.auto) { seat(pid, u); return pushState(); }
      if (!H.pend.some(x => x.pid === pid)) { H.pend.push({ pid, u }); sfx("ding"); toast(`${u.nick}(${rankOf(u)})님이 도전을 신청했습니다.`); }
      return pushState();
    }
    case "watch": {
      if (H.priv && d.pw !== H.pwh) return A.gm.send({ t: "deny", rid: H.rid, why: "비밀번호가 맞지 않습니다." }, pid);
      if (!myC && !H.specs.some(x => x.pid === pid)) { if (H.specs.length >= 60) return A.gm.send({ t: "deny", rid: H.rid, why: "관전자가 가득 찼습니다." }, pid); H.specs.push({ pid, u: u ? briefU(u) : null }); }
      return pushState();
    }
    case "leave": return hostPeerLeft(pid, true);
    case "mv": { if (!myC) return; if (d.n !== H.moves.length) return pushState(); const mv = d.mv === null ? null : Array.isArray(d.mv) && d.mv.length === 2 && d.mv.every(Number.isInteger) ? d.mv : undefined; if (mv === undefined) return; if (!playMove(myC, mv)) pushState(); return; }
    case "resign": if (myC && (H.status === "play" || H.status === "count")) endGame(`${colName(opp)} 불계승 (${colName(myC)} 기권)`, opp); return;
    case "undo": {
      if (!myC || H.status !== "play") return; if (!H.undo) return A.gm.send({ t: "note", rid: H.rid, text: "이 방은 한 수 물리기를 받지 않습니다." }, pid);
      if (H.moves.length < (myC === BLACK ? 1 : 2) || H.req) return;
      H.req = { type: "undo", from: myC, ts: now() }; sysChat(`${colName(myC)}이 한 수 물리기를 요청했습니다.`); if (H.p[opp].pid === "ai") return answer(opp, true); return pushState();
    }
    case "score": { if (!myC || H.status !== "play" || H.moves.length < 10) return; H.req = { type: "score", from: myC, ts: now() }; sysChat(`${colName(myC)}이 계가를 신청했습니다.`); if (H.p[opp].pid === "ai") return answer(opp, true); return pushState(); }
    case "again": { if (!myC || H.status !== "end") return; H.req = { type: "again", from: myC, ts: now() }; sysChat(`${colName(myC)}이 한 판 더 두자고 합니다.`); if (H.p[opp] && H.p[opp].pid === "ai") return answer(opp, true); return pushState(); }
    case "cancel": if (myC && H.req && H.req.from === myC) { H.req = null; sysChat("요청을 거두었습니다."); pushState(); } return;
    case "ans": if (myC && H.req && H.req.from === opp) answer(myC, !!d.ok); return;
    case "chat": { if (typeof d.text !== "string" || !d.text.trim() || d.text.length > 200) return; const who = myC ? H.p[myC].u : H.specs.find(x => x.pid === pid)?.u; if (!who) return; H.chat.push({ nick: who.nick, id: who.id, c: myC, text: d.text.trim(), ts: now() }); if (H.chat.length > 120) H.chat.shift(); return pushState(); }
  }
}
function answer(col, ok) {
  const q = H.req; if (!q) return; H.req = null;
  if (!ok) { sysChat(`${colName(col)}이 ${q.type === "undo" ? "한 수 물리기" : q.type === "score" ? "계가 신청" : "다시 두기"}를 거절했습니다.`); return pushState(); }
  if (q.type === "undo") {
    const lastBy = H.moves.length % 2 === 1 ? BLACK : WHITE, k = lastBy === q.from ? 1 : 2; H.moves.splice(Math.max(0, H.moves.length - k), k); H.b = fromMoves(H.size, H.moves); H.t0 = now();
    sysChat(`${colName(col)}이 허락해 ${k}수를 물렸습니다.`); pushState(); aiMaybe(); return;
  }
  if (q.type === "score") { sysChat(`${colName(col)}이 계가에 동의했습니다.`); countGame(); return; }
  if (q.type === "again") { const a = H.p[1]; H.p[1] = H.p[2]; H.p[2] = a; sysChat("흑백을 바꿔 한 판 더 둡니다."); startGame(); pushState(); }
}
function hostPeerLeft(pid, said) {
  if (!H) return; const c = colorOf(pid); let ch = false;
  if (H.specs.some(x => x.pid === pid)) { H.specs = H.specs.filter(x => x.pid !== pid); ch = true; }
  if (H.pend.some(x => x.pid === pid)) { H.pend = H.pend.filter(x => x.pid !== pid); ch = true; }
  if (c && pid !== selfId) { const u = H.p[c].u; ch = true;
    if (H.status === "play" || H.status === "count") { endGame(`${colName(3 - c)} 기권승 · ${u.nick} ${said ? "퇴장" : "연결 끊김"}`, 3 - c); }
    else { sysChat(`${u.nick}님이 나갔습니다.`); }
    H.p[c] = null; if (H.status === "end") H.status = "wait";
  }
  if (ch) pushState();
}
function approve(pid, ok) { if (!H) return; const x = H.pend.find(v => v.pid === pid); if (!x) return; if (!ok) { H.pend = H.pend.filter(v => v.pid !== pid); A.gm.send({ t: "deny", rid: H.rid, why: "방장이 도전을 거절했습니다. 관전으로 남아 있을 수 있어요." }, pid); if (!H.specs.some(v => v.pid === pid)) H.specs.push({ pid, u: briefU(x.u) }); return pushState(); } if (!seat(pid, x.u)) toast("빈 자리가 없습니다."); pushState(); }
function hostSit() { if (!H || colorOf(selfId)) return; if (!seat(selfId, pubU())) toast("빈 자리가 없습니다."); pushState(); }

// =====================================================================
// 방 (들어간 사람 쪽)
// =====================================================================
let cur = null; // { rid, S, b, mode, recvAt, saved:Set }
function send(t, extra = {}) { if (!cur) return; const d = { t, rid: cur.rid, ...extra }; if (H && H.rid === cur.rid) hostHandle(d, selfId); else if (cur.S) A.gm.send(d, cur.S.host); else { const r = rooms.get(cur.rid); if (r) A.gm.send(d, r.host); } }
async function enterRoom(rid, mode) {
  if (H && H.rid === rid) { cur = cur && cur.rid === rid ? cur : { rid, S: null, mode: "host", saved: new Set() }; return true; }
  if (H) { if (!(await ask("방 나가기", "지금 연 방을 닫고 다른 방으로 갈까요?", "방 닫고 이동"))) { location.hash = "#/room/" + H.rid; return false; } closeRoom(true); }
  if (cur && cur.rid !== rid) leaveRoom(true);
  const r = rooms.get(rid); let pw = "";
  if (mode === "join" && !me) { toast("도전하려면 먼저 로그인해 주세요."); location.hash = "#/login?next=" + encodeURIComponent("/room/" + rid + "?m=join"); return false; }
  if (r && r.priv) { const v = await modal(`<h3>비공개 방</h3><p class="m-text">「${esc(r.title)}」 방의 비밀번호를 입력해 주세요.</p><label class="fld"><span>비밀번호</span><input name="pw" type="password" required maxlength="20" autofocus></label><div class="m-act"><button class="btn ghost" data-x>취소</button><button class="btn gold" type="submit">들어가기</button></div>`); if (!v) { location.hash = "#/"; return false; } pw = await sha(rid + ":" + v.pw); }
  cur = { rid, S: null, mode, saved: new Set(), pw };
  const go = () => { const rr = rooms.get(rid); if (!rr) return false; A.gm.send({ t: mode === "join" ? "join" : "watch", rid, u: pubU(), pw }, rr.host); return true; };
  if (!go()) { let n = 0; const iv = setInterval(() => { if (!cur || cur.rid !== rid || cur.S) return clearInterval(iv); if (go() || ++n > 12) { clearInterval(iv); if (n > 12 && !cur.S) roomGone("방을 찾지 못했습니다. 이미 닫혔을 수 있어요."); } }, 500); }
  setTimeout(() => { if (cur && cur.rid === rid && !cur.S) roomGone("방장의 응답이 없습니다. 잠시 뒤 다시 시도해 주세요."); }, 9000);
  sendPres(); return true;
}
function leaveRoom(silent) { if (!cur) return; if (H && H.rid === cur.rid) { cur = null; return; } const host = cur.S ? cur.S.host : rooms.get(cur.rid)?.host; if (host) A.gm.send({ t: "leave", rid: cur.rid }, host); cur = null; sendPres(); if (!silent) toast("방에서 나왔습니다."); }
function roomGone(msg) { if (!cur) return; const was = cur; cur = null; toast(msg, "warn"); if (location.hash.startsWith("#/room/" + was.rid)) location.hash = "#/"; }
function clientHandle(d, pid) {
  if (!cur || d.rid !== cur.rid) return;
  if (d.t === "st" && d.S && typeof d.S === "object" && (!cur.S || cur.S.host === pid) && d.S.rid === cur.rid) { onState(d.S, pid); }
  else if (d.t === "deny" && typeof d.why === "string") { toast(d.why, "warn"); if (!cur.S || d.why.includes("비밀번호") || d.why.includes("가득")) { cur = null; location.hash = "#/"; } }
  else if (d.t === "note" && typeof d.text === "string") toast(d.text);
  else if (d.t === "closed") roomGone("방장이 방을 닫았습니다.");
}
function myColorIn(S) { return S.p[1] && S.p[1].pid === selfId ? 1 : S.p[2] && S.p[2].pid === selfId ? 2 : 0; }
const savedG = new Set();
function onState(S, from) {
  if (S.status === "end" && S.gid && !savedG.has(S.gid)) { savedG.add(S.gid); const ms = unpackMoves(S.m); if (ms.length >= 2 && (!cur || cur.rid === S.rid)) archiveGame(S, ms); }
  if (!cur || cur.rid !== S.rid) { if (H && S.rid === H.rid && location.hash.startsWith("#/room/" + H.rid)) cur = { rid: H.rid, S: null, mode: "host", saved: new Set() }; else return; }
  if (cur.S && S.rev && cur.S.rev && S.rev < cur.S.rev && cur.S.host === S.host) return;
  const prev = cur.S, moves = unpackMoves(S.m), b = fromMoves(S.size, moves) || new Board(S.size);
  cur.S = S; cur.moves = moves; cur.b = b; cur.recvAt = now();
  if (prev && moves.length > (prev.m || "").length / 2) sfx("stone");
  if (prev && S.req && (!prev.req || prev.req.ts !== S.req.ts) && S.req.from !== myColorIn(S) && myColorIn(S)) sfx("ding");
  
  if (S.status === "play" && prev && prev.status !== "play") sfx("ding");
  renderRoom();
}
function archiveGame(S, moves) {
  const mc = myColorIn(S), p1 = S.p[1] && S.p[1].u, p2 = S.p[2] && S.p[2].u;
  if (games.some(g => g.id === S.gid && g.owner === (me ? me.key : undefined))) return;
  const rec = { id: S.gid, size: S.size, komi: S.komi, m: packMoves(moves), pb: p1 ? p1.nick : "흑", pw: p2 ? p2.nick : "백", pbId: p1 ? p1.id : "", pwId: p2 ? p2.id : "", br: p1 ? rankOf(p1) : "", wr: p2 ? rankOf(p2) : "", result: S.result, title: S.title, date: now(), mine: mc ? 1 : 0, myColor: mc, ai: S.ai ? 1 : 0, win: S.win, owner: me ? me.key : undefined, pub: 0 };
  games.unshift(rec); recAdd(rec);
  if (mc && me && !S.ai) { if (S.win === mc) me.rec.w++; else me.rec.l++; if (cloud) cloud.addStat(me.key, S.win === mc).catch(cloudErr); else saveAccounts(); sendPres(); }
  toast(mc ? `대국이 끝났습니다 — ${S.result}. 기보실에 저장했습니다.` : `관전한 대국의 기보를 기보실에 저장했습니다.`);
}

// =====================================================================
// 화면: 머리 · 라우터
// =====================================================================
const view = $("#view");
function renderChip() {
  const c = $("#me-chip");
  if (!me) { c.innerHTML = `<a class="btn gold sm" href="#/login">로그인</a>`; return; }
  c.innerHTML = `<button class="chip" id="chip-btn" aria-haspopup="menu">${avatar(me, 30)}<span><b>${esc(me.nick)}</b><small>@${esc(me.id)} · ${esc(rankOf(me))}</small></span></button>
  <div class="chip-menu" hidden role="menu"><a href="#/profile" role="menuitem">프로필 설정</a><a href="#/kibo" role="menuitem">내 기보</a><button type="button" id="chip-out" role="menuitem">로그아웃</button></div>`;
  const m = $(".chip-menu", c); $("#chip-btn").onclick = e => { e.stopPropagation(); m.hidden = !m.hidden; };
  document.addEventListener("click", () => { m.hidden = true; }, { once: true });
  $("#chip-out").onclick = () => logout();
}
async function logout() { if (H && (H.status === "play")) { if (!(await ask("로그아웃", "진행 중인 대국은 기권으로 처리됩니다.", "로그아웃", true))) return; } if (H) closeRoom(true); if (cur) leaveRoom(true); if (cloud) { await cloud.logout().catch(() => {}); games = []; } setMe(null); toast("로그아웃했습니다."); location.hash = "#/"; }

let page = "", liveT = 0, clockT = 0;
function refreshLive() { clearTimeout(liveT); liveT = setTimeout(() => { if (page === "home") { renderRooms(); renderOnline(); renderStats(); } else if (page === "watch") renderWatch(); else if (page === "kibo" && kiboTab === "pub") renderKiboList(); else if (page === "user") userView(userId); }, 80); }
async function route() {
  const h = location.hash.replace(/^#/, "") || "/", [path, qs] = h.split("?"), q = new URLSearchParams(qs || ""), seg = path.split("/").filter(Boolean);
  const leavingRoom = cur && !(seg[0] === "room" && seg[1] === cur.rid);
  if (leavingRoom) { if (H && H.rid === cur.rid) { if (H.status === "play" || H.status === "count") { if (!(await ask("방 나가기", "대국 중입니다. 나가면 기권으로 처리되고 방이 닫힙니다.", "나가기", true))) { history.replaceState(null, "", "#/room/" + H.rid); return; } closeRoom(); } else toast("방은 열어 둔 채입니다. 대국실에서 「내 방」으로 돌아갈 수 있어요."); cur = null; } else { if (cur.S && myColorIn(cur.S) && cur.S.status === "play" && !(await ask("방 나가기", "대국 중입니다. 나가면 기권으로 처리됩니다.", "나가기", true))) { history.replaceState(null, "", "#/room/" + cur.rid); return; } leaveRoom(); } }
  clearInterval(clockT); document.onkeydown = null;
  $$(".nav a").forEach(a => a.classList.toggle("on", a.dataset.nav === (seg[0] === "room" || !seg[0] ? "home" : seg[0] === "u" ? "" : seg[0])));
  window.scrollTo(0, 0);
  if (!seg[0]) return homeView();
  if (seg[0] === "room") return roomView(seg[1], q.get("m") || "watch");
  if (seg[0] === "watch") return watchView();
  if (seg[0] === "kibo" && seg[1]) return viewerView(seg[1], decodeURIComponent(seg[2] || ""));
  if (seg[0] === "kibo") return kiboView(q.get("tab") || "mine");
  if (seg[0] === "profile") return profileView();
  if (seg[0] === "login") return loginView(q.get("tab") || "in", q.get("next") || "");
  if (seg[0] === "u") return userView(decodeURIComponent(seg[1] || ""));
  homeView();
}
addEventListener("hashchange", route);

// =====================================================================
// 대국실 (첫 화면)
// =====================================================================
let roomFilter = "all";
function homeView() {
  page = "home";
  view.innerHTML = `
  <section class="hero">
    <div class="hero-txt">
      <p class="eyebrow">無量 · MURYANG BADUK</p>
      <h1>흑과 백이 그리는<br><em>무한의 세계.</em></h1>
      <p class="lead">방을 열고, 들어가고, 지켜보세요. 끝난 대국은 기보로 남습니다.</p>
      <div class="hero-act"><button class="btn gold lg" id="b-create">방 만들기</button><button class="btn line lg" id="b-quick">빠른 대국</button><button class="btn ghost lg" id="b-ai">무량 AI와 한 판</button></div>
    </div>
    <div class="hero-board" aria-hidden="true"><canvas id="hero-cv"></canvas></div>
  </section>
  <section class="stats" id="stats"></section>
  <section class="home-grid">
    <div class="panel">
      <div class="panel-h"><h2>대국실</h2><div class="seg" id="room-filter"><button data-f="all">전체</button><button data-f="wait">대기 중</button><button data-f="play">대국 중</button></div></div>
      <div id="room-list" class="room-list"></div>
    </div>
    <aside class="side">
      <div class="panel"><div class="panel-h"><h2>접속 중</h2><span class="muted" id="online-n"></span></div><div id="online" class="online"></div></div>
      <div class="panel" id="lobby-chat"><div class="panel-h"><h2>로비 이야기</h2></div><div class="chat-log"></div><form class="chat-form"><input maxlength="200" placeholder="${me ? "인사를 건네 보세요" : "로그인하면 이야기할 수 있어요"}" ${me ? "" : "disabled"} aria-label="로비 채팅"><button class="btn sm gold" ${me ? "" : "disabled"}>보내기</button></form></div>
    </aside>
  </section>`;
  $("#b-create").onclick = () => createDialog(0); $("#b-ai").onclick = () => createDialog(2); $("#b-quick").onclick = quickMatch;
  $$("#room-filter button").forEach(b => { b.classList.toggle("on", b.dataset.f === roomFilter); b.onclick = () => { roomFilter = b.dataset.f; $$("#room-filter button").forEach(x => x.classList.toggle("on", x === b)); renderRooms(); }; });
  $(".chat-form").onsubmit = e => { e.preventDefault(); const i = $("input", e.target), t = i.value.trim(); if (!t || !me) return; A.lob.send({ t: "chat", u: pubU(), text: t }); pushLobbyChat({ u: pubU(), text: t, ts: now() }); i.value = ""; };
  heroBoard(); renderRooms(); renderOnline(); renderStats(); renderLobbyChat();
}
function heroBoard() {
  const cv = $("#hero-cv"); if (!cv) return; const f = FAMOUS.find(x => x.id === "famous-lee_gu_2014_g1") || FAMOUS[0], all = unpackMoves(f.m); let k = Math.min(60, all.length);
  const draw = () => { if (!document.body.contains(cv)) return; const b = fromMoves(19, all.slice(0, k)); if (b) paintBoard(cv, b, { coords: false }); };
  draw(); const iv = setInterval(() => { if (!document.body.contains(cv)) return clearInterval(iv); k = k >= all.length ? 30 : k + 1; draw(); }, 1400);
  new ResizeObserver(draw).observe(cv);
}
function renderStats() {
  const s = $("#stats"); if (!s) return; const rs = [...rooms.values()], mine = H ? 1 : 0;
  const play = rs.filter(r => r.status === "play").length + (H && H.status !== "wait" && H.status !== "end" ? 1 : 0), wait = rs.filter(r => r.status === "wait").length + (H && H.status === "wait" ? 1 : 0);
  s.innerHTML = `<div><b>${peers.size + 1}</b><span>지금 접속</span></div><div><b>${play}</b><span>진행 중인 대국</span></div><div><b>${wait}</b><span>상대를 기다리는 방</span></div><div><b>${myGames().length}</b><span>내 기보</span></div>${mine ? `<a class="my-room" href="#/room/${H.rid}">내 방 「${esc(H.title)}」로 돌아가기 →</a>` : ""}`;
}
function allRooms() { const list = [...rooms.values()]; if (H) list.unshift({ ...summary(), mine: 1 }); return list; }
function renderRooms() {
  const box = $("#room-list"); if (!box) return; let list = allRooms().filter(r => roomFilter === "all" || r.status === roomFilter);
  list.sort((a, b) => (a.mine ? -1 : 0) - (b.mine ? -1 : 0) || ({ wait: 0, play: 1, end: 2 }[a.status] - { wait: 0, play: 1, end: 2 }[b.status]) || b.ts - a.ts);
  if (!list.length) { box.innerHTML = `<div class="empty"><div class="empty-stones"><i></i><i></i></div><p>${roomFilter === "play" ? "진행 중인 대국이 없습니다." : "열린 방이 없습니다."}</p><p class="muted">첫 방을 열어 상대를 기다려 보세요. 접속한 사람에게 바로 보입니다.</p><button class="btn gold" id="empty-create">방 만들기</button></div>`; $("#empty-create").onclick = () => createDialog(0); return; }
  box.innerHTML = list.map(r => { const open = r.status === "wait" && (!r.pl[0] || !r.pl[1]) && !r.ai;
    const pl = c => r.pl[c] ? `<span class="pl">${avatar(r.pl[c], 24)}<b>${esc(r.pl[c].nick)}</b><small>${esc(rankOf(r.pl[c]))}</small></span>` : `<span class="pl empty-seat">빈 자리</span>`;
    return `<article class="room ${r.status}${r.mine ? " mine" : ""}">
      <div class="room-st"><span class="pill ${r.status}">${r.status === "wait" ? "대기" : r.status === "play" ? "대국 중" : "종료"}</span>${r.priv ? `<span class="lock" title="비공개 방">🔒</span>` : ""}</div>
      <div class="room-main"><h3>${esc(r.title)}${r.mine ? ` <small class="gold-t">내 방</small>` : ""}</h3>
        <p class="room-meta">${r.size}줄 · 덤 ${r.komi} · ${TC_LABEL(r.tc)}${r.undo ? " · 물리기 허용" : ""}${r.ai ? ` · 무량 AI ${["", "입문", "중급", "고급"][r.ai]}` : ""}${r.status === "play" ? ` · ${(r.m || "").length / 2}수` : ""}</p>
        <div class="room-pl"><span class="dot b"></span>${pl(0)}<span class="vs">vs</span><span class="dot w"></span>${pl(1)}</div></div>
      <div class="room-act"><span class="muted sp">관전 ${r.sp}</span>
        ${r.mine ? `<a class="btn gold sm" href="#/room/${r.rid}">들어가기</a>` : `${open ? `<a class="btn gold sm" href="#/room/${r.rid}?m=join">도전하기</a>` : ""}<a class="btn line sm" href="#/room/${r.rid}?m=watch">관전</a>`}</div>
    </article>`; }).join("");
}
function renderOnline() {
  const box = $("#online"); if (!box) return; const list = [...peers.values()].filter(p => p.u);
  if (me) list.unshift({ u: pubU(), at: where(), self: 1 });
  $("#online-n").textContent = `${peers.size + 1}명`;
  const guests = peers.size - [...peers.values()].filter(p => p.u).length + (me ? 0 : 1);
  box.innerHTML = list.map(p => `<a class="who" href="#/u/${encodeURIComponent(p.u.id)}">${avatar(p.u, 32)}<span><b>${esc(p.u.nick)}${p.self ? ` <small class="gold-t">나</small>` : ""}</b><small>@${esc(p.u.id)} · ${esc(rankOf(p.u))} · ${p.u.w}승 ${p.u.l}패</small></span><em class="${p.at.startsWith("room:") ? "in" : ""}">${p.at.startsWith("room:") ? "대국실" : "로비"}</em></a>`).join("") + (guests > 0 ? `<p class="muted guests">손님 ${guests}명 둘러보는 중</p>` : "");
}
function renderLobbyChat() {
  const box = $("#lobby-chat .chat-log"); if (!box) return;
  box.innerHTML = lobbyChat.length ? lobbyChat.map(c => `<p><a href="#/u/${encodeURIComponent(c.u.id)}">${esc(c.u.nick)}</a><span>${esc(c.text)}</span><time>${z2(new Date(c.ts).getHours())}:${z2(new Date(c.ts).getMinutes())}</time></p>`).join("") : `<p class="muted">아직 조용합니다.</p>`;
  box.scrollTop = box.scrollHeight;
}
function quickMatch() {
  if (!me) { toast("대국하려면 먼저 로그인해 주세요."); location.hash = "#/login"; return; }
  const open = [...rooms.values()].filter(r => r.status === "wait" && !r.priv && !r.ai && r.auto && (!r.pl[0] || !r.pl[1])).sort((a, b) => Math.abs((a.pl[0] || a.pl[1]).rank - me.rank) - Math.abs((b.pl[0] || b.pl[1]).rank - me.rank));
  if (open.length) { toast(`「${open[0].title}」 방에 도전합니다.`); location.hash = `#/room/${open[0].rid}?m=join`; return; }
  createRoom({ title: `${me.nick}님의 빠른 대국`, size: 19, komi: 6.5, tc: { m: 600, b: 30, n: 3 }, color: 0, undo: true, priv: false, auto: true, ai: 0 });
  toast("바로 들어올 수 있는 방이 없어 새 방을 열었습니다. 상대를 기다립니다.");
}
async function createDialog(aiDefault) {
  if (!me) { toast("방을 만들려면 먼저 로그인해 주세요."); location.hash = "#/login"; return; }
  const v = await modal(`<h3>방 만들기</h3>
    <label class="fld"><span>방 제목</span><input name="title" maxlength="30" value="${esc(me.nick)}님의 대국" required></label>
    <div class="fld"><span>상대</span><div class="seg" data-name="opp"><button type="button" data-v="0">사람</button><button type="button" data-v="1">AI 입문</button><button type="button" data-v="2">AI 중급</button><button type="button" data-v="3">AI 고급</button></div></div>
    <div class="fld-row"><div class="fld"><span>판 크기</span><div class="seg" data-name="size"><button type="button" data-v="19">19줄</button><button type="button" data-v="13">13줄</button><button type="button" data-v="9">9줄</button></div></div>
    <div class="fld"><span>내 돌</span><div class="seg" data-name="color"><button type="button" data-v="0">돌 가리기</button><button type="button" data-v="1">흑</button><button type="button" data-v="2">백</button></div></div></div>
    <div class="fld-row"><div class="fld"><span>대국 시간</span><select name="tc"><option value="0">무제한</option><option value="300">5분 · 초읽기 30초 3회</option><option value="600" selected>10분 · 초읽기 30초 3회</option><option value="1200">20분 · 초읽기 30초 3회</option><option value="1800">30분 · 초읽기 30초 3회</option></select></div>
    <div class="fld"><span>덤</span><select name="komi"><option value="6.5" selected>6.5집</option><option value="7.5">7.5집</option><option value="0.5">0.5집</option></select></div></div>
    <div class="fld-row checks"><label class="ck"><input type="checkbox" name="undo" checked><span>한 수 물리기 허용<small>상대가 허락하면 물릴 수 있어요</small></span></label>
    <label class="ck" data-human><input type="checkbox" name="manual" checked><span>도전 직접 허락<small>끄면 먼저 온 사람이 바로 앉아요</small></span></label></div>
    <div class="fld-row" data-human><label class="ck"><input type="checkbox" name="priv"><span>비공개 방<small>비밀번호를 아는 사람만 도전·관전</small></span></label><label class="fld pw-fld" hidden><span>비밀번호</span><input name="pw" type="password" maxlength="20" autocomplete="new-password"></label></div>
    <p class="m-err" hidden></p>
    <div class="m-act"><button class="btn ghost" data-x>취소</button><button class="btn gold" type="submit">방 열기</button></div>`, { wide: true,
    onOpen: f => {
      const val = { opp: String(aiDefault), size: "19", color: aiDefault ? "1" : "0" };
      $$(".seg[data-name]", f).forEach(sg => { const k = sg.dataset.name; const set = v => { val[k] = v; $$("button", sg).forEach(b => b.classList.toggle("on", b.dataset.v === v)); f.dataset[k] = v; if (k === "opp") $$("[data-human]", f).forEach(e => e.hidden = v !== "0"); }; set(val[k]); $$("button", sg).forEach(b => b.onclick = () => set(b.dataset.v)); });
      const pv = $("[name=priv]", f); pv.onchange = () => { $(".pw-fld", f).hidden = !pv.checked; };
    },
    validate: (fd, f) => { if (!fd.title.trim()) return "방 제목을 적어 주세요."; if (fd.priv && f.dataset.opp === "0" && (fd.pw || "").length < 2) return "비밀번호를 2자 이상 적어 주세요."; return ""; } });
  if (!v) return; const f = modalIn, ai = +f.dataset.opp, tc = +v.tc;
  const o = { title: v.title.trim().slice(0, 30), size: +f.dataset.size, color: +f.dataset.color, komi: +v.komi, tc: tc ? { m: tc, b: 30, n: 3 } : null, undo: !!v.undo, auto: !ai && !v.manual, ai, priv: !ai && !!v.priv, pwh: "" };
  if (o.priv) { o.rid = rid8(); o.pwh = await sha(o.rid + ":" + v.pw); }
  createRoom(o);
}

// =====================================================================
// 대국 화면
// =====================================================================
let roomGeo = null, hover = null;
async function roomView(rid, mode) {
  page = "room";
  if (!(H && H.rid === rid)) { if (!cur || cur.rid !== rid) { view.innerHTML = `<div class="loading-room"><div class="spin"></div><p>방에 들어가는 중입니다…</p></div>`; const ok = await enterRoom(rid, mode); if (!ok) return; } }
  else if (!cur || cur.rid !== rid) cur = { rid, S: null, mode: "host", saved: new Set() };
  view.innerHTML = `<section class="room-wrap">
    <div class="room-board"><div class="room-title"><a class="back" href="#/">← 대국실</a><h1 id="r-title"></h1><p id="r-meta" class="muted"></p></div>
      <div class="board-frame"><canvas id="r-cv" aria-label="바둑판"></canvas><div class="board-cover" id="r-cover" hidden></div></div>
      <p class="turn-line" id="r-turn"></p></div>
    <aside class="room-side">
      <div class="players"><div class="pcard" data-c="1"></div><div class="pcard" data-c="2"></div></div>
      <div id="r-req"></div>
      <div class="r-actions" id="r-act"></div>
      <div class="panel tabs-panel"><div class="tabs"><button data-t="chat" class="on">채팅</button><button data-t="moves">수순</button><button data-t="spec">관전자</button></div>
        <div class="tab-body" data-b="chat"><div class="chat-log" id="r-chat"></div><form class="chat-form" id="r-chat-f"><input maxlength="200" placeholder="한마디 남기기" aria-label="대국실 채팅"><button class="btn sm gold">보내기</button></form></div>
        <div class="tab-body" data-b="moves" hidden><ol class="mlist" id="r-moves"></ol></div>
        <div class="tab-body" data-b="spec" hidden><div id="r-spec" class="online"></div></div></div>
    </aside></section>`;
  $$(".tabs button").forEach(b => b.onclick = () => { $$(".tabs button").forEach(x => x.classList.toggle("on", x === b)); $$(".tab-body").forEach(x => x.hidden = x.dataset.b !== b.dataset.t); });
  $("#r-chat-f").onsubmit = e => { e.preventDefault(); const i = $("input", e.target), t = i.value.trim(); if (!t) return; if (!me) return toast("로그인하면 이야기할 수 있어요."); send("chat", { text: t }); i.value = ""; };
  const cv = $("#r-cv");
  cv.onmousemove = e => { if (!cur || !cur.S) return; const p = boardPoint(cv, roomGeo, cur.S.size, e), k = p ? p.join(",") : ""; if (k !== (hover ? hover.join(",") : "")) { hover = p; drawRoomBoard(); } };
  cv.onmouseleave = () => { hover = null; drawRoomBoard(); };
  cv.onclick = e => { const S = cur && cur.S; if (!S || S.status !== "play") return; const mc = myColorIn(S); if (!mc) return; if (cur.b.turn !== mc) return toast("상대 차례입니다."); const p = boardPoint(cv, roomGeo, S.size, e); if (!p) return; if (!cur.b.legal(cur.b.pos(p[0], p[1]), mc)) return toast("둘 수 없는 자리입니다 (자충·패)."); sfx("stone"); send("mv", { mv: p, n: cur.moves.length }); };
  new ResizeObserver(() => drawRoomBoard()).observe(cv);
  clockT = setInterval(tickClocks, 250);
  if (H && H.rid === rid) pushState(); else if (cur && cur.S) renderRoom();
}
function drawRoomBoard() {
  const cv = $("#r-cv"); if (!cv || !cur || !cur.S) return; const S = cur.S, mc = myColorIn(S);
  const nums = settings.numbers ? new Map(cur.moves.map((m, i) => m ? [cur.b.pos(m[0], m[1]), i + 1] : null).filter(Boolean)) : null;
  roomGeo = paintBoard(cv, cur.b, { coords: settings.coords, numbers: nums, score: S.status === "end" ? S.score : null, hover: S.status === "play" && mc && cur.b.turn === mc && hover && cur.b.legal(cur.b.pos(hover[0], hover[1]), mc) ? hover : null, me: mc });
}
function renderRoom() {
  if (page !== "room" || !cur || !cur.S || !$("#r-cv")) return; const S = cur.S, mc = myColorIn(S), isHost = H && H.rid === S.rid, b = cur.b;
  $("#r-title").textContent = S.title; document.title = `${S.title} · 무량`;
  $("#r-meta").textContent = `${S.size}줄 · 덤 ${S.komi} · ${TC_LABEL(S.tc)} · 물리기 ${S.undo ? "허용" : "불가"}${S.priv ? " · 비공개" : ""} · 관전 ${S.specs.length}명`;
  for (const c of [1, 2]) { const el = $(`.pcard[data-c="${c}"]`), p = S.p[c], u = p && p.u, turn = S.status === "play" && b.turn === c;
    el.className = `pcard${turn ? " turn" : ""}${S.status === "end" && S.win === c ? " won" : ""}`; el.dataset.c = c;
    el.innerHTML = u ? `<div class="pc-top"><span class="stone-ic ${c === 1 ? "b" : "w"}"></span>${avatar(u, 44)}<div class="pc-name"><b>${esc(u.nick)}${p.pid === selfId ? ` <small class="gold-t">나</small>` : ""}</b><small>${u.id === "muryang_ai" ? "인공지능" : "@" + esc(u.id)} · ${esc(rankOf(u))}</small></div></div>
      <div class="pc-bot"><span>따낸 돌 <b>${b.cap[c]}</b></span><span class="clock" id="clk-${c}">${S.cl ? "" : S.tc && S.tc.m ? "⏱ " + TC_LABEL(S.tc) : "시간 무제한"}</span></div>${S.status === "end" && S.win === c ? `<span class="won-tag">승</span>` : ""}`
      : `<div class="pc-top"><span class="stone-ic ${c === 1 ? "b" : "w"}"></span><div class="pc-name"><b class="muted">빈 자리</b><small>${colName(c)}으로 둘 사람을 기다립니다</small></div></div>`; }
  const moveN = cur.moves.length, last = moveN ? cur.moves[moveN - 1] : undefined;
  $("#r-turn").innerHTML = S.status === "wait" ? `상대를 기다리는 중입니다` : S.status === "count" ? `계가 중입니다…` : S.status === "end" ? `<b>${esc(S.result)}</b> · 총 ${moveN}수${S.closeAt ? ` · <span id="r-close"></span>` : ""}` : `<b>${colName(b.turn)} 차례</b> · ${moveN + 1}수째${last !== undefined ? ` · 직전 ${COORD(last, S.size)}` : ""}${mc ? (b.turn === mc ? ` · <span class="gold-t">내 차례</span>` : "") : ` · 관전 중`}`;
  const rq = $("#r-req"), q = S.req; let rh = "";
  if (q && (S.status === "play" || S.status === "end")) { const what = q.type === "undo" ? "한 수 물리기" : q.type === "score" ? "계가" : "흑백 바꿔 한 판 더"; const nick = S.p[q.from] ? S.p[q.from].u.nick : colName(q.from);
    if (mc && mc !== q.from) rh = `<div class="req"><p><b>${esc(nick)}</b>님이 <b>${what}</b>를 요청했습니다.</p><div><button class="btn gold sm" id="q-ok">허락하기</button><button class="btn line sm" id="q-no">거절</button></div></div>`;
    else if (mc === q.from) rh = `<div class="req mine"><p>${what} 요청을 보냈습니다. 상대의 허락을 기다리는 중…</p><button class="btn ghost sm" id="q-cancel">요청 거두기</button></div>`;
    else rh = `<div class="req spec"><p>${esc(nick)}님이 ${what}를 요청했습니다.</p></div>`; }
  if (isHost && S.status === "wait" && S.pend.length) rh += `<div class="req"><p><b>도전 신청</b></p>${S.pend.map(x => `<div class="pend">${avatar(x.u, 30)}<span><b>${esc(x.u.nick)}</b><small>@${esc(x.u.id)} · ${esc(rankOf(x.u))} · ${x.u.w}승 ${x.u.l}패</small></span><button class="btn gold sm" data-ap="${esc(x.pid)}">허락하기</button><button class="btn line sm" data-dn="${esc(x.pid)}">거절</button></div>`).join("")}</div>`;
  rq.innerHTML = rh;
  $("#q-ok") && ($("#q-ok").onclick = () => send("ans", { ok: 1 })); $("#q-no") && ($("#q-no").onclick = () => send("ans", { ok: 0 })); $("#q-cancel") && ($("#q-cancel").onclick = () => send("cancel"));
  $$("[data-ap]", rq).forEach(x => x.onclick = () => approve(x.dataset.ap, true)); $$("[data-dn]", rq).forEach(x => x.onclick = () => approve(x.dataset.dn, false));
  const act = $("#r-act"); let ah = "";
  if (S.status === "play" && mc) { const canUndo = S.undo && (mc === BLACK ? moveN >= 1 : moveN >= 2); ah = `<button class="btn line" id="a-pass">패스</button><button class="btn line" id="a-undo" ${canUndo && !q ? "" : "disabled"}>한 수 물리기</button><button class="btn line" id="a-score" ${moveN >= 10 && !q ? "" : "disabled"} title="10수 이상부터">계가 신청</button><button class="btn danger-line" id="a-resign">기권</button>`; }
  else if (S.status === "wait") { const open = !S.p[1] || !S.p[2]; if (isHost) ah = `${!mc && open ? `<button class="btn gold" id="a-sit">빈 자리에 앉기</button>` : ""}<p class="muted note">${S.auto ? "먼저 도전한 사람이 바로 앉습니다." : "도전 신청이 오면 여기서 허락할 수 있어요."} 다른 화면에 가도 방은 열려 있고, 도전이 오면 알려 드립니다.</p><button class="btn danger-line" id="a-close">방 닫기</button>`; else if (!mc) ah = open ? `<button class="btn gold" id="a-join">도전하기</button><p class="muted note">관전하며 기다리는 중입니다.</p>` : `<p class="muted note">관전 중입니다.</p>`; else ah = `<p class="muted note">상대를 기다리는 중입니다.</p>`; }
  else if (S.status === "end") { const g = games.find(x => x.id === S.gid); ah = `${mc && S.p[1] && S.p[2] ? `<button class="btn gold" id="a-again" ${q ? "disabled" : ""}>다시 두기 (흑백 바꿈)</button>` : ""}${g ? `<a class="btn line" href="#/kibo/mine/${encodeURIComponent(g.id)}">기보 보기</a>` : ""}${isHost ? `<button class="btn danger-line" id="a-close">방 닫기</button>` : ""}`; }
  ah += `<div class="r-opts"><label class="ck mini"><input type="checkbox" id="o-num" ${settings.numbers ? "checked" : ""}><span>수 번호</span></label><label class="ck mini"><input type="checkbox" id="o-crd" ${settings.coords ? "checked" : ""}><span>좌표</span></label><label class="ck mini"><input type="checkbox" id="o-snd" ${settings.sound ? "checked" : ""}><span>소리</span></label><a class="btn ghost sm" href="#/">나가기</a></div>`;
  act.innerHTML = ah;
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  on("#a-pass", async () => { if (await ask("패스", "이번 차례를 넘길까요? 양쪽이 연달아 패스하면 계가합니다.", "패스")) send("mv", { mv: null, n: cur.moves.length }); });
  on("#a-undo", () => send("undo")); on("#a-close", async () => { if (await ask("방 닫기", "이 방을 닫을까요? 들어와 있는 사람도 모두 나가게 됩니다.", "방 닫기", true)) { closeRoom(); cur = null; location.hash = "#/"; } }); on("#a-score", () => send("score")); on("#a-again", () => send("again")); on("#a-sit", hostSit);
  on("#a-resign", async () => { if (await ask("기권", "이 대국을 기권할까요?", "기권", true)) send("resign"); });
  on("#a-join", () => { if (!me) { toast("도전하려면 로그인해 주세요."); location.hash = "#/login"; return; } cur.mode = "join"; send("join", { u: pubU(), pw: cur.pw || "" }); toast("도전을 신청했습니다."); });
  for (const [id, k] of [["#o-num", "numbers"], ["#o-crd", "coords"], ["#o-snd", "sound"]]) { const e = $(id); e.onchange = () => { settings[k] = e.checked; save(LS.set, settings); drawRoomBoard(); }; }
  const ch = $("#r-chat"), atBottom = ch.scrollHeight - ch.scrollTop - ch.clientHeight < 40;
  ch.innerHTML = S.chat.map(c => c.sys ? `<p class="sys">${esc(c.text)}</p>` : `<p><a href="#/u/${encodeURIComponent(c.id)}" class="${c.c === 1 ? "cb" : c.c === 2 ? "cw" : ""}">${esc(c.nick)}</a><span>${esc(c.text)}</span></p>`).join(""); if (atBottom || true) ch.scrollTop = ch.scrollHeight;
  $("#r-moves").innerHTML = cur.moves.map((m, i) => `<li><i>${i + 1}</i><span class="${i % 2 ? "w" : "b"}"></span>${COORD(m, S.size)}</li>`).join("") || `<li class="muted">아직 둔 수가 없습니다.</li>`;
  $("#r-spec").innerHTML = S.specs.length ? S.specs.map(x => x.u ? `<a class="who" href="#/u/${encodeURIComponent(x.u.id)}">${avatar(x.u, 28)}<span><b>${esc(x.u.nick)}</b><small>${esc(rankOf(x.u))}</small></span></a>` : `<p class="who muted">손님</p>`).join("") : `<p class="muted">관전자가 없습니다.</p>`;
  $(".tabs [data-t=spec]").textContent = `관전자 ${S.specs.length}`;
  drawRoomBoard(); tickClocks();
}
const fmtClock = st => st.lost ? "시간 초과" : st.byo ? `초읽기 ${Math.ceil(st.left / 1000)}초 · ${st.n}회` : `${Math.floor(st.left / 60000)}:${z2(Math.floor(st.left / 1000) % 60)}`;
function tickClocks() {
  const rc = $("#r-close"); if (rc && cur && cur.S && cur.S.closeAt) { const left = Math.max(0, cur.S.closeAt - now()); rc.textContent = `${Math.floor(left / 60000)}:${z2(Math.floor(left / 1000) % 60)} 뒤 방이 닫힙니다`; }
  if (!cur || !cur.S || !cur.S.cl || !cur.b) return; const S = cur.S, live = S.status === "play", el = live ? (H && H.rid === S.rid ? now() - H.t0 : S.el + now() - cur.recvAt) : 0, turn = cur.b.turn;
  for (const c of [1, 2]) { const e = $("#clk-" + c); if (!e) continue; const st = clockOf(S.cl, S.tc, c, live && turn === c ? el : 0); e.textContent = "⏱ " + fmtClock(st); e.classList.toggle("warn", live && turn === c && (st.byo ? st.left < 10000 : st.left < 60000)); }
}

// =====================================================================
// 관전
// =====================================================================
function watchView() {
  page = "watch";
  view.innerHTML = `<section class="page-h"><p class="eyebrow">觀戰 · LIVE</p><h1>관전</h1><p class="lead">지금 두어지고 있는 대국을 조용히 지켜보세요. 관전한 대국의 기보도 기보실에 남습니다.</p></section><section class="watch-grid" id="watch"></section>`;
  renderWatch();
}
function renderWatch() {
  const box = $("#watch"); if (!box) return; const list = allRooms().filter(r => r.status === "play" || r.status === "end" && r.m);
  if (!list.length) { box.innerHTML = `<div class="empty wide"><div class="empty-stones"><i></i><i></i></div><p>지금 진행 중인 대국이 없습니다.</p><p class="muted">기다리는 동안 이름난 대국을 감상해 보세요.</p><a class="btn gold" href="#/kibo?tab=famous">명국 기보 보기</a></div>`; return; }
  box.innerHTML = list.map(r => `<a class="wcard" href="#/room/${r.rid}?m=watch"><canvas data-rid="${r.rid}"></canvas><div class="wc-in"><h3>${esc(r.title)}</h3><p><span class="dot b"></span>${esc(r.pl[0] ? r.pl[0].nick : "?")} <small>${r.pl[0] ? esc(rankOf(r.pl[0])) : ""}</small> <span class="vs">vs</span> <span class="dot w"></span>${esc(r.pl[1] ? r.pl[1].nick : "?")} <small>${r.pl[1] ? esc(rankOf(r.pl[1])) : ""}</small></p><p class="muted">${r.status === "end" ? esc(r.res) : `${r.m.length / 2}수 진행`} · 관전 ${r.sp}${r.priv ? " · 🔒" : ""}</p></div></a>`).join("");
  $$("canvas[data-rid]", box).forEach(cv => { const r = list.find(x => x.rid === cv.dataset.rid), b = fromMoves(r.size, unpackMoves(r.m)) || new Board(r.size); requestAnimationFrame(() => paintBoard(cv, b, { mini: true })); });
}

// =====================================================================
// 기보실
// =====================================================================
let kiboTab = "mine", kiboQ = "";
function kiboView(tab) {
  page = "kibo"; kiboTab = ["mine", "pub", "famous"].includes(tab) ? tab : "mine";
  view.innerHTML = `<section class="page-h"><p class="eyebrow">棋譜 · RECORDS</p><h1>기보실</h1><p class="lead">끝난 대국은 저절로 이곳에 남습니다. 공개하면 접속한 모두가 볼 수 있고, SGF로 내려받을 수 있습니다.</p></section>
  <section class="panel"><div class="panel-h kibo-h"><div class="seg" id="k-tabs"><a href="#/kibo?tab=mine" data-t="mine">내 기보</a><a href="#/kibo?tab=pub" data-t="pub">공개 기보</a><a href="#/kibo?tab=famous" data-t="famous">명국</a></div>
    <div class="k-tools"><input id="k-q" type="search" placeholder="기사 이름 · 제목 검색" value="${esc(kiboQ)}" aria-label="기보 검색"><label class="btn line sm file-btn">SGF 불러오기<input type="file" id="k-file" accept=".sgf,text/plain" hidden></label></div></div>
    <div id="k-stats"></div><div id="k-list" class="k-list"></div></section>`;
  $$("#k-tabs a").forEach(a => a.classList.toggle("on", a.dataset.t === kiboTab));
  $("#k-q").oninput = e => { kiboQ = e.target.value; renderKiboList(); };
  $("#k-file").onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 200000) return toast("파일이 너무 큽니다."); const r = parseSGF(await f.text()); if (!r.moves.length || !fromMoves(r.size, r.moves)) return toast("읽을 수 없는 SGF입니다 (주 수순만 지원)."); const rec = { id: "sgf-" + rid8(), size: r.size, komi: r.komi, m: packMoves(r.moves), pb: r.pb.slice(0, 40), pw: r.pw.slice(0, 40), result: r.result.slice(0, 40), title: (r.title || f.name.replace(/\.sgf$/i, "")).slice(0, 40), date: now(), mine: 0, imported: 1, owner: me ? me.key : undefined, pub: 0 }; games.unshift(rec); recAdd(rec); toast(cloud && !me ? "기보를 불러왔습니다. 로그인하면 사이트에 저장됩니다." : "기보를 불러왔습니다."); location.hash = `#/kibo/mine/${encodeURIComponent(rec.id)}`; };
  renderKiboList();
  if (cloud && kiboTab === "pub") { $("#k-list").innerHTML = `<div class="loading-room"><div class="spin"></div></div>`; cloud.listPub().then(l => { pubs = l.filter(okRec); renderKiboList(); }).catch(e => { cloudErr(e); renderKiboList(); }); }
}
function kiboRows() {
  const q = kiboQ.trim().toLowerCase(), hit = r => !q || [r.title, r.pb, r.pw, r.byNick, r.by].some(v => v && String(v).toLowerCase().includes(q));
  if (kiboTab === "famous") return FAMOUS.filter(hit).map(f => ({ ...f, src: "famous", date: f.date }));
  if (kiboTab === "pub") return pubs.filter(hit).map(r => ({ ...r, src: "pub" }));
  return myGames().filter(hit).map(r => ({ ...r, src: "mine" }));
}
// 내 기보 전적: 총 판수 · 승패 · 승률 · 최근 흐름 · 월별
let statKind = "all";
function renderKiboStats() {
  const box = $("#k-stats"); if (!box) return; if (kiboTab !== "mine") { box.innerHTML = ""; return; }
  const all = myGames().filter(g => g.mine && g.myColor), list = all.filter(g => statKind === "all" || (statKind === "ai" ? g.ai : !g.ai)).sort((a, b) => (b.date || 0) - (a.date || 0));
  if (!all.length) { box.innerHTML = ""; return; }
  const W = g => g.win === g.myColor ? 1 : g.win ? -1 : 0, cnt = a => { const w = a.filter(g => W(g) > 0).length, l = a.filter(g => W(g) < 0).length; return { n: a.length, w, l, d: a.length - w - l, rate: w + l ? Math.round(w / (w + l) * 100) : 0 }; };
  const t = cnt(list), recent = list.slice(0, 20);
  let streak = 0, sk = 0; for (const g of list) { const v = W(g); if (!v) break; if (!sk) sk = v; if (v !== sk) break; streak++; }
  const months = new Map(); for (const g of list) { const d = new Date(g.date || 0), k = `${d.getFullYear()}.${z2(d.getMonth() + 1)}`; if (!months.has(k)) months.set(k, []); months.get(k).push(g); }
  const mrows = [...months.entries()].slice(0, 12), maxN = Math.max(1, ...mrows.map(([, a]) => a.length));
  const thisM = (() => { const d = new Date(); return `${d.getFullYear()}.${z2(d.getMonth() + 1)}`; })(), tm = cnt(months.get(thisM) || []);
  box.innerHTML = `<div class="ks">
    <div class="ks-top"><div class="seg ks-kind">${[["all", "전체"], ["human", "사람과"], ["ai", "AI와"]].map(([k, l]) => `<button type="button" data-k="${k}" class="${statKind === k ? "on" : ""}">${l}</button>`).join("")}</div>
      ${streak >= 2 ? `<span class="ks-streak ${sk > 0 ? "w" : "l"}">${streak}${sk > 0 ? "연승" : "연패"} 중</span>` : ""}</div>
    <div class="ks-nums"><div><b>${t.n}</b><span>총 판수</span></div><div><b>${t.w}</b><span>승</span></div><div><b>${t.l}</b><span>패</span></div><div class="rate"><b>${t.rate}%</b><span>승률</span><i style="--p:${t.rate}%"></i></div><div><b>${tm.n}</b><span>이번 달 판수</span></div><div><b>${tm.w + tm.l ? tm.rate + "%" : "—"}</b><span>이번 달 승률</span></div></div>
    ${recent.length ? `<div class="ks-form"><span class="ks-lbl">최근 ${recent.length}판 <small>(왼쪽이 최근)</small></span><div>${recent.map(g => { const v = W(g); return `<a href="#/kibo/mine/${encodeURIComponent(g.id)}" class="res ${v > 0 ? "w" : v < 0 ? "l" : "d"}" title="${esc(fmtDay(g.date))} · ${esc(g.myColor === 1 ? g.pw : g.pb)} · ${esc(g.result || "")}">${v > 0 ? "승" : v < 0 ? "패" : "무"}</a>`; }).join("")}</div></div>` : ""}
    ${mrows.length ? `<div class="ks-month"><span class="ks-lbl">월별</span><table><thead><tr><th>달</th><th>판수</th><th>승</th><th>패</th><th>승률</th><th class="bar-h"></th></tr></thead><tbody>${mrows.map(([k, a]) => { const c = cnt(a); return `<tr><td>${k}</td><td>${c.n}</td><td class="w">${c.w}</td><td class="l">${c.l}</td><td><b>${c.w + c.l ? c.rate + "%" : "—"}</b></td><td class="bar"><span style="width:${a.length / maxN * 100}%"><i style="width:${c.n ? c.w / c.n * 100 : 0}%"></i></span></td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted small">이 분류의 대국이 아직 없습니다.</p>`}
  </div>`;
  $$(".ks-kind button", box).forEach(b => b.onclick = () => { statKind = b.dataset.k; renderKiboStats(); });
}
function renderKiboList() {
  renderKiboStats();
  const box = $("#k-list"); if (!box) return; const rows = kiboRows();
  if (!rows.length) { box.innerHTML = `<div class="empty"><p>${kiboTab === "mine" ? "아직 저장된 기보가 없습니다." : kiboTab === "pub" ? "아직 공개된 기보가 없습니다." : "찾는 기보가 없습니다."}</p><p class="muted">${kiboTab === "mine" ? "대국을 마치면 기보가 자동으로 저장됩니다. SGF 파일을 불러올 수도 있어요." : kiboTab === "pub" ? "내 기보에서 「공개하기」를 누르면 여기에 올라갑니다. 접속한 사람들끼리 서로 나눠 가집니다." : ""}</p></div>`; return; }
  let lastCat = "";
  box.innerHTML = rows.map(r => { const n = r.m.length / 2, catH = r.src === "famous" && r.cat !== lastCat ? `<h4 class="k-cat">${esc(lastCat = r.cat)}</h4>` : "";
    return catH + `<a class="krow" href="#/kibo/${r.src}/${encodeURIComponent(r.id)}"><span class="k-mini"><canvas data-k="${esc(r.id)}"></canvas></span>
    <span class="k-main"><b>${esc(r.title || `${r.pb} vs ${r.pw}`)}</b><small><span class="dot b"></span>${esc(r.pb)}${r.br ? ` ${esc(r.br)}` : ""} <span class="vs">vs</span> <span class="dot w"></span>${esc(r.pw)}${r.wr ? ` ${esc(r.wr)}` : ""}</small></span>
    <span class="k-res">${esc(r.result || "")}<small>${r.size}줄 · ${n}수</small></span>
    <span class="k-date">${r.src === "famous" ? esc(r.date || "") : fmtDay(r.date)}${r.src === "famous" ? "" : r.src === "pub" ? `<small>@${esc(r.by)} 공개</small>` : r.mine && r.myColor ? `<small class="k-tags">${r.win === r.myColor ? `<span class="res w">승</span>` : r.win ? `<span class="res l">패</span>` : `<span class="res d">무</span>`}${r.ai ? `<em>AI</em>` : ""}${r.pub ? `<em class="gold-t">공개</em>` : ""}</small>` : r.pub ? `<small class="gold-t">공개됨</small>` : r.imported ? `<small>불러옴</small>` : `<small>관전</small>`}</span></a>`; }).join("");
  const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target); const r = rows.find(x => x.id === e.target.dataset.k); if (!r) return; const b = fromMoves(r.size, unpackMoves(r.m)); if (b) paintBoard(e.target, b, { mini: true, noLast: true }); }), { rootMargin: "200px" });
  $$("canvas[data-k]", box).forEach(c => io.observe(c));
}
function findRec(src, id) { if (src === "famous") return FAMOUS.find(f => f.id === id); if (src === "pub") return pubs.find(p => p.id === id); return games.find(g => g.id === id); }
async function viewerView(src, id) {
  page = "viewer"; let r = findRec(src, id);
  if (!r && cloud && src !== "famous") { view.innerHTML = `<div class="loading-room"><div class="spin"></div><p>기보를 불러오는 중입니다…</p></div>`; try { r = src === "pub" ? await cloud.getPub(id) : me ? await cloud.getMine(me.key, id) : null; } catch (e) { cloudErr(e); } if (page !== "viewer") return; }
  if (!r) { view.innerHTML = `<div class="empty wide"><p>기보를 찾을 수 없습니다.</p><a class="btn gold" href="#/kibo">기보실로</a></div>`; return; }
  const main = unpackMoves(r.m), size = r.size; let idx = main.length, vari = null; // vari: { at, moves:[] }
  const isMine = src === "mine" && (!r.owner || (me && r.owner === me.key));
  view.innerHTML = `<section class="room-wrap viewer">
    <div class="room-board"><div class="room-title"><a class="back" href="#/kibo?tab=${src}">← 기보실</a><h1>${esc(r.title || `${r.pb} vs ${r.pw}`)}</h1><p class="muted">${esc(r.date ? (typeof r.date === "number" ? fmtDate(r.date) : r.date) : "")}${src === "pub" ? ` · @${esc(r.by)} 공개` : ""}</p></div>
      <div class="board-frame"><canvas id="v-cv" aria-label="기보 바둑판"></canvas></div>
      <div class="v-ctrl"><button class="btn line sm" data-v="first" aria-label="처음">⏮</button><button class="btn line sm" data-v="-10" aria-label="10수 뒤로">−10</button><button class="btn line sm" data-v="-1" aria-label="한 수 뒤로">◀</button><input type="range" id="v-rng" min="0" max="${main.length}" value="${idx}" aria-label="수순 이동"><button class="btn line sm" data-v="1" aria-label="한 수 앞으로">▶</button><button class="btn line sm" data-v="10" aria-label="10수 앞으로">+10</button><button class="btn line sm" data-v="last" aria-label="끝">⏭</button><button class="btn ghost sm" id="v-play">▶ 재생</button></div>
      <p class="turn-line" id="v-st"></p></div>
    <aside class="room-side">
      <div class="players"><div class="pcard"><div class="pc-top"><span class="stone-ic b"></span><div class="pc-name"><b>${esc(r.pb)}</b><small>${esc(r.br || "흑")}</small></div></div><div class="pc-bot"><span>따낸 돌 <b id="v-cb">0</b></span></div></div>
      <div class="pcard"><div class="pc-top"><span class="stone-ic w"></span><div class="pc-name"><b>${esc(r.pw)}</b><small>${esc(r.wr || "백")}</small></div></div><div class="pc-bot"><span>따낸 돌 <b id="v-cw">0</b></span></div></div></div>
      <div class="panel v-info"><p><b>결과</b> ${esc(r.result || "기록 없음")}</p><p><b>규칙</b> ${size}줄 · 덤 ${r.komi ?? 6.5} · 총 ${main.length}수</p>${r.desc ? `<p class="desc">${esc(r.desc)}</p>` : ""}
        <p class="muted small">판을 클릭하면 그 자리에서 변화도를 둘 수 있습니다.</p></div>
      <div class="r-actions"><button class="btn gold" id="v-sgf">SGF 내려받기</button><button class="btn line" id="v-png">이미지로 저장</button>
        ${isMine ? `<button class="btn line" id="v-pub">${r.pub ? "공개 취소" : "공개하기"}</button><button class="btn danger-line" id="v-del">삭제</button>` : ""}
        ${src !== "mine" ? `<button class="btn line" id="v-keep">내 기보에 담기</button>` : ""}
        <label class="ck mini"><input type="checkbox" id="v-num" ${settings.numbers ? "checked" : ""}><span>수 번호</span></label></div>
      <div class="panel"><div class="panel-h"><h2>수순</h2></div><ol class="mlist" id="v-moves"></ol></div>
    </aside></section>`;
  const cv = $("#v-cv"), rng = $("#v-rng"); let playT = 0;
  const seq = () => vari ? main.slice(0, vari.at).concat(vari.moves) : main.slice(0, idx);
  const draw = () => {
    if (!document.body.contains(cv)) return; const ms = seq(), b = fromMoves(size, ms) || new Board(size), nums = settings.numbers ? new Map(ms.map((m, i) => m ? [b.pos(m[0], m[1]), i + 1] : null).filter(Boolean)) : null;
    geo = paintBoard(cv, b, { coords: settings.coords, numbers: nums }); $("#v-cb").textContent = b.cap[1]; $("#v-cw").textContent = b.cap[2];
    const last = ms[ms.length - 1];
    $("#v-st").innerHTML = vari ? `<b>변화도</b> · ${vari.at}수 다음에서 ${vari.moves.length}수 <button class="btn ghost sm" id="v-back">원래 수순으로</button>` : `${idx}수 / ${main.length}수${idx ? ` · ${idx % 2 ? "흑" : "백"} ${COORD(last, size)}` : ""}${idx === main.length && r.result ? ` · <b>${esc(r.result)}</b>` : ""}`;
    const bk = $("#v-back"); if (bk) bk.onclick = () => { vari = null; draw(); };
    rng.value = vari ? vari.at : idx; $$("#v-moves li").forEach((li, i) => li.classList.toggle("cur", !vari && i === idx - 1));
    const curLi = $("#v-moves li.cur"); if (curLi) curLi.scrollIntoView({ block: "nearest" });
  };
  let geo = null;
  $("#v-moves").innerHTML = main.map((m, i) => `<li data-i="${i + 1}"><i>${i + 1}</i><span class="${i % 2 ? "w" : "b"}"></span>${COORD(m, size)}</li>`).join("");
  $$("#v-moves li").forEach(li => li.onclick = () => { vari = null; idx = +li.dataset.i; draw(); });
  const go = v => { vari = null; idx = v === "first" ? 0 : v === "last" ? main.length : Math.max(0, Math.min(main.length, idx + +v)); draw(); };
  $$(".v-ctrl [data-v]").forEach(bn => bn.onclick = () => go(bn.dataset.v));
  rng.oninput = () => { vari = null; idx = +rng.value; draw(); };
  $("#v-play").onclick = () => { if (playT) { clearInterval(playT); playT = 0; $("#v-play").textContent = "▶ 재생"; return; } if (idx >= main.length) idx = 0; $("#v-play").textContent = "⏸ 멈춤"; playT = setInterval(() => { if (!document.body.contains(cv) || idx >= main.length) { clearInterval(playT); playT = 0; const p = $("#v-play"); if (p) p.textContent = "▶ 재생"; return; } idx++; vari = null; sfx("stone"); draw(); }, 900); };
  cv.onclick = e => { const p = boardPoint(cv, geo, size, e); if (!p) return; const ms = seq(), b = fromMoves(size, ms); if (!b || !b.legal(b.pos(p[0], p[1]), b.turn)) return; if (!vari) vari = { at: idx, moves: [] }; vari.moves.push(p); sfx("stone"); draw(); };
  document.onkeydown = e => { if (e.target.closest("input,textarea")) return; if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); else if (e.key === "Home") go("first"); else if (e.key === "End") go("last"); };
  $("#v-num").onchange = e => { settings.numbers = e.target.checked; save(LS.set, settings); draw(); };
  const fname = () => `${(r.title || `${r.pb}_vs_${r.pw}`).replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60)}`;
  $("#v-sgf").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([toSGF({ ...r, moves: main })], { type: "application/x-go-sgf" })); a.download = fname() + ".sgf"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $("#v-png").onclick = () => { const c = document.createElement("canvas"); c.style.cssText = "position:fixed;left:-9999px;width:900px;height:900px"; document.body.appendChild(c); const b = fromMoves(size, seq()); paintBoard(c, b, { coords: true }); const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = fname() + `_${seq().length}수.png`; a.click(); c.remove(); };
  const pubBtn = $("#v-pub"); if (pubBtn) pubBtn.onclick = async () => {
    if (!me) { toast("공개하려면 로그인해 주세요."); location.hash = "#/login"; return; }
    if (r.pub) { recUpd(r, { pub: 0 }); const pid = pubIdOf(r), i = pubs.findIndex(p => p.id === pid && p.bk === me.key); if (i >= 0) pubs.splice(i, 1); savePubs(); if (cloud) cloud.unpublish(pid).catch(cloudErr); else A.kb.send({ t: "unpub", id: pid, bk: me.key }); toast("공개를 취소했습니다."); pubBtn.textContent = "공개하기"; return; }
    if (!(await ask("기보 공개", "이 기보를 공개 기보실에 올릴까요? 지금 접속한 사람들과, 앞으로 만나는 사람들에게 퍼집니다.", "공개하기"))) return;
    const p = { id: pubIdOf(r), size: r.size, komi: r.komi ?? 6.5, m: r.m, pb: r.pb, pw: r.pw, br: r.br, wr: r.wr, result: r.result, title: r.title, date: r.date, by: me.id, byNick: me.nick, bk: me.key, ts: now() };
    recUpd(r, { pub: 1 }); addPub(p); savePubs(); if (cloud) cloud.publish(p).catch(cloudErr); else A.kb.send({ t: "pub", r: p }); toast("기보를 공개했습니다."); pubBtn.textContent = "공개 취소";
  };
  const del = $("#v-del"); if (del) del.onclick = async () => { if (!(await ask("기보 삭제", "이 기보를 지울까요? 되돌릴 수 없습니다.", "삭제", true))) return; if (r.pub && me) { const pid = pubIdOf(r); pubs = pubs.filter(p => !(p.id === pid && p.bk === me.key)); savePubs(); if (cloud) cloud.unpublish(pid).catch(() => {}); } recDel(r); toast("기보를 지웠습니다."); location.hash = "#/kibo"; };
  const keep = $("#v-keep"); if (keep) keep.onclick = () => { if (games.some(g => g.id === r.id && g.owner === (me ? me.key : undefined))) return toast("이미 내 기보에 있습니다."); games.unshift({ id: r.id, size: r.size, komi: r.komi ?? 6.5, m: r.m, pb: r.pb, pw: r.pw, br: r.br, wr: r.wr, result: r.result, title: r.title, date: now(), mine: 0, imported: 1, owner: me ? me.key : undefined, pub: 0 }); recAdd(games[0]); toast("내 기보에 담았습니다."); };
  new ResizeObserver(draw).observe(cv); draw();
}

// =====================================================================
// 로그인 · 회원가입
// =====================================================================
function loginView(tab, next) {
  page = "login"; if (me && tab !== "up") { location.hash = "#/profile"; return; }
  view.innerHTML = `<section class="auth"><div class="auth-art" aria-hidden="true"><canvas id="auth-cv"></canvas><p>無量</p></div>
    <div class="auth-box panel"><div class="seg wide"><a href="#/login" class="${tab !== "up" ? "on" : ""}">로그인</a><a href="#/login?tab=up" class="${tab === "up" ? "on" : ""}">회원가입</a></div>
    ${tab === "up" ? `<form id="f-up" class="auth-f">
      <label class="fld"><span>아이디</span><input name="id" required maxlength="16" autocomplete="username" placeholder="영문 소문자로 시작 · 4~16자" pattern="[a-z][a-z0-9_]{3,15}"><small class="hint" id="id-hint">영문 소문자·숫자·밑줄(_)만 쓸 수 있어요.</small></label>
      <label class="fld"><span>닉네임</span><input name="nick" required maxlength="12" placeholder="대국실에 보이는 이름 · 2~12자"></label>
      <label class="fld"><span>비밀번호</span><input name="pw" type="password" required minlength="6" maxlength="40" autocomplete="new-password" placeholder="6자 이상"></label>
      <label class="fld"><span>비밀번호 확인</span><input name="pw2" type="password" required maxlength="40" autocomplete="new-password"></label>
      <label class="fld"><span>내 기력</span><select name="rank">${RANKS.map((r, i) => `<option value="${i}" ${i === 10 ? "selected" : ""}>${r}</option>`).join("")}</select></label>
      <p class="m-err" hidden></p><button class="btn gold lg block">가입하고 시작하기</button></form>`
    : `<form id="f-in" class="auth-f">
      <label class="fld"><span>아이디</span><input name="id" required maxlength="16" autocomplete="username"></label>
      <label class="fld"><span>비밀번호</span><input name="pw" type="password" required maxlength="40" autocomplete="current-password"></label>
      <p class="m-err" hidden></p><button class="btn gold lg block">로그인</button>
      ${!cloud && accounts.length ? `<div class="saved-acc"><p class="muted small">이 기기의 계정</p>${accounts.map(a => `<button type="button" class="who" data-id="${esc(a.id)}">${avatar(a, 30)}<span><b>${esc(a.nick)}</b><small>@${esc(a.id)}</small></span></button>`).join("")}</div>` : ""}</form>`}
    <div class="auth-foot">${cloud ? `<p class="muted small">무량 회원은 <b>어느 기기에서나</b> 같은 아이디와 비밀번호로 로그인할 수 있고, 기보와 전적은 사이트에 저장됩니다.</p>` : `<p class="muted small">계정과 기보는 서버가 아니라 <b>이 기기의 브라우저</b>에 저장됩니다. 다른 기기에서 쓰려면 프로필에서 계정 파일을 내려받아 그 기기에서 불러오세요.</p><label class="btn ghost sm file-btn">계정 파일 불러오기<input type="file" id="acc-file" accept=".json,application/json" hidden></label>`}</div></div></section>`;
  const cvA = $("#auth-cv"); const f = FAMOUS[Math.floor(Math.random() * FAMOUS.length)], ms = unpackMoves(f.m); const drawA = () => { const b = fromMoves(f.size, ms.slice(0, Math.min(120, ms.length))); if (b) paintBoard(cvA, b, { coords: false }); }; new ResizeObserver(drawA).observe(cvA);
  const err = (fm, t) => { const p = $(".m-err", fm); p.textContent = t; p.hidden = !t; };
  const goNext = () => { location.hash = next ? "#" + next : "#/"; };
  const fin = $("#f-in"); if (fin) {
    $$(".saved-acc [data-id]").forEach(b => b.onclick = () => { $("[name=id]", fin).value = b.dataset.id; $("[name=pw]", fin).focus(); });
    fin.onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(fin));
      if (cloud) { const bt = $("button", fin); bt.disabled = true; err(fin, ""); const id = v.id.trim().toLowerCase();
        try { const p = fromCloud(await cloud.login(id, v.pw)); await loadMine(p); setMe(p); toast(`${p.nick}님, 어서 오세요.`); goNext(); }
        catch (x) {
          const old = x.message === "없는 아이디입니다." && accounts.find(a => a.id === id);
          if (old && (await sha(old.salt + v.pw)) === old.pw) { try { await migrate(old, v.pw); goNext(); } catch (y) { err(fin, y.message); } }
          else err(fin, old ? "이 기기에 예전 계정이 있지만 비밀번호가 맞지 않습니다." : x.message);
        } bt.disabled = false; return; }
      const a = accounts.find(x => x.id === v.id.trim().toLowerCase());
      if (!a) return err(fin, "이 기기에 없는 아이디입니다. 다른 기기에서 만든 계정이면 계정 파일을 불러오세요.");
      if ((await sha(a.salt + v.pw)) !== a.pw) return err(fin, "비밀번호가 맞지 않습니다.");
      setMe(a); toast(`${a.nick}님, 어서 오세요.`); goNext(); };
  }
  const fup = $("#f-up"); if (fup) {
    const idIn = $("[name=id]", fup); let idT = 0; idIn.oninput = () => { const v = idIn.value.trim().toLowerCase(), h = $("#id-hint"); if (!v) { h.textContent = "영문 소문자·숫자·밑줄(_)만 쓸 수 있어요."; h.className = "hint"; return; } const m = idCheck(v); h.textContent = m || (cloud ? "확인 중…" : "쓸 수 있는 아이디입니다."); h.className = "hint " + (m ? "bad" : cloud ? "" : "good");
      if (!m && cloud) { clearTimeout(idT); idT = setTimeout(() => cloud.idTaken(v).then(t => { if (idIn.value.trim().toLowerCase() !== v) return; h.textContent = t ? "이미 쓰는 아이디입니다." : "쓸 수 있는 아이디입니다."; h.className = "hint " + (t ? "bad" : "good"); }).catch(() => { h.textContent = ""; }), 400); } };
    fup.onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(fup)), id = v.id.trim().toLowerCase();
      const m = idCheck(id); if (m) return err(fup, m); if (!nickOK(v.nick)) return err(fup, "닉네임은 2~12자로 적어 주세요."); if (v.pw.length < 6) return err(fup, "비밀번호는 6자 이상이어야 합니다."); if (v.pw !== v.pw2) return err(fup, "비밀번호 확인이 맞지 않습니다.");
      if (cloud) { const bt = $("button.block", fup); bt.disabled = true; err(fup, ""); try { const p = fromCloud(await cloud.signup({ id, nick: v.nick.trim(), pw: v.pw, rank: +v.rank })); games = []; setMe(p); toast("가입을 마쳤습니다. 프로필을 꾸며 보세요."); location.hash = next ? "#" + next : "#/profile"; } catch (x) { err(fup, x.message); } bt.disabled = false; return; }
      const salt = rid8() + rid8(), a = { key: "k" + rid8() + rid8(), id, nick: v.nick.trim(), pw: await sha(salt + v.pw), salt, rank: +v.rank, bio: "", av: { k: "stone", c: "black" }, rec: { w: 0, l: 0 }, created: now(), idAt: now() };
      accounts.push(a); saveAccounts(); setMe(a); toast("가입을 마쳤습니다. 프로필을 꾸며 보세요."); location.hash = next ? "#" + next : "#/profile"; };
  }
  if ($("#acc-file")) $("#acc-file").onchange = async e => { const file = e.target.files[0]; if (!file) return; try { const d = JSON.parse(await file.text()); if (d.kind !== "muryang-account" || !d.account || !ID_RE.test(d.account.id)) throw 0; const a = d.account; if (!okAv(a.av) || !nickOK(a.nick) || typeof a.pw !== "string" || typeof a.salt !== "string") throw 0;
    const old = accounts.findIndex(x => x.key === a.key || x.id === a.id); if (old >= 0) { if (!(await ask("계정 덮어쓰기", `이 기기에 @${a.id} 계정이 이미 있습니다. 불러온 파일로 바꿀까요?`, "바꾸기"))) return; accounts.splice(old, 1); }
    accounts.push({ ...a, rec: a.rec || { w: 0, l: 0 } }); saveAccounts(); let n = 0; if (Array.isArray(d.games)) for (const g of d.games) if (okRec(g) && !games.some(x => x.id === g.id && x.owner === a.key)) { games.push({ ...g, owner: a.key }); n++; } games.sort((x, y) => (y.date || 0) - (x.date || 0)); saveGames();
    toast(`@${a.id} 계정과 기보 ${n}개를 불러왔습니다. 비밀번호로 로그인하세요.`); location.hash = "#/login"; route(); } catch (er) { toast("계정 파일을 읽지 못했습니다.", "warn"); } };
}
// Firebase 연결 전에 이 기기에서 만든 계정을 사이트 계정으로 옮긴다 (같은 아이디 · 비밀번호 · 기보 · 전적)
async function migrate(old, pw) {
  const p = fromCloud(await cloud.signup({ id: old.id, nick: old.nick, pw, rank: old.rank }));
  const rec = old.rec || { w: 0, l: 0 }; p.bio = old.bio || ""; p.av = okAv(old.av) ? old.av : p.av; p.rec = { w: rec.w | 0, l: rec.l | 0 };
  try { await cloud.saveProfile(p.key, { nick: p.nick, rank: p.rank, bio: p.bio, av: p.av, w: p.rec.w, l: p.rec.l }); } catch (e) { console.warn(e); }
  const mine = load(LS.games, []).filter(g => g.owner === old.key && okRec(g)); let n = 0;
  for (const g of mine) { try { await cloud.addRec(p.key, { ...g, owner: undefined, pub: 0 }); n++; } catch (e) { console.warn(e); } }
  accounts = accounts.filter(a => a.key !== old.key); saveAccounts();
  games = mine.map(g => ({ ...g, owner: p.key, pub: 0 })).sort((a, b) => (b.date || 0) - (a.date || 0)); setMe(p);
  toast(`예전 @${old.id} 계정을 사이트 계정으로 옮겼습니다${n ? ` (기보 ${n}개)` : ""}. 이제 어느 기기에서나 로그인됩니다.`);
}
function idCheck(id, selfKey) {
  if (!ID_RE.test(id)) return "아이디는 영문 소문자로 시작하고, 영문 소문자·숫자·밑줄로 4~16자여야 합니다.";
  if (["muryang", "muryang_ai", "admin", "guest", "system"].includes(id)) return "쓸 수 없는 아이디입니다.";
  if (!cloud && accounts.some(a => a.id === id && a.key !== selfKey)) return "이 기기에 이미 있는 아이디입니다.";
  for (const p of peers.values()) if (p.u && p.u.id === id && p.u.key !== selfKey) return "지금 접속한 다른 회원이 쓰는 아이디입니다.";
  if (!cloud) for (const p of pubs) if (p.by === id && p.bk !== selfKey) return "공개 기보에 이미 쓰인 아이디입니다.";
  return "";
}

// =====================================================================
// 프로필
// =====================================================================
function profileView() {
  page = "profile"; if (!me) { location.hash = "#/login?next=" + encodeURIComponent("/profile"); return; }
  const mine = myGames().filter(g => g.mine && !g.ai), w = me.rec.w, l = me.rec.l, rate = w + l ? Math.round(w / (w + l) * 100) : 0, canId = now() - (me.idAt || 0) > 86400000;
  view.innerHTML = `<section class="page-h"><p class="eyebrow">PROFILE</p><h1>프로필 설정</h1></section>
  <section class="prof-grid">
    <form class="panel prof-form" id="pf">
      <div class="av-edit">${avatar(me, 96)}<div><p class="small muted">돌 색 고르기</p><div class="av-pick">${Object.entries(STONES).map(([k, [c1, c2]]) => `<button type="button" class="av-sw ${me.av.k === "stone" && me.av.c === k ? "on" : ""}" data-c="${k}" style="--c1:${c1};--c2:${c2}" aria-label="${k}"></button>`).join("")}<label class="av-sw up ${me.av.k === "img" ? "on" : ""}" title="사진 올리기">＋<input type="file" accept="image/*" id="av-file" hidden></label></div></div></div>
      <label class="fld"><span>닉네임</span><input name="nick" value="${esc(me.nick)}" maxlength="12" required></label>
      <label class="fld"><span>아이디</span><div class="id-row"><span class="at">@</span><input name="id" value="${esc(me.id)}" maxlength="16" ${canId ? "" : "disabled"}></div><small class="hint" id="pid-hint">${canId ? "아이디는 바꾼 뒤 24시간이 지나야 다시 바꿀 수 있어요." : `아이디는 ${fmtDate((me.idAt || 0) + 86400000)} 이후에 바꿀 수 있어요.`}</small></label>
      <label class="fld"><span>기력</span><select name="rank">${RANKS.map((r, i) => `<option value="${i}" ${i === me.rank ? "selected" : ""}>${r}</option>`).join("")}</select></label>
      <label class="fld"><span>한마디</span><input name="bio" value="${esc(me.bio || "")}" maxlength="80" placeholder="예) 느긋하게 두는 걸 좋아합니다"></label>
      <p class="m-err" hidden></p><div class="m-act"><button class="btn gold">저장하기</button></div>
    </form>
    <div class="prof-side">
      <div class="panel stat-card"><div class="sc-head">${avatar(me, 56)}<div><b>${esc(me.nick)}</b><small>@${esc(me.id)} · ${esc(rankOf(me))}</small></div></div>
        <div class="sc-nums"><div><b>${w + l}</b><span>대국</span></div><div><b>${w}</b><span>승</span></div><div><b>${l}</b><span>패</span></div><div><b>${rate}%</b><span>승률</span></div></div><p class="muted small">사람과 둔 대국만 셉니다.</p></div>
      <div class="panel"><div class="panel-h"><h2>최근 대국</h2><a class="muted small" href="#/kibo">전체 →</a></div><div class="recent">${mine.slice(0, 6).map(g => `<a href="#/kibo/mine/${encodeURIComponent(g.id)}"><span class="res ${g.win === g.myColor ? "w" : "l"}">${g.win === g.myColor ? "승" : "패"}</span><span>${esc(g.myColor === 1 ? g.pw : g.pb)} <small>${esc(g.myColor === 1 ? g.wr || "" : g.br || "")}</small></span><small>${fmtDay(g.date)}</small></a>`).join("") || `<p class="muted">아직 사람과 둔 대국이 없습니다.</p>`}</div></div>
      <div class="panel acc-panel"><div class="panel-h"><h2>계정</h2></div>
        <button class="btn line block" id="pw-ch">비밀번호 바꾸기</button>${cloud ? "" : `<button class="btn line block" id="acc-exp">계정 파일 내려받기 <small>(다른 기기로 옮기기)</small></button>`}<button class="btn ghost block" id="acc-out">로그아웃</button><button class="btn danger-line block" id="acc-del">계정 지우기</button></div>
    </div></section>`;
  let av = { ...me.av };
  const setAv = a => { av = a; $(".av-edit > .av").outerHTML = avatar({ ...me, av }, 96); $$(".av-sw").forEach(b => b.classList.toggle("on", a.k === "stone" ? b.dataset.c === a.c : b.classList.contains("up"))); };
  $$(".av-sw[data-c]").forEach(b => b.onclick = () => setAv({ k: "stone", c: b.dataset.c }));
  $("#av-file").onchange = e => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 96; const x = c.getContext("2d"), s = Math.min(img.width, img.height); x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96); let q = .85, src = c.toDataURL("image/jpeg", q); while (src.length > 22000 && q > .3) { q -= .15; src = c.toDataURL("image/jpeg", q); } URL.revokeObjectURL(img.src); setAv({ k: "img", src }); }; img.onerror = () => toast("그림을 읽지 못했습니다."); img.src = URL.createObjectURL(f); };
  const idIn = $("[name=id]", $("#pf")); idIn.oninput = () => { const v = idIn.value.trim().toLowerCase(), m = v === me.id ? "" : idCheck(v, me.key), h = $("#pid-hint"); h.textContent = v === me.id ? "지금 아이디입니다." : m || "쓸 수 있는 아이디입니다."; h.className = "hint " + (v === me.id ? "" : m ? "bad" : "good"); };
  $("#pf").onsubmit = async e => { e.preventDefault(); const fm = e.target, v = Object.fromEntries(new FormData(fm)), er = t => { const p = $(".m-err", fm); p.textContent = t; p.hidden = !t; };
    if (!nickOK(v.nick)) return er("닉네임은 2~12자로 적어 주세요.");
    if (canId && v.id !== undefined) { const id = v.id.trim().toLowerCase(); if (id !== me.id) { const m = idCheck(id, me.key); if (m) return er(m); if (cloud) { try { await cloud.changeId(me.key, me.id, id); } catch (x) { return er(x.message); } } for (const g of games) if (g.owner === me.key) { if (g.pbId === me.id) g.pbId = id; if (g.pwId === me.id) g.pwId = id; } me.id = id; me.idAt = now(); if (!cloud) saveGames(); } }
    me.nick = v.nick.trim(); me.rank = +v.rank; me.bio = (v.bio || "").trim().slice(0, 80); me.av = av; if (cloud) { try { await cloud.saveProfile(me.key, { nick: me.nick, rank: me.rank, bio: me.bio, av: me.av }); } catch (x) { return er(x.message); } } else saveAccounts(); renderChip(); sendPres(); if (H) { for (const c of [1, 2]) if (H.p[c] && H.p[c].pid === selfId) H.p[c].u = pubU(); pushState(); } toast("프로필을 저장했습니다."); profileView(); };
  $("#pw-ch").onclick = async () => { const v = await modal(`<h3>비밀번호 바꾸기</h3><label class="fld"><span>지금 비밀번호</span><input name="o" type="password" required></label><label class="fld"><span>새 비밀번호</span><input name="n" type="password" required minlength="6"></label><label class="fld"><span>새 비밀번호 확인</span><input name="n2" type="password" required></label><p class="m-err" hidden></p><div class="m-act"><button class="btn ghost" data-x>취소</button><button class="btn gold" type="submit">바꾸기</button></div>`, { validate: async fd => fd.n.length < 6 ? "새 비밀번호는 6자 이상이어야 합니다." : fd.n !== fd.n2 ? "새 비밀번호 확인이 맞지 않습니다." : cloud ? await cloud.changePw(fd.o, fd.n).then(() => "", x => x.message) : (await sha(me.salt + fd.o)) !== me.pw ? "지금 비밀번호가 맞지 않습니다." : "" }); if (!v) return; if (!cloud) { me.salt = rid8() + rid8(); me.pw = await sha(me.salt + v.n); saveAccounts(); } toast("비밀번호를 바꿨습니다."); };
  if ($("#acc-exp")) $("#acc-exp").onclick = () => { const data = { kind: "muryang-account", v: 1, at: now(), account: me, games: games.filter(g => g.owner === me.key) }; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })); a.download = `muryang_${me.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast("계정 파일을 내려받았습니다. 비밀번호는 해시로만 들어 있어요."); };
  $("#acc-out").onclick = logout;
  $("#acc-del").onclick = async () => { const v = await modal(`<h3>계정 지우기</h3><p class="m-text">@${esc(me.id)} 계정과 이 계정의 기보가 ${cloud ? "사이트에서" : "이 기기에서"} 지워집니다. 되돌릴 수 없습니다.</p><label class="fld"><span>비밀번호</span><input name="pw" type="password" required></label><p class="m-err" hidden></p><div class="m-act"><button class="btn ghost" data-x>취소</button><button class="btn danger" type="submit">지우기</button></div>`, { validate: async fd => cloud ? await cloud.deleteAccount(fd.pw, me.id).then(() => "", x => x.message) : (await sha(me.salt + fd.pw)) !== me.pw ? "비밀번호가 맞지 않습니다." : "" }); if (!v) return; const k = me.key; if (cloud) { if (H) closeRoom(true); games = []; setMe(null); toast("계정을 지웠습니다."); location.hash = "#/"; return; } if (H) closeRoom(true); accounts = accounts.filter(a => a.key !== k); games = games.filter(g => g.owner !== k); saveAccounts(); saveGames(); setMe(null); toast("계정을 지웠습니다."); location.hash = "#/"; };
}
let userId = "";
const userCache = new Map();
async function userView(id) {
  page = "user"; userId = id; const p = [...peers.values()].find(x => x.u && x.u.id === id); let u = p ? p.u : me && me.id === id ? pubU() : null, theirs = pubs.filter(r => r.by === id);
  if (cloud) { let c = userCache.get(id); if (!c || now() - c.t > 30000) { if (!c) view.innerHTML = `<div class="loading-room"><div class="spin"></div></div>`; try { const [pp, list] = await Promise.all([u ? null : cloud.userById(id), cloud.pubsBy(id)]); c = { t: now(), u: pp ? cleanU({ ...pp, key: pp.key }) : null, list: list.filter(okRec) }; userCache.set(id, c); } catch (e) { c = { t: now(), u: null, list: [] }; } if (page !== "user" || userId !== id) return; } if (!u) u = c.u; theirs = c.list; }
  const at = p && p.at.startsWith("room:") ? p.at.slice(5) : "", r = at ? allRooms().find(x => x.rid === at) : null;
  view.innerHTML = `<section class="user-page">${u ? `<div class="panel user-card">${avatar(u, 110)}<div><h1>${esc(u.nick)}</h1><p class="muted">@${esc(u.id)} · ${esc(rankOf(u))}</p>${u.bio ? `<p class="bio">“${esc(u.bio)}”</p>` : ""}
      <div class="sc-nums"><div><b>${u.w + u.l}</b><span>대국</span></div><div><b>${u.w}</b><span>승</span></div><div><b>${u.l}</b><span>패</span></div><div><b>${u.w + u.l ? Math.round(u.w / (u.w + u.l) * 100) : 0}%</b><span>승률</span></div></div>
      <p class="online-st">${me && me.id === id ? "나" : !p ? "지금 접속해 있지 않습니다" : `<span class="live-dot"></span>지금 접속 중${r ? ` · 「${esc(r.title)}」 ${r.status === "play" ? "대국 중" : "방에 있음"} <a class="btn line sm" href="#/room/${r.rid}?m=watch">관전</a>` : " · 로비"}`}</p></div></div>`
    : `<div class="panel user-card"><span class="av stone" style="--s:110px;--c1:#222;--c2:#555">?</span><div><h1>@${esc(id)}</h1><p class="muted">지금 접속해 있지 않아 프로필을 불러올 수 없습니다.</p></div></div>`}
    <div class="panel"><div class="panel-h"><h2>@${esc(id)}님이 공개한 기보</h2></div><div class="k-list">${theirs.length ? theirs.map(x => `<a class="krow" href="#/kibo/pub/${encodeURIComponent(x.id)}"><span class="k-main"><b>${esc(x.title || `${x.pb} vs ${x.pw}`)}</b><small>${esc(x.pb)} vs ${esc(x.pw)}</small></span><span class="k-res">${esc(x.result || "")}<small>${x.size}줄 · ${x.m.length / 2}수</small></span><span class="k-date">${fmtDay(x.date)}</span></a>`).join("") : `<p class="muted pad">공개한 기보가 없습니다.</p>`}</div></div></section>`;
}

// =====================================================================
// 시작
// =====================================================================
addEventListener("beforeunload", e => { if (H || (cur && cur.S && myColorIn(cur.S) && cur.S.status === "play")) { if (H) A.lob.send({ t: "close", rid: H.rid }); if (cur && !H) leaveRoom(true); e.preventDefault(); e.returnValue = ""; } });
async function loadMine(p) { games = []; if (!cloud || !p) return; try { games = (await cloud.listMine(p.key)).filter(okRec); } catch (e) { cloudErr(e); } }
async function start() {
  renderChip(); setNet("connecting");
  const cfg = firebaseConfig || {};
  if (cfg.apiKey && cfg.projectId) {
    view.innerHTML = `<div class="loading-room"><div class="spin"></div><p>무량에 들어가는 중입니다…</p></div>`;
    try {
      cloud = await initCloud(cfg); me = null; games = []; pubs = []; let first = true;
      cloud.onUser = async p => { const m = fromCloud(p); if (!first && ((m && me && m.key === me.key) || (!m && !me))) return; await loadMine(m); setMe(m); if (!first) route(); };
      await Promise.race([cloud.ready, new Promise(r => setTimeout(r, 8000))]); first = false;
      $(".foot-r").textContent = "회원 · 기보는 사이트에 저장됩니다 · 대국은 접속한 사람끼리 직접 연결됩니다";
    } catch (e) { console.warn(e); cloud = null; me = accounts.find(a => a.key === load(LS.ses, null)) || null; games = load(LS.games, []); pubs = load(LS.pub, []); toast("사이트 저장소(Firebase)에 연결하지 못해 이 기기 저장 모드로 엽니다.", "warn"); }
  }
  renderChip(); route(); connect();
}
start();
