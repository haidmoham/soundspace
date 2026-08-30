import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const DEFAULT_OUTPUT = "e2e/fixtures/song-corpus.local.json";

function usage() {
  return [
    "usage: npm run corpus:spotify -- <YourLibrary.json|exportify.csv> [output.json]",
    "",
    `default output: ${DEFAULT_OUTPUT}`,
    "the output is ignored by git and omits spotify account and playlist fields.",
  ].join("\n");
}

function text(value) {
  return String(value || "").trim();
}

function first(row, names) {
  for (const name of names) {
    const value = text(row?.[name]);
    if (value) return value;
  }
  return "";
}

function parseCsv(input) {
  const rows = [];
  let cell = "";
  let quoted = false;
  let row = [];

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  const [headers = [], ...values] = rows;
  return values.map((cells) => Object.fromEntries(
    headers.map((header, index) => [header.trim(), cells[index] || ""]),
  ));
}

function fromExportify(input) {
  return parseCsv(input).map((row) => ({
    album: first(row, ["Album Name", "Album", "album"]),
    artist: first(row, ["Artist Name(s)", "Artist Name", "Artist", "artist"]),
    title: first(row, ["Track Name", "Track", "title"]),
  }));
}

function fromYourLibrary(input) {
  const data = JSON.parse(input);
  const tracks = Array.isArray(data) ? data : data?.tracks;
  if (!Array.isArray(tracks)) {
    throw new Error("expected a Spotify YourLibrary.json object with a tracks array");
  }
  return tracks.map((row) => ({
    album: first(row, ["album", "albumName", "Album Name"]),
    artist: first(row, ["artist", "artistName", "Artist Name"]),
    title: first(row, ["track", "trackName", "Track Name"]),
  }));
}

function fixtureId(artist, title) {
  return `local-${createHash("sha256").update(`${artist}\u0000${title}`).digest("hex").slice(0, 16)}`;
}

function caseId(artist, title, fixtureTrackId) {
  const slug = `${artist}-${title}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${slug || "song"}-${fixtureTrackId.slice(-6)}`;
}

function toCorpus(rows) {
  const unique = new Map();
  for (const row of rows) {
    const artist = text(row.artist);
    const title = text(row.title);
    if (!artist || !title) continue;
    const album = text(row.album);
    const id = fixtureId(artist, title);
    unique.set(id, {
      caseId: caseId(artist, title, id),
      playerAuthor: artist,
      query: `${artist} ${title}`,
      track: {
        album,
        artists: [artist],
        id,
        provider: "youtube",
        title,
        uri: id,
        youtubeVideoId: id,
      },
    });
  }
  return {
    source: { kind: "spotify-export", label: "private Spotify export" },
    version: 1,
    tracks: [...unique.values()],
  };
}

const [, , inputArgument, outputArgument = DEFAULT_OUTPUT] = process.argv;
if (!inputArgument) {
  console.error(usage());
  process.exitCode = 1;
} else {
  const inputPath = resolve(process.cwd(), inputArgument);
  const outputPath = resolve(process.cwd(), outputArgument);
  const input = readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
  const rows = extname(inputPath).toLocaleLowerCase("en-US") === ".csv"
    ? fromExportify(input)
    : fromYourLibrary(input);
  const corpus = toCorpus(rows);
  if (corpus.tracks.length === 0) {
    throw new Error("the Spotify export did not contain tracks with both artist and title");
  }
  writeFileSync(outputPath, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
  console.log(`wrote ${corpus.tracks.length} sanitized song cases to ${outputPath}`);
}
