import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { YouTubeResolvedTrack } from "@soundspace/shared";

export type SongCorpusCase = {
  caseId: string;
  playerAuthor: string;
  query: string;
  track: YouTubeResolvedTrack;
};

export type SongCorpus = {
  source?: {
    kind: string;
    label: string;
  };
  version: 1;
  tracks: SongCorpusCase[];
};

const SAMPLE_CORPUS_PATH = "e2e/fixtures/song-corpus.sample.json";

function requireText(value: string, field: string): void {
  assert.equal(value.length > 0, true, `${field} must not be empty`);
}

function validateCorpus(corpus: SongCorpus): SongCorpus {
  assert.equal(corpus.version, 1, "song corpus version must be 1");
  assert.equal(Array.isArray(corpus.tracks), true, "song corpus tracks must be an array");
  assert.equal(corpus.tracks.length > 0, true, "song corpus must contain at least one track");
  if (corpus.source) {
    requireText(corpus.source.kind, "source.kind");
    requireText(corpus.source.label, "source.label");
  }

  const caseIds = new Set<string>();
  for (const [index, songCase] of corpus.tracks.entries()) {
    const prefix = `tracks[${index}]`;
    requireText(songCase.caseId, `${prefix}.caseId`);
    assert.match(songCase.caseId, /^[a-z0-9-]+$/, `${prefix}.caseId must be slug-like`);
    assert.equal(caseIds.has(songCase.caseId), false, `${prefix}.caseId must be unique`);
    caseIds.add(songCase.caseId);
    requireText(songCase.query, `${prefix}.query`);
    requireText(songCase.playerAuthor, `${prefix}.playerAuthor`);
    requireText(songCase.track.id, `${prefix}.track.id`);
    requireText(songCase.track.uri, `${prefix}.track.uri`);
    requireText(songCase.track.title, `${prefix}.track.title`);
    assert.equal(songCase.track.provider, "youtube", `${prefix}.track.provider must be youtube`);
    requireText(songCase.track.youtubeVideoId, `${prefix}.track.youtubeVideoId`);
    assert.equal(songCase.track.artists.length > 0, true, `${prefix}.track.artists must not be empty`);
    for (const [artistIndex, artist] of songCase.track.artists.entries()) {
      requireText(artist, `${prefix}.track.artists[${artistIndex}]`);
    }
  }

  return corpus;
}

export function loadSongCorpus(): SongCorpus {
  const inputPath = process.env.SOUNDSPACE_SONG_CORPUS || SAMPLE_CORPUS_PATH;
  const absolutePath = resolve(process.cwd(), inputPath);
  // SAFETY: validateCorpus checks all fields that the E2E harness reads before returning the value.
  const corpus = JSON.parse(readFileSync(absolutePath, "utf8")) as SongCorpus;
  return validateCorpus(corpus);
}
