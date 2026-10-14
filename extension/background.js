const DEFAULT_APP_URL = "http://localhost:3000";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }, (result) => {
    if (!result.appUrl) {
      chrome.storage.sync.set({ appUrl: DEFAULT_APP_URL });
    }
  });
  syncBackupAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  syncBackupAlarm();
  runDailyBackup();
});

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1].trim()) : "";
}

function parseRss(xml) {
  const videos = [];
  const chunks = xml.split("<entry>").slice(1);
  for (const chunk of chunks) {
    const videoId = tag(chunk, "yt:videoId");
    if (!videoId) continue;
    videos.push({
      videoId,
      channelId: tag(chunk, "yt:channelId"),
      channelName: tag(chunk, "name") || "Canal",
      title: tag(chunk, "title"),
      published: tag(chunk, "published"),
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      description: tag(chunk, "media:description"),
    });
  }
  return videos;
}

async function fetchFeed(channelIds) {
  const unique = [...new Set(channelIds.filter(Boolean))];
  const batches = [];
  for (let i = 0; i < unique.length; i += 4) {
    const slice = unique.slice(i, i + 4);
    const part = await Promise.all(
      slice.map(async (id) => {
        try {
          const response = await fetch(
            `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`,
          );
          if (!response.ok) return [];
          return parseRss(await response.text());
        } catch {
          return [];
        }
      }),
    );
    batches.push(...part);
  }
  const seen = new Set();
  const merged = [];
  for (const video of batches.flat()) {
    if (seen.has(video.videoId)) continue;
    seen.add(video.videoId);
    merged.push(video);
  }
  merged.sort(
    (a, b) => new Date(b.published).getTime() - new Date(a.published).getTime(),
  );
  return merged;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_PANEL") {
    const windowId = sender.tab?.windowId;
    if (windowId != null) {
      chrome.sidePanel.open({ windowId });
    } else {
      chrome.windows.getCurrent((win) => {
        if (win.id != null) chrome.sidePanel.open({ windowId: win.id });
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "FETCH_FEED") {
    fetchFeed(message.channelIds ?? []).then((videos) => {
      sendResponse({ videos });
    });
    return true;
  }

  if (message?.type === "ADD_CHANNEL") {
    addChannel(message.url, message.fallback).then(sendResponse);
    return true;
  }

  if (message?.type === "REMOVE_CHANNEL") {
    removeChannel(message.channelId).then(sendResponse);
    return true;
  }

  if (message?.type === "BACKUP_ALARM_SYNC") {
    syncBackupAlarm().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "BACKUP_WRITTEN") {
    chrome.action.setBadgeText({ text: "" });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "WRITE_BACKUP_FILE") {
    return false;
  }

  return false;
});

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function resolveChannel(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    const html = await response.text();
    const idMatch =
      html.match(/feeds\.videos\.xml\?channel_id=(UC[\w-]{22})/) ||
      html.match(/"externalId":"(UC[\w-]{22})"/) ||
      html.match(/"browseId":"(UC[\w-]{22})"/);
    if (!idMatch) return null;
    const title = html.match(/<meta property="og:title" content="([^"]*)"/i);
    const image = html.match(/<meta property="og:image" content="([^"]*)"/i);
    const name = decodeHtml((title?.[1] || "Canal").replace(/\s+- YouTube$/i, ""));
    return {
      id: idMatch[1],
      name,
      url: response.url || url,
      thumbnail: image?.[1] || null,
      addedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function addChannel(url, fallback) {
  const stored = await chrome.storage.local.get("channels");
  const channels = stored.channels ?? [];
  const { appUrl } = await chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL });
  let channel = fallback && fallback.id ? fallback : null;
  try {
    const response = await fetch(`${(appUrl || DEFAULT_APP_URL).replace(/\/$/, "")}/api/channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(1500),
    });
    const data = await response.json();
    if (response.ok && data.channel?.id) channel = data.channel;
  } catch {
    /* usa YouTube directo */
  }
  if (!channel?.id) channel = await resolveChannel(url);
  if (!channel?.id) return { ok: false };
  const already = channels.some((item) => item.id === channel.id);
  if (!already) {
    await chrome.storage.local.set({ channels: [channel, ...channels] });
  }
  return { ok: true, already, channel };
}

async function removeChannel(channelId) {
  if (!channelId) return { ok: false };
  const stored = await chrome.storage.local.get("channels");
  const channels = (stored.channels ?? []).filter((item) => item.id !== channelId);
  await chrome.storage.local.set({ channels });
  return { ok: true };
}

const BACKUP_ALARM = "fube-daily-backup";

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

async function syncBackupAlarm() {
  const { backupEnabled } = await chrome.storage.local.get("backupEnabled");
  await chrome.alarms.clear(BACKUP_ALARM);
  if (backupEnabled) {
    await chrome.alarms.create(BACKUP_ALARM, { periodInMinutes: 60 });
  }
}

async function hasOffscreen() {
  if (chrome.offscreen.hasDocument) {
    return chrome.offscreen.hasDocument();
  }
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Escribe el backup diario de favoritos en la carpeta elegida.",
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function runDailyBackup(force = false) {
  const settings = await chrome.storage.local.get([
    "backupEnabled",
    "backupFolderName",
    "lastBackupDay",
  ]);
  if (!settings.backupEnabled || !settings.backupFolderName) return;
  if (!force && settings.lastBackupDay === todayKey()) return;
  try {
    await ensureOffscreen();
    const result = await chrome.runtime.sendMessage({ type: "WRITE_BACKUP_FILE" });
    if (result?.ok) {
      await chrome.storage.local.set({
        lastBackupAt: result.savedAt,
        lastBackupDay: todayKey(),
        backupNeedsPermission: false,
      });
      await chrome.action.setBadgeText({ text: "" });
    } else if (result?.reason === "permission") {
      await chrome.storage.local.set({ backupNeedsPermission: true });
      await chrome.action.setBadgeBackgroundColor({ color: "#f10d11" });
      await chrome.action.setBadgeText({ text: "!" });
      await chrome.action.setTitle({
        title: "Fube: autorizá el backup en Opciones",
      });
    }
  } catch (error) {
    console.error("Fube backup", error);
  } finally {
    if (await hasOffscreen()) {
      await chrome.offscreen.closeDocument();
    }
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BACKUP_ALARM) runDailyBackup();
});
