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

function textFrom(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.simpleText) return node.simpleText;
  if (typeof node.content === "string") return node.content;
  if (Array.isArray(node.runs)) return node.runs.map((part) => part.text).join("");
  return "";
}

function parseRelativeDate(text) {
  const raw = String(text || "");
  const n = parseInt(raw.replace(/\./g, ""), 10);
  const now = Date.now();
  if (!Number.isFinite(n)) return new Date(now).toISOString();
  const lower = raw.toLowerCase();
  let unit = 0;
  if (/second|segundo/.test(lower)) unit = 1000;
  else if (/minute|minuto/.test(lower)) unit = 60 * 1000;
  else if (/hour|hora/.test(lower)) unit = 3600 * 1000;
  else if (/day|d[ií]a/.test(lower)) unit = 86400 * 1000;
  else if (/week|semana/.test(lower)) unit = 7 * 86400 * 1000;
  else if (/month|mes/.test(lower)) unit = 30 * 86400 * 1000;
  else if (/year|a[nñ]o/.test(lower)) unit = 365 * 86400 * 1000;
  return new Date(now - n * unit).toISOString();
}

function collectVideos(node, channelId, channelName, acc = [], seen = new Set()) {
  if (!node || typeof node !== "object" || acc.length >= 30) return acc;
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, channelId, channelName, acc, seen);
    return acc;
  }
  const renderer =
    node.videoRenderer ||
    node.gridVideoRenderer ||
    node.compactVideoRenderer ||
    node.reelItemRenderer ||
    null;
  if (renderer?.videoId && !seen.has(renderer.videoId)) {
    seen.add(renderer.videoId);
    acc.push({
      videoId: renderer.videoId,
      channelId,
      channelName:
        textFrom(renderer.ownerText) ||
        textFrom(renderer.shortBylineText) ||
        channelName ||
        "Canal",
      title: textFrom(renderer.title) || "Video",
      published: parseRelativeDate(textFrom(renderer.publishedTimeText)),
      thumbnail: `https://i.ytimg.com/vi/${renderer.videoId}/hqdefault.jpg`,
      description: "",
    });
  }
  const lockup = node.lockupViewModel;
  if (
    lockup?.contentId &&
    /^[\w-]{11}$/.test(lockup.contentId) &&
    !seen.has(lockup.contentId)
  ) {
    seen.add(lockup.contentId);
    const title =
      lockup.metadata?.lockupMetadataViewModel?.title?.content ||
      textFrom(lockup.metadata?.lockupMetadataViewModel?.title);
    acc.push({
      videoId: lockup.contentId,
      channelId,
      channelName: channelName || "Canal",
      title: title || "Video",
      published: new Date().toISOString(),
      thumbnail: `https://i.ytimg.com/vi/${lockup.contentId}/hqdefault.jpg`,
      description: "",
    });
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectVideos(value, channelId, channelName, acc, seen);
    }
  }
  return acc;
}

function extractInitialData(html) {
  const at = html.indexOf("ytInitialData");
  if (at < 0) return null;
  const jsonStart = html.indexOf("{", at);
  const end = html.indexOf(";</script>", jsonStart);
  if (jsonStart < 0 || end < 0) return null;
  try {
    return JSON.parse(html.slice(jsonStart, end));
  } catch {
    return null;
  }
}

async function fetchRss(id) {
  const urls = [
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`,
    `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(`UU${id.slice(2)}`)}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/atom+xml,application/xml,text/xml,*/*" },
      });
      if (!response.ok) continue;
      const xml = await response.text();
      if (!xml.includes("<entry>")) continue;
      const videos = parseRss(xml);
      if (videos.length) return videos;
    } catch {
      /* siguiente fuente */
    }
  }
  return [];
}

async function fetchChannelHtml(id, url, name) {
  const pages = [];
  if (url) pages.push(`${String(url).replace(/\/$/, "")}/videos`);
  if (id) pages.push(`https://www.youtube.com/channel/${id}/videos`);
  for (const page of pages) {
    try {
      const response = await fetch(page, {
        credentials: "include",
        redirect: "follow",
      });
      if (!response.ok) continue;
      const data = extractInitialData(await response.text());
      if (!data) continue;
      const videos = collectVideos(data, id, name);
      if (videos.length) return videos;
    } catch {
      /* siguiente fuente */
    }
  }
  return [];
}

async function fetchChannelInnertube(id, name) {
  try {
    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20260101.00.00",
              hl: "es",
              gl: "AR",
            },
          },
          browseId: id,
          params: "EgZ2aWRlb3PyBgQKAjoA",
        }),
      },
    );
    if (!response.ok) return [];
    return collectVideos(await response.json(), id, name);
  } catch {
    return [];
  }
}

async function fetchChannelVideos(channel) {
  const id = channel.id;
  const name = channel.name || "Canal";
  const url = channel.url || "";
  if (!id) return [];
  const rss = await fetchRss(id);
  if (rss.length) return rss;
  const html = await fetchChannelHtml(id, url, name);
  if (html.length) return html;
  return fetchChannelInnertube(id, name);
}

async function fetchFeed(channels, channelIds) {
  const list =
    Array.isArray(channels) && channels.length
      ? channels
      : [...new Set((channelIds ?? []).filter(Boolean))].map((id) => ({
          id,
          url: "",
          name: "",
        }));
  const batches = [];
  for (let i = 0; i < list.length; i += 3) {
    const slice = list.slice(i, i + 3);
    batches.push(
      ...(await Promise.all(slice.map((channel) => fetchChannelVideos(channel)))),
    );
  }
  const seen = new Set();
  const merged = [];
  for (const video of batches.flat()) {
    if (!video?.videoId || seen.has(video.videoId)) continue;
    seen.add(video.videoId);
    merged.push(video);
  }
  merged.sort(
    (a, b) => new Date(b.published).getTime() - new Date(a.published).getTime(),
  );
  return merged;
}
