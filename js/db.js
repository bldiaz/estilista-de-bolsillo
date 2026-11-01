// Almacenamiento local en el dispositivo (IndexedDB). Nada sale del teléfono salvo las llamadas a Claude.
const DB_NAME = "estilista-de-bolsillo";
const STORES = ["kv", "closet", "outfits", "shopping", "diario"];
let dbp = null;
const listeners = {};

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, s === "kv" ? undefined : { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

function emit(store) { (listeners[store] || []).forEach(cb => all(store).then(cb)); }

export function on(store, cb) { (listeners[store] = listeners[store] || []).push(cb); all(store).then(cb); }
export function all(store) { return tx(store, "readonly", s => reqP(s.getAll())); }
export async function put(store, obj) { await tx(store, "readwrite", s => s.put(obj)); emit(store); return obj; }
export async function del(store, id) { await tx(store, "readwrite", s => s.delete(id)); emit(store); }
export async function getKV(key) { return tx("kv", "readonly", s => reqP(s.get(key))); }
export async function setKV(key, val) { await tx("kv", "readwrite", s => s.put(val, key)); (listeners["kv:" + key] || []).forEach(cb => cb(val)); }
export function onKV(key, cb) { (listeners["kv:" + key] = listeners["kv:" + key] || []).push(cb); getKV(key).then(cb); }

export async function exportAll() {
  const out = { app: "estilista-de-bolsillo", version: 1, exportado: new Date().toISOString(), kv: {} };
  for (const s of STORES.slice(1)) out[s] = await all(s);
  for (const k of ["perfil", "avatar"]) out.kv[k] = await getKV(k);
  return out;
}
export async function importAll(data) {
  if (!data || data.app !== "estilista-de-bolsillo") throw new Error("Este archivo no es una copia de Estilista de Bolsillo.");
  for (const s of STORES.slice(1)) {
    await tx(s, "readwrite", st => { st.clear(); for (const o of data[s] || []) st.put(o); });
    emit(s);
  }
  for (const [k, v] of Object.entries(data.kv || {})) if (v != null) await setKV(k, v);
}
export async function wipe() {
  for (const s of STORES) await tx(s, "readwrite", st => st.clear());
  STORES.slice(1).forEach(emit);
  for (const k of ["perfil", "avatar"]) (listeners["kv:" + k] || []).forEach(cb => cb(undefined));
}
export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}
