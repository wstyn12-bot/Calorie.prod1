// Small IndexedDB key-value store with an in-memory fallback (e.g. private browsing).

const DB_NAME = "calorie-prod";
const STORE = "kv";
let dbPromise = null;
const memory = new Map(); // used only when IndexedDB isn't available

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

const reqDone = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const txDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export const idb = {
  async get(key) {
    const db = await open();
    if (!db) return memory.get(key);
    return reqDone(db.transaction(STORE, "readonly").objectStore(STORE).get(key));
  },
  async set(key, value) {
    const db = await open();
    if (!db) return void memory.set(key, value);
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    return txDone(tx);
  },
  async setMany(entries) {
    const db = await open();
    if (!db) return void entries.forEach(([k, v]) => memory.set(k, v));
    const tx = db.transaction(STORE, "readwrite");
    const s = tx.objectStore(STORE);
    for (const [k, v] of entries) s.put(v, k);
    return txDone(tx);
  },
  async del(key) {
    const db = await open();
    if (!db) return void memory.delete(key);
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    return txDone(tx);
  },
  async keys() {
    const db = await open();
    if (!db) return [...memory.keys()];
    return reqDone(db.transaction(STORE, "readonly").objectStore(STORE).getAllKeys());
  },
  async clear() {
    const db = await open();
    if (!db) return void memory.clear();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    return txDone(tx);
  },
};
