import { expect, test } from "@playwright/test";
import { installFakeYouTube } from "./support/fake-youtube";
import { loadSongCorpus } from "./support/song-corpus";
import { installSoundspaceRoutes } from "./support/soundspace-routes";

const corpus = loadSongCorpus();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.describe("song journeys", () => {
  for (const songCase of corpus.tracks) {
    test(`${songCase.caseId}: search, pregame, and enter`, async ({ page }, testInfo) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installFakeYouTube(page, corpus.tracks);
      await installSoundspaceRoutes(page, corpus);

      await page.goto("/");
      await expect(page.getByRole("button", { name: /^enter / })).toBeEnabled();
      await expect(page.getByText("forming", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "choose track" }).click();
      const dialog = page.getByRole("dialog", { name: "choose youtube track" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("textbox", { name: "search youtube" }).fill(songCase.query);
      await dialog.getByRole("button", { name: "search ↗" }).click();
      const result = dialog.getByRole("button", {
        name: new RegExp(
          `${escapeRegExp(songCase.track.title)}.*${escapeRegExp(songCase.track.artists.join(", "))}`,
          "i",
        ),
      });
      await expect(result).toBeVisible();
      await result.click();

      const shell = page.locator("main.player-shell");
      await expect(shell).toHaveAttribute("data-entered", "false");
      await expect(shell).toHaveAttribute("data-weather-stage", "pregame");
      await expect(shell).toHaveAttribute("data-weather-primary", /^(rain|snow|sun)$/);
      await expect(shell).toHaveAttribute("data-weather-confidence", /^(0\.[6-9]\d\d|1\.000)$/);
      await expect(shell).toHaveAttribute("data-weather-seed", /\d+/);
      await expect(shell).toHaveAttribute("data-visual-quality", "max");
      await expect(page.locator(".now-playing h1")).toHaveText(songCase.track.title);
      await expect(page.locator(".artist-line")).toHaveText(songCase.track.artists.join(", ").replace(/ - Topic$/, ""));
      await expect(page.locator("main.player-shell")).toHaveCount(1);
      await expect(page.locator(".youtube-player-host")).toHaveCount(1);
      await expect(page.getByRole("complementary", { name: "visual budget probe" })).toBeVisible();
      await expect(page.getByText("forming", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: `enter ${songCase.track.title}` }).click();
      await expect(shell).toHaveAttribute("data-entered", "true");
      await expect(shell).toHaveAttribute("data-weather-stage", "live");
      await expect(page.getByRole("button", { name: "soundspace entered" })).toContainText("inside");
      await expect(page.locator(".artist-line")).not.toContainText(" - Topic");
      await expect(page.locator("main.player-shell")).toHaveCount(1);
      await expect(page.locator(".youtube-player-host")).toHaveCount(1);
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
