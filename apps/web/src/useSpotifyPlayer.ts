import {
  EMPTY_PLAYBACK_STATE,
  type PlaybackProvider,
  type PlaybackState,
} from "@soundspace/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SpotifySdkPlayer, SpotifySdkState } from "./spotify-sdk";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const SDK_URL = "https://sdk.scdn.co/spotify-player.js";

type PlayerPhase =
  | "idle"
  | "loading-sdk"
  | "connecting"
  | "ready"
  | "offline"
  | "error";

type PlayerError = {
  message: string;
};

type SpotifyPlayerController = {
  deviceId: string | null;
  error: string | null;
  phase: PlayerPhase;
  playbackState: PlaybackState;
  provider: PlaybackProvider;
  selectTrack(uri: string): Promise<void>;
};

let sdkPromise: Promise<NonNullable<typeof window.Spotify>> | undefined;

function loadSpotifySdk(): Promise<NonNullable<typeof window.Spotify>> {
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (window.Spotify) resolve(window.Spotify);
      else reject(new Error("Spotify SDK loaded without exposing its player."));
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_URL}"]`,
    );
    if (existingScript) {
      existingScript.addEventListener("error", () => {
        reject(new Error("Spotify Web Playback SDK failed to load."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.addEventListener("error", () => {
      reject(new Error("Spotify Web Playback SDK failed to load."));
    });
    document.head.append(script);
  });

  return sdkPromise;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}.`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function normalizeState(state: SpotifySdkState | null): PlaybackState {
  if (!state) return EMPTY_PLAYBACK_STATE;

  const track = state.track_window.current_track;
  return {
    trackId: track.id,
    track: {
      id: track.id,
      uri: track.uri,
      title: track.name,
      artists: track.artists.map((artist) => artist.name),
      album: track.album.name,
      artworkUrl: track.album.images[0]?.url,
    },
    positionMs: state.position,
    durationMs: state.duration || track.duration_ms,
    isPlaying: !state.paused,
  };
}

export function useSpotifyPlayer(
  authenticated: boolean,
): SpotifyPlayerController {
  const playerRef = useRef<SpotifySdkPlayer | null>(null);
  const stateRef = useRef<PlaybackState>(EMPTY_PLAYBACK_STATE);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<PlayerPhase>("idle");
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    EMPTY_PLAYBACK_STATE,
  );

  const updateState = (sdkState: SpotifySdkState | null) => {
    const normalized = normalizeState(sdkState);
    stateRef.current = normalized;
    setPlaybackState(normalized);
  };

  useEffect(() => {
    if (!authenticated) {
      playerRef.current?.disconnect();
      playerRef.current = null;
      setDeviceId(null);
      setPhase("idle");
      updateState(null);
      return;
    }

    let disposed = false;
    let player: SpotifySdkPlayer | undefined;

    const connect = async () => {
      try {
        setError(null);
        setPhase("loading-sdk");
        const sdk = await loadSpotifySdk();
        if (disposed) return;

        setPhase("connecting");
        player = new sdk.Player({
          name: "soundspace",
          volume: 0.72,
          getOAuthToken: (callback) => {
            void fetchJson<{ accessToken: string }>("/spotify/token")
              .then(({ accessToken }) => callback(accessToken))
              .catch((tokenError: unknown) => {
                const message =
                  tokenError instanceof Error
                    ? tokenError.message
                    : "Unable to refresh the Spotify player token.";
                setError(message);
                setPhase("error");
              });
          },
        });

        player.addListener("ready", (payload) => {
          const { device_id: readyDeviceId } = payload as unknown as {
            device_id: string;
          };
          playerRef.current = player ?? null;
          setDeviceId(readyDeviceId);
          setPhase("ready");

          void fetchJson<void>("/spotify/player/transfer", {
            method: "POST",
            body: JSON.stringify({ deviceId: readyDeviceId }),
          }).catch((transferError: unknown) => {
            const message =
              transferError instanceof Error
                ? transferError.message
                : "Spotify could not activate this browser.";
            setError(message);
          });
        });

        player.addListener("not_ready", () => {
          setPhase("offline");
          setDeviceId(null);
        });

        player.addListener("player_state_changed", (payload) => {
          updateState(payload as unknown as SpotifySdkState | null);
        });

        const reportSdkError = (payload: never) => {
          const { message } = payload as unknown as PlayerError;
          setError(message);
          setPhase("error");
        };
        player.addListener("initialization_error", reportSdkError);
        player.addListener("authentication_error", reportSdkError);
        player.addListener("account_error", reportSdkError);
        player.addListener("playback_error", reportSdkError);

        const connected = await player.connect();
        if (!connected) {
          throw new Error("Spotify declined the browser player connection.");
        }
      } catch (connectionError) {
        if (disposed) return;
        const message =
          connectionError instanceof Error
            ? connectionError.message
            : "The Spotify player could not start.";
        setError(message);
        setPhase("error");
      }
    };

    void connect();

    return () => {
      disposed = true;
      player?.disconnect();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [authenticated]);

  useEffect(() => {
    if (phase !== "ready" || !playbackState.isPlaying) return;

    const sampleSpotifyState = () => {
      void playerRef.current?.getCurrentState().then(updateState);
    };
    const interval = window.setInterval(sampleSpotifyState, 500);
    return () => window.clearInterval(interval);
  }, [phase, playbackState.isPlaying]);

  const provider = useMemo<PlaybackProvider>(
    () => ({
      getState: () => stateRef.current,
      play: async () => {
        await playerRef.current?.resume();
      },
      pause: async () => {
        await playerRef.current?.pause();
      },
      seek: async (positionMs) => {
        await playerRef.current?.seek(positionMs);
        const current = await playerRef.current?.getCurrentState();
        if (current !== undefined) updateState(current);
      },
      previous: async () => {
        await playerRef.current?.previousTrack();
      },
      next: async () => {
        await playerRef.current?.nextTrack();
      },
      setVolume: async (volume) => {
        await playerRef.current?.setVolume(volume);
      },
    }),
    [],
  );

  const selectTrack = async (uri: string) => {
    if (!deviceId) throw new Error("The browser player is not ready yet.");
    await fetchJson<void>("/spotify/player/play", {
      method: "POST",
      body: JSON.stringify({ deviceId, uri }),
    });
  };

  return {
    deviceId,
    error,
    phase,
    playbackState,
    provider,
    selectTrack,
  };
}
