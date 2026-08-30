import type { VisualState } from "@soundspace/shared";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  type Group,
  type PointLight,
  type Points,
} from "three";
import { useEffect, useMemo, useRef, useState } from "react";

type SoundspaceWorldProps = {
  visualState: VisualState;
};

type WorldSceneProps = SoundspaceWorldProps & {
  reducedMotion: boolean;
};

type CloudSeed = {
  opacity: number;
  position: [number, number, number];
  scale: [number, number, number];
  speed: number;
};

type ParticleSeed = {
  position: [number, number, number];
  phase: number;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const clouds: readonly CloudSeed[] = [
  { opacity: 0.34, position: [-4.7, 2.5, -1.8], scale: [3.8, 1.35, 1], speed: 0.22 },
  { opacity: 0.22, position: [-1.3, 3.1, -2.1], scale: [3.4, 1.1, 1], speed: 0.16 },
  { opacity: 0.42, position: [2.2, 2.1, -1.6], scale: [4.6, 1.6, 1], speed: 0.28 },
  { opacity: 0.26, position: [5.3, 3.45, -2.3], scale: [3.1, 1.04, 1], speed: 0.12 },
  { opacity: 0.18, position: [0.6, 0.7, -2.2], scale: [5.1, 1.2, 1], speed: 0.08 },
];

const rainPositions = new Float32Array(
  Array.from({ length: 100 }, () => [
    (Math.random() - 0.5) * 17,
    (Math.random() - 0.5) * 11,
    (Math.random() - 0.5) * 2,
  ]).flat(),
);

const particles: readonly ParticleSeed[] = Array.from({ length: 44 }, () => ({
  phase: Math.random() * Math.PI * 2,
  position: [
    (Math.random() - 0.5) * 13,
    (Math.random() - 0.5) * 8,
    -0.4 - Math.random() * 1.8,
  ],
}));

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

function Skywash({ visualState }: WorldSceneProps) {
  const { climate, weather } = visualState;
  const baseline = climate.baseline;
  const light = clamp(baseline.sunlight * 0.22 + weather.sunlight * 0.78);
  const warmth = clamp(baseline.temperature * 0.35 + weather.temperature * 0.65);
  const sky = useMemo(() => {
    const night = new Color("#120d20");
    const clearing = new Color("#7c4b64");
    const sun = new Color("#e7a66e");
    const base = night.clone().lerp(clearing, light * 0.7);
    return base.lerp(sun, light * warmth * 0.34);
  }, [light, warmth]);
  const horizon = useMemo(() => {
    const base = new Color("#211a34");
    return base.lerp(new Color("#bc6c72"), light * 0.5);
  }, [light]);

  return (
    <>
      <mesh position={[0, 0.2, -5]} scale={[1.3, 1, 1]}>
        <planeGeometry args={[14, 9]} />
        <meshBasicMaterial color={sky} opacity={0.96} transparent />
      </mesh>
      <mesh position={[0, -3.6, -4.7]} visible={visualState.semantics.horizon > 0.01}>
        <planeGeometry args={[15, 2.8]} />
        <meshBasicMaterial
          color={horizon}
          opacity={visualState.semantics.horizon * (0.22 + weather.haze * 0.4)}
          transparent
        />
      </mesh>
    </>
  );
}

function CloudField({ visualState, reducedMotion }: WorldSceneProps) {
  const group = useRef<Group>(null);
  const { audio, climate, semantics, weather } = visualState;
  const presence = semantics.clouds;

  useFrame((state, delta) => {
    if (!group.current || reducedMotion || presence <= 0.01) return;
    const drift = weather.wind * (0.16 + audio.midEnergy * 0.24);
    group.current.position.x = Math.sin(state.clock.elapsedTime * 0.06) * drift;
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.04) * 0.008;
    group.current.children.forEach((cloud, index) => {
      cloud.position.y += Math.sin(state.clock.elapsedTime * clouds[index]!.speed) * delta * 0.035;
    });
  });

  const color = useMemo(() => {
    const storm = new Color("#25182f");
    const baselineLight = climate.baseline.sunlight * 0.18;
    return storm.lerp(new Color("#b6787e"), baselineLight + weather.sunlight * 0.52);
  }, [climate.baseline.sunlight, weather.sunlight]);

  return (
    <group ref={group} visible={presence > 0.01}>
      {clouds.map((cloud, index) => (
        <mesh
          key={index}
          position={cloud.position}
          rotation={[0, 0, index % 2 === 0 ? -0.12 : 0.09]}
          scale={cloud.scale}
        >
          <circleGeometry args={[1, 64]} />
          <meshBasicMaterial
            color={color}
            opacity={presence * cloud.opacity * (0.38 + weather.cloudCover * 0.7)}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

function RainField({ visualState, reducedMotion }: WorldSceneProps) {
  const points = useRef<Points>(null);
  const { audio, semantics, weather } = visualState;
  const presence = semantics.precipitation;

  useFrame((_, delta) => {
    if (!points.current || reducedMotion || presence <= 0.01) return;
    const attribute = points.current.geometry.getAttribute("position");
    const fall = (3.5 + weather.wind * 8 + audio.highEnergy * 4) * delta;
    const slant = (weather.wind * 0.8 + audio.spectralFlux * 0.24) * delta;

    for (let index = 0; index < attribute.count; index += 1) {
      attribute.setY(index, attribute.getY(index) - fall);
      attribute.setX(index, attribute.getX(index) + slant);
      if (attribute.getY(index) < -5.8) {
        attribute.setY(index, 5.8 + Math.random() * 1.2);
        attribute.setX(index, (Math.random() - 0.5) * 16);
      }
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points} visible={presence > 0.01} rotation={[0, 0, -weather.wind * 0.11]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[rainPositions, 3]} count={100} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        color="#d4b6c6"
        opacity={presence * weather.precipitation * (0.22 + weather.stormIntensity * 0.5)}
        size={0.019 + weather.precipitation * 0.038}
        sizeAttenuation
        transparent
      />
    </points>
  );
}

function ElectricalFront({ visualState, reducedMotion }: WorldSceneProps) {
  const light = useRef<PointLight>(null);
  const { audio, semantics, weather } = visualState;
  const presence = semantics.electricity;

  useFrame(({ clock }) => {
    if (!light.current || reducedMotion || presence <= 0.01) return;
    const signal = clamp(audio.transient * 2.2 + audio.highEnergy * 0.38);
    const cadence = Math.max(0, Math.sin(clock.elapsedTime * (0.55 + weather.stormIntensity * 2.3)) - 0.94);
    light.current.intensity = presence * weather.stormIntensity * (signal + cadence * 5.2);
  });

  return (
    <pointLight
      ref={light}
      color="#c5b3ff"
      decay={1.4}
      intensity={0}
      position={[2.8, 2.1, 1.6]}
      visible={presence > 0.01}
    />
  );
}

function AirborneMatter({ visualState, reducedMotion }: WorldSceneProps) {
  const group = useRef<Group>(null);
  const { audio, semantics, weather } = visualState;
  const presence = semantics.particles;

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion || presence <= 0.01) return;
    const motion = weather.wind * 0.14 + audio.rms * 0.16;
    group.current.children.forEach((particle, index) => {
      const seed = particles[index]!;
      particle.position.x = seed.position[0] + Math.sin(clock.elapsedTime * motion + seed.phase) * 0.45;
      particle.position.y = seed.position[1] + Math.cos(clock.elapsedTime * (motion * 0.7) + seed.phase) * 0.22;
      particle.scale.setScalar(0.45 + audio.transient * 1.1);
    });
  });

  return (
    <group ref={group} visible={presence > 0.01}>
      {particles.map((particle, index) => (
        <mesh key={index} position={particle.position}>
          <circleGeometry args={[0.017 + (index % 4) * 0.009, 12]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#e5a581"
            opacity={presence * (0.08 + weather.haze * 0.24)}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

function AtmosphericScene(props: WorldSceneProps) {
  const { visualState } = props;
  const baseline = visualState.climate.baseline;
  const atmosphericHaze = clamp(baseline.haze * 0.34 + visualState.weather.haze * 0.66);
  const atmosphericLight = clamp(
    baseline.sunlight * 0.2 + visualState.weather.sunlight * 0.8,
  );
  const fogColor = useMemo(() => {
    const dark = new Color("#170f1d");
    return dark.lerp(new Color("#6e455b"), atmosphericHaze * 0.5);
  }, [atmosphericHaze]);
  const ambientIntensity = 0.08 + atmosphericLight * 0.32;

  return (
    <>
      <fog attach="fog" args={[fogColor, 4.4, 13 - atmosphericHaze * 6]} />
      <ambientLight color="#f3d8ca" intensity={ambientIntensity} />
      <pointLight
        color="#d99876"
        intensity={atmosphericLight * 1.2}
        position={[-3.4, 2.8, 2.2]}
      />
      <Skywash {...props} />
      <CloudField {...props} />
      <RainField {...props} />
      <ElectricalFront {...props} />
      <AirborneMatter {...props} />
    </>
  );
}

export function SoundspaceWorld({ visualState }: SoundspaceWorldProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="soundspace-world">
      <Canvas
        camera={{ fov: 46, position: [0, 0, 7.2] }}
        dpr={[1, 1.65]}
        frameloop={reducedMotion ? "demand" : "always"}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ pointerEvents: "none" }}
      >
        <AtmosphericScene reducedMotion={reducedMotion} visualState={visualState} />
      </Canvas>
    </div>
  );
}
