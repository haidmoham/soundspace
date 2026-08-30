import {
  EMPTY_PLAYBACK_STATE,
  type PlaybackProvider,
  type PlaybackState,
  type YouTubeResolvedTrack,
} from "@soundspace/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const IFRAME_API_URL = "https://www.youtube.com/iframe_api";
const SAMPLE_INTERVAL_MS = 250;

export type { YouTubeResolvedTrack } from "@soundspace/shared";

export type PlayerPhase = "idle" | "loading-api" | "ready" | "error";

type YouTubePlayerController = {
  error: string | null;
  phase: PlayerPhase;
  playbackState: PlaybackState;
  playerHostRef: (element: HTMLDivElement | null) => void;
  provider: PlaybackProvider;
  selectTrack(track: YouTubeResolvedTrack): Promise<void>;
};

let iframeApiPromise: Promise<YouTubePlayerConstructor> | undefined;

function loadIframeApi(): Promise<YouTubePlayerConstructor> {
  if (window.YT?.Player) return Promise.resolve(window.YT.Player);
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise((resolve, reject) => {
    const complete = () => {
      if (window.YT?.Player) {
        resolve(window.YT.Player);
        return;
      }
      reject(new Error("youtube player didn't load"));
    };

    window.onYouTubeIframeAPIReady = complete;

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${IFRAME_API_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("error", () => {
        reject(new Error("youtube player didn't load"));
      });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = IFRAME_API_URL;
    script.addEventListener("error", () => {
      reject(new Error("youtube player didn't load"));
    });
    document.head.append(script);
  });

  return iframeApiPromise;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

function playbackMilliseconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * 1_000)) : 0;
}

function displayArtist(videoAuthor: string | undefined, requestedArtist: string): string {
  if (!videoAuthor) return requestedArtist;

  const topicSuffix = " - Topic";
  if (requestedArtist.endsWith(topicSuffix)) return requestedArtist;

  const channelArtist = videoAuthor.endsWith(topicSuffix)
    ? videoAuthor.slice(0, -topicSuffix.length)
    : videoAuthor;
  return channelArtist.toLocaleLowerCase("en-US") ===
    requestedArtist.toLocaleLowerCase("en-US")
    ? requestedArtist
    : channelArtist;
}

function errorForPlayerCode(code: YouTubePlayerErrorEvent["data"]): string {
  switch (code) {
    case 2:
      return "youtube rejected this video";
    case 5:
      return "this video won't play here";
    case 100:
      return "this video is gone";
    case 101:
    case 150:
      return "this video can't be embedded";
    case 153:
      return "youtube couldn't verify this player";
  }
}

export function useYouTubePlayer(): YouTubePlayerController {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const selectedTrackRef = useRef<YouTubeResolvedTrack | null>(null);
  const stateRef = useRef<PlaybackState>(EMPTY_PLAYBACK_STATE);
  const [playerHost, setPlayerHost] = useState<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<PlayerPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    EMPTY_PLAYBACK_STATE,
  );

  const playerHostRef = useCallback((element: HTMLDivElement | null) => {
    setPlayerHost(element);
  }, []);

  const sampleState = useCallback(() => {
    const player = playerRef.current;
    const selectedTrack = selectedTrackRef.current;
    if (!player || !selectedTrack) return;

    const videoData = player.getVideoData();
    const videoMatchesSelection =
      videoData?.video_id === selectedTrack.youtubeVideoId;
    const durationSeconds = videoMatchesSelection ? player.getDuration() : 0;
    const positionSeconds = videoMatchesSelection ? player.getCurrentTime() : 0;
    const isPlaying = videoMatchesSelection && player.getPlayerState() === 1;
    const requestedArtist = selectedTrack.artists.join(", ");
    const artist = displayArtist(
      videoMatchesSelection ? videoData?.author : undefined,
      requestedArtist,
    );
    const videoId = selectedTrack.youtubeVideoId;
    const nextState: PlaybackState = {
      trackId: videoId,
      track: {
        ...selectedTrack,
        id: videoId,
        title: selectedTrack.title,
        artists: [artist],
        uri: videoId,
      },
      positionMs: playbackMilliseconds(positionSeconds),
      durationMs: playbackMilliseconds(durationSeconds),
      isPlaying,
    };
    stateRef.current = nextState;
    setPlaybackState(nextState);
  }, []);

  useEffect(() => {
    if (!playerHost) return;

    let disposed = false;
    let player: YouTubePlayer | null = null;
    const mountElement = document.createElement("div");
    playerHost.replaceChildren(mountElement);
    setPhase("loading-api");
    setError(null);

    void loadIframeApi()
      .then((Player) => {
        if (disposed || !mountElement.isConnected) return;
        player = new Player(mountElement, {
          height: 1,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          width: 1,
          events: {
            onAutoplayBlocked: () => {
              setError("press play again");
            },
            onError: (event) => {
              setError(errorForPlayerCode(event.data));
              sampleState();
            },
            onReady: (event) => {
              playerRef.current = event.target;
              event.target.setVolume(72);
              setPhase("ready");
              sampleState();
            },
            onStateChange: () => {
              sampleState();
            },
          },
        });
      })
      .catch((cause: Error) => {
        if (!disposed) {
          setError(cause.message);
          setPhase("error");
        }
      });

    return () => {
      disposed = true;
      player?.destroy();
      playerHost.replaceChildren();
      if (playerRef.current === player) playerRef.current = null;
      stateRef.current = EMPTY_PLAYBACK_STATE;
      setPlaybackState(EMPTY_PLAYBACK_STATE);
    };
  }, [playerHost, sampleState]);

  useEffect(() => {
    if (phase !== "ready") return;
    const intervalId = window.setInterval(sampleState, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [phase, sampleState]);

  const provider = useMemo<PlaybackProvider>(
    () => ({
      getState: () => stateRef.current,
      play: async () => {
        const player = playerRef.current;
        if (!player) throw new Error("still loading");
        player.playVideo();
        sampleState();
      },
      pause: async () => {
        const player = playerRef.current;
        if (!player) throw new Error("still loading");
        player.pauseVideo();
        sampleState();
      },
      seek: async (positionMs) => {
        const player = playerRef.current;
        if (!player) throw new Error("still loading");
        player.seekTo(Math.max(0, positionMs / 1_000), true);
        sampleState();
      },
      previous: async () => {
        const player = playerRef.current;
        if (!player) throw new Error("still loading");
        player.seekTo(0, true);
        sampleState();
      },
      next: async () => {
        throw new Error("no queue yet");
      },
      setVolume: async (volume) => {
        const player = playerRef.current;
        if (!player) throw new Error("still loading");
        player.setVolume(Math.round(clamp(volume, 0, 1) * 100));
      },
    }),
    [sampleState],
  );

  const selectTrack = useCallback(async (track: YouTubeResolvedTrack) => {
    const player = playerRef.current;
    if (!player) throw new Error("still loading");
    selectedTrackRef.current = track;
    setError(null);
    const nextState: PlaybackState = {
      trackId: track.youtubeVideoId,
      track,
      positionMs: 0,
      durationMs: 0,
      isPlaying: false,
    };
    stateRef.current = nextState;
    setPlaybackState(nextState);
    player.cueVideoById(track.youtubeVideoId);
  }, []);

  return {
    error,
    phase,
    playbackState,
    playerHostRef,
    provider,
    selectTrack,
  };
}
