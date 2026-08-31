import type {
  PlaybackTrack,
  VisualState,
  WeatherProfile,
} from "@soundspace/shared";
import { blendVisualStates } from "@soundspace/shared";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type YouTubeResolvedTrack,
  useYouTubePlayer,
} from "./useYouTubePlayer";
import { AMBIENT_VISUAL_STATE } from "./atmosphere/ambient";
import { createMusicResponseProgram } from "./atmosphere/music-response";
import {
  createSongWeatherProgram,
  type WeatherKind,
} from "./atmosphere/weather-engine";
import {
  SoundspaceWorld,
  type PerformanceSample,
} from "./world/SoundspaceWorld";
import { SoundspaceOrb } from "./world/SoundspaceOrb";
import type { VisualQuality } from "./world/WeatherSystem";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const DEFAULT_ARTIST = "driveways";
const DEFAULT_TITLE = "melancholy";
const DEFAULT_SEARCH_QUERY = "this modern love bloc party";
const DEFAULT_TRACK: PlaybackTrack = {
  id: "default-driveways-melancholy",
  uri: "soundspace:default:driveways-melancholy",
  title: DEFAULT_TITLE,
  artists: [DEFAULT_ARTIST],
  album: "melancholy",
};

const LIVE_WEATHER_EXPRESSION = {
  rain: "thunderstorm",
  snow: "blizzard",
  sun: "scorching heat",
} as const satisfies Record<WeatherKind, string>;

type SearchPayload = {
  tracks?: YouTubeResolvedTrack[];
};

type ApiErrorPayload = {
  message?: string;
};

async function searchYouTube(query: string): Promise<YouTubeResolvedTrack[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${API_BASE}/youtube/search?${params}`, {
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const payload: ApiErrorPayload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `search unavailable (${response.status})`);
  }

  // SAFETY: This repo owns the search endpoint. The optional array guard rejects a missing collection.
  const payload = await response.json() as SearchPayload | null;
  return Array.isArray(payload?.tracks) ? payload.tracks : [];
}

function formatTime(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "0:00";
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const displayCopy = (value: string) => value.toLocaleLowerCase();

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

function TrackArtwork({
  active,
  disabled,
  onEnter,
  onExit,
  profile,
  track,
  visualState,
  weather,
  playing,
}: {
  active: boolean;
  disabled: boolean;
  onEnter(): void;
  onExit(): void;
  profile: WeatherProfile;
  playing: boolean;
  track: PlaybackTrack | null;
  visualState: VisualState;
  weather: WeatherKind;
}) {
  return (
    <>
      {weather === "sun" ? <WeatherCrest /> : null}
      <button
        aria-label={active ? `exit ${displayCopy(track?.title ?? "soundspace")}` : `enter ${displayCopy(track?.title ?? "soundspace")}`}
        className="artwork-orb-control"
        data-active={active}
        data-playing={playing}
        data-weather={weather}
        disabled={disabled}
        onClick={active ? onExit : onEnter}
        type="button"
      >
        <SoundspaceOrb
          active={playing}
          profile={profile}
          title={track?.title ?? "soundspace"}
          visualState={visualState}
        />
        <span>{active ? `exit the ${weather} ↙` : disabled ? "forming" : `enter the ${weather} ↗`}</span>
      </button>
    </>
  );
}

function isCandidatePlaybackFailure(cause: unknown): cause is Error {
  if (!(cause instanceof Error)) return false;
  return /embedded|rejected|won't play|video is gone|verify this player|too long to change songs/i
    .test(cause.message);
}

function WeatherCrest() {
  return (
    <span aria-label="sun forecast" className="weather-crest weather-crest--sun" role="img">
      <svg aria-hidden="true" viewBox="0 0 96 74">
        <g className="weather-crest__sun">
          <g className="weather-crest__sun-rays">
            <path d="M48 5v11M48 58v11M10 37h12M74 37h12M21 11l8 9M67 54l8 9M75 11l-8 9M29 54l-8 9" />
          </g>
          <circle cx="48" cy="37" r="17" />
          <circle className="weather-crest__sun-core" cx="48" cy="37" r="11" />
        </g>
      </svg>
      <small>sun</small>
    </span>
  );
}

function TrackSearch({
  landing = false,
  onChoose,
  onClose,
  onQueryChange,
  onSubmit,
  query,
  resolving,
  results,
  searching,
}: {
  landing?: boolean;
  onChoose(track: YouTubeResolvedTrack): void;
  onClose?: () => void;
  onQueryChange(value: string): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  query: string;
  resolving: boolean;
  results: YouTubeResolvedTrack[];
  searching: boolean;
}) {
  return (
    <div className={landing ? "search-sheet search-sheet--landing" : "search-sheet"}>
      <div className="search-header">
        <div>
          <p>{landing ? "music becomes weather" : "another forecast / youtube"}</p>
          <h2>{landing ? <>enter a<br /><i>sound</i></> : <>find a<br /><i>sound</i></>}</h2>
        </div>
        {onClose ? (
          <button aria-label="close track search" className="close-button" onClick={onClose} type="button">×</button>
        ) : null}
      </div>
      <form aria-busy={searching} className="search-form" onSubmit={onSubmit}>
        <label>
          <span>artist, title, or whatever you remember</span>
          <input
            aria-label="search youtube"
            autoFocus
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={DEFAULT_SEARCH_QUERY}
            value={query}
          />
        </label>
        <button disabled={searching || resolving} type="submit">
          {searching ? "listening…" : "search ↗"}
        </button>
      </form>

      <div aria-live="polite" className="search-results">
        {searching ? <p className="search-state">pulling sound through the weather…</p> : null}
        {!searching && results.length === 0 ? (
          <p className="search-state">choose a song. we will suggest its weather before you enter.</p>
        ) : null}
        {results.map((track, index) => {
          const weather = createSongWeatherProgram(track).classification.primary;
          const embeddingBlocked = track.embeddable === false;
          return (
            <button
              className="search-result"
              data-embed-status={embeddingBlocked ? "blocked" : "allowed"}
              disabled={resolving || embeddingBlocked}
              key={track.id}
              onClick={() => onChoose(track)}
              type="button"
            >
              <WeatherGlyph weather={weather} />
              {track.artworkUrl ? (
                <img alt="" src={track.artworkUrl} />
              ) : (
                <span aria-hidden="true" className="result-placeholder" />
              )}
              <span>
                <strong>{displayCopy(track.title)}</strong>
                <small>{displayCopy(track.artists.join(", "))}</small>
              </span>
              <i>
                {String(index + 1).padStart(2, "0")} / {embeddingBlocked ? "embedding off" : "open"}
              </i>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeatherGlyph({ weather }: { weather: WeatherKind }) {
  return (
    <span aria-label={`recommended weather: ${weather}`} className={`weather-glyph weather-glyph--${weather}`} role="img">
      <svg aria-hidden="true" viewBox="0 0 32 32">
        {weather === "rain" ? (
          <>
            <path d="M7 15c.3-4 3.2-6.6 7-6.3 1.7-2.3 5.8-1.7 6.7 1.3 3.2.2 4.8 2.2 4.3 5.2" />
            <path d="m10 19-2 5m7-5-2 7m7-7-2 5" />
          </>
        ) : null}
        {weather === "sun" ? (
          <>
            <circle cx="16" cy="16" r="5.2" />
            <path d="M16 4v4m0 16v4M4 16h4m16 0h4M7.5 7.5l2.8 2.8m11.4 11.4 2.8 2.8m0-17-2.8 2.8M10.3 21.7l-2.8 2.8" />
          </>
        ) : null}
        {weather === "snow" ? (
          <path d="M16 4v24M5.6 10l20.8 12M5.6 22l20.8-12M12 6.5l4 3 4-3M12 25.5l4-3 4 3M6.5 14l4 .5-1.2 3.8m16.2-.3-4-.5 1.2-3.8" />
        ) : null}
      </svg>
    </span>
  );
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState(DEFAULT_SEARCH_QUERY);
  const [searchResults, setSearchResults] = useState<YouTubeResolvedTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<YouTubeResolvedTrack | null>(
    null,
  );
  const [entered, setEntered] = useState(false);
  const [entryTransition, setEntryTransition] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [pendingAutoplayTrackId, setPendingAutoplayTrackId] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.72);
  const [visualQuality, setVisualQuality] = useState<VisualQuality>("max");
  const [weatherOverride, setWeatherOverride] = useState<WeatherKind | null>(null);
  const [performanceSample, setPerformanceSample] = useState<PerformanceSample | null>(null);
  const searchRequestIdRef = useRef(0);
  const searchPanelRef = useRef<HTMLElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const player = useYouTubePlayer();
  const landing = selectedTrack === null;
  const isPlaying = player.playbackState.isPlaying;
  const visibleTrack = player.playbackState.track ?? selectedTrack;
  const playerReady = player.phase === "ready";
  const sliderPosition = seekDraft ?? player.playbackState.positionMs;
  const playbackProgress = player.playbackState.durationMs
    ? player.playbackState.positionMs / player.playbackState.durationMs
    : 0;
  const weatherProgram = useMemo(
    () => createSongWeatherProgram(visibleTrack ?? DEFAULT_TRACK, weatherOverride ?? undefined),
    [
      visibleTrack?.album,
      visibleTrack?.artists,
      visibleTrack?.id,
      visibleTrack?.title,
      weatherOverride,
    ],
  );
  const musicResponseProgram = useMemo(
    () => createMusicResponseProgram(visibleTrack ?? DEFAULT_TRACK, weatherProgram),
    [visibleTrack, weatherProgram],
  );
  const musicResponse = useMemo(
    () => musicResponseProgram.sample({ playback: player.playbackState }),
    [
      musicResponseProgram,
      player.playbackState.durationMs,
      player.playbackState.isPlaying,
      player.playbackState.positionMs,
    ],
  );
  const liveWeatherStructure = useMemo(
    () => weatherProgram.live(playbackProgress),
    [playbackProgress, weatherProgram],
  );
  const weatherStructure = entered
    ? liveWeatherStructure
    : weatherProgram.pregame;
  const weatherExpression = isPlaying
    ? LIVE_WEATHER_EXPRESSION[weatherProgram.classification.primary]
    : weatherProgram.classification.primary;
  const entryBlend = entryTransition <= 0.32
    ? 0
    : 1 - Math.pow(1 - (entryTransition - 0.32) / 0.68, 3);
  const worldVisualState = !entered
    ? AMBIENT_VISUAL_STATE
    : !isPlaying
      ? weatherProgram.pregame.visualState
      : blendVisualStates(
        weatherProgram.pregame.visualState,
        musicResponse.visualState,
        entryBlend,
      );
  const worldProfile = weatherProgram.pregame.profile;

  useEffect(() => {
    if (!searchOpen) return;
    const handleSearchKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        requestAnimationFrame(() => searchTriggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;

      const controls = searchPanelRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled)",
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleSearchKeys);
    return () => window.removeEventListener("keydown", handleSearchKeys);
  }, [searchOpen]);

  useEffect(() => {
    if (!entered || !isPlaying || entryTransition >= 1) return;
    // The entry timeline is a visual response to playback. Keep its elapsed
    // time across pauses so pausing does not consume the remaining entrance.
    const startedAt = performance.now() - entryTransition * 2_800;
    let frameId = 0;
    const updateEntryTransition = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 2_800);
      setEntryTransition(progress);
      if (progress < 1) frameId = requestAnimationFrame(updateEntryTransition);
    };
    frameId = requestAnimationFrame(updateEntryTransition);
    return () => cancelAnimationFrame(frameId);
  }, [entered, isPlaying]);

  useEffect(() => {
    if (!playerReady || !selectedTrack) return;
    const syncSelection = async () => {
      if (player.playbackState.track?.id !== selectedTrack.id) {
        await player.selectTrack(selectedTrack);
      }
      if (pendingAutoplayTrackId === selectedTrack.id) {
        setPendingAutoplayTrackId(null);
        await player.provider.play();
      }
    };

    void syncSelection().catch((cause: Error) => setNotice(cause.message));
  }, [
    pendingAutoplayTrackId,
    player.playbackState.track?.id,
    player.provider,
    player.selectTrack,
    playerReady,
    selectedTrack,
  ]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setNotice("type an artist, a title, or both");
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setSearching(true);
    setNotice(null);
    void searchYouTube(query)
      .then((tracks) => {
        if (requestId !== searchRequestIdRef.current) return;
        setSearchResults(tracks);
        if (tracks.length === 0) setNotice("no playable weather found");
      })
      .catch((cause: unknown) => {
        if (requestId !== searchRequestIdRef.current) return;
        setNotice(cause instanceof Error ? cause.message : "search unavailable");
      })
      .finally(() => {
        if (requestId === searchRequestIdRef.current) setSearching(false);
      });
  };

  const changeSearchQuery = (value: string) => {
    // Invalidate an in-flight response as soon as its visible query changes.
    // Search text and result rows must always describe the same request.
    searchRequestIdRef.current += 1;
    setSearchQuery(value);
    setSearchResults([]);
    setSearching(false);
    setNotice(null);
  };

  const chooseSearchResult = async (track: YouTubeResolvedTrack) => {
    setResolving(true);
    setNotice(null);

    try {
      if (!playerReady) {
        throw new Error("youtube is still arriving — try this song again");
      }

      // The player waits for the iframe to confirm both the video id and its
      // duration. Commit every visible song state only after that boundary.
      await player.selectTrack(track);
      setSelectedTrack(track);
      setEntered(false);
      setEntryTransition(0);
      setSeekDraft(null);
      setPendingAutoplayTrackId(null);
      setWeatherOverride(null);
      setSearchOpen(false);
      requestAnimationFrame(() => window.scrollTo(0, 0));
    } catch (cause: unknown) {
      if (isCandidatePlaybackFailure(cause)) {
        setSearchResults((current) => current.map((candidate) =>
          candidate.id === track.id
            ? { ...candidate, embeddable: false }
            : candidate,
        ));
      }
      setNotice(cause instanceof Error ? cause.message : "track unavailable");
    } finally {
      setResolving(false);
    }
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

  const enterWorld = async () => {
    if (!selectedTrack) {
      setNotice("the soundspace is still forming");
      return;
    }

    setEntryTransition(0);
    setEntered(true);

    if (!playerReady) {
      setPendingAutoplayTrackId(selectedTrack.id);
      setNotice("youtube is still arriving — the weather can form without it");
      return;
    }

    try {
      if (player.playbackState.track?.id !== selectedTrack.id) {
        await player.selectTrack(selectedTrack);
      }
      await player.provider.play();
      setNotice(null);
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : "click the orb again");
    }
  };

  const exitWorld = () => {
    setEntered(false);
    setEntryTransition(0);
    setNotice(null);
  };

  const commitSeek = (positionMs: number) => {
    void player.provider.seek(positionMs).catch((cause: Error) => {
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
    <main
      className="player-shell"
      data-entry-progress={entryTransition.toFixed(3)}
      data-entered={entered}
      data-landing={landing}
      data-playing={isPlaying}
      data-music-energy={musicResponse.energy.toFixed(3)}
      data-music-event={musicResponse.events.find((event) => event.active)?.kind ?? "none"}
      data-music-pulse={musicResponse.pulse.toFixed(3)}
      data-music-source="authored-playback-clock"
      data-playback-progress={playbackProgress.toFixed(3)}
      data-weather-primary={weatherStructure.profile.primaryPhenomenon}
      data-weather-expression={weatherExpression}
      data-weather-seed={weatherStructure.profile.seed}
      data-weather-stage={weatherStructure.kind}
      data-weather-confidence={weatherProgram.classification.confidence.toFixed(3)}
      data-visual-quality={visualQuality}
    >
      <SoundspaceWorld
        entryProgress={entryTransition}
        entryVisualState={weatherProgram.pregame.visualState}
        expanded={entered}
        onPerformanceSample={setPerformanceSample}
        profile={worldProfile}
        quality={visualQuality}
        response={musicResponse}
        visualState={worldVisualState}
      />

      <header className="topbar">
        <p className="wordmark">soundspace</p>
        {!landing ? <div className="session-controls">
          <div aria-label="choose weather" className="forecast-picker" role="group">
            <span>forecast</span>
            {(["auto", "rain", "sun", "snow"] as const).map((weather) => {
              const active = weather === "auto"
                ? weatherOverride === null
                : weatherOverride === weather;
              return (
                <button
                  aria-pressed={active}
                  key={weather}
                  onClick={() => setWeatherOverride(weather === "auto" ? null : weather)}
                  type="button"
                >
                  {weather}
                </button>
              );
            })}
          </div>
          <button className="text-button" onClick={() => setSearchOpen(true)} ref={searchTriggerRef} type="button">
            choose track
          </button>
        </div> : <p className="landing-note">one song / one weather / one world</p>}
      </header>

      {landing ? (
        <section aria-label="find a soundspace" className="landing-page">
          <TrackSearch
            landing
            onChoose={(track) => void chooseSearchResult(track)}
            onQueryChange={changeSearchQuery}
            onSubmit={submitSearch}
            query={searchQuery}
            resolving={resolving}
            results={searchResults}
            searching={searching}
          />
          <p className="landing-coda">search → forecast → enter</p>
        </section>
      ) : <>
      <section className="now-playing" aria-live="polite">
        <div className="artwork-frame">
          <TrackArtwork
            active={entered}
            disabled={!selectedTrack}
            onEnter={() => void enterWorld()}
            onExit={exitWorld}
            profile={weatherStructure.profile}
            playing={isPlaying}
            track={visibleTrack}
            visualState={isPlaying
              ? weatherStructure.visualState
              : weatherProgram.pregame.visualState}
            weather={weatherProgram.classification.primary}
          />
        </div>
        <div className="track-copy">
          <h1>{displayCopy(visibleTrack?.title ?? "melancholy")}</h1>
          <p className="artist-line">
            {displayCopy(visibleTrack?.artists.join(", ") ?? "driveways")}
          </p>
        </div>
      </section>

      </>}

      <div
        aria-label="youtube player"
        className={landing ? "youtube-player-host youtube-player-host--warming" : "youtube-player-host"}
        data-track-id={player.playbackState.track?.id ?? ""}
      >
        <div ref={player.playerHostRef} />
      </div>

      {!landing ? <section className="player-controls" aria-label="playback controls">
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
          onBlur={(event) => commitSeek(Number(event.currentTarget.value))}
          onKeyUp={(event) => commitSeek(Number(event.currentTarget.value))}
          onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
          step="1000"
          type="range"
          value={sliderPosition}
        />
        <div className="transport-row">
          <div className="volume-control">
            <span aria-hidden="true">vol</span>
            <input
              aria-label="volume"
              disabled={!playerReady}
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
      </section> : null}

      {!landing ? <aside className="visual-budget" aria-label="visual budget probe">
        <div className="visual-budget__header">
          <span>weather / {weatherExpression}</span>
          <strong>{!isPlaying
            ? "still"
            : performanceSample
              ? `${Math.round(performanceSample.fps)} fps`
              : "sampling"}</strong>
        </div>
        <p>
          {performanceSample
            ? `${performanceSample.frameMs.toFixed(1)} ms · ${performanceSample.calls} calls · ${performanceSample.triangles.toLocaleString()} tris · ${performanceSample.points.toLocaleString()} pts`
            : `${weatherProgram.classification.rationale} · render probe forming`}
        </p>
        <p className="visual-budget__source" title="youtube iframe audio cannot be read by the web audio api">
          response / authored timeline · no fft
        </p>
        <div className="visual-budget__tiers" aria-label="weather render density">
          {(["low", "balanced", "max"] as const).map((quality) => (
            <button
              aria-pressed={visualQuality === quality}
              key={quality}
              onClick={() => setVisualQuality(quality)}
              type="button"
            >
              {quality}
            </button>
          ))}
        </div>
      </aside> : null}

      {player.error || notice ? (
        <aside className="runtime-notice" role="status">
          <p>{player.error ?? notice}</p>
        </aside>
      ) : null}

      {!landing && searchOpen ? (
        <section
          aria-label="choose youtube track"
          aria-modal="true"
          className="search-panel"
          ref={searchPanelRef}
          role="dialog"
        >
          <TrackSearch
            onChoose={(track) => void chooseSearchResult(track)}
            onClose={() => {
                setSearchOpen(false);
                requestAnimationFrame(() => searchTriggerRef.current?.focus());
            }}
            onQueryChange={changeSearchQuery}
            onSubmit={submitSearch}
            query={searchQuery}
            resolving={resolving}
            results={searchResults}
            searching={searching}
          />
        </section>
      ) : null}
    </main>
  );
}
