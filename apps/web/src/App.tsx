import type { PlaybackTrack } from "@soundspace/shared";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type YouTubeResolvedTrack,
  useYouTubePlayer,
} from "./useYouTubePlayer";
import { AMBIENT_VISUAL_STATE } from "./atmosphere/ambient";
import { sampleMelancholyVisualState } from "./atmosphere/melancholy";
import { SoundspaceWorld } from "./world/SoundspaceWorld";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const DEFAULT_ARTIST = "driveways";
const DEFAULT_TITLE = "melancholy";

type ResolveSource = "cache" | "youtube";

type ResolveResponse = {
  source: ResolveSource;
  track: YouTubeResolvedTrack;
};

type ResolvePayload = {
  source: ResolveSource | string;
  track: YouTubeResolvedTrack;
};

type ApiErrorPayload = {
  message?: string;
};

function decodeResolveResponse(response: ResolvePayload): ResolveResponse {
  if (response.source !== "cache" && response.source !== "youtube") {
    throw new Error("unknown youtube source");
  }
  return { source: response.source, track: response.track };
}

async function resolveTrack(artist: string, title: string): Promise<ResolveResponse> {
  const params = new URLSearchParams({ artist, title });
  const response = await fetch(`${API_BASE}/youtube/resolve?${params}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const payload: ApiErrorPayload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `track unavailable (${response.status})`);
  }
  return decodeResolveResponse(await response.json());
}

function formatTime(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "0:00";
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
  primary = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick(): void;
  primary?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={
        primary ? "transport-button transport-button--primary" : "transport-button"
      }
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function TrackArtwork({ track }: { track: PlaybackTrack | null }) {
  if (track?.artworkUrl) {
    return <img alt="" className="artwork-image" src={track.artworkUrl} />;
  }

  return (
    <div aria-hidden="true" className="artwork-placeholder">
      <span>s</span>
    </div>
  );
}

export default function App() {
  const [artist, setArtist] = useState(DEFAULT_ARTIST);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [selectedTrack, setSelectedTrack] = useState<YouTubeResolvedTrack | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.72);
  const player = useYouTubePlayer();
  const visibleTrack = player.playbackState.track ?? selectedTrack;
  const playerReady = player.phase === "ready";
  const sliderPosition = seekDraft ?? player.playbackState.positionMs;
  const playbackProgress = player.playbackState.durationMs
    ? player.playbackState.positionMs / player.playbackState.durationMs
    : 0;
  const visualState = useMemo(() => {
    if (!player.playbackState.track) return AMBIENT_VISUAL_STATE;
    return sampleMelancholyVisualState(playbackProgress);
  }, [playbackProgress, player.playbackState.track]);

  const playerStatus = useMemo(() => {
    if (player.phase === "ready") return "ready";
    if (player.phase === "error") return "error";
    if (player.phase === "loading-api") return "loading";
    return "idle";
  }, [player.phase]);

  const chooseTrack = async (
    nextArtist: string,
    nextTitle: string,
    shouldPlay: boolean,
  ) => {
    if (!nextArtist.trim() || !nextTitle.trim()) {
      setNotice("add artist and title");
      return;
    }

    setResolving(true);
    setNotice(null);
    try {
      const result = await resolveTrack(nextArtist.trim(), nextTitle.trim());
      setSelectedTrack(result.track);
      if (shouldPlay) await player.selectTrack(result.track);
      setSearchOpen(false);
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : "track unavailable");
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    void chooseTrack(DEFAULT_ARTIST, DEFAULT_TITLE, false);
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void chooseTrack(artist, title, true);
  };

  const togglePlayback = async () => {
    try {
      if (!player.playbackState.track && selectedTrack) {
        await player.selectTrack(selectedTrack);
        await player.provider.play();
      } else if (player.playbackState.isPlaying) {
        await player.provider.pause();
      } else {
        await player.provider.play();
      }
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : "click play to start");
    }
  };

  const commitSeek = () => {
    if (seekDraft === null) return;
    void player.provider.seek(seekDraft).catch((cause: Error) => {
      setNotice(cause.message);
    });
    setSeekDraft(null);
  };

  const updateVolume = (nextVolume: number) => {
    setVolume(nextVolume);
    void player.provider.setVolume(nextVolume).catch((cause: Error) => {
      setNotice(cause.message);
    });
  };

  return (
    <main className="player-shell" data-playing={player.playbackState.isPlaying}>
      <SoundspaceWorld visualState={visualState} />
      <div className="player-atmosphere" aria-hidden="true">
        <div className="field-line field-line--outer" />
        <div className="field-line field-line--middle" />
        <div className="field-line field-line--inner" />
      </div>

      <header className="topbar">
        <p className="wordmark">soundspace</p>
        <div className="session-controls">
          <span className="connection-state"><i />{playerStatus}</span>
          <button className="text-button" onClick={() => setSearchOpen(true)} type="button">
            choose track
          </button>
        </div>
      </header>

      <section className="now-playing" aria-live="polite">
        <div className="artwork-frame">
          <TrackArtwork track={visibleTrack} />
          <span className="artwork-index">ss—001</span>
        </div>
        <div className="track-copy">
          <h1>{visibleTrack?.title ?? "melancholy"}</h1>
          <p className="artist-line">
            {visibleTrack?.artists.join(", ") ?? "driveways"}
          </p>
        </div>
      </section>

      <div aria-label="youtube player" className="youtube-player-host">
        <div ref={player.playerHostRef} />
      </div>

      <section className="player-controls" aria-label="playback controls">
        <div className="time-row">
          <span>{formatTime(sliderPosition)}</span>
          <span>{formatTime(player.playbackState.durationMs)}</span>
        </div>
        <input
          aria-label="seek position"
          className="timeline"
          disabled={!player.playbackState.durationMs}
          max={Math.max(player.playbackState.durationMs, 1)}
          min="0"
          onChange={(event) => setSeekDraft(Number(event.target.value))}
          onKeyUp={commitSeek}
          onPointerUp={commitSeek}
          step="1000"
          type="range"
          value={sliderPosition}
        />
        <div className="transport-row">
          <div className="volume-control">
            <span aria-hidden="true">vol</span>
            <input
              aria-label="volume"
              max="1"
              min="0"
              onChange={(event) => updateVolume(Number(event.target.value))}
              step="0.05"
              type="range"
              value={volume}
            />
          </div>
          <div className="transport-cluster">
            <IconButton
              disabled={!playerReady || !player.playbackState.track}
              label="restart track"
              onClick={() => void player.provider.previous()}
            >
              <span aria-hidden="true">↤</span>
            </IconButton>
            <IconButton
              disabled={!playerReady || !selectedTrack}
              label={player.playbackState.isPlaying ? "pause" : "play"}
              onClick={() => void togglePlayback()}
              primary
            >
              <span aria-hidden="true">{player.playbackState.isPlaying ? "Ⅱ" : "▶"}</span>
            </IconButton>
            <IconButton disabled label="next track unavailable" onClick={() => undefined}>
              <span aria-hidden="true">↦</span>
            </IconButton>
          </div>
        </div>
      </section>

      {player.error || notice ? (
        <aside className="runtime-notice" role="status">
          <p>{player.error ?? notice}</p>
        </aside>
      ) : null}

      {searchOpen ? (
        <section aria-label="choose youtube track" className="search-panel">
          <div className="search-header">
            <h2>find</h2>
            <button aria-label="close track search" className="close-button" onClick={() => setSearchOpen(false)} type="button">×</button>
          </div>
          <form className="search-form" onSubmit={submitSearch}>
            <label>
              <span>artist</span>
              <input
                aria-label="artist"
                onChange={(event) => setArtist(event.target.value)}
                placeholder="artist"
                value={artist}
              />
            </label>
            <label>
              <span>title</span>
              <input
                aria-label="track title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="title"
                value={title}
              />
            </label>
            <button disabled={resolving} type="submit">
              {resolving ? "resolving" : "play"}
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
