export type PlaybackTrack = {
  id: string;
  uri: string;
  title: string;
  artists: string[];
  album: string;
  artworkUrl?: string;
};

export type YouTubeResolvedTrack = PlaybackTrack & {
  provider: "youtube";
  youtubeVideoId: string;
};

export type PlaybackState = {
  trackId: string | null;
  track: PlaybackTrack | null;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
};

export type PlaybackProvider = {
  getState(): PlaybackState;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  previous(): Promise<void>;
  next(): Promise<void>;
  setVolume(volume: number): Promise<void>;
};

export const EMPTY_PLAYBACK_STATE: PlaybackState = {
  trackId: null,
  track: null,
  positionMs: 0,
  durationMs: 0,
  isPlaying: false,
};

export type WeatherState = {
  cloudCover: number;
  precipitation: number;
  stormIntensity: number;
  sunlight: number;
  haze: number;
  wind: number;
  temperature: number;
};

export type AudioFeatures = {
  lowEnergy: number;
  midEnergy: number;
  highEnergy: number;
  spectralCentroid: number;
  spectralFlux: number;
  rms: number;
  transient: number;
};

/**
 * all atmospheric values are normalized from 0 to 1. temperature represents
 * perceived warmth, not a physical temperature unit.
 */
export type SongClimate = {
  baseline: WeatherState;
};

/**
 * semantics says which atmospheric forms may exist; it does not prescribe a
 * component, color, or animation.
 */
export type VisualSemantics = {
  clouds: number;
  precipitation: number;
  electricity: number;
  horizon: number;
  particles: number;
};

export type WeatherKeyframe = {
  at: number;
  weather: WeatherState;
};

export type SemanticsKeyframe = {
  at: number;
  semantics: VisualSemantics;
};

export type VisualState = {
  climate: SongClimate;
  weather: WeatherState;
  semantics: VisualSemantics;
  audio: AudioFeatures;
};

export const EMPTY_WEATHER_STATE: WeatherState = {
  cloudCover: 0,
  precipitation: 0,
  stormIntensity: 0,
  sunlight: 0,
  haze: 0,
  wind: 0,
  temperature: 0,
};

export const EMPTY_AUDIO_FEATURES: AudioFeatures = {
  lowEnergy: 0,
  midEnergy: 0,
  highEnergy: 0,
  spectralCentroid: 0,
  spectralFlux: 0,
  rms: 0,
  transient: 0,
};

export const EMPTY_VISUAL_SEMANTICS: VisualSemantics = {
  clouds: 0,
  precipitation: 0,
  electricity: 0,
  horizon: 0,
  particles: 0,
};

type VisualStateInput = {
  climate: SongClimate;
  weather: WeatherState;
  semantics: VisualSemantics;
  audio?: AudioFeatures;
};

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const interpolate = (from: number, to: number, amount: number) =>
  from + (to - from) * clampUnit(amount);

const normalizedProgress = (progress: number) => clampUnit(progress);

const normalizeWeather = (weather: WeatherState): WeatherState => ({
  cloudCover: clampUnit(weather.cloudCover),
  precipitation: clampUnit(weather.precipitation),
  stormIntensity: clampUnit(weather.stormIntensity),
  sunlight: clampUnit(weather.sunlight),
  haze: clampUnit(weather.haze),
  wind: clampUnit(weather.wind),
  temperature: clampUnit(weather.temperature),
});

const normalizeSemantics = (semantics: VisualSemantics): VisualSemantics => ({
  clouds: clampUnit(semantics.clouds),
  precipitation: clampUnit(semantics.precipitation),
  electricity: clampUnit(semantics.electricity),
  horizon: clampUnit(semantics.horizon),
  particles: clampUnit(semantics.particles),
});

const normalizeAudio = (audio: AudioFeatures): AudioFeatures => ({
  lowEnergy: clampUnit(audio.lowEnergy),
  midEnergy: clampUnit(audio.midEnergy),
  highEnergy: clampUnit(audio.highEnergy),
  spectralCentroid: clampUnit(audio.spectralCentroid),
  spectralFlux: clampUnit(audio.spectralFlux),
  rms: clampUnit(audio.rms),
  transient: clampUnit(audio.transient),
});

const interpolateWeather = (
  from: WeatherState,
  to: WeatherState,
  amount: number,
): WeatherState =>
  normalizeWeather({
    cloudCover: interpolate(from.cloudCover, to.cloudCover, amount),
    precipitation: interpolate(from.precipitation, to.precipitation, amount),
    stormIntensity: interpolate(from.stormIntensity, to.stormIntensity, amount),
    sunlight: interpolate(from.sunlight, to.sunlight, amount),
    haze: interpolate(from.haze, to.haze, amount),
    wind: interpolate(from.wind, to.wind, amount),
    temperature: interpolate(from.temperature, to.temperature, amount),
  });

const interpolateSemantics = (
  from: VisualSemantics,
  to: VisualSemantics,
  amount: number,
): VisualSemantics =>
  normalizeSemantics({
    clouds: interpolate(from.clouds, to.clouds, amount),
    precipitation: interpolate(from.precipitation, to.precipitation, amount),
    electricity: interpolate(from.electricity, to.electricity, amount),
    horizon: interpolate(from.horizon, to.horizon, amount),
    particles: interpolate(from.particles, to.particles, amount),
  });

export const sampleWeather = (
  keyframes: readonly WeatherKeyframe[],
  progress: number,
): WeatherState => {
  const frames = [...keyframes].sort((left, right) => left.at - right.at);
  const first = frames[0];
  const last = frames.at(-1);

  if (!first || !last) {
    return EMPTY_WEATHER_STATE;
  }

  const time = normalizedProgress(progress);
  if (time <= first.at) {
    return normalizeWeather(first.weather);
  }

  if (time >= last.at) {
    return normalizeWeather(last.weather);
  }

  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index];
    const previous = frames[index - 1];

    if (next && previous && time <= next.at) {
      const span = next.at - previous.at;
      const amount = span === 0 ? 1 : (time - previous.at) / span;
      return interpolateWeather(previous.weather, next.weather, amount);
    }
  }

  return normalizeWeather(last.weather);
};

export const sampleSemantics = (
  keyframes: readonly SemanticsKeyframe[],
  progress: number,
): VisualSemantics => {
  const frames = [...keyframes].sort((left, right) => left.at - right.at);
  const first = frames[0];
  const last = frames.at(-1);

  if (!first || !last) {
    return EMPTY_VISUAL_SEMANTICS;
  }

  const time = normalizedProgress(progress);
  if (time <= first.at) {
    return normalizeSemantics(first.semantics);
  }

  if (time >= last.at) {
    return normalizeSemantics(last.semantics);
  }

  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index];
    const previous = frames[index - 1];

    if (next && previous && time <= next.at) {
      const span = next.at - previous.at;
      const amount = span === 0 ? 1 : (time - previous.at) / span;
      return interpolateSemantics(previous.semantics, next.semantics, amount);
    }
  }

  return normalizeSemantics(last.semantics);
};

export const composeVisualState = ({
  climate,
  weather,
  semantics,
  audio = EMPTY_AUDIO_FEATURES,
}: VisualStateInput): VisualState => ({
  climate: {
    baseline: normalizeWeather(climate.baseline),
  },
  weather: normalizeWeather(weather),
  semantics: normalizeSemantics(semantics),
  audio: normalizeAudio(audio),
});
