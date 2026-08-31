import { expect, test } from "@playwright/test";
import { installFakeYouTube } from "./support/fake-youtube";
import { loadSongCorpus } from "./support/song-corpus";
import { installSoundspaceRoutes } from "./support/soundspace-routes";

const corpus = loadSongCorpus();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const liveWeatherExpression = {
  rain: "thunderstorm",
  snow: "blizzard",
  sun: "scorching heat",
} as const;

function isWeather(value: string | null): value is keyof typeof liveWeatherExpression {
  return value === "rain" || value === "snow" || value === "sun";
}

test.describe("song journeys", () => {
  for (const songCase of corpus.tracks) {
    test(`${songCase.caseId}: search, weather, playback, and enter`, async ({ page }, testInfo) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installFakeYouTube(page, corpus.tracks);
      await installSoundspaceRoutes(page, corpus);

      await page.goto("/");
      const landing = page.getByRole("region", { name: "find a soundspace" });
      await expect(landing).toBeVisible();
      await expect(page.locator("main.player-shell")).toHaveAttribute("data-landing", "true");
      await expect(page.locator(".now-playing")).toHaveCount(0);

      await landing.getByRole("textbox", { name: "search youtube" }).fill(songCase.query);
      await landing.getByRole("button", { name: "search ↗" }).click();
      const result = landing.getByRole("button", {
        name: new RegExp(
          `${escapeRegExp(songCase.track.title)}.*${escapeRegExp(songCase.track.artists.join(", "))}`,
          "i",
        ),
      });
      await expect(result).toBeVisible();
      await expect(result.getByRole("img", { name: /^recommended weather: (rain|sun|snow)$/ })).toBeVisible();
      await result.click();

      const shell = page.locator("main.player-shell");
      const orb = page.locator(".artwork-orb-control");
      await expect(shell).toHaveAttribute("data-landing", "false");
      await expect(shell).toHaveAttribute("data-entered", "false");
      await expect(shell).toHaveAttribute("data-weather-stage", "pregame");
      await expect(shell).toHaveAttribute("data-weather-primary", /^(rain|snow|sun)$/);
      const primaryWeather = await shell.getAttribute("data-weather-primary");
      if (!isWeather(primaryWeather)) throw new Error("song weather must be rain, snow, or sun");
      await expect(shell).toHaveAttribute("data-weather-expression", primaryWeather);
      await expect(shell).toHaveAttribute("data-weather-confidence", /^(0\.[6-9]\d\d|1\.000)$/);
      await expect(shell).toHaveAttribute("data-weather-seed", /\d+/);
      await expect(shell).toHaveAttribute("data-music-source", "authored-playback-clock");
      await expect(shell).toHaveAttribute("data-music-energy", /^0\.\d{3}$/);
      await expect(shell).toHaveAttribute("data-music-pulse", /^0\.\d{3}$/);
      await expect(shell).toHaveAttribute("data-visual-quality", "max");
      await expect(shell).toHaveAttribute("data-playing", "false");
      await expect(orb).toHaveAttribute("data-playing", "false");
      await expect(page.getByRole("button", { name: "play" })).toBeVisible();
      const weatherPicker = page.getByRole("group", { name: "choose weather" });
      await expect(weatherPicker.getByRole("button", { name: "auto" })).toHaveAttribute("aria-pressed", "true");

      for (const weather of ["rain", "sun", "snow"] as const) {
        await weatherPicker.getByRole("button", { name: weather }).click();
        await expect(weatherPicker.getByRole("button", { name: weather })).toHaveAttribute("aria-pressed", "true");
        await expect(shell).toHaveAttribute("data-weather-primary", weather);
      }
      await weatherPicker.getByRole("button", { name: "auto" }).click();
      await expect(weatherPicker.getByRole("button", { name: "auto" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".now-playing h1")).toHaveText(songCase.track.title.toLowerCase());
      await expect(page.locator(".artist-line")).toHaveText(songCase.track.artists.join(", ").replace(/ - Topic$/, "").toLowerCase());
      await expect(page.locator("main.player-shell")).toHaveCount(1);
      await expect(page.locator(".youtube-player-host"))
        .toHaveAttribute("data-track-id", songCase.track.youtubeVideoId);
      await expect(page.getByRole("complementary", { name: "visual budget probe" })).toBeVisible();
      await expect(page.getByText("forming", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: `enter ${songCase.track.title.toLowerCase()}` }).click();
      await expect(shell).toHaveAttribute("data-entered", "true");
      await expect(shell).toHaveAttribute("data-weather-stage", "live");
      await expect(shell).toHaveAttribute("data-playing", "true");
      await expect(shell).toHaveAttribute("data-weather-expression", liveWeatherExpression[primaryWeather]);
      await expect(orb).toHaveAttribute("data-active", "true");
      await expect(orb).toHaveAttribute("data-playing", "true");
      await expect(page.getByRole("button", { name: "pause" })).toBeVisible();
      const exitControl = page.getByRole("button", { name: `exit ${songCase.track.title.toLowerCase()}` });
      await expect(exitControl).toContainText(`exit the ${await shell.getAttribute("data-weather-primary")}`);
      await expect(page.locator(".artist-line")).not.toContainText(" - Topic");
      await expect(page.locator("main.player-shell")).toHaveCount(1);
      await expect(page.locator(".youtube-player-host")).toHaveCount(1);

      if (songCase.caseId === "seed-01-nabokov") {
        const timeline = page.getByRole("slider", { name: "seek position" });
        await timeline.fill("60000");
        await timeline.blur();
        await expect(page.locator(".time-row span").first()).toHaveText("1:00");
      }

      // The orb turns a still pregame into audible, moving weather. Pausing
      // inside the world freezes it without changing the entry state.
      await page.getByRole("button", { name: "pause" }).click();
      await expect(shell).toHaveAttribute("data-entered", "true");
      await expect(shell).toHaveAttribute("data-playing", "false");
      await expect(shell).toHaveAttribute("data-weather-expression", primaryWeather);
      await expect(orb).toHaveAttribute("data-active", "true");
      await expect(orb).toHaveAttribute("data-playing", "false");
      await expect(page.getByRole("button", { name: "play" })).toBeVisible();

      // Exit changes only the presentation. It never changes transport.
      await exitControl.click();
      await expect(shell).toHaveAttribute("data-entered", "false");
      await expect(shell).toHaveAttribute("data-weather-stage", "pregame");
      await expect(shell).toHaveAttribute("data-playing", "false");
      await expect(orb).toHaveAttribute("data-active", "false");
      await expect(orb).toHaveAttribute("data-playing", "false");
      await expect(page.getByRole("button", { name: "play" })).toBeVisible();

      // Playback outside the world still animates the orb. Re-entry expands
      // the already-playing weather without restarting or pausing it.
      await page.getByRole("button", { name: "play" }).click();
      await expect(page.getByRole("button", { name: "pause" })).toBeVisible();
      await expect(shell).toHaveAttribute("data-playing", "true");
      await expect(shell).toHaveAttribute("data-weather-expression", liveWeatherExpression[primaryWeather]);
      await expect(orb).toHaveAttribute("data-playing", "true");

      await page.getByRole("button", { name: `enter ${songCase.track.title.toLowerCase()}` }).click();
      await expect(shell).toHaveAttribute("data-entered", "true");
      await expect(shell).toHaveAttribute("data-weather-stage", "live");
      await expect(shell).toHaveAttribute("data-playing", "true");
      await expect(orb).toHaveAttribute("data-active", "true");
      await expect(orb).toHaveAttribute("data-playing", "true");
      await expect(page.getByRole("button", { name: "pause" })).toBeVisible();

      if (process.env.SOUNDSPACE_E2E_CAPTURE === "1") {
        await testInfo.attach(`${songCase.caseId}-inside`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      }

      await page.getByRole("button", { name: `exit ${songCase.track.title.toLowerCase()}` }).click();
      await expect(shell).toHaveAttribute("data-entered", "false");
      await expect(shell).toHaveAttribute("data-weather-stage", "pregame");
      await expect(shell).toHaveAttribute("data-playing", "true");
      await expect(orb).toHaveAttribute("data-active", "false");
      await expect(orb).toHaveAttribute("data-playing", "true");
      await expect(page.getByRole("button", { name: "pause" })).toBeVisible();

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
});
