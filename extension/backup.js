const FubeBackup = (() => {
  const FILE = "fube-favoritos.json";
  const DB = "fube-backup-db";
  const STORE = "handles";
  const KEY = "directory";

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveHandle(handle) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadHandle() {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle ?? null;
  }

  async function clearHandle() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function ensurePermission(handle) {
    const mode = { mode: "readwrite" };
    if ((await handle.queryPermission(mode)) === "granted") return true;
    try {
      return (await handle.requestPermission(mode)) === "granted";
    } catch {
      return false;
    }
  }

  async function buildPayload() {
    const stored = await chrome.storage.local.get([
      "channels",
      "watched",
      "hideWatched",
    ]);
    return {
      app: "fube",
      version: 1,
      savedAt: new Date().toISOString(),
      channels: stored.channels ?? [],
      watched: stored.watched ?? [],
      hideWatched: Boolean(stored.hideWatched),
    };
  }

  async function writeFile(handle, payload) {
    const fileHandle = await handle.getFileHandle(FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(`${JSON.stringify(payload, null, 2)}\n`);
    await writable.close();
  }

  async function writeDaily() {
    const handle = await loadHandle();
    if (!handle) return { ok: false, reason: "no-folder" };
    const permitted = await ensurePermission(handle);
    if (!permitted) return { ok: false, reason: "permission" };
    const payload = await buildPayload();
    await writeFile(handle, payload);
    return { ok: true, savedAt: payload.savedAt, folder: handle.name };
  }

  function parseBackup(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.channels)) {
      throw new Error("Archivo inválido");
    }
    return {
      channels: data.channels,
      watched: Array.isArray(data.watched) ? data.watched : [],
      hideWatched: Boolean(data.hideWatched),
    };
  }

  async function restoreFromHandle() {
    const handle = await loadHandle();
    if (!handle) return { ok: false, reason: "no-folder" };
    const permitted = await ensurePermission(handle);
    if (!permitted) return { ok: false, reason: "permission" };
    const fileHandle = await handle.getFileHandle(FILE);
    const file = await fileHandle.getFile();
    const store = parseBackup(await file.text());
    await chrome.storage.local.set(store);
    return { ok: true, count: store.channels.length };
  }

  async function restoreFromFile(file) {
    const store = parseBackup(await file.text());
    await chrome.storage.local.set(store);
    return { ok: true, count: store.channels.length };
  }

  return {
    FILE,
    saveHandle,
    loadHandle,
    clearHandle,
    ensurePermission,
    writeDaily,
    restoreFromHandle,
    restoreFromFile,
  };
})();
