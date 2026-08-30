import type { Page } from "@playwright/test";
import type { SongCorpusCase } from "./song-corpus";

type FakePlayerOptions = {
  events: {
    onReady(event: { target: FakeYouTubePlayer }): void;
    onStateChange(event: { data: number; target: FakeYouTubePlayer }): void;
  };
};

type FakeVideoData = {
  author: string;
  video_id: string;
};

type FakeYouTubePlayer = {
  cueVideoById(videoId: string): void;
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): FakeVideoData;
  pauseVideo(): void;
  playVideo(): void;
  seekTo(seconds: number): void;
  setVolume(volume: number): void;
};

export async function installFakeYouTube(page: Page, cases: SongCorpusCase[]): Promise<void> {
  const authorByVideoId = Object.fromEntries(
    cases.map((songCase) => [songCase.track.youtubeVideoId, songCase.playerAuthor]),
  );

  await page.addInitScript((authors: Record<string, string>) => {
    class DeterministicPlayer implements FakeYouTubePlayer {
      private currentTime = 0;
      private destroyed = false;
      private duration = 213;
      private playerState = 5;
      private videoId = "";

      constructor(_element: HTMLElement, private readonly options: FakePlayerOptions) {
        window.setTimeout(() => {
          if (!this.destroyed) this.options.events.onReady({ target: this });
        }, 0);
      }

      cueVideoById(videoId: string): void {
        this.videoId = videoId;
        this.currentTime = 0;
        this.playerState = 5;
        this.emitState();
      }

      destroy(): void {
        this.destroyed = true;
      }

      getCurrentTime(): number {
        return this.currentTime;
      }

      getDuration(): number {
        return this.videoId ? this.duration : 0;
      }

      getPlayerState(): number {
        return this.playerState;
      }

      getVideoData(): FakeVideoData {
        return {
          author: authors[this.videoId] || "Fixture Artist",
          video_id: this.videoId,
        };
      }

      pauseVideo(): void {
        this.playerState = 2;
        this.emitState();
      }

      playVideo(): void {
        this.playerState = 1;
        this.emitState();
      }

      seekTo(seconds: number): void {
        this.currentTime = Math.max(0, Math.min(seconds, this.duration));
        this.emitState();
      }

      setVolume(_volume: number): void {}

      private emitState(): void {
        this.options.events.onStateChange({ data: this.playerState, target: this });
      }
    }

    Reflect.set(window, "YT", { Player: DeterministicPlayer });
  }, authorByVideoId);
}
