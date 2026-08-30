import {
  EMPTY_AUDIO_FEATURES,
  composeVisualState,
  defineWeatherProfile,
  type LiveWeatherStructure,
  type PregameWeatherStructure,
  sampleSemantics,
  sampleWeather,
  type AudioFeatures,
  type SemanticsKeyframe,
  type SongClimate,
  type VisualState,
  type WeatherKeyframe,
} from "@soundspace/shared";
import { weatherPalette, weatherRelationship } from "./grammar";

export const MELANCHOLY_WEATHER_PROFILE = defineWeatherProfile({
  id: "driveways-melancholy",
  seed: 11_907,
  palette: weatherPalette("rain"),
  layers: {
    skyTexture: 0.96,
    vibrance: 1,
    cloudDensity: 1,
    cloudDepth: 1,
    mistDensity: 0.96,
    precipitationDensity: 1,
    particleDensity: 0.92,
    electricityFrequency: 0.94,
    turbulence: 1,
  },
  relationships: [weatherRelationship("rain", 1)],
});

/**
 * A persistent atmospheric identity for the track. The timeline below moves
 * around this baseline instead of replacing it with named weather states.
 */
export const MELANCHOLY_CLIMATE: SongClimate = {
  baseline: {
    cloudCover: 0.78,
    precipitation: 0.48,
    stormIntensity: 0.38,
    sunlight: 0.1,
    haze: 0.62,
    wind: 0.62,
    temperature: 0.24,
  },
};

/**
 * These are authored against normalized YouTube progress, not wall-clock
 * seconds. Every transition is interpolated by the shared domain layer.
 */
export const MELANCHOLY_WEATHER: readonly WeatherKeyframe[] = [
  {
    at: 0,
    weather: {
      cloudCover: 0.78,
      precipitation: 0.48,
      stormIntensity: 0.34,
      sunlight: 0.1,
      haze: 0.64,
      wind: 0.62,
      temperature: 0.24,
    },
  },
  {
    at: 0.17,
    weather: {
      cloudCover: 0.86,
      precipitation: 0.72,
      stormIntensity: 0.58,
      sunlight: 0.06,
      haze: 0.72,
      wind: 0.82,
      temperature: 0.2,
    },
  },
  {
    at: 0.42,
    weather: {
      cloudCover: 0.94,
      precipitation: 0.9,
      stormIntensity: 0.82,
      sunlight: 0.02,
      haze: 0.84,
      wind: 0.94,
      temperature: 0.14,
    },
  },
  {
    at: 0.58,
    weather: {
      cloudCover: 0.98,
      precipitation: 0.93,
      stormIntensity: 0.9,
      sunlight: 0,
      haze: 0.88,
      wind: 0.92,
      temperature: 0.1,
    },
  },
  {
    at: 0.76,
    weather: {
      cloudCover: 0.82,
      precipitation: 0.74,
      stormIntensity: 0.58,
      sunlight: 0.14,
      haze: 0.7,
      wind: 0.78,
      temperature: 0.26,
    },
  },
  {
    at: 1,
    weather: {
      cloudCover: 0.4,
      precipitation: 0.32,
      stormIntensity: 0.24,
      sunlight: 0.52,
      haze: 0.34,
      wind: 0.52,
      temperature: 0.48,
    },
  },
];

/**
 * Semantics only grants phenomena permission to exist. The renderer decides
 * how those permissions become clouds, particles, a horizon, or electricity.
 */
export const MELANCHOLY_SEMANTICS: readonly SemanticsKeyframe[] = [
  {
    at: 0,
    semantics: {
      clouds: 0.92,
      precipitation: 0.72,
      electricity: 0.32,
      horizon: 0.22,
      particles: 0.38,
    },
  },
  {
    at: 0.24,
    semantics: {
      clouds: 0.98,
      precipitation: 0.9,
      electricity: 0.5,
      horizon: 0.12,
      particles: 0.62,
    },
  },
  {
    at: 0.52,
    semantics: {
      clouds: 1,
      precipitation: 1,
      electricity: 0.9,
      horizon: 0.04,
      particles: 0.9,
    },
  },
  {
    at: 0.78,
    semantics: {
      clouds: 0.76,
      precipitation: 0.78,
      electricity: 0.52,
      horizon: 0.52,
      particles: 0.58,
    },
  },
  {
    at: 1,
    semantics: {
      clouds: 0.3,
      precipitation: 0.42,
      electricity: 0.2,
      horizon: 0.9,
      particles: 0.26,
    },
  },
];

/**
 * The iframe boundary exposes no PCM signal. Keep the future audio contract
 * explicit and neutral until an approved analysis source is available.
 */
export const MELANCHOLY_AUDIO_FEATURES: AudioFeatures = EMPTY_AUDIO_FEATURES;

export const MELANCHOLY_PREGAME_STRUCTURE: PregameWeatherStructure = {
  kind: "pregame",
  profile: MELANCHOLY_WEATHER_PROFILE,
  details: {
    containment: "artwork-orb",
    expansionOrigin: "artwork-orb",
    forecastProgress: 0.52,
  },
  visualState: composeVisualState({
    climate: MELANCHOLY_CLIMATE,
    weather: {
      cloudCover: 0.92,
      precipitation: 0.56,
      stormIntensity: 0.48,
      sunlight: 0.04,
      haze: 0.78,
      wind: 0.68,
      temperature: 0.16,
    },
    semantics: {
      clouds: 1,
      precipitation: 0.86,
      electricity: 0.48,
      horizon: 0.08,
      particles: 0.72,
    },
    audio: MELANCHOLY_AUDIO_FEATURES,
  }),
};

export function sampleMelancholyVisualState(progress: number): VisualState {
  return composeVisualState({
    climate: MELANCHOLY_CLIMATE,
    weather: sampleWeather(MELANCHOLY_WEATHER, progress),
    semantics: sampleSemantics(MELANCHOLY_SEMANTICS, progress),
    audio: MELANCHOLY_AUDIO_FEATURES,
  });
}

export function createMelancholyLiveStructure(
  progress: number,
): LiveWeatherStructure {
  return {
    kind: "live",
    profile: MELANCHOLY_WEATHER_PROFILE,
    details: {
      expansionOrigin: "artwork-orb",
      playbackProgress: progress,
    },
    visualState: sampleMelancholyVisualState(progress),
  };
}
