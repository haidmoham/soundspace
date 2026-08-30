import type { Page } from "@playwright/test";
import type { SongCorpus, SongCorpusCase } from "./song-corpus";

const artwork = (label: string) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <defs><linearGradient id="weather" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#241728"/><stop offset="1" stop-color="#b47b78"/></linearGradient></defs>
    <rect width="640" height="640" fill="url(#weather)"/>
    <circle cx="480" cy="155" r="88" fill="#ead9bb" fill-opacity=".62"/>
    <path d="M0 440 Q150 350 310 435 T640 410 V640 H0Z" fill="#4d304d"/>
    <text x="44" y="570" fill="#f3e5cf" font-family="serif" font-size="34">${label}</text>
  </svg>`;

function resolvePayload(songCase: SongCorpusCase) {
  return { source: "cache", track: songCase.track };
}

export async function installSoundspaceRoutes(page: Page, corpus: SongCorpus): Promise<void> {
  const defaultSongCase = corpus.tracks[0];
  if (!defaultSongCase) throw new Error("song corpus must contain a default track");

  await page.route("**/api/youtube/resolve?**", async (route) => {
    await route.fulfill({ contentType: "application/json", json: resolvePayload(defaultSongCase) });
  });

  await page.route("**/api/youtube/search?**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get("q")?.toLocaleLowerCase("en-US") || "";
    const exact = corpus.tracks.filter((songCase) =>
      songCase.query.toLocaleLowerCase("en-US") === query,
    );
    const tracks = (exact.length > 0 ? exact : corpus.tracks).map((songCase) => songCase.track);
    await route.fulfill({ contentType: "application/json", json: { tracks } });
  });

  await page.route("https://fixtures.soundspace.test/artwork/**", async (route) => {
    const label = new URL(route.request().url()).pathname.split("/").at(-1) || "soundspace";
    await route.fulfill({ body: artwork(label), contentType: "image/svg+xml" });
  });
}
