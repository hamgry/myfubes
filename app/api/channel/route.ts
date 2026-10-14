import { NextResponse } from "next/server";
import { resolveChannel } from "@/lib/youtube-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim() ?? "";
    if (!url) {
      return NextResponse.json(
        { error: "Pega una URL de canal o un @handle." },
        { status: 400 },
      );
    }
    const channel = await resolveChannel(url);
    return NextResponse.json({ channel });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No pude resolver el canal.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
