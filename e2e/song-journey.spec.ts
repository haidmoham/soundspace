import { expect, test } from "@playwright/test";
import { installFakeYouTube } from "./support/fake-youtube";
import { loadSongCorpus } from "./support/song-corpus";
import { installSoundspaceRoutes } from "./support/soundspace-routes";

const corpus = loadSongCorpus();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("song journeys", () => {
  for (const songCase of corpus.tracks) {
    test(`${songCase.caseId}: search, pregame, and enter`, async ({ page }, testInfo) => {
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
      await expect(shell).toHaveAttribute("data-landing", "false");
      await expect(shell).toHaveAttribute("data-entered", "false");
      await expect(shell).toHaveAttribute("data-weather-stage", "pregame");
      await expect(shell).toHaveAttribute("data-weather-primary", /^(rain|snow|sun)$/);
      await expect(shell).toHaveAttribute("data-weather-confidence", /^(0\.[6-9]\d\d|1\.000)$/);
      await expect(shell).toHaveAttribute("data-weather-seed", /\d+/);
      await expect(shell).toHaveAttribute("data-music-source", "authored-playback-clock");
      await expect(shell).toHaveAttribute("data-music-energy", /^0\.\d{3}$/);
      await expect(shell).toHaveAttribute("data-music-pulse", /^0\.\d{3}$/);
      await expect(shell).toHaveAttribute("data-visual-quality", "max");
      const weatherPicker = page.getByRole("group", { name: "choose weather" });
      await expect(weatherPicker.getByRole("button", { name: "auto" })).toHaveAttribute("aria-pressed", "true");
      if (songCase.caseId === "seed-01-nabokov") {
        const suggestedWeather = await shell.getAttribute("data-weather-primary");
        const overrideWeather = suggestedWeather === "rain" ? "snow" : "rain";
        await weatherPicker.getByRole("button", { name: overrideWeather }).click();
        await expect(shell).toHaveAttribute("data-weather-primary", overrideWeather);
        await weatherPicker.getByRole("button", { name: "auto" }).click();
        await expect(shell).toHaveAttribute("data-weather-primary", suggestedWeather ?? "rain");
      }
      await expect(page.locator(".now-playing h1")).toHaveText(songCase.track.title.toLowerCase());
      await expect(page.locator(".artist-line")).toHaveText(songCase.track.artists.join(", ").replace(/ - Topic$/, "").toLowerCase());
      await expect(page.locator("main.player-shell")).toHaveCount(1);
      await expect(page.locator(".youtube-player-host")).toHaveCount(1);
      await expect(page.getByRole("complementary", { name: "visual budget probe" })).toBeVisible();
      await expect(page.getByText("forming", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: `enter ${songCase.track.title.toLowerCase()}` }).click();
      await expect(shell).toHaveAttribute("data-entered", "true");
      await expect(shell).toHaveAttribute("data-weather-stage", "live");
      await expect(page.getByRole("button", { name: "soundspace entered" })).toContainText("inside");
      await expect(page.locator(".artist-line")).not.toContainText(" - Topic");
      await expect(page.locator("main.player-shell")).toHaveCount(1);
      await expect(page.locator(".youtube-player-host")).toHaveCount(1);

      if (songCase.caseId === "seed-01-nabokov") {
        const timeline = page.getByRole("slider", { name: "seek position" });
        await timeline.fill("60000");
        await timeline.blur();
        await expect(page.locator(".time-row span").first()).toHaveText("1:00");
      }

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);

      if (process.env.SOUNDSPACE_E2E_CAPTURE === "1") {
        await testInfo.attach(`${songCase.caseId}-inside`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      }
    });
  }
});
