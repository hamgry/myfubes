import { NextResponse } from "next/server";
import { fetchMergedFeed } from "@/lib/youtube-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      channelIds?: string[];
      fresh?: boolean;
    };
    const channelIds = Array.isArray(body.channelIds) ? body.channelIds : [];
    if (channelIds.length === 0) {
      return NextResponse.json({ videos: [] });
    }
    const videos = await fetchMergedFeed(channelIds, Boolean(body.fresh));
    return NextResponse.json({ videos });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No pude cargar el feed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
