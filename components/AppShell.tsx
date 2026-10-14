"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { channelInitial, timeAgo } from "@/lib/format";
import { mediaSrc } from "@/lib/media";
import {
  emptyStore,
  loadStore,
  saveStore,
  sameStore,
  subscribeStore,
  type FavStore,
} from "@/lib/storage";
import type { Channel, Video } from "@/lib/types";

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [store, setStore] = useState<FavStore>(emptyStore);
  const [videos, setVideos] = useState<Video[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Video | null>(null);
  const [ready, setReady] = useState(false);

  const channels = store.channels;
  const watched = store.watched;
  const hideWatched = store.hideWatched;

  const patchStore = useCallback((partial: Partial<FavStore>) => {
    setStore((current) => {
      const next = { ...current, ...partial };
      return sameStore(current, next) ? current : next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    void loadStore().then((loaded) => {
      if (!active) return;
      setStore(loaded);
      saveStore(loaded);
      setReady(true);
    });
    const unsubscribe = subscribeStore((incoming) => {
      setStore((current) => (sameStore(current, incoming) ? current : incoming));
      setReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveStore(store);
  }, [ready, store]);

  const loadFeed = useCallback(async (ids: string[], fresh = false) => {
    if (ids.length === 0) {
      setVideos([]);
      return;
    }
    setLoadingFeed(true);
    setError(null);
    try {
      const response = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelIds: ids, fresh }),
      });
      const data = (await response.json()) as {
        videos?: Video[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "No pude cargar el feed.");
      }
      setVideos(data.videos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude cargar el feed.");
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void loadFeed(channels.map((channel) => channel.id));
  }, [channels, loadFeed, ready]);

  const addChannel = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setAdding(true);
    setError(null);
    try {
      const response = await fetch("/api/channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = (await response.json()) as {
        channel?: Channel;
        error?: string;
      };
      if (!response.ok || !data.channel) {
        throw new Error(data.error ?? "No pude añadir el canal.");
      }
      const channel = data.channel;
      setStore((current) => {
        if (current.channels.some((item) => item.id === channel.id)) return current;
        return { ...current, channels: [channel, ...current.channels] };
      });
      setActiveChannelId(null);
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude añadir el canal.");
    } finally {
      setAdding(false);
    }
  }, []);

  useEffect(() => {
    const pending = searchParams.get("add");
    if (!pending || !ready) return;
    void addChannel(pending);
    router.replace("/");
  }, [addChannel, ready, router, searchParams]);

  const watchedSet = useMemo(() => new Set(watched), [watched]);

  const visibleVideos = useMemo(() => {
    let list = videos;
    if (activeChannelId) {
      list = list.filter((video) => video.channelId === activeChannelId);
    }
    if (hideWatched) {
      list = list.filter((video) => !watchedSet.has(video.videoId));
    }
    return list;
  }, [activeChannelId, hideWatched, videos, watchedSet]);

  const channelById = useMemo(() => {
    return new Map(channels.map((channel) => [channel.id, channel]));
  }, [channels]);

  function removeChannel(id: string) {
    patchStore({
      channels: channels.filter((channel) => channel.id !== id),
    });
    if (activeChannelId === id) setActiveChannelId(null);
    if (selected?.channelId === id) setSelected(null);
  }

  function toggleWatched(videoId: string) {
    patchStore({
      watched: watchedSet.has(videoId)
        ? watched.filter((id) => id !== videoId)
        : [...watched, videoId],
    });
  }

  function openVideo(video: Video) {
    setSelected(video);
    if (!watchedSet.has(video.videoId)) {
      patchStore({ watched: [...watched, video.videoId] });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-neutral-200 bg-white px-4">
        <Logo />
        <form
          className="mx-auto flex w-full max-w-xl"
          onSubmit={(event) => {
            event.preventDefault();
            void addChannel(url);
          }}
        >
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Buscar o pegar URL de canal"
            className="h-10 min-w-0 flex-1 rounded-l-full border border-neutral-300 bg-white px-4 text-sm outline-none placeholder:text-neutral-500 focus:border-neutral-800"
          />
          <button
            type="submit"
            disabled={adding}
            className="h-10 rounded-r-full border border-l-0 border-neutral-300 bg-neutral-100 px-5 text-sm font-medium disabled:opacity-60"
          >
            {adding ? "…" : "Añadir"}
          </button>
        </form>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-neutral-200 lg:h-[calc(100dvh-56px)] lg:w-60 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-base font-medium">Favoritos</p>
          </div>
          <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
            <button
              type="button"
              onClick={() => setActiveChannelId(null)}
              className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                activeChannelId === null
                  ? "bg-neutral-100 font-medium"
                  : "hover:bg-neutral-100"
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-[10px]">
                All
              </span>
              Todos
            </button>
            {channels.map((channel) => (
              <div
                key={channel.id}
                className={`group mb-0.5 flex items-center rounded-lg ${
                  activeChannelId === channel.id
                    ? "bg-neutral-100"
                    : "hover:bg-neutral-100"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveChannelId(channel.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
                >
                  <ChannelPhoto channel={channel} size={24} />
                  <span className="truncate text-sm">{channel.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeChannel(channel.id)}
                  className="mr-2 rounded-full px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200 lg:opacity-0 lg:group-hover:opacity-100"
                  aria-label={`Quitar ${channel.name}`}
                >
                  ×
                </button>
              </div>
            ))}
            {ready && channels.length === 0 ? (
              <p className="px-3 py-4 text-sm text-neutral-500">
                Añade un canal con la barra de búsqueda.
              </p>
            ) : null}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col lg:h-[calc(100dvh-56px)]">
          {error ? (
            <p className="px-6 py-3 text-sm text-red-600">{error}</p>
          ) : null}

          {selected ? (
            <section className="bg-black">
              <div className="mx-auto max-w-5xl px-4 py-4">
                <div className="aspect-video overflow-hidden rounded-xl bg-black">
                  <iframe
                    title={selected.title}
                    src={`https://www.youtube.com/embed/${selected.videoId}?autoplay=1`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              </div>
            </section>
          ) : null}

          {selected ? (
            <div className="flex items-start justify-between gap-4 px-6 pt-4">
              <div>
                <h2 className="text-xl font-medium leading-snug">{selected.title}</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  {selected.channelName} · {timeAgo(selected.published)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium"
              >
                Cerrar
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <h1 className="text-xl font-bold">
              {activeChannelId
                ? channelById.get(activeChannelId)?.name ?? "Canal"
                : "Más recientes"}
            </h1>
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={hideWatched}
                  onChange={(event) =>
                    patchStore({ hideWatched: event.target.checked })
                  }
                />
                Ocultar vistos
              </label>
              <button
                type="button"
                onClick={() =>
                  void loadFeed(
                    channels.map((channel) => channel.id),
                    true,
                  )
                }
                disabled={loadingFeed || channels.length === 0}
                className="text-sm font-medium text-neutral-600 hover:text-neutral-950 disabled:opacity-50"
              >
                {loadingFeed ? "Cargando..." : "Actualizar"}
              </button>
            </div>
          </div>

          <section className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-8">
            {ready && channels.length === 0 ? (
              <EmptyState />
            ) : visibleVideos.length === 0 && !loadingFeed ? (
              <p className="text-sm text-neutral-500">
                {hideWatched
                  ? "No hay videos sin ver."
                  : "No hay videos en este filtro."}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                {visibleVideos.map((video) => {
                  const channel = channelById.get(video.channelId);
                  const isWatched = watchedSet.has(video.videoId);
                  return (
                    <li key={video.videoId} className={isWatched ? "opacity-55" : ""}>
                      <div className="w-full text-left">
                        <button
                          type="button"
                          onClick={() => openVideo(video)}
                          className="block w-full text-left"
                        >
                          <span className="relative block aspect-video overflow-hidden rounded-xl bg-neutral-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={mediaSrc(video.thumbnail) ?? video.thumbnail}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                            {isWatched ? (
                              <span className="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
                                Visto
                              </span>
                            ) : null}
                          </span>
                        </button>
                        <span className="mt-3 flex gap-3">
                          {channel ? (
                            <ChannelPhoto channel={channel} size={36} />
                          ) : (
                            <span className="h-9 w-9 shrink-0 rounded-full bg-neutral-200" />
                          )}
                          <span className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => openVideo(video)}
                              className="line-clamp-2 text-left text-sm font-medium leading-5"
                            >
                              {video.title}
                            </button>
                            <span className="mt-1 block truncate text-sm text-neutral-600">
                              {video.channelName}
                            </span>
                            <span className="block text-sm text-neutral-600">
                              {timeAgo(video.published)}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleWatched(video.videoId)}
                              className="mt-1 text-xs font-medium text-neutral-500 hover:text-neutral-950"
                            >
                              {isWatched ? "Marcar no visto" : "Marcar visto"}
                            </button>
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/fube-icon.png" alt="" width={28} height={28} className="rounded-md" />
      <span className="text-[20px] font-bold tracking-tight">Fube</span>
    </div>
  );
}

function ChannelPhoto({
  channel,
  size,
}: {
  channel: Channel;
  size: number;
}) {
  const src = mediaSrc(channel.thumbnail);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-medium"
        style={{ width: size, height: size }}
      >
        {channelInitial(channel.name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <p className="text-xl font-medium">Tus canales favoritos, sin algoritmo.</p>
      <p className="mt-2 text-sm text-neutral-500">
        Pega un @handle o una URL de YouTube en la barra de búsqueda.
      </p>
    </div>
  );
}
