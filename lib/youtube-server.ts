import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { decodeXml } from "./format";
import { cleanMediaUrl } from "./media";
import type { Channel, Video } from "./types";

const execFileAsync = promisify(execFile);
const CHANNEL_ID_RE = /UC[\w-]{22}/;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const rssCache = new Map<string, { at: number; videos: Video[] }>();
const RSS_TTL_MS = 8 * 60 * 1000;

export function extractChannelId(text: string): string | null {
  const rss = text.match(/feeds\.videos\.xml\?channel_id=(UC[\w-]{22})/);
  if (rss) return rss[1]!;
  const channelPath = text.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
  if (channelPath) return channelPath[1]!;
  const externalId = text.match(/"externalId":"(UC[\w-]{22})"/);
  if (externalId) return externalId[1]!;
  const browseId = text.match(/"browseId":"(UC[\w-]{22})"/);
  if (browseId) return browseId[1]!;
  const plain = text.match(CHANNEL_ID_RE);
  return plain ? plain[0] : null;
}

export function normalizeChannelInput(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (/^UC[\w-]{22}$/.test(value)) {
    return `https://www.youtube.com/channel/${value}`;
  }
  if (value.startsWith("@")) {
    return `https://www.youtube.com/${value}`;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  if (value.includes("youtube.com") || value.includes("youtu.be")) {
    return `https://${value}`;
  }
  return `https://www.youtube.com/@${value.replace(/^@/, "")}`;
}

function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]+)"`,
    "i",
  );
  const match = html.match(pattern);
  if (match) return decodeXml(match[1]!);
  const patternAlt = new RegExp(
    `<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="${property}"`,
    "i",
  );
  const alt = html.match(patternAlt);
  return alt ? decodeXml(alt[1]!) : null;
}

function isCertError(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${error.message} ${String("cause" in error ? error.cause : "")}`
      : String(error);
  return /certificate|UNABLE_TO_VERIFY|cert/i.test(text);
}

async function fetchWithCurl(url: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "curl",
    ["-sS", "-L", "-A", UA, "--max-time", "25", url],
    { maxBuffer: 12 * 1024 * 1024 },
  );
  return stdout;
}

async function fetchYoutube(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es,en;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`YouTube respondió ${response.status}`);
    }
    return response.text();
  } catch (error) {
    if (!isCertError(error)) {
      const cause =
        error instanceof Error && "cause" in error
          ? String(error.cause)
          : error instanceof Error
            ? error.message
            : "error de red";
      throw new Error(`No pude leer YouTube. ${cause}`);
    }
    try {
      return await fetchWithCurl(url);
    } catch {
      throw new Error("No pude leer YouTube. Revisa la red.");
    }
  }
}


function extractAvatar(html: string): string | null {
  const patterns = [
    /"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/,
    /"channelAvatar":\{"thumbnails":\[\{"url":"([^"]+)"/,
    /"(?:url|image)":"(https:\\?\/\\?\/yt3\.(?:ggpht|googleusercontent)\.com[^"]+)"/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanMediaUrl(match[1]);
  }
  const og = metaContent(html, "og:image");
  return og ? cleanMediaUrl(og) : null;
}

export async function resolveChannel(input: string): Promise<Channel> {
  const url = normalizeChannelInput(input);
  if (!url) {
    throw new Error("Pega una URL de canal o un @handle.");
  }

  const html = await fetchYoutube(url);
  const id = extractChannelId(html) ?? extractChannelId(url);
  if (!id) {
    throw new Error("No encontré el canal. Prueba el ID UCxxxx.");
  }

  const title =
    metaContent(html, "og:title")?.replace(/\s+- YouTube$/, "") ??
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s+- YouTube$/, "") ??
    "Canal";
  const thumbnail = extractAvatar(html);
  const canonical =
    html.match(
      /<link rel="canonical" href="(https:\/\/www\.youtube\.com\/[^"]+)"/i,
    )?.[1] ?? `https://www.youtube.com/channel/${id}`;

  return {
    id,
    name: decodeXml(title).trim() || "Canal",
    url: canonical,
    thumbnail,
    addedAt: new Date().toISOString(),
  };
}

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1]!.trim()) : "";
}

export function parseRss(xml: string): Video[] {
  const chunks = xml.split("<entry>").slice(1);
  const videos: Video[] = [];

  for (const chunk of chunks) {
    const videoId = tag(chunk, "yt:videoId");
    if (!videoId) continue;
    const channelId = tag(chunk, "yt:channelId");
    const title = tag(chunk, "title");
    const published = tag(chunk, "published");
    const channelName = tag(chunk, "name") || "Canal";
    const description = tag(chunk, "media:description");
    videos.push({
      videoId,
      channelId,
      channelName,
      title,
      published,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      description,
    });
  }

  return videos;
}

export async function fetchChannelFeed(
  channelId: string,
  fresh = false,
): Promise<Video[]> {
  const cached = rssCache.get(channelId);
  if (!fresh && cached && Date.now() - cached.at < RSS_TTL_MS) {
    return cached.videos;
  }

  const xml = await fetchYoutube(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
  );
  const videos = parseRss(xml);
  rssCache.set(channelId, { at: Date.now(), videos });
  return videos;
}

export async function fetchMergedFeed(
  channelIds: string[],
  fresh = false,
): Promise<Video[]> {
  const unique = [...new Set(channelIds.filter((id) => CHANNEL_ID_RE.test(id)))];
  const batches: Video[][] = [];
  const limit = 4;

  for (let i = 0; i < unique.length; i += limit) {
    const slice = unique.slice(i, i + limit);
    const part = await Promise.all(
      slice.map(async (id) => {
        try {
          return await fetchChannelFeed(id, fresh);
        } catch {
          return [] as Video[];
        }
      }),
    );
    batches.push(...part);
  }

  const seen = new Set<string>();
  const merged: Video[] = [];
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
