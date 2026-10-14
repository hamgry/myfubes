import type { Channel } from "./types";

const CHANNELS_KEY = "fube.v1.channels";
const CHANNELS_LEGACY = ["favtube.v1.channels", "yt-feed.v1.channels"];
const WATCHED_KEY = "fube.v1.watched";
const WATCHED_LEGACY = "favtube.v1.watched";
const HIDE_KEY = "fube.v1.hideWatched";
const HIDE_LEGACY = "favtube.v1.hideWatched";
const PAGE = "fube-page";
const BRIDGE = "fube-bridge";

export type FavStore = {
  channels: Channel[];
  watched: string[];
  hideWatched: boolean;
};

function parseChannels(raw: string | null): Channel[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Channel[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseWatched(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function emptyStore(): FavStore {
  return { channels: [], watched: [], hideWatched: false };
}

export function readLocalStore(): FavStore {
  if (typeof window === "undefined") return emptyStore();
  return {
    channels: parseChannels(
      window.localStorage.getItem(CHANNELS_KEY) ??
        CHANNELS_LEGACY.map((key) => window.localStorage.getItem(key)).find(Boolean) ??
        null,
    ),
    watched: parseWatched(
      window.localStorage.getItem(WATCHED_KEY) ??
        window.localStorage.getItem(WATCHED_LEGACY),
    ),
    hideWatched:
      (window.localStorage.getItem(HIDE_KEY) ??
        window.localStorage.getItem(HIDE_LEGACY)) === "1",
  };
}

export function writeLocalStore(store: FavStore): void {
  window.localStorage.setItem(CHANNELS_KEY, JSON.stringify(store.channels));
  window.localStorage.setItem(WATCHED_KEY, JSON.stringify(store.watched));
  window.localStorage.setItem(HIDE_KEY, store.hideWatched ? "1" : "0");
}

export function mergeChannels(lists: Channel[][]): Channel[] {
  const map = new Map<string, Channel>();
  for (const list of lists) {
    for (const channel of list) {
      const current = map.get(channel.id);
      if (!current || channel.addedAt > current.addedAt) {
        map.set(channel.id, channel);
      }
    }
  }
  return [...map.values()];
}

export function mergeWatched(lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

export function mergeStores(a: FavStore, b: FavStore): FavStore {
  return {
    channels: mergeChannels([a.channels, b.channels]),
    watched: mergeWatched([a.watched, b.watched]),
    hideWatched: a.hideWatched || b.hideWatched,
  };
}

export function sameStore(a: FavStore, b: FavStore): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function emit(payload: Record<string, unknown>): void {
  const message = { source: PAGE, ...payload };
  window.postMessage(message, "*");
  if (window.parent !== window) {
    window.parent.postMessage(message, "*");
  }
}

export function loadStore(): Promise<FavStore> {
  const local = readLocalStore();
  if (typeof window === "undefined") return Promise.resolve(local);

  return new Promise((resolve) => {
    let done = false;
    const finish = (store: FavStore) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      writeLocalStore(store);
      resolve(store);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.source !== BRIDGE) return;
      if (event.data.type !== "STORE") return;
      if (!event.data.store) return;
      finish(mergeStores(local, event.data.store as FavStore));
    };

    window.addEventListener("message", onMessage);
    emit({
      type: "GET",
      localChannels: local.channels,
      localWatched: local.watched,
      localHideWatched: local.hideWatched,
    });
    window.setTimeout(() => finish(local), 400);
  });
}

export function saveStore(store: FavStore): void {
  writeLocalStore(store);
  emit({
    type: "SET",
    channels: store.channels,
    watched: store.watched,
    hideWatched: store.hideWatched,
  });
}

export function subscribeStore(callback: (store: FavStore) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.data?.source !== BRIDGE) return;
    if (event.data.type !== "STORE") return;
    if (!event.data.store) return;
    callback(event.data.store as FavStore);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
