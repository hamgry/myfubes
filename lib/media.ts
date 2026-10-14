const HOSTS = new Set([
  "i.ytimg.com",
  "i9.ytimg.com",
  "yt3.ggpht.com",
  "yt3.googleusercontent.com",
  "img.youtube.com",
]);

export function isYoutubeMediaUrl(url: string): boolean {
  try {
    return HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function mediaSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isYoutubeMediaUrl(url)) return url;
  return `/api/thumb?u=${encodeURIComponent(url)}`;
}

export function cleanMediaUrl(raw: string): string {
  return raw
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
}
