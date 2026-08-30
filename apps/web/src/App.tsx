import type {
  AuthStatus,
  PlaybackTrack,
  SpotifyTrackSummary,
} from "@soundspace/shared";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSpotifyPlayer } from "./useSpotifyPlayer";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const FIXTURE_QUERY = 'track:"melancholy" artist:driveways';

const initialAuth: AuthStatus = {
  authenticated: false,
  configured: true,
  profile: null,
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
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
      className={primary ? "transport-button transport-button--primary" : "transport-button"}
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
  const [auth, setAuth] = useState<AuthStatus>(initialAuth);
  const [authLoading, setAuthLoading] = useState(true);
  const [query, setQuery] = useState("melancholy driveways");
  const [tracks, setTracks] = useState<SpotifyTrackSummary[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<SpotifyTrackSummary | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.72);

  const player = useSpotifyPlayer(auth.authenticated);
  const visibleTrack = player.playbackState.track ?? selectedTrack;
  const playerReady = player.phase === "ready";
  const sliderPosition = seekDraft ?? player.playbackState.positionMs;

  const playerStatus = useMemo(() => {
    if (!auth.authenticated) return "awaiting authentication";
    if (player.phase === "ready") return "browser playback online";
    if (player.phase === "error") return "playback needs attention";
    if (player.phase === "offline") return "browser player offline";
    return "connecting browser playback";
  }, [auth.authenticated, player.phase]);

  const search = async (searchQuery: string) => {
    setSearching(true);
    setNotice(null);
    try {
      const result = await request<{ tracks: SpotifyTrackSummary[] }>(
        `/spotify/search?q=${encodeURIComponent(searchQuery)}`,
      );
      setTracks(result.tracks);
      if (searchQuery === FIXTURE_QUERY && result.tracks[0]) {
        setSelectedTrack(result.tracks[0]);
      }
      if (result.tracks.length === 0) setNotice("No tracks found for that search.");
    } catch (searchError) {
      setNotice(
        searchError instanceof Error ? searchError.message : "Search failed.",
      );
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const status = await request<AuthStatus>("/auth/status");
        setAuth(status);
        if (status.authenticated) void search(FIXTURE_QUERY);
      } catch {
        setNotice("The soundspace API is not reachable yet.");
      } finally {
        setAuthLoading(false);
      }
    };
    void loadAuth();

    const authResult = new URLSearchParams(window.location.search).get("auth");
    if (authResult && authResult !== "success") {
      setNotice(`Spotify authentication returned: ${authResult.replace("_", " ")}.`);
    }
    if (authResult) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim()) void search(query.trim());
  };

  const playSelection = async (track: SpotifyTrackSummary) => {
    setSelectedTrack(track);
    setNotice(null);
    try {
      await player.selectTrack(track.uri);
      setSearchOpen(false);
    } catch (playError) {
      setNotice(
        playError instanceof Error ? playError.message : "The track could not start.",
      );
    }
  };

  const togglePlayback = async () => {
    try {
      if (!player.playbackState.track && selectedTrack) {
        await playSelection(selectedTrack);
      } else if (player.playbackState.isPlaying) {
        await player.provider.pause();
      } else {
        await player.provider.play();
      }
    } catch (toggleError) {
      setNotice(
        toggleError instanceof Error ? toggleError.message : "Playback failed.",
      );
    }
  };

  const commitSeek = () => {
    if (seekDraft === null) return;
    void player.provider.seek(seekDraft).catch((seekError: unknown) => {
      setNotice(seekError instanceof Error ? seekError.message : "Seeking failed.");
    });
    setSeekDraft(null);
  };

  const updateVolume = (nextVolume: number) => {
    setVolume(nextVolume);
    void player.provider.setVolume(nextVolume);
  };

  const logout = async () => {
    await request<void>("/auth/logout", { method: "POST" });
    window.location.assign("/");
  };

  if (authLoading) {
    return (
      <main className="loading-screen">
        <p className="wordmark">soundspace</p>
        <div className="loading-line" />
      </main>
    );
  }

  if (!auth.authenticated) {
    return (
      <main className="auth-screen">
        <div className="atmosphere" aria-hidden="true">
          <div className="orbit orbit--one" />
          <div className="orbit orbit--two" />
          <div className="signal-core" />
        </div>
        <header className="topbar">
          <p className="wordmark">soundspace</p>
          <span className="version-tag">player / 001</span>
        </header>
        <section className="auth-copy">
          <p className="eyebrow">Spotify is the clock.</p>
          <h1>Enter the listening space.</h1>
          <p className="lede">
            A basic player for now: one real track, one authoritative timeline,
            and the foundation for everything the music will become.
          </p>
          {notice ? <p className="notice">{notice}</p> : null}
          {!auth.configured ? (
            <p className="setup-callout">
              Spotify credentials are not configured. Copy
              <code> apps/api/.env.example </code> to <code>.env</code> first.
            </p>
          ) : null}
          <a
            aria-disabled={!auth.configured}
            className="connect-button"
            href={auth.configured ? `${API_BASE}/auth/login` : undefined}
          >
            <span>Connect Spotify</span>
            <span aria-hidden="true">↗</span>
          </a>
          <p className="premium-note">Spotify Premium and app test-user access required.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="player-shell" data-playing={player.playbackState.isPlaying}>
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
          <button className="text-button" onClick={() => void logout()} type="button">
            disconnect
          </button>
        </div>
      </header>

      <section className="now-playing" aria-live="polite">
        <div className="artwork-frame">
          <TrackArtwork track={visibleTrack} />
          <span className="artwork-index">SS—001</span>
        </div>
        <div className="track-copy">
          <p className="eyebrow">{player.playbackState.isPlaying ? "Now transmitting" : "Selected signal"}</p>
          <h1>{visibleTrack?.title ?? "No track selected"}</h1>
          <p className="artist-line">{visibleTrack?.artists.join(", ") ?? "Choose a track to begin"}</p>
          <p className="album-line">{visibleTrack?.album ?? "Spotify browser playback"}</p>
        </div>
      </section>

      <section className="player-controls" aria-label="Playback controls">
        <div className="time-row">
          <span>{formatTime(sliderPosition)}</span>
          <span>{formatTime(player.playbackState.durationMs)}</span>
        </div>
        <input
          aria-label="Seek position"
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
              aria-label="Volume"
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
              disabled={!playerReady}
              label="Previous track"
              onClick={() => void player.provider.previous()}
            >
              <span aria-hidden="true">↤</span>
            </IconButton>
            <IconButton
              disabled={!playerReady || (!selectedTrack && !player.playbackState.track)}
              label={player.playbackState.isPlaying ? "Pause" : "Play"}
              onClick={() => void togglePlayback()}
              primary
            >
              <span aria-hidden="true">{player.playbackState.isPlaying ? "Ⅱ" : "▶"}</span>
            </IconButton>
            <IconButton
              disabled={!playerReady}
              label="Next track"
              onClick={() => void player.provider.next()}
            >
              <span aria-hidden="true">↦</span>
            </IconButton>
          </div>
          <p className="account-label">{auth.profile?.displayName}<br />{auth.profile?.product}</p>
        </div>
      </section>

      {player.error || notice ? (
        <aside className="runtime-notice" role="status">
          <span>player note</span>
          <p>{player.error ?? notice}</p>
        </aside>
      ) : null}

      {searchOpen ? (
        <section aria-label="Choose a Spotify track" className="search-panel">
          <div className="search-header">
            <div>
              <p className="eyebrow">Spotify catalogue</p>
              <h2>Choose a signal</h2>
            </div>
            <button aria-label="Close track search" className="close-button" onClick={() => setSearchOpen(false)} type="button">×</button>
          </div>
          <form className="search-form" onSubmit={submitSearch}>
            <input
              aria-label="Search Spotify"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="track, artist, or album"
              value={query}
            />
            <button disabled={searching} type="submit">{searching ? "searching" : "search"}</button>
          </form>
          <div className="search-results">
            {tracks.map((track) => (
              <button className="search-result" key={track.id} onClick={() => void playSelection(track)} type="button">
                {track.artworkUrl ? <img alt="" src={track.artworkUrl} /> : <span className="result-placeholder" />}
                <span><strong>{track.title}</strong><small>{track.artists.join(", ")} · {track.album}</small></span>
                <i aria-hidden="true">play</i>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
