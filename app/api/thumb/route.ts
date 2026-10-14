import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isYoutubeMediaUrl } from "@/lib/media";

const execFileAsync = promisify(execFile);

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("u") ?? "";
  if (!isYoutubeMediaUrl(url)) {
    return new Response("URL no permitida", { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "image/*" },
      redirect: "follow",
      cache: "force-cache",
    });
    if (upstream.ok) {
      const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
      return new Response(upstream.body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  } catch {
    // Node a veces falla el certificado. Usa curl.
  }

  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sS", "-L", "--max-time", "20", url],
      { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 },
    );
    return new Response(new Uint8Array(stdout), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("No pude cargar la foto", { status: 502 });
  }
}
