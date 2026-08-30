import type {
  AudioFeatures,
  PlaybackState,
  PlaybackTrack,
  VisualState,
} from "@soundspace/shared";
import type { SongWeatherProgram } from "./weather-engine";

/**
 * A confirmed analysis source may refine the authored score. The YouTube
 * iframe is deliberately not such a source: it exposes playback timing, not
 * PCM or a trustworthy frequency analysis signal.
 */
export type ApprovedAudioFeatures = {
  features: AudioFeatures;
  source: "approved";
};

export type MusicResponsePlayback = Pick<
  PlaybackState,
  "durationMs" | "isPlaying" | "positionMs"
> & {
  /**
   * Use this when a provider supplies normalized progress before it knows a
   * duration. Duration-based progress takes precedence when it is valid.
   */
  normalizedProgress?: number;
};

export type MusicResponseInput = {
  audioAnalysis?: ApprovedAudioFeatures;
  playback: MusicResponsePlayback;
};

export type MusicResponseEventKind =
  | "opening-accent"
  | "midpoint-lift"
  | "storm-apex"
  | "release";

export type MusicResponseEvent = {
  active: boolean;
  kind: MusicResponseEventKind;
  strength: number;
};

/**
 * These normalized values are an authored response score. They are not audio
 * telemetry. A renderer can use them as stable targets and use isPlaying to
 * decide whether its local animation clock advances.
 */
export type MusicResponseEnvelope = {
  currentTimeMs: number;
  durationMs: number;
  electricTension: number;
  energy: number;
  events: readonly MusicResponseEvent[];
  gust: number;
  isPlaying: boolean;
  luminosity: number;
  normalizedProgress: number;
  precipitationPressure: number;
  pulse: number;
  visualState: VisualState;
};

export type MusicResponseProgram = {
  sample(input: MusicResponseInput): MusicResponseEnvelope;
};

type AuthoredEvent = {
  at: number;
  kind: MusicResponseEventKind;
  width: number;
};

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const safeMilliseconds = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

function hashIdentity(track: PlaybackTrack): number {
  const identity = [
    track.id,
    track.uri,
    track.title,
    track.artists.join("\u0000"),
    track.album,
  ].join("\u0001");
  let hash = 2_166_136_261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number, shift: number): number {
  return ((seed >>> shift) & 255) / 255;
}

function normalizedProgress(playback: MusicResponsePlayback): number {
  const durationMs = safeMilliseconds(playback.durationMs);
  const positionMs = safeMilliseconds(playback.positionMs);
  if (durationMs > 0) return clampUnit(positionMs / durationMs);
  return clampUnit(playback.normalizedProgress ?? 0);
}

function eventStrength(progress: number, event: AuthoredEvent): number {
  const distance = Math.abs(progress - event.at);
  return clampUnit(1 - distance / event.width);
}

function analysisEnergy(analysis: ApprovedAudioFeatures | undefined): number {
  if (!analysis) return 0;
  const { features } = analysis;
  return clampUnit(
    features.lowEnergy * 0.24 +
      features.midEnergy * 0.22 +
      features.highEnergy * 0.16 +
      features.rms * 0.24 +
      features.transient * 0.14,
  );
}

/**
 * Create a deterministic score for a track and its existing weather program.
 * It uses only metadata and playback timing until approved audio features are
 * supplied by a separate source.
 */
export function createMusicResponseProgram(
  track: PlaybackTrack,
  weatherProgram: SongWeatherProgram,
): MusicResponseProgram {
  const seed = hashIdentity(track);
  const phraseRate = 1.6 + seededUnit(seed, 0) * 1.8;
  const phraseOffset = seededUnit(seed, 8) * Math.PI * 2;
  const dynamics = 0.72 + seededUnit(seed, 16) * 0.28;
  const events: readonly AuthoredEvent[] = [
    { kind: "opening-accent", at: 0.12 + seededUnit(seed, 0) * 0.04, width: 0.055 },
    { kind: "midpoint-lift", at: 0.4 + seededUnit(seed, 8) * 0.08, width: 0.075 },
    { kind: "storm-apex", at: 0.66 + seededUnit(seed, 16) * 0.08, width: 0.065 },
    { kind: "release", at: 0.88 + seededUnit(seed, 24) * 0.05, width: 0.08 },
  ];

  return {
    sample: ({ audioAnalysis, playback }) => {
      const progress = normalizedProgress(playback);
      const currentTimeMs = safeMilliseconds(playback.positionMs);
      const durationMs = safeMilliseconds(playback.durationMs);
      const visualState = weatherProgram.live(progress).visualState;
      const phrase = (Math.sin(progress * Math.PI * 2 * phraseRate + phraseOffset) + 1) / 2;
      const contour = Math.sin(progress * Math.PI);
      const eventResponses = events.map((event) => ({
        active: playback.isPlaying && eventStrength(progress, event) > 0.02,
        kind: event.kind,
        strength: eventStrength(progress, event),
      }));
      const accent = Math.max(...eventResponses.map((event) => event.strength));
      const approvedEnergy = analysisEnergy(audioAnalysis);
      const weather = visualState.weather;
      const semantics = visualState.semantics;
      const energy = clampUnit(
        0.14 +
          phrase * 0.2 * dynamics +
          contour * 0.2 +
          accent * 0.22 +
          weather.stormIntensity * 0.14 +
          approvedEnergy * 0.26,
      );
      const pulse = clampUnit(0.12 + energy * 0.52 + phrase * 0.2 + accent * 0.16);

      return {
        currentTimeMs,
        durationMs,
        electricTension: clampUnit(
          weather.stormIntensity * 0.5 +
            semantics.electricity * 0.26 +
            accent * 0.24 +
            approvedEnergy * 0.12,
        ),
        energy,
        events: eventResponses,
        gust: clampUnit(weather.wind * (0.54 + energy * 0.34 + accent * 0.2)),
        isPlaying: playback.isPlaying,
        luminosity: clampUnit(
          weather.sunlight * (0.58 + phrase * 0.22) +
            semantics.horizon * 0.18 +
            accent * 0.1,
        ),
        normalizedProgress: progress,
        precipitationPressure: clampUnit(
          weather.precipitation * (0.62 + energy * 0.24 + accent * 0.18) *
            (0.72 + semantics.precipitation * 0.28),
        ),
        pulse,
        visualState,
      };
    },
  };
}
