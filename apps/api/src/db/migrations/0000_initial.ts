import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

const INITIAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS youtube_track_cache (
    cache_key TEXT PRIMARY KEY NOT NULL,
    artist TEXT NOT NULL,
    title TEXT NOT NULL,
    youtube_video_id TEXT NOT NULL,
    display_title TEXT NOT NULL,
    channel_title TEXT NOT NULL,
    artwork_url TEXT,
    resolved_at INTEGER NOT NULL
  );
`;

export function applyInitialMigration(database: BetterSQLite3Database): void {
  database.run(sql.raw(INITIAL_SCHEMA));
}
