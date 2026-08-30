# soundspace

Soundspace is an expressive Spotify web player. This repository contains the
first vertical slice: Spotify authentication, browser playback, normalized
playback state, track selection, and a deliberately small player surface.

The semantic timeline, concept graph, database-backed song semantics, and
Three.js world are intentionally not part of this slice.

## What runs

This is an npm-workspaces monorepo:

- `apps/web` — Vite, React, and TypeScript
- `apps/api` — Fastify and TypeScript
- `packages/shared` — the provider-independent `PlaybackState` and
  `PlaybackProvider` contracts

Spotify remains authoritative for the current track, playback position,
duration, and playing state. The web app samples state from the Spotify Web
Playback SDK; it does not create or interpolate a second audio clock.

## Prerequisites

- Node.js 22 or newer
- A Spotify Premium account
- A Spotify developer app owned by a Premium account
- Your Spotify account added to the app's test-user allowlist when the app is in
  development mode

Spotify currently limits new development-mode apps to five allowlisted users.
An unlisted user may complete the login screen but receive `403` responses from
the APIs afterward.

## Spotify Dashboard setup

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and create an app.
2. Open the app's settings and add this redirect URI exactly:

   ```text
   http://127.0.0.1:5173/api/auth/callback
   ```

   Spotify permits plain HTTP for explicit loopback addresses. Do not replace
   `127.0.0.1` with `localhost`; the redirect URI used in the Dashboard,
   authorization request, and token exchange must match exactly.
3. In **Settings → Users Management**, add the Spotify name and email of every
   account that will test the app.
4. Copy the client ID and client secret into the API environment file described
   below. Never place the client secret in a `VITE_` variable or browser code.

The app requests these scopes:

```text
streaming
user-read-email
user-read-private
user-read-playback-state
user-modify-playback-state
```

## Local setup

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm install
```

Fill in `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in
`apps/api/.env`. Replace `COOKIE_SECRET` with a random value, for example:

```bash
openssl rand -base64 32
```

Then start both workspaces:

```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The Vite server proxies
`/api` to Fastify at `http://127.0.0.1:8787`, which lets the OAuth callback and
signed session cookie stay on one browser origin during local development.

## Verification

The repository-level gates are:

```bash
npm run typecheck
npm run build
```

The live acceptance path is:

1. Open the Vite URL and choose **Connect Spotify**.
2. Complete Spotify authorization and return to Soundspace.
3. Wait for the status to read **browser playback online**.
4. Press play on the preselected “melancholy” result, or open **choose track**
   and select a search result.
5. Confirm real Spotify audio, current-track metadata, advancing Spotify-derived
   position, play/pause, seek, previous/next, and volume.

## Security and session boundary

Fastify owns the OAuth code exchange, client secret, refresh token, and refresh
behavior. The browser receives only the short-lived user access token that the
Spotify Web Playback SDK requires. The session identifier is stored in a signed,
HTTP-only, same-site cookie.

For this local slice, session records live in API memory. Restarting Fastify
therefore signs the user out. Production deployment will need a persistent,
shared session store before horizontal scaling.

## Spotify platform constraint

Spotify's current Web Playback SDK policy prohibits synchronizing Spotify audio
with visual media and altering Spotify content. This basic player limits its
visual response to ordinary transport/status feedback. Before implementing the
planned semantic world, confirm that the intended experience complies with
Spotify's platform rules or use an audio source for which the project has the
required synchronization rights.

Official references:

- [Authorization Code flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow)
- [Redirect URI rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Web Playback SDK player tutorial](https://developer.spotify.com/documentation/web-playback-sdk/howtos/web-app-player)
- [Web Playback SDK terms and restrictions](https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started)
- [Development-mode quota rules](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
