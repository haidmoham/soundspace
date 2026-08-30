import type { VisualState, WeatherProfile } from "@soundspace/shared";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { MusicResponseEnvelope } from "../atmosphere/music-response";
import {
  VISUAL_QUALITY,
  WeatherSystem,
  type VisualQuality,
} from "./WeatherSystem";

export type PerformanceSample = {
  calls: number;
  fps: number;
  frameMs: number;
  points: number;
  triangles: number;
};

type SoundspaceWorldProps = {
  /**
   * The parent entry timeline, normalized from 0 to 1. When omitted, the
   * weather renderer uses its local fallback timeline for backwards safety.
   */
  entryProgress?: number;
  entryVisualState: VisualState;
  expanded: boolean;
  onPerformanceSample?(sample: PerformanceSample): void;
  profile: WeatherProfile;
  quality: VisualQuality;
  response: MusicResponseEnvelope;
  visualState: VisualState;
};

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function RenderBudgetMeter({
  onSample,
}: {
  onSample?(sample: PerformanceSample): void;
}) {
  const elapsed = useRef(0);
  const frames = useRef(0);

  useFrame(({ gl }, delta) => {
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 0.8) return;
    const fps = frames.current / elapsed.current;
    onSample?.({
      calls: gl.info.render.calls,
      fps,
      frameMs: 1_000 / Math.max(fps, 1),
      points: gl.info.render.points,
      triangles: gl.info.render.triangles,
    });
    elapsed.current = 0;
    frames.current = 0;
  });

  return null;
}

export function SoundspaceWorld({
  entryProgress,
  entryVisualState,
  expanded,
  onPerformanceSample,
  profile,
  quality,
  response,
  visualState,
}: SoundspaceWorldProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="soundspace-world">
      <Canvas
        camera={{ fov: 46, position: [0, 0, 7.2] }}
        dpr={VISUAL_QUALITY[quality].dpr}
        frameloop="always"
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ pointerEvents: "none" }}
      >
        <WeatherSystem
          entryProgress={entryProgress}
          entryVisualState={entryVisualState}
          expanded={expanded}
          profile={profile}
          quality={quality}
          reducedMotion={reducedMotion}
          response={response}
          visualState={visualState}
        />
        <RenderBudgetMeter onSample={onPerformanceSample} />
      </Canvas>
    </div>
  );
}
