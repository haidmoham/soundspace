import type {
  WeatherDriver,
  WeatherExpressionResponse,
  WeatherPalette,
  WeatherRelationship,
} from "@soundspace/shared";

type WeatherGrammarEntry = {
  phenomenon: string;
  characters: readonly [string, ...string[]];
  driver: WeatherDriver;
  palette: WeatherPalette;
  response: WeatherExpressionResponse;
};

export const WEATHER_GRAMMAR = [
  {
    phenomenon: "rain",
    characters: ["tumult"],
    driver: "precipitation",
    palette: {
      sky: "#19091f",
      horizon: "#d35779",
      cloudDark: "#35113e",
      cloudLight: "#cf4f82",
      haze: "#9d3f72",
      precipitation: "#f6d6ff",
      particle: "#ff9b5e",
      electricity: "#d9c2ff",
      glow: "#ff6f61",
    },
    response: {
      atmosphericMotion: 1,
      viewportPressure: 1,
      particleAgitation: 0.94,
      lightVolatility: 0.88,
      obscurity: 0.82,
    },
  },
  {
    phenomenon: "sun",
    characters: ["bright", "energetic"],
    driver: "sunlight",
    palette: {
      sky: "#168bd3",
      horizon: "#ffbd45",
      cloudDark: "#506fc4",
      cloudLight: "#fff2ad",
      haze: "#ff8f45",
      precipitation: "#fff6d1",
      particle: "#fff07d",
      electricity: "#ffffff",
      glow: "#ff6d38",
    },
    response: {
      atmosphericMotion: 0.7,
      viewportPressure: 0.24,
      particleAgitation: 0.78,
      lightVolatility: 0.64,
      obscurity: 0,
    },
  },
  {
    phenomenon: "snow",
    characters: ["somber", "calm"],
    driver: "precipitation",
    palette: {
      sky: "#101a38",
      horizon: "#7a70a5",
      cloudDark: "#253050",
      cloudLight: "#b9c7e8",
      haze: "#687596",
      precipitation: "#f8fbff",
      particle: "#d9e8ff",
      electricity: "#c6d4ff",
      glow: "#d6a7c7",
    },
    response: {
      atmosphericMotion: 0.16,
      viewportPressure: 0.08,
      particleAgitation: 0.18,
      lightVolatility: 0.1,
      obscurity: 0.76,
    },
  },
] as const satisfies readonly WeatherGrammarEntry[];

export function weatherRelationship(
  phenomenon: (typeof WEATHER_GRAMMAR)[number]["phenomenon"],
  membership: number,
): WeatherRelationship {
  const entry = WEATHER_GRAMMAR.find(
    (candidate) => candidate.phenomenon === phenomenon,
  );
  if (!entry) throw new Error(`unknown weather phenomenon: ${phenomenon}`);
  return {
    phenomenon: entry.phenomenon,
    characters: entry.characters,
    driver: entry.driver,
    membership,
    response: entry.response,
  };
}

export function weatherPalette(
  phenomenon: (typeof WEATHER_GRAMMAR)[number]["phenomenon"],
): WeatherPalette {
  const entry = WEATHER_GRAMMAR.find(
    (candidate) => candidate.phenomenon === phenomenon,
  );
  if (!entry) throw new Error(`unknown weather phenomenon: ${phenomenon}`);
  return entry.palette;
}
