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
