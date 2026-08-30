import {
  EMPTY_AUDIO_FEATURES,
  composeVisualState,
  defineWeatherProfile,
  sampleSemantics,
  sampleWeather,
  type LiveWeatherStructure,
  type PlaybackTrack,
  type PregameWeatherStructure,
  type SemanticsKeyframe,
  type SongClimate,
  type VisualSemantics,
  type VisualState,
  type WeatherKeyframe,
  type WeatherLayerTuning,
  type WeatherPalette,
  type WeatherProfile,
  type WeatherState,
} from "@soundspace/shared";
import { weatherRelationship } from "./grammar";

export type WeatherKind = "rain" | "snow" | "sun";

export type WeatherClassification = {
  confidence: number;
  primary: WeatherKind;
  rationale: string;
  scores: Record<WeatherKind, number>;
};

export type SongWeatherProgram = {
  classification: WeatherClassification;
  live(progress: number): LiveWeatherStructure;
  pregame: PregameWeatherStructure;
};

type WeatherPreset = {
  climate: SongClimate;
  layers: WeatherLayerTuning;
  liveSemantics: readonly SemanticsKeyframe[];
  liveWeather: readonly WeatherKeyframe[];
  palette: WeatherPalette;
  pregameSemantics: VisualSemantics;
  pregameWeather: WeatherState;
};

const RAIN_WORDS = [
  "alone", "dark", "dead", "grey", "lost", "melancholy", "nightmare",
  "pain", "rain", "sad", "storm", "truth", "violent", "wound",
] as const;
const SUN_WORDS = [
  "baby", "bright", "dance", "day", "flash", "fun", "gate", "golden",
  "love", "moves", "party", "spend", "summer", "sun", "warm",
] as const;
const SNOW_WORDS = [
  "calm", "cold", "dream", "hotel", "moon", "quiet", "room", "slow",
  "snow", "somber", "still", "winter",
] as const;

const WEATHER_ORDER: readonly WeatherKind[] = ["rain", "sun", "snow"];

const PRESETS = {
  rain: {
    palette: {
      sky: "#10051f",
      horizon: "#ff315f",
      cloudDark: "#27062e",
      cloudLight: "#c637a4",
      haze: "#7f2cff",
      precipitation: "#f7e2ff",
      particle: "#ff743d",
      electricity: "#e8d5ff",
      glow: "#ff294d",
    },
    layers: {
      skyTexture: 1,
      vibrance: 1,
      cloudDensity: 1,
      cloudDepth: 1,
      mistDensity: 0.92,
      precipitationDensity: 1,
      particleDensity: 0.94,
      electricityFrequency: 1,
      turbulence: 1,
    },
    climate: {
      baseline: {
        cloudCover: 0.9,
        precipitation: 0.82,
        stormIntensity: 0.84,
        sunlight: 0.02,
        haze: 0.72,
        wind: 0.92,
        temperature: 0.22,
      },
    },
    pregameWeather: {
      cloudCover: 0.92,
      precipitation: 0.72,
      stormIntensity: 0.7,
      sunlight: 0.03,
      haze: 0.74,
      wind: 0.82,
      temperature: 0.18,
    },
    pregameSemantics: {
      clouds: 1,
      precipitation: 0.94,
      electricity: 0.7,
      horizon: 0.15,
      particles: 0.82,
    },
    liveWeather: [
      { at: 0, weather: { cloudCover: 0.92, precipitation: 0.76, stormIntensity: 0.7, sunlight: 0.02, haze: 0.7, wind: 0.84, temperature: 0.2 } },
      { at: 0.2, weather: { cloudCover: 1, precipitation: 1, stormIntensity: 0.96, sunlight: 0, haze: 0.9, wind: 1, temperature: 0.12 } },
      { at: 0.48, weather: { cloudCover: 0.96, precipitation: 0.9, stormIntensity: 1, sunlight: 0.04, haze: 0.76, wind: 1, temperature: 0.16 } },
      { at: 0.72, weather: { cloudCover: 1, precipitation: 1, stormIntensity: 0.92, sunlight: 0, haze: 0.94, wind: 0.96, temperature: 0.1 } },
      { at: 1, weather: { cloudCover: 0.78, precipitation: 0.62, stormIntensity: 0.64, sunlight: 0.12, haze: 0.58, wind: 0.78, temperature: 0.26 } },
    ],
    liveSemantics: [
      { at: 0, semantics: { clouds: 1, precipitation: 0.94, electricity: 0.66, horizon: 0.12, particles: 0.82 } },
      { at: 0.2, semantics: { clouds: 1, precipitation: 1, electricity: 1, horizon: 0.04, particles: 1 } },
      { at: 0.55, semantics: { clouds: 0.96, precipitation: 1, electricity: 0.9, horizon: 0.1, particles: 0.96 } },
      { at: 0.8, semantics: { clouds: 1, precipitation: 1, electricity: 1, horizon: 0.02, particles: 1 } },
      { at: 1, semantics: { clouds: 0.8, precipitation: 0.78, electricity: 0.5, horizon: 0.34, particles: 0.7 } },
    ],
  },
  sun: {
    palette: {
      sky: "#0569e8",
      horizon: "#ffea54",
      cloudDark: "#6d36e8",
      cloudLight: "#fff4bc",
      haze: "#ff6b2c",
      precipitation: "#fff7c7",
      particle: "#fff15b",
      electricity: "#ffffff",
      glow: "#ff3b18",
    },
    layers: {
      skyTexture: 0.82,
      vibrance: 1,
      cloudDensity: 0.4,
      cloudDepth: 0.44,
      mistDensity: 0.24,
      precipitationDensity: 0,
      particleDensity: 1,
      electricityFrequency: 0,
      turbulence: 0.7,
    },
    climate: {
      baseline: {
        cloudCover: 0.18,
        precipitation: 0,
        stormIntensity: 0.08,
        sunlight: 0.96,
        haze: 0.28,
        wind: 0.42,
        temperature: 0.94,
      },
    },
    pregameWeather: {
      cloudCover: 0.16,
      precipitation: 0,
      stormIntensity: 0.06,
      sunlight: 1,
      haze: 0.26,
      wind: 0.48,
      temperature: 0.96,
    },
    pregameSemantics: {
      clouds: 0.28,
      precipitation: 0,
      electricity: 0,
      horizon: 1,
      particles: 1,
    },
    liveWeather: [
      { at: 0, weather: { cloudCover: 0.12, precipitation: 0, stormIntensity: 0.04, sunlight: 0.92, haze: 0.22, wind: 0.38, temperature: 0.9 } },
      { at: 0.22, weather: { cloudCover: 0.06, precipitation: 0, stormIntensity: 0.08, sunlight: 1, haze: 0.14, wind: 0.58, temperature: 1 } },
      { at: 0.5, weather: { cloudCover: 0.24, precipitation: 0, stormIntensity: 0.12, sunlight: 0.96, haze: 0.32, wind: 0.72, temperature: 0.96 } },
      { at: 0.76, weather: { cloudCover: 0.08, precipitation: 0, stormIntensity: 0.06, sunlight: 1, haze: 0.18, wind: 0.62, temperature: 1 } },
      { at: 1, weather: { cloudCover: 0.2, precipitation: 0, stormIntensity: 0.04, sunlight: 0.88, haze: 0.4, wind: 0.34, temperature: 0.86 } },
    ],
    liveSemantics: [
      { at: 0, semantics: { clouds: 0.2, precipitation: 0, electricity: 0, horizon: 0.94, particles: 0.88 } },
      { at: 0.24, semantics: { clouds: 0.08, precipitation: 0, electricity: 0, horizon: 1, particles: 1 } },
      { at: 0.52, semantics: { clouds: 0.34, precipitation: 0, electricity: 0, horizon: 1, particles: 1 } },
      { at: 0.78, semantics: { clouds: 0.12, precipitation: 0, electricity: 0, horizon: 1, particles: 1 } },
      { at: 1, semantics: { clouds: 0.24, precipitation: 0, electricity: 0, horizon: 0.9, particles: 0.76 } },
    ],
  },
  snow: {
    palette: {
      sky: "#081738",
      horizon: "#8ccfff",
      cloudDark: "#182953",
      cloudLight: "#c8dcff",
      haze: "#725dba",
      precipitation: "#ffffff",
      particle: "#cceaff",
      electricity: "#eef8ff",
      glow: "#ff9fca",
    },
    layers: {
      skyTexture: 0.72,
      vibrance: 0.84,
      cloudDensity: 0.72,
      cloudDepth: 0.76,
      mistDensity: 0.92,
      precipitationDensity: 0.94,
      particleDensity: 0.9,
      electricityFrequency: 0,
      turbulence: 0.2,
    },
    climate: {
      baseline: {
        cloudCover: 0.7,
        precipitation: 0.62,
        stormIntensity: 0.08,
        sunlight: 0.1,
        haze: 0.84,
        wind: 0.16,
        temperature: 0.02,
      },
    },
    pregameWeather: {
      cloudCover: 0.76,
      precipitation: 0.66,
      stormIntensity: 0.05,
      sunlight: 0.08,
      haze: 0.88,
      wind: 0.12,
      temperature: 0,
    },
    pregameSemantics: {
      clouds: 0.82,
      precipitation: 0.92,
      electricity: 0,
      horizon: 0.44,
      particles: 1,
    },
    liveWeather: [
      { at: 0, weather: { cloudCover: 0.72, precipitation: 0.58, stormIntensity: 0.04, sunlight: 0.08, haze: 0.82, wind: 0.1, temperature: 0.02 } },
      { at: 0.24, weather: { cloudCover: 0.82, precipitation: 0.76, stormIntensity: 0.08, sunlight: 0.04, haze: 0.94, wind: 0.14, temperature: 0 } },
      { at: 0.5, weather: { cloudCover: 0.62, precipitation: 0.9, stormIntensity: 0.12, sunlight: 0.16, haze: 0.72, wind: 0.22, temperature: 0.04 } },
      { at: 0.76, weather: { cloudCover: 0.86, precipitation: 0.72, stormIntensity: 0.06, sunlight: 0.05, haze: 0.96, wind: 0.1, temperature: 0 } },
      { at: 1, weather: { cloudCover: 0.58, precipitation: 0.48, stormIntensity: 0.03, sunlight: 0.24, haze: 0.68, wind: 0.08, temperature: 0.06 } },
    ],
    liveSemantics: [
      { at: 0, semantics: { clouds: 0.76, precipitation: 0.84, electricity: 0, horizon: 0.42, particles: 0.96 } },
      { at: 0.28, semantics: { clouds: 0.86, precipitation: 1, electricity: 0, horizon: 0.24, particles: 1 } },
      { at: 0.52, semantics: { clouds: 0.66, precipitation: 1, electricity: 0, horizon: 0.56, particles: 1 } },
      { at: 0.8, semantics: { clouds: 0.9, precipitation: 0.92, electricity: 0, horizon: 0.18, particles: 1 } },
      { at: 1, semantics: { clouds: 0.54, precipitation: 0.7, electricity: 0, horizon: 0.7, particles: 0.82 } },
    ],
  },
} satisfies Record<WeatherKind, WeatherPreset>;

function hashText(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function wordScore(haystack: string, words: readonly string[]): number {
  return words.reduce(
    (score, word) => score + (new RegExp(`\\b${word}\\b`, "i").test(haystack) ? 1 : 0),
    0,
  );
}

export function classifyTrackWeather(track: PlaybackTrack): WeatherClassification {
  const identity = `${track.title} ${track.artists.join(" ")} ${track.album}`.toLowerCase();
  const hash = hashText(identity);
  const scores = {
    rain: 0.18 + ((hash >>> 0) & 255) / 2_550,
    sun: 0.18 + ((hash >>> 8) & 255) / 2_550,
    snow: 0.18 + ((hash >>> 16) & 255) / 2_550,
  } satisfies Record<WeatherKind, number>;
  const lexical = {
    rain: wordScore(identity, RAIN_WORDS),
    sun: wordScore(identity, SUN_WORDS),
    snow: wordScore(identity, SNOW_WORDS),
  };
  for (const kind of WEATHER_ORDER) scores[kind] += lexical[kind] * 0.72;

  const ordered = [...WEATHER_ORDER].sort((left, right) => scores[right] - scores[left]);
  const primary = ordered[0] ?? "rain";
  const runnerUp = ordered[1] ?? primary;
  const gap = scores[primary] - scores[runnerUp];
  const lexicalHit = lexical[primary] > 0;
  return {
    confidence: Math.min(0.98, 0.68 + gap * 0.22 + (lexicalHit ? 0.12 : 0)),
    primary,
    rationale: lexicalHit ? "title language" : "stable metadata seed",
    scores,
  };
}

function createProfile(kind: WeatherKind, seed: number): WeatherProfile {
  const preset = PRESETS[kind];
  return defineWeatherProfile({
    id: `${kind}-${seed}`,
    seed,
    palette: preset.palette,
    layers: preset.layers,
    relationships: [weatherRelationship(kind, 1)],
  });
}

function pregameState(preset: WeatherPreset): VisualState {
  return composeVisualState({
    climate: preset.climate,
    weather: preset.pregameWeather,
    semantics: preset.pregameSemantics,
    audio: EMPTY_AUDIO_FEATURES,
  });
}

export function createSongWeatherProgram(track: PlaybackTrack): SongWeatherProgram {
  const classification = classifyTrackWeather(track);
  const identity = `${track.id}:${track.title}:${track.artists.join(":")}`;
  const seed = 1_000 + hashText(identity) % 999_000;
  const preset = PRESETS[classification.primary];
  const profile = createProfile(classification.primary, seed);
  const pregame: PregameWeatherStructure = {
    kind: "pregame",
    profile,
    details: {
      containment: "artwork-orb",
      expansionOrigin: "artwork-orb",
      forecastProgress: 0.42,
    },
    visualState: pregameState(preset),
  };

  return {
    classification,
    pregame,
    live: (progress) => ({
      kind: "live",
      profile,
      details: {
        expansionOrigin: "artwork-orb",
        playbackProgress: progress,
      },
      visualState: composeVisualState({
        climate: preset.climate,
        weather: sampleWeather(preset.liveWeather, progress),
        semantics: sampleSemantics(preset.liveSemantics, progress),
        audio: EMPTY_AUDIO_FEATURES,
      }),
    }),
  };
}
