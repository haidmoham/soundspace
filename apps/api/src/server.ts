import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type { AuthStatus, SpotifyTrackSummary } from "@soundspace/shared";
import dotenv from "dotenv";
import Fastify, {
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const SESSION_COOKIE = "soundspace_session";
const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const REQUIRED_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
];

type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};

type Session = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  oauthState?: string;
  oauthStateCreatedAt?: number;
  tokens?: SpotifyTokens;
};

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

type SpotifyProfileResponse = {
  display_name?: string | null;
  id: string;
  product?: string;
};

type SpotifySearchResponse = {
  tracks?: {
    items: Array<{
      id: string;
      uri: string;
      name: string;
      artists: Array<{ name: string }>;
      album: {
        name: string;
        images: Array<{ url: string; width: number; height: number }>;
      };
    }>;
  };
};

const env = {
  clientId: process.env.SPOTIFY_CLIENT_ID?.trim() ?? "",
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? "",
  redirectUri:
    process.env.SPOTIFY_REDIRECT_URI?.trim() ??
    "http://127.0.0.1:5173/api/auth/callback",
  webOrigin: process.env.WEB_ORIGIN?.trim() ?? "http://127.0.0.1:5173",
  host: process.env.API_HOST?.trim() ?? "127.0.0.1",
  port: Number.parseInt(process.env.API_PORT ?? "8787", 10),
  cookieSecret:
    process.env.COOKIE_SECRET?.trim() ??
    "soundspace-local-only-cookie-secret-change-me",
  isProduction: process.env.NODE_ENV === "production",
};

const isSpotifyConfigured = Boolean(env.clientId && env.clientSecret);
const sessions = new Map<string, Session>();
const app = Fastify({ logger: true });

await app.register(cookie, { secret: env.cookieSecret });
await app.register(cors, {
  origin: env.webOrigin,
  credentials: true,
});

function newOpaqueValue(): string {
  return randomBytes(32).toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readSession(request: FastifyRequest): Session | undefined {
  const rawCookie = request.cookies[SESSION_COOKIE];
  if (!rawCookie) return undefined;

  const unsigned = request.unsignCookie(rawCookie);
  if (!unsigned.valid) return undefined;

  const session = sessions.get(unsigned.value);
  if (session) session.lastSeenAt = Date.now();
  return session;
}

function createSession(reply: FastifyReply): Session {
  const session: Session = {
    id: randomUUID(),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };

  sessions.set(session.id, session);
  reply.setCookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: env.isProduction,
    signed: true,
  });

  return session;
}

function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Session | undefined {
  const session = readSession(request);
  if (!session?.tokens) {
    void reply.code(401).send({ error: "spotify_auth_required" });
    return undefined;
  }

  return session;
}

function requireSpotifyConfig(reply: FastifyReply): boolean {
  if (isSpotifyConfigured) return true;

  void reply.code(503).send({
    error: "spotify_not_configured",
    message: "Add Spotify credentials to apps/api/.env and restart the API.",
  });
  return false;
}

async function tokenRequest(
  body: URLSearchParams,
): Promise<SpotifyTokenResponse> {
  const basicCredentials = Buffer.from(
    `${env.clientId}:${env.clientSecret}`,
  ).toString("base64");
  const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicCredentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Spotify token exchange failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as SpotifyTokenResponse;
}

function storeTokens(
  response: SpotifyTokenResponse,
  existingRefreshToken?: string,
): SpotifyTokens {
  const refreshToken = response.refresh_token ?? existingRefreshToken;
  if (!refreshToken) throw new Error("Spotify did not return a refresh token.");

  return {
    accessToken: response.access_token,
    refreshToken,
    expiresAt: Date.now() + response.expires_in * 1_000,
    scope: response.scope,
  };
}

async function refreshAccessToken(
  session: Session,
  force = false,
): Promise<string> {
  const tokens = session.tokens;
  if (!tokens) throw new Error("Spotify authentication required.");

  if (!force && tokens.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
    return tokens.accessToken;
  }

  const response = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }),
  );
  session.tokens = storeTokens(response, tokens.refreshToken);
  return session.tokens.accessToken;
}

async function spotifyFetch(
  session: Session,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const request = async (accessToken: string) =>
    fetch(`${SPOTIFY_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    });

  let response = await request(await refreshAccessToken(session));
  if (response.status === 401) {
    response = await request(await refreshAccessToken(session, true));
  }
  return response;
}

async function spotifyError(
  reply: FastifyReply,
  response: Response,
): Promise<FastifyReply> {
  const detail = await response.text();
  const status = response.status >= 400 && response.status < 600
    ? response.status
    : 502;

  return reply.code(status).send({
    error: "spotify_request_failed",
    status: response.status,
    detail,
  });
}

app.get("/api/health", async () => ({
  ok: true,
  spotifyConfigured: isSpotifyConfigured,
}));

app.get("/api/auth/login", async (_request, reply) => {
  if (!requireSpotifyConfig(reply)) return;

  const session = createSession(reply);
  session.oauthState = newOpaqueValue();
  session.oauthStateCreatedAt = Date.now();

  const authorizeUrl = new URL(`${SPOTIFY_ACCOUNTS_URL}/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: env.clientId,
    scope: REQUIRED_SCOPES.join(" "),
    redirect_uri: env.redirectUri,
    state: session.oauthState,
    show_dialog: "true",
  }).toString();

  return reply.redirect(authorizeUrl.toString());
});

app.get<{
  Querystring: { code?: string; error?: string; state?: string };
}>("/api/auth/callback", async (request, reply) => {
  const session = readSession(request);
  const { code, error, state } = request.query;

  if (error) {
    return reply.redirect(`${env.webOrigin}/?auth=denied`);
  }

  const stateIsFresh = session?.oauthStateCreatedAt
    ? Date.now() - session.oauthStateCreatedAt < 10 * 60 * 1_000
    : false;
  const stateMatches = Boolean(
    session?.oauthState && state && safeEqual(session.oauthState, state),
  );

  if (!session || !code || !stateIsFresh || !stateMatches) {
    return reply.redirect(`${env.webOrigin}/?auth=invalid_state`);
  }

  try {
    const response = await tokenRequest(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.redirectUri,
      }),
    );
    session.tokens = storeTokens(response);
    delete session.oauthState;
    delete session.oauthStateCreatedAt;
    return reply.redirect(`${env.webOrigin}/?auth=success`);
  } catch (callbackError) {
    request.log.error(callbackError);
    return reply.redirect(`${env.webOrigin}/?auth=token_error`);
  }
});

app.get("/api/auth/status", async (request): Promise<AuthStatus> => {
  const session = readSession(request);
  if (!session?.tokens) {
    return {
      authenticated: false,
      configured: isSpotifyConfigured,
      profile: null,
    };
  }

  const response = await spotifyFetch(session, "/me");
  if (!response.ok) {
    request.log.warn({ status: response.status }, "Spotify profile request failed");
    return {
      authenticated: false,
      configured: isSpotifyConfigured,
      profile: null,
    };
  }

  const profile = (await response.json()) as SpotifyProfileResponse;
  return {
    authenticated: true,
    configured: isSpotifyConfigured,
    profile: {
      displayName: profile.display_name || profile.id,
      product: profile.product ?? "unknown",
    },
  };
});

app.post("/api/auth/logout", async (request, reply) => {
  const session = readSession(request);
  if (session) sessions.delete(session.id);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return reply.code(204).send();
});

app.get("/api/spotify/token", async (request, reply) => {
  const session = requireSession(request, reply);
  if (!session) return;

  const accessToken = await refreshAccessToken(session);
  return {
    accessToken,
    expiresAt: session.tokens?.expiresAt,
  };
});

app.get<{ Querystring: { q?: string } }>(
  "/api/spotify/search",
  async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const query = request.query.q?.trim() || 'track:"melancholy" artist:driveways';
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: "8",
    });
    const response = await spotifyFetch(session, `/search?${params.toString()}`);
    if (!response.ok) return spotifyError(reply, response);

    const data = (await response.json()) as SpotifySearchResponse;
    const tracks: SpotifyTrackSummary[] = (data.tracks?.items ?? []).map(
      (track) => ({
        id: track.id,
        uri: track.uri,
        title: track.name,
        artists: track.artists.map((artist) => artist.name),
        album: track.album.name,
        artworkUrl: track.album.images[0]?.url,
      }),
    );

    return { tracks };
  },
);

app.post<{ Body: { deviceId?: string } }>(
  "/api/spotify/player/transfer",
  async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const deviceId = request.body?.deviceId?.trim();
    if (!deviceId) {
      return reply.code(400).send({ error: "device_id_required" });
    }

    const response = await spotifyFetch(session, "/me/player", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    });
    if (!response.ok) return spotifyError(reply, response);
    return reply.code(204).send();
  },
);

app.post<{ Body: { deviceId?: string; uri?: string } }>(
  "/api/spotify/player/play",
  async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const deviceId = request.body?.deviceId?.trim();
    const uri = request.body?.uri?.trim();
    if (!deviceId || !uri?.startsWith("spotify:track:")) {
      return reply.code(400).send({ error: "valid_device_and_track_required" });
    }

    const params = new URLSearchParams({ device_id: deviceId });
    const response = await spotifyFetch(
      session,
      `/me/player/play?${params.toString()}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [uri] }),
      },
    );
    if (!response.ok) return spotifyError(reply, response);
    return reply.code(204).send();
  },
);

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const message = env.isProduction
    ? "Unexpected server error."
    : error instanceof Error
      ? error.message
      : "Unknown server error.";
  return reply.code(500).send({ error: "server_error", message });
});

const sessionCleanup = setInterval(() => {
  const staleBefore = Date.now() - SESSION_MAX_AGE_SECONDS * 1_000;
  for (const [id, session] of sessions) {
    if (session.lastSeenAt < staleBefore) sessions.delete(id);
  }
}, 60 * 60 * 1_000);
sessionCleanup.unref();

try {
  await app.listen({ host: env.host, port: env.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
