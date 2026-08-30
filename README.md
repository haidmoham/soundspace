# soundspace

a small youtube-backed player.

the first slice does one thing: find a track, cache the youtube video id, play
it in the browser, and let the iframe player own the clock.

## shape

- `apps/web` — vite, react, youtube iframe player api
- `apps/api` — fastify, youtube data api, drizzle, sqlite
- `packages/shared` — playback, climate, weather, semantics, audio, and visual state

the web app samples `getCurrentTime()`, `getDuration()`, and
`getPlayerState()` from youtube. there is no second timer pretending to be the
audio clock.

the room has its own ambient climate before playback starts. once a track
begins, youtube progress samples the song's authored weather timeline. climate
sets the baseline, semantics decides what can appear, and audio features only
change how those things move. youtube does not expose pcm here, so the audio
feature contract stays neutral for now.

## setup

you need node 22+ and a youtube data api v3 key.

1. create a google cloud project.
2. enable youtube data api v3.
3. create a server api key and restrict it to youtube data api v3. use an ip
   restriction when the api has a stable outbound ip.
4. copy the env files:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

5. put the key in `apps/api/.env`:

   ```text
   YOUTUBE_API_KEY=...
   ```

don't put the key in a `VITE_` variable. search stays on the server.

then:

```bash
npm install
npm run dev
```

open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## what it does

`GET /api/youtube/resolve?artist=Driveways&title=Melancholy`

the api:

1. normalizes artist + title into a cache key.
2. checks sqlite first.
3. searches for `artist title official audio` on a miss.
4. filters for syndicated, embeddable videos and confirms embed status.
5. ranks the remaining results and caches the winner.

the response says whether it came from `cache` or `youtube`.

local sqlite data lives at `apps/api/.data/soundspace.sqlite` by default. set
`SOUNDSPACE_DATABASE_PATH` to move it.

## checks

```bash
npm run lint
npm run typecheck
npm run build
```

the live path is:

1. load the default driveways / melancholy fixture.
2. press play.
3. hear youtube audio.
4. pause and seek.
5. watch the displayed time follow the iframe player.
6. resolve the same track again and confirm `source: "cache"`.

## notes

- youtube search uses a server api key, not oauth.
- autoplay may be blocked. press play again if the browser asks for a gesture.
- an embeddable search result can still become unavailable later. the player
  reports iframe errors instead of inventing fallback playback.
- the cache stores soundspace's resolved mapping, not a copy of the youtube
  catalogue.

official references:

- [youtube search](https://developers.google.com/youtube/v3/docs/search/list)
- [youtube iframe player](https://developers.google.com/youtube/iframe_api_reference)
- [api key restrictions](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)
- [drizzle sqlite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
