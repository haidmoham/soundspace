import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const youtubeTrackCache = sqliteTable("youtube_track_cache", {
  cacheKey: text("cache_key").primaryKey(),
  artist: text("artist").notNull(),
  title: text("title").notNull(),
  youtubeVideoId: text("youtube_video_id").notNull(),
  displayTitle: text("display_title").notNull(),
  channelTitle: text("channel_title").notNull(),
  artworkUrl: text("artwork_url"),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }).notNull(),
});
