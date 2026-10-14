const DEFAULT_APP_URL = "http://localhost:3000";
const PAGE = "fube-page";
const BRIDGE = "fube-bridge";

function mergeChannels(a, b) {
  const map = new Map();
  for (const channel of [...(a || []), ...(b || [])]) {
    const current = map.get(channel.id);
    if (!current || channel.addedAt > current.addedAt) {
      map.set(channel.id, channel);
    }
  }
  return [...map.values()];
}

function mergeWatched(a, b) {
  return [...new Set([...(a || []), ...(b || [])])];
}

function frame() {
  return document.getElementById("frame");
}

async function readStore() {
  const data = await chrome.storage.local.get([
    "channels",
    "watched",
    "hideWatched",
  ]);
  return {
    channels: data.channels ?? [],
    watched: data.watched ?? [],
    hideWatched: Boolean(data.hideWatched),
  };
}

function reply(source, store) {
  source.postMessage({ source: BRIDGE, type: "STORE", store }, "*");
}

window.addEventListener("message", (event) => {
  const iframe = frame();
  if (!iframe || event.source !== iframe.contentWindow) return;
  const data = event.data;
  if (!data || data.source !== PAGE) return;

  if (data.type === "GET") {
    readStore().then((store) => {
      const next = {
        channels: mergeChannels(store.channels, data.localChannels),
        watched: mergeWatched(store.watched, data.localWatched),
        hideWatched: store.hideWatched || Boolean(data.localHideWatched),
      };
      chrome.storage.local.set(next, () => reply(event.source, next));
    });
    return;
  }

  if (data.type === "SET") {
    const patch = {};
    if (Array.isArray(data.channels)) patch.channels = data.channels;
    if (Array.isArray(data.watched)) patch.watched = data.watched;
    if (typeof data.hideWatched === "boolean") patch.hideWatched = data.hideWatched;
    chrome.storage.local.set(patch);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!changes.channels && !changes.watched && !changes.hideWatched) return;
  const iframe = frame();
  if (!iframe?.contentWindow) return;
  readStore().then((store) => {
    iframe.contentWindow.postMessage({ source: BRIDGE, type: "STORE", store }, "*");
  });
});

async function load() {
  const { appUrl } = await chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL });
  const { pendingAdd } = await chrome.storage.session.get("pendingAdd");
  const base = (appUrl || DEFAULT_APP_URL).replace(/\/$/, "");
  let src = base;
  if (pendingAdd) {
    src = `${base}/?add=${encodeURIComponent(pendingAdd)}`;
    await chrome.storage.session.remove("pendingAdd");
  }
  frame().src = src;
}

load();
