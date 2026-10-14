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

function post(payload) {
  window.postMessage({ source: BRIDGE, ...payload }, "*");
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

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== PAGE) return;

  if (data.type === "GET") {
    readStore().then((store) => {
      const next = {
        channels: mergeChannels(store.channels, data.localChannels),
        watched: mergeWatched(store.watched, data.localWatched),
        hideWatched: store.hideWatched || Boolean(data.localHideWatched),
      };
      chrome.storage.local.set(next, () => {
        post({ type: "STORE", store: next });
      });
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
  readStore().then((store) => post({ type: "STORE", store }));
});
