// 무량 · Firebase 연결 (회원 · 프로필 · 기보를 사이트에 저장)
// 아이디 로그인: 가입할 때 Firebase 인증용 내부 이메일을 하나 만들고, ids/{아이디} 문서에 연결해 둔다.
const V = "10.12.2", BASE = `https://www.gstatic.com/firebasejs/${V}/`;

export async function initCloud(cfg) {
  const [{ initializeApp }, A, F] = await Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-auth.js"), import(BASE + "firebase-firestore.js")]);
  const app = initializeApp(cfg), auth = A.getAuth(app), db = F.getFirestore(app);
  const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit, where, runTransaction, increment, writeBatch } = F;
  const strip = o => { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && k !== "owner" && k !== "src") r[k] = v; return r; };
  const profile = async uid => { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? { key: uid, ...s.data() } : null; };
  let onUser = () => {}, busy = false, readyRes; const ready = new Promise(r => { readyRes = r; });
  A.onAuthStateChanged(auth, async u => {
    if (busy) return;
    let p = null; try { if (u) { p = await profile(u.uid); if (!p) { await new Promise(r => setTimeout(r, 1500)); p = await profile(u.uid); } } } catch (e) { console.warn(e); }
    onUser(p); readyRes();
  });
  const msg = e => { const c = (e && e.code) || ""; return c.includes("wrong-password") || c.includes("invalid-credential") || c.includes("invalid-login") ? "비밀번호가 맞지 않습니다." : c.includes("too-many-requests") ? "시도가 너무 많습니다. 잠시 뒤 다시 해 주세요." : c.includes("network") ? "인터넷 연결을 확인해 주세요." : c.includes("weak-password") ? "비밀번호는 6자 이상이어야 합니다." : c.includes("permission") ? "권한이 없습니다. Firestore 보안 규칙을 확인해 주세요." : (e && e.message) || "알 수 없는 오류가 났습니다."; };
  const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { throw new Error(msg(e)); } };
  return {
    ready, set onUser(f) { onUser = f; },
    idTaken: wrap(async id => (await getDoc(doc(db, "ids", id))).exists()),
    signup: async ({ id, nick, pw, rank }) => {
      busy = true;
      try {
        if ((await getDoc(doc(db, "ids", id))).exists()) throw new Error("이미 쓰는 아이디입니다.");
        const email = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@muryang-baduk.app`;
        let cred; try { cred = await A.createUserWithEmailAndPassword(auth, email, pw); } catch (e) { throw new Error(msg(e)); }
        const uid = cred.user.uid, t0 = Date.now(), prof = { id, nick, rank, bio: "", av: { k: "stone", c: "black" }, w: 0, l: 0, created: t0, idAt: t0 };
        try { await runTransaction(db, async t => { const r = doc(db, "ids", id); if ((await t.get(r)).exists()) throw new Error("taken"); t.set(r, { uid, email }); t.set(doc(db, "users", uid), prof); }); }
        catch (e) { await cred.user.delete().catch(() => {}); throw new Error(e.message === "taken" ? "이미 쓰는 아이디입니다." : msg(e)); }
        return { key: uid, ...prof };
      } finally { busy = false; }
    },
    login: async (id, pw) => {
      busy = true;
      try {
        let s; try { s = await getDoc(doc(db, "ids", id)); } catch (e) { throw new Error(msg(e)); }
        if (!s.exists()) throw new Error("없는 아이디입니다.");
        try { await A.signInWithEmailAndPassword(auth, s.data().email, pw); } catch (e) { throw new Error(msg(e)); }
        const p = await profile(auth.currentUser.uid); if (!p) throw new Error("회원 정보를 찾지 못했습니다."); return p;
      } finally { busy = false; }
    },
    logout: () => A.signOut(auth),
    saveProfile: wrap((uid, patch) => updateDoc(doc(db, "users", uid), strip(patch))),
    changeId: wrap(async (uid, oldId, newId) => {
      await runTransaction(db, async t => {
        const nr = doc(db, "ids", newId), or = doc(db, "ids", oldId), [ns, os] = [await t.get(nr), await t.get(or)];
        if (ns.exists()) throw new Error("이미 쓰는 아이디입니다."); if (!os.exists()) throw new Error("지금 아이디 정보를 찾지 못했습니다.");
        t.set(nr, { uid, email: os.data().email }); t.delete(or); t.update(doc(db, "users", uid), { id: newId, idAt: Date.now() });
      });
    }),
    changePw: wrap(async (oldPw, newPw) => { const u = auth.currentUser; await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, oldPw)); await A.updatePassword(u, newPw); }),
    deleteAccount: wrap(async (pw, id) => {
      const u = auth.currentUser, uid = u.uid; await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, pw));
      const del = async snap => { let b = writeBatch(db), n = 0; for (const d of snap.docs) { b.delete(d.ref); if (++n % 400 === 0) { await b.commit(); b = writeBatch(db); } } await b.commit(); };
      await del(await getDocs(collection(db, "users", uid, "games"))); await del(await getDocs(query(collection(db, "pub"), where("bk", "==", uid))));
      await deleteDoc(doc(db, "ids", id)); await deleteDoc(doc(db, "users", uid)); await A.deleteUser(u);
    }),
    addStat: wrap((uid, won) => updateDoc(doc(db, "users", uid), won ? { w: increment(1) } : { l: increment(1) })),
    // 내 기보: users/{uid}/games/{gid}
    listMine: wrap(async uid => (await getDocs(query(collection(db, "users", uid, "games"), orderBy("date", "desc"), limit(400)))).docs.map(d => ({ ...d.data(), id: d.id, owner: uid }))),
    getMine: wrap(async (uid, gid) => { const s = await getDoc(doc(db, "users", uid, "games", gid)); return s.exists() ? { ...s.data(), id: gid, owner: uid } : null; }),
    addRec: wrap((uid, r) => setDoc(doc(db, "users", uid, "games", r.id), strip(r))),
    updRec: wrap((uid, gid, patch) => updateDoc(doc(db, "users", uid, "games", gid), patch)),
    delRec: wrap((uid, gid) => deleteDoc(doc(db, "users", uid, "games", gid))),
    // 공개 기보: pub/{gid}
    listPub: wrap(async () => (await getDocs(query(collection(db, "pub"), orderBy("ts", "desc"), limit(200)))).docs.map(d => ({ ...d.data(), id: d.id }))),
    getPub: wrap(async id => { const s = await getDoc(doc(db, "pub", id)); return s.exists() ? { ...s.data(), id } : null; }),
    publish: wrap(r => setDoc(doc(db, "pub", r.id), strip(r))),
    unpublish: wrap(id => deleteDoc(doc(db, "pub", id))),
    pubsBy: wrap(async id => (await getDocs(query(collection(db, "pub"), where("by", "==", id), limit(60)))).docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => b.ts - a.ts)),
    userById: wrap(async id => { const s = await getDoc(doc(db, "ids", id)); if (!s.exists()) return null; return profile(s.data().uid); }),
  };
}
