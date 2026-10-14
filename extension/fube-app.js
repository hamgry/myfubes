let activeChannelId = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function renderEmpty(root) {
  root.innerHTML = `
    <div class="fube-brand">
      <img src="icons/icon128.png" alt="" />
      <strong>Fube</strong>
    </div>
    <div class="fube-page">
      <h1>My Fubes</h1>
      <p class="fube-empty">Aún no hay canales. Añádelos desde YouTube o el icono de la extensión.</p>
    </div>`;
}

async function renderFeed(root) {
  const data = await chrome.storage.local.get([
    "channels",
    "watched",
    "hideWatched",
  ]);
  const channels = data.channels ?? [];
  const watched = new Set(data.watched ?? []);
  const hideWatched = Boolean(data.hideWatched);

  if (!channels.length) {
    renderEmpty(root);
    return;
  }

  root.innerHTML = `<div class="fube-loading">Cargando My Fubes…</div>`;

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
  if (activeChannelId) {
    videos = videos.filter((video) => video.channelId === activeChannelId);
  }

  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const channelButtons = [
    `<button type="button" data-channel="" class="${activeChannelId ? "" : "is-active"}">Todos</button>`,
    ...channels.map((channel) => {
      const thumb = channel.thumbnail
        ? `<img src="${escapeHtml(channel.thumbnail)}" alt="" />`
        : "";
      const active = channel.id === activeChannelId ? " is-active" : "";
      return `<button type="button" data-channel="${channel.id}" class="${active}">${thumb}<span>${escapeHtml(channel.name)}</span></button>`;
    }),
  ].join("");

  root.innerHTML = `
    <div class="fube-brand">
      <img src="icons/icon128.png" alt="" />
      <strong>Fube</strong>
    </div>
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
                    const avatar =
                      channel?.thumbnail ||
                      `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
                    return `<a class="fube-card${isWatched ? " is-watched" : ""}" href="https://www.youtube.com/watch?v=${video.videoId}">
                      <span class="fube-thumb-wrap">
                        <img class="fube-thumb" src="https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg" alt="" referrerpolicy="no-referrer" />
                        ${isWatched ? `<span class="fube-badge">Visto</span>` : ""}
                      </span>
                      <span class="fube-meta">
                        <img class="fube-avatar" src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer" />
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

  root.querySelector("#fube-hide-watched")?.addEventListener("change", async (event) => {
    await chrome.storage.local.set({ hideWatched: event.target.checked });
  });

  root.querySelectorAll(".fube-channels button").forEach((button) => {
    button.addEventListener("click", async () => {
      activeChannelId = button.getAttribute("data-channel") || null;
      await renderFeed(root);
    });
  });

  root.querySelectorAll(".fube-card").forEach((card) => {
    card.addEventListener("click", async (event) => {
      event.preventDefault();
      const href = card.getAttribute("href") || "";
      const id = new URL(href).searchParams.get("v");
      if (id) {
        const stored = await chrome.storage.local.get("watched");
        const current = stored.watched ?? [];
        if (!current.includes(id)) {
          await chrome.storage.local.set({ watched: [...current, id] });
        }
      }
      await chrome.tabs.create({ url: href });
    });
  });
}

function boot() {
  const root = document.getElementById("app");
  renderFeed(root);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes.channels && !changes.watched && !changes.hideWatched) return;
    renderFeed(root);
  });
}

boot();
