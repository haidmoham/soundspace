import {
  EMPTY_AUDIO_FEATURES,
  composeVisualState,
  defineWeatherProfile,
  type VisualState,
} from "@soundspace/shared";
import { weatherPalette, weatherRelationship } from "./grammar";

export const AMBIENT_WEATHER_PROFILE = defineWeatherProfile({
  id: "ambient-room",
  seed: 2_041,
  palette: weatherPalette("snow"),
  layers: {
    skyTexture: 0.5,
    vibrance: 0.52,
    cloudDensity: 0.46,
    cloudDepth: 0.48,
    mistDensity: 0.58,
    precipitationDensity: 0,
    particleDensity: 0.42,
    electricityFrequency: 0,
    turbulence: 0.18,
  },
  relationships: [weatherRelationship("snow", 1)],
});

export const AMBIENT_VISUAL_STATE: VisualState = composeVisualState({
  climate: {
    baseline: {
      cloudCover: 0.42,
      precipitation: 0,
      stormIntensity: 0,
      sunlight: 0.08,
      haze: 0.58,
      wind: 0.12,
      temperature: 0.3,
    },
  },
  weather: {
    cloudCover: 0.46,
    precipitation: 0,
    stormIntensity: 0,
    sunlight: 0.06,
    haze: 0.64,
    wind: 0.14,
    temperature: 0.28,
  },
  semantics: {
    clouds: 0.54,
    precipitation: 0,
    electricity: 0,
    horizon: 0.38,
    particles: 0.48,
  },
  audio: EMPTY_AUDIO_FEATURES,
});
