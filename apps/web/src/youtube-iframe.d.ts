export {};

declare global {
  type YouTubePlayerState = -1 | 0 | 1 | 2 | 3 | 5;

  type YouTubePlayerEvent = {
    target: YouTubePlayer;
  };

  type YouTubePlayerStateChangeEvent = YouTubePlayerEvent & {
    data: YouTubePlayerState;
  };

  type YouTubePlayerErrorEvent = YouTubePlayerEvent & {
    data: 2 | 5 | 100 | 101 | 150 | 153;
  };

  type YouTubePlayerEvents = {
    onAutoplayBlocked: YouTubePlayerEvent;
    onError: YouTubePlayerErrorEvent;
    onReady: YouTubePlayerEvent;
    onStateChange: YouTubePlayerStateChangeEvent;
  };

  type YouTubeVideoData = {
    author: string;
    title: string;
    video_id: string;
  };

  type YouTubePlayer = {
    cueVideoById(videoId: string): void;
    destroy(): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): YouTubePlayerState;
    getVideoData(): YouTubeVideoData | undefined;
    loadVideoById(videoId: string): void;
    pauseVideo(): void;
    playVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setVolume(volume: number): void;
  };

  type YouTubePlayerOptions = {
    events?: {
      [K in keyof YouTubePlayerEvents]?: (event: YouTubePlayerEvents[K]) => void;
    };
    height?: number;
    playerVars?: {
      autoplay?: 0 | 1;
      controls?: 0 | 1;
      disablekb?: 0 | 1;
      modestbranding?: 0 | 1;
      origin?: string;
      playsinline?: 0 | 1;
      rel?: 0 | 1;
    };
    videoId?: string;
    width?: number;
  };

  type YouTubePlayerConstructor = new (
    element: HTMLElement,
    options: YouTubePlayerOptions,
  ) => YouTubePlayer;

  interface Window {
    YT?: {
      Player: YouTubePlayerConstructor;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
