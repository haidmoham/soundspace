export type SpotifySdkArtist = {
  name: string;
};

export type SpotifySdkTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: SpotifySdkArtist[];
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
};

export type SpotifySdkState = {
  duration: number;
  paused: boolean;
  position: number;
  track_window: {
    current_track: SpotifySdkTrack;
  };
};

export type SpotifySdkPlayerOptions = {
  name: string;
  getOAuthToken(callback: (token: string) => void): void;
  volume?: number;
};

export type SpotifySdkPlayer = {
  addListener(event: string, callback: (payload: never) => void): boolean;
  connect(): Promise<boolean>;
  disconnect(): void;
  getCurrentState(): Promise<SpotifySdkState | null>;
  nextTrack(): Promise<void>;
  pause(): Promise<void>;
  previousTrack(): Promise<void>;
  removeListener(event?: string): boolean;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
};

export type SpotifySdkConstructor = new (
  options: SpotifySdkPlayerOptions,
) => SpotifySdkPlayer;

declare global {
  interface Window {
    Spotify?: {
      Player: SpotifySdkConstructor;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export {};
