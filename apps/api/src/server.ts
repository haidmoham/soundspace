import cors from "@fastify/cors";
import type { YouTubeResolvedTrack } from "@soundspace/shared";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Fastify from "fastify";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { applyInitialMigration } from "./db/migrations/0000_initial.js";
import { youtubeTrackCache } from "./db/schema.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const LOCAL_DATABASE_PATH = fileURLToPath(
  new URL("../.data/soundspace.sqlite", import.meta.url),
);

const env = {
  youtubeApiKey: process.env.YOUTUBE_API_KEY?.trim() ?? "",
  databasePath: process.env.SOUNDSPACE_DATABASE_PATH?.trim() || LOCAL_DATABASE_PATH,
  webOrigin: process.env.WEB_ORIGIN?.trim() ?? "http://127.0.0.1:5173",
  host: process.env.API_HOST?.trim() ?? "127.0.0.1",
  port: Number.parseInt(process.env.API_PORT ?? "8787", 10),
  isProduction: process.env.NODE_ENV === "production",
};

type YouTubeCandidate = {
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  artworkUrl?: string;
};

type ResolverSource = "cache" | "youtube";

class YouTubeNotConfiguredError extends Error {
  constructor() {
    super("youtube data api is not configured.");
  }
}

const YouTubeThumbnailSchema = z.object({ url: z.string().url() });
const YouTubeThumbnailSetSchema = z.object({
  maxres: YouTubeThumbnailSchema.optional(),
  standard: YouTubeThumbnailSchema.optional(),
  high: YouTubeThumbnailSchema.optional(),
  medium: YouTubeThumbnailSchema.optional(),
  default: YouTubeThumbnailSchema.optional(),
});
const YouTubeSearchResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.object({ videoId: z.string().min(1) }),
      snippet: z.object({
        title: z.string().min(1),
        channelTitle: z.string().min(1).optional(),
        thumbnails: YouTubeThumbnailSetSchema.optional(),
      }),
    }),
  ),
});
const YouTubeVideoResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      status: z.object({ embeddable: z.boolean().optional() }),
    }),
  ),
});

type YouTubeThumbnailSet = z.infer<typeof YouTubeThumbnailSetSchema>;

function preferredArtworkUrl(
  thumbnails: YouTubeThumbnailSet | undefined,
): string | undefined {
  if (!thumbnails) return undefined;

  for (const thumbnail of [
    thumbnails.maxres,
    thumbnails.standard,
    thumbnails.high,
    thumbnails.medium,
    thumbnails.default,
  ]) {
    if (thumbnail) return thumbnail.url;
  }

  return undefined;
}

async function readSearchCandidates(response: Response): Promise<YouTubeCandidate[]> {
  const parsed = YouTubeSearchResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("youtube search returned an unexpected response shape.");
  }

  return parsed.data.items.map((item) => ({
    youtubeVideoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle ?? "YouTube",
    artworkUrl: preferredArtworkUrl(item.snippet.thumbnails),
  }));
}

async function readEmbeddableVideoIds(response: Response): Promise<Set<string>> {
  const parsed = YouTubeVideoResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("youtube video lookup returned an unexpected response shape.");
  }

  return new Set(
    parsed.data.items
      .filter((item) => item.status.embeddable)
      .map((item) => item.id),
  );
}

function normalizeQueryPart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function createCacheKey(artist: string, title: string): string {
  return `${normalizeQueryPart(artist)}\u001f${normalizeQueryPart(title)}`;
}

function scoreCandidate(
  candidate: YouTubeCandidate,
  artist: string,
  title: string,
): number {
  const normalizedArtist = normalizeQueryPart(artist);
  const normalizedTitle = normalizeQueryPart(title);
  const normalizedVideoTitle = normalizeQueryPart(candidate.title);
  const normalizedChannel = normalizeQueryPart(candidate.channelTitle);
  const searchableText = `${normalizedVideoTitle} ${normalizedChannel}`;
  let score = 0;

  if (normalizedVideoTitle.includes(normalizedTitle)) score += 24;
  if (normalizedVideoTitle.includes(normalizedArtist)) score += 20;
  if (normalizedChannel.includes(normalizedArtist)) score += 18;
  if (normalizedVideoTitle.includes("official audio")) score += 48;
  if (normalizedVideoTitle.includes("official")) score += 16;
  if (normalizedVideoTitle.includes("audio")) score += 12;
  if (normalizedChannel.includes("topic")) score += 16;

  for (const signal of ["cover", "reaction", "live", "slowed", "nightcore"]) {
    if (searchableText.includes(signal)) score -= 80;
  }
  for (const signal of ["remix", "sped up", "lyrics", "lyric video"]) {
    if (searchableText.includes(signal)) score -= 20;
  }

  return score;
}

function rankCandidates(
  candidates: YouTubeCandidate[],
  artist: string,
  title: string,
): YouTubeCandidate[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidate(candidate, artist, title),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.candidate);
}

function toResolvedTrack(
  artist: string,
  cached: {
    youtubeVideoId: string;
    displayTitle: string;
    channelTitle: string;
    artworkUrl: string | null;
  },
): YouTubeResolvedTrack {
  return {
    id: cached.youtubeVideoId,
    uri: cached.youtubeVideoId,
    youtubeVideoId: cached.youtubeVideoId,
    provider: "youtube",
    title: cached.displayTitle,
    artists: [artist],
    album: cached.channelTitle,
    artworkUrl: cached.artworkUrl ?? undefined,
  };
}

mkdirSync(dirname(env.databasePath), { recursive: true });
const sqlite = new Database(env.databasePath);
sqlite.pragma("journal_mode = WAL");
const database = drizzle(sqlite);
applyInitialMigration(database);

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: env.webOrigin,
});

async function findYouTubeCandidates(
  artist: string,
  title: string,
): Promise<YouTubeCandidate[]> {
  const query = `${artist} ${title} official audio`;
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.search = new URLSearchParams({
    key: env.youtubeApiKey,
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "10",
    videoEmbeddable: "true",
    videoSyndicated: "true",
  }).toString();

  const response = await fetch(searchUrl);
  if (!response.ok) {
    throw new Error(`youtube search failed with status ${response.status}.`);
  }

  const candidates = await readSearchCandidates(response);
  if (candidates.length === 0) return [];

  const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsUrl.search = new URLSearchParams({
    key: env.youtubeApiKey,
    part: "status",
    id: candidates.map((candidate) => candidate.youtubeVideoId).join(","),
  }).toString();

  const detailsResponse = await fetch(detailsUrl);
  if (!detailsResponse.ok) {
    throw new Error(
      `youtube video lookup failed with status ${detailsResponse.status}.`,
    );
  }

  const embeddableVideoIds = await readEmbeddableVideoIds(detailsResponse);
  return rankCandidates(
    candidates.filter((candidate) =>
      embeddableVideoIds.has(candidate.youtubeVideoId),
    ),
    artist,
    title,
  );
}

async function resolveTrack(
  artist: string,
  title: string,
): Promise<{ source: ResolverSource; track: YouTubeResolvedTrack }> {
  const cacheKey = createCacheKey(artist, title);
  const cached = database
    .select()
    .from(youtubeTrackCache)
    .where(eq(youtubeTrackCache.cacheKey, cacheKey))
    .get();

  if (cached) {
    return { source: "cache", track: toResolvedTrack(artist, cached) };
  }

  if (!env.youtubeApiKey) {
    throw new YouTubeNotConfiguredError();
  }

  const candidates = await findYouTubeCandidates(artist, title);
  const candidate = candidates[0];
  if (!candidate) {
    throw new Error("no embeddable, syndicated youtube result was found.");
  }

  database
    .insert(youtubeTrackCache)
    .values({
      cacheKey,
      artist: artist.trim(),
      title: title.trim(),
      youtubeVideoId: candidate.youtubeVideoId,
      displayTitle: candidate.title,
      channelTitle: candidate.channelTitle,
      artworkUrl: candidate.artworkUrl ?? null,
      resolvedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: youtubeTrackCache.cacheKey,
      set: {
        youtubeVideoId: candidate.youtubeVideoId,
        displayTitle: candidate.title,
        channelTitle: candidate.channelTitle,
        artworkUrl: candidate.artworkUrl ?? null,
        resolvedAt: new Date(),
      },
    })
    .run();

  return {
    source: "youtube",
    track: toResolvedTrack(artist, {
      youtubeVideoId: candidate.youtubeVideoId,
      displayTitle: candidate.title,
      channelTitle: candidate.channelTitle,
      artworkUrl: candidate.artworkUrl ?? null,
    }),
  };
}

app.get("/api/health", async () => ({
  ok: true,
  databaseReady: true,
  youtubeConfigured: Boolean(env.youtubeApiKey),
}));

app.get<{ Querystring: { artist?: string; title?: string } }>(
  "/api/youtube/resolve",
  async (request, reply) => {
    const artist = request.query.artist?.trim();
    const title = request.query.title?.trim();
    if (!artist || !title) {
      return reply.code(400).send({ error: "artist_and_title_required" });
    }

    try {
      return await resolveTrack(artist, title);
    } catch (error) {
      if (error instanceof YouTubeNotConfiguredError) {
        return reply.code(503).send({
          error: "youtube_not_configured",
          message: "add youtube_api_key to apps/api/.env and restart the api.",
        });
      }

      request.log.error(error);
      const message = error instanceof Error ? error.message : "youtube resolution failed.";
      return reply.code(502).send({ error: "youtube_resolution_failed", message });
    }
  },
);

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const message = env.isProduction
    ? "unexpected server error."
    : error instanceof Error
      ? error.message
      : "unknown server error.";
  return reply.code(500).send({ error: "server_error", message });
});

try {
  await app.listen({ host: env.host, port: env.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
