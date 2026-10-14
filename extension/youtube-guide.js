const ENTRY_ID = "fube-guide-entry";
const MINI_ID = "fube-mini-entry";
const HOST_ID = "fube-page-host";

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function fubeIcon() {
  const src = chrome.runtime.getURL("icons/icon48.png");
  return `<img src="${src}" width="24" height="24" alt="" />`;
}

function isShortsEntry(el) {
  const href = el.querySelector("a")?.getAttribute("href") || "";
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  return /\/shorts/i.test(href) || /^shorts$/i.test(text) || text.startsWith("Shorts");
}

function isSubscriptionsEntry(el) {
  const href = el.querySelector("a")?.getAttribute("href") || "";
  const text = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  return (
    /\/feed\/subscriptions/i.test(href) ||
    text.startsWith("suscripciones") ||
    text.startsWith("subscriptions")
  );
}

function placeAfterShorts(entries, node) {
  const list = [...entries];
  const shorts = list.find(isShortsEntry);
  const subs = list.find(isSubscriptionsEntry);
  if (shorts) {
    shorts.after(node);
    return;
  }
  if (subs) {
    subs.before(node);
    return;
  }
  const first = list[0];
  if (first?.parentElement) first.parentElement.append(node);
}

function createExpandedEntry() {
  const item = document.createElement("div");
  item.id = ENTRY_ID;
  item.className = "fube-guide-item";
  item.setAttribute("role", "link");
  item.tabIndex = 0;
  item.innerHTML = `${fubeIcon()}<span class="fube-guide-label">My Fubes</span>`;
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFube();
  });
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFube();
    }
  });
  return item;
}

function createMiniEntry() {
  const item = document.createElement("div");
  item.id = MINI_ID;
  item.className = "fube-mini-item";
  item.setAttribute("role", "link");
  item.tabIndex = 0;
  item.innerHTML = `${fubeIcon()}<span class="fube-mini-label">Fubes</span>`;
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFube();
  });
  return item;
}

function insertExpanded() {
  const existing = document.getElementById(ENTRY_ID);
  const entries = document.querySelectorAll(
    "ytd-guide-section-renderer ytd-guide-entry-renderer",
  );
  if (!entries.length) return;
  const shorts = [...entries].find(isShortsEntry);
  if (existing) {
    if (shorts && shorts.nextElementSibling !== existing) shorts.after(existing);
    return;
  }
  placeAfterShorts(entries, createExpandedEntry());
}

function insertMini() {
  const existing = document.getElementById(MINI_ID);
  const entries = document.querySelectorAll("ytd-mini-guide-entry-renderer");
  if (!entries.length) return;
  const shorts = [...entries].find(isShortsEntry);
  if (existing) {
    if (shorts && shorts.nextElementSibling !== existing) shorts.after(existing);
    return;
  }
  placeAfterShorts(entries, createMiniEntry());
}

function setActive(active) {
  document.getElementById(ENTRY_ID)?.classList.toggle("is-active", active);
  document.getElementById(MINI_ID)?.classList.toggle("is-active", active);
}

let fubeOpen = false;
let activeChannelId = null;

function hostEl() {
  let host = document.getElementById(HOST_ID);
  if (host) return host;
  host = document.createElement("div");
  host.id = HOST_ID;
  host.hidden = true;
  (document.body || document.documentElement).append(host);
  return host;
}

function hideFube() {
  fubeOpen = false;
  const host = document.getElementById(HOST_ID);
  if (host) host.hidden = true;
  setActive(false);
}

async function openFube() {
  fubeOpen = true;
  setActive(true);
  const host = hostEl();
  host.hidden = false;
  host.innerHTML = `<div class="fube-loading">Cargando My Fubes…</div>`;
  try {
    await renderFeed(host);
  } catch (error) {
    host.innerHTML = `<div class="fube-page"><h1>My Fubes</h1><p class="fube-empty">No pude cargar el feed.</p></div>`;
    console.error("Fube", error);
  }
}

function renderEmpty(host) {
  host.innerHTML = `
    <div class="fube-page">
      <h1>My Fubes</h1>
      <p class="fube-empty">Aún no hay canales. Añádelos desde Fube o el icono de la extensión.</p>
    </div>`;
}

async function renderFeed(host) {
  const data = await chrome.storage.local.get([
    "channels",
    "watched",
    "hideWatched",
  ]);
  const channels = data.channels ?? [];
  const watched = new Set(data.watched ?? []);
  const hideWatched = Boolean(data.hideWatched);

  if (!channels.length) {
    renderEmpty(host);
    return;
  }

  let videos = [];
  try {
    const response = await chrome.runtime.sendMessage({
      type: "FETCH_FEED",
      channelIds: channels.map((channel) => channel.id),
    });
    videos = response?.videos ?? [];
  } catch (error) {
    console.error("Fube feed", error);
  }
  if (hideWatched) {
    videos = videos.filter((video) => !watched.has(video.videoId));
  }

  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  if (activeChannelId) {
    videos = videos.filter((video) => video.channelId === activeChannelId);
  }
  const channelButtons = [
    `<button type="button" data-channel="" class="${activeChannelId ? "" : "is-active"}">Todos</button>`,
    ...channels.map((channel) => {
      const thumb = channel.thumbnail
        ? `<img src="${channel.thumbnail}" alt="" />`
        : "";
      const active = channel.id === activeChannelId ? " is-active" : "";
      return `<button type="button" data-channel="${channel.id}" class="${active}">${thumb}<span>${escapeHtml(channel.name)}</span></button>`;
    }),
  ].join("");

  host.innerHTML = `
    <div class="fube-page">
      <div class="fube-page-head">
        <h1>My Fubes</h1>
        <label class="fube-hide">
          <input id="fube-hide-watched" type="checkbox" ${hideWatched ? "checked" : ""} />
          Ocultar vistos
        </label>
      </div>
      <div class="fube-layout">
        <aside class="fube-channels">${channelButtons}</aside>
        <div class="fube-main">
      ${
        videos.length === 0
          ? `<p class="fube-empty">${hideWatched ? "No hay videos sin ver." : "No hay videos."}</p>`
          : `<div class="fube-grid">${videos
              .map((video) => {
                const channel = byId.get(video.channelId);
                const isWatched = watched.has(video.videoId);
                const thumb =
                  channel?.thumbnail ||
                  `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
                return `<a class="fube-card${isWatched ? " is-watched" : ""}" href="/watch?v=${video.videoId}">
                  <span class="fube-thumb-wrap">
                    <img class="fube-thumb" src="https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg" alt="" referrerpolicy="no-referrer" />
                    ${isWatched ? `<span class="fube-badge">Visto</span>` : ""}
                  </span>
                  <span class="fube-meta">
                    <img class="fube-avatar" src="${thumb}" alt="" referrerpolicy="no-referrer" />
                    <span>
                      <span class="fube-title">${escapeHtml(video.title)}</span>
                      <span class="fube-sub">${escapeHtml(video.channelName)}</span>
                      <span class="fube-sub">${timeAgo(video.published)}</span>
                    </span>
                  </span>
                </a>`;
              })
              .join("")}</div>`
      }
        </div>
      </div>
    </div>`;

  host.querySelector("#fube-hide-watched")?.addEventListener("change", async (event) => {
    await chrome.storage.local.set({ hideWatched: event.target.checked });
    await renderFeed(host);
  });

  host.querySelectorAll(".fube-channels button").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-channel") || "";
      activeChannelId = id || null;
      await renderFeed(host);
    });
  });

  host.querySelectorAll(".fube-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const href = card.getAttribute("href") || "";
      const id = new URL(href, location.origin).searchParams.get("v");
      if (!id) return;
      const stored = await chrome.storage.local.get("watched");
      const current = stored.watched ?? [];
      if (!current.includes(id)) {
        await chrome.storage.local.set({ watched: [...current, id] });
      }
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isChannelPage() {
  const path = location.pathname;
  return (
    path.startsWith("/@") ||
    path.startsWith("/channel/") ||
    path.startsWith("/c/") ||
    path.startsWith("/user/")
  );
}

function findChannelActions() {
  return (
    document.querySelector("yt-page-header-view-model yt-subscribe-button-view-model") ||
    document.querySelector("yt-page-header-view-model ytd-subscribe-button-renderer") ||
    document.querySelector("#page-header ytd-subscribe-button-renderer") ||
    document.querySelector("yt-page-header-view-model yt-flexible-actions-view-model") ||
    document.querySelector("#page-header yt-flexible-actions-view-model") ||
    document.querySelector("ytd-c4-tabbed-header-renderer #buttons") ||
    document.querySelector("#inner-header-container #buttons") ||
    document.querySelector("ytd-c4-tabbed-header-renderer ytd-subscribe-button-renderer")
  );
}

function extractChannelId() {
  const meta = document.querySelector('meta[itemprop="channelId"]');
  if (meta?.content?.startsWith("UC")) return meta.content;
  const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
  const fromCanon = canonical.match(/\/channel\/(UC[\w-]{22})/);
  if (fromCanon) return fromCanon[1];
  const attr = document.querySelector("[channel-id]")?.getAttribute("channel-id");
  if (attr?.startsWith("UC")) return attr;
  const html = document.documentElement.innerHTML;
  const rss = html.match(/channel_id=(UC[\w-]{22})/);
  if (rss) return rss[1];
  const external = html.match(/"externalId":"(UC[\w-]{22})"/);
  return external ? external[1] : null;
}

function channelFromPage() {
  const id = extractChannelId();
  if (!id) return null;
  const name = (
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector("yt-dynamic-text-view-model h1")?.textContent ||
    document.title
  )
    .replace(/\s+- YouTube$/i, "")
    .trim();
  const thumbnail =
    document.querySelector("#page-header yt-avatar-shape img")?.src ||
    document.querySelector("yt-page-header-view-model img")?.src ||
    document.querySelector('meta[property="og:image"]')?.content ||
    null;
  const url =
    document.querySelector('link[rel="canonical"]')?.href || location.href;
  return {
    id,
    name: name || "Canal",
    url,
    thumbnail,
    addedAt: new Date().toISOString(),
  };
}

function setAddButtonLabel(btn, added) {
  const next = added ? "added" : "idle";
  if (btn.dataset.state === next && btn.querySelector("span")) {
    btn.disabled = false;
    return;
  }
  const icon = chrome.runtime.getURL("icons/icon32.png");
  btn.dataset.state = next;
  btn.disabled = false;
  btn.classList.toggle("is-added", added);
  btn.title = added ? "Quitar de My Fubes" : "Agregar a My Fubes";
  btn.innerHTML = `<img src="${icon}" width="18" height="18" alt="" /><span>${
    added ? "En My Fubes" : "Agregar a My Fubes"
  }</span>`;
}

async function refreshAddButton(btn) {
  const channel = channelFromPage();
  if (!channel?.id) return;
  const stored = await chrome.storage.local.get("channels");
  const added = (stored.channels ?? []).some((item) => item.id === channel.id);
  setAddButtonLabel(btn, added);
}

async function onAddToFubes(event) {
  event.preventDefault();
  event.stopPropagation();
  const btn = event.currentTarget;
  if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
  const fallback = channelFromPage();
  const removing = btn.dataset.state === "added";
  btn.disabled = true;
  if (removing) {
    const result = await chrome.runtime.sendMessage({
      type: "REMOVE_CHANNEL",
      channelId: fallback?.id,
    });
    btn.disabled = false;
    setAddButtonLabel(btn, !(result?.ok));
    return;
  }
  const result = await chrome.runtime.sendMessage({
    type: "ADD_CHANNEL",
    url: location.href,
    fallback,
  });
  btn.disabled = false;
  setAddButtonLabel(btn, Boolean(result?.ok));
}

let lastChannelPath = "";

function subscribeHost(anchor) {
  if (
    anchor.matches(
      "yt-subscribe-button-view-model, ytd-subscribe-button-renderer, #subscribe-button",
    )
  ) {
    return anchor;
  }
  return (
    anchor.querySelector(
      "yt-subscribe-button-view-model, ytd-subscribe-button-renderer, #subscribe-button",
    ) || anchor
  );
}

function placeChannelButton(anchor, btn) {
  const subscribe = subscribeHost(anchor);
  let wrap = document.getElementById("fube-actions-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "fube-actions-wrap";
  }
  if (subscribe.parentElement !== wrap) {
    subscribe.replaceWith(wrap);
    wrap.append(subscribe);
  }
  if (btn.parentElement !== wrap) wrap.append(btn);
}

function insertChannelButton() {
  if (!isChannelPage()) {
    document.getElementById("fube-add-channel")?.remove();
    const wrap = document.getElementById("fube-actions-wrap");
    if (wrap) wrap.replaceWith(...[...wrap.childNodes]);
    lastChannelPath = "";
    return;
  }
  const anchor = findChannelActions();
  if (!anchor) return;
  let btn = document.getElementById("fube-add-channel");
  const created = !btn;
  const pathChanged = lastChannelPath !== location.pathname;
  lastChannelPath = location.pathname;
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "fube-add-channel";
    btn.type = "button";
    setAddButtonLabel(btn, false);
    btn.addEventListener("click", onAddToFubes);
  }
  placeChannelButton(anchor, btn);
  if (created || pathChanged) refreshAddButton(btn);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.channels) return;
  const btn = document.getElementById("fube-add-channel");
  if (btn) refreshAddButton(btn);
});

function insertAll() {
  insertExpanded();
  insertMini();
  insertChannelButton();
}

let timer = 0;
const observer = new MutationObserver(() => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    insertAll();
    if (fubeOpen) {
      const host = hostEl();
      host.hidden = false;
      setActive(true);
    }
  }, 120);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`#${ENTRY_ID}, #${MINI_ID}, #${HOST_ID}`)) return;
    if (
      target.closest(
        "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-guide-collapsible-entry-renderer",
      )
    ) {
      hideFube();
    }
  },
  true,
);

window.addEventListener("yt-navigate-finish", () => {
  if (!fubeOpen) return;
  if (location.pathname.startsWith("/watch")) hideFube();
});
insertAll();
