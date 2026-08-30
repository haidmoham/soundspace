import type {
  VisualState,
  WeatherExpressionResponse,
  WeatherProfile,
} from "@soundspace/shared";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  type Group,
  type LineBasicMaterial,
  type LineSegments,
  type MeshBasicMaterial,
  type PointLight,
  type Points,
  type ShaderMaterial,
} from "three";
import { type ReactNode, useEffect, useMemo, useRef } from "react";

export type WeatherSystemProps = {
  /** Normalized parent entry timeline. The local timer remains a fallback. */
  entryProgress?: number;
  entryVisualState: VisualState;
  expanded: boolean;
  profile: WeatherProfile;
  quality: VisualQuality;
  reducedMotion: boolean;
  visualState: VisualState;
};

export type VisualQuality = "low" | "balanced" | "max";

export const VISUAL_QUALITY = {
  low: { density: 0.38, dpr: 1, label: "low" },
  balanced: { density: 0.68, dpr: 1.35, label: "balanced" },
  max: { density: 1, dpr: 1.8, label: "max" },
} as const satisfies Record<VisualQuality, { density: number; dpr: number; label: string }>;

type LayerProps = WeatherSystemProps;

type CloudSeed = {
  opacity: number;
  position: [number, number, number];
  rotation: number;
  scale: [number, number, number];
  speed: number;
};

type MistSeed = {
  opacity: number;
  position: [number, number, number];
  scale: [number, number, number];
  speed: number;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const EMPTY_EXPRESSION_RESPONSE: WeatherExpressionResponse = {
  atmosphericMotion: 0,
  viewportPressure: 0,
  particleAgitation: 0,
  lightVolatility: 0,
  obscurity: 0,
};

function phenomenonMembership(profile: WeatherProfile, phenomenon: string) {
  return profile.relationships
    .filter((relationship) => relationship.phenomenon === phenomenon)
    .reduce((total, relationship) => total + relationship.membership, 0);
}

function weatherForces({
  profile,
  visualState,
}: Pick<LayerProps, "profile" | "visualState">) {
  const forces = { ...EMPTY_EXPRESSION_RESPONSE };
  for (const relationship of profile.relationships) {
    const driver = Math.max(
      visualState.climate.baseline[relationship.driver] * 0.82,
      visualState.weather[relationship.driver],
    );
    const amount = driver * relationship.membership;
    forces.atmosphericMotion += relationship.response.atmosphericMotion * amount;
    forces.viewportPressure += relationship.response.viewportPressure * amount;
    forces.particleAgitation += relationship.response.particleAgitation * amount;
    forces.lightVolatility += relationship.response.lightVolatility * amount;
    forces.obscurity += relationship.response.obscurity * amount;
  }
  return {
    atmosphericMotion: clamp(forces.atmosphericMotion),
    viewportPressure: clamp(forces.viewportPressure),
    particleAgitation: clamp(forces.particleAgitation),
    lightVolatility: clamp(forces.lightVolatility),
    obscurity: clamp(forces.obscurity),
  };
}

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function qualityDensity(quality: VisualQuality) {
  return VISUAL_QUALITY[quality].density;
}

function createCloudSeeds(profile: WeatherProfile, quality: VisualQuality): readonly CloudSeed[] {
  const random = createRandom(profile.seed + 17);
  const count = 6 + Math.round(profile.layers.cloudDensity * 22 * qualityDensity(quality));
  return Array.from({ length: count }, (_, index) => {
    const depth = random();
    return {
      opacity: 0.09 + random() * 0.2,
      position: [
        (random() - 0.5) * 17,
        -0.1 + random() * 5.7,
        -3.3 + depth * 2.5,
      ],
      rotation: (random() - 0.5) * 0.32,
      scale: [
        2.2 + random() * 3.8,
        0.52 + random() * 1.15,
        1,
      ],
      speed: 0.035 + random() * 0.11 + index * 0.001,
    };
  });
}

function createMistSeeds(profile: WeatherProfile, quality: VisualQuality): readonly MistSeed[] {
  const random = createRandom(profile.seed + 41);
  const count = 3 + Math.round(profile.layers.mistDensity * 8 * qualityDensity(quality));
  return Array.from({ length: count }, () => ({
    opacity: 0.035 + random() * 0.09,
    position: [
      (random() - 0.5) * 10,
      -3 + random() * 5.2,
      -0.6 - random() * 2.2,
    ],
    scale: [4.2 + random() * 4.6, 0.18 + random() * 0.42, 1],
    speed: 0.025 + random() * 0.09,
  }));
}

function createRainPositions(seed: number, count: number, near: boolean) {
  const random = createRandom(seed);
  const positions = new Float32Array(count * 6);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 6;
    const x = (random() - 0.5) * 18;
    const y = (random() - 0.5) * 12;
    const z = near ? 2.2 + random() * 1.2 : -2.2 + random() * 1.8;
    const length = (near ? 0.18 : 0.08) + random() * (near ? 0.34 : 0.18);
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    positions[offset + 3] = x - length * (near ? 0.72 : 0.42);
    positions[offset + 4] = y - length;
    positions[offset + 5] = z;
  }
  return positions;
}

function createParticleData(profile: WeatherProfile, quality: VisualQuality) {
  const random = createRandom(profile.seed + 83);
  const count = 32 + Math.round(profile.layers.particleDensity * 240 * qualityDensity(quality));
  const positions = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const x = (random() - 0.5) * 15;
    const y = (random() - 0.5) * 9;
    const z = -1.8 + random() * 3.4;
    positions.set([x, y, z], offset);
    origins.set([x, y, z], offset);
    phases[index] = random() * Math.PI * 2;
  }
  return { origins, phases, positions };
}

function createWindPositions(profile: WeatherProfile, quality: VisualQuality) {
  const random = createRandom(profile.seed + 307);
  const count = 36 + Math.round(profile.layers.turbulence * 180 * qualityDensity(quality));
  const positions = new Float32Array(count * 6);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 6;
    const x = (random() - 0.5) * 18;
    const y = (random() - 0.5) * 11;
    const z = 1.4 + random() * 2;
    const length = 0.24 + random() * 1.1;
    positions.set([x, y, z, x + length, y + length * 0.22, z], offset);
  }
  return { count, positions };
}

function createSnowData(profile: WeatherProfile, quality: VisualQuality) {
  const random = createRandom(profile.seed + 401);
  const count = 100 + Math.round(700 * profile.layers.precipitationDensity * qualityDensity(quality));
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions.set([
      (random() - 0.5) * 18,
      (random() - 0.5) * 12,
      -2.4 + random() * 5.2,
    ], offset);
    phases[index] = random() * Math.PI * 2;
    sizes[index] = 0.5 + random() * 1.5;
  }
  return { count, phases, positions, sizes };
}

function createSolarData(profile: WeatherProfile, quality: VisualQuality) {
  const random = createRandom(profile.seed + 503);
  const count = 80 + Math.round(480 * profile.layers.particleDensity * qualityDensity(quality));
  const positions = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const radius = 0.8 + random() * 7;
    const angle = random() * Math.PI * 2;
    const offset = index * 3;
    const point: [number, number, number] = [
      3 + Math.cos(angle) * radius,
      1.1 + Math.sin(angle) * radius * 0.64,
      -1.4 + random() * 4,
    ];
    positions.set(point, offset);
    origins.set(point, offset);
    phases[index] = angle;
  }
  return { origins, phases, positions };
}

function createBoltPositions(profile: WeatherProfile) {
  const random = createRandom(profile.seed + 131);
  const segments: number[] = [];
  let previous: [number, number, number] = [2.3, 4.4, 0.8];
  for (let index = 1; index <= 12; index += 1) {
    const next: [number, number, number] = [
      2.3 + (random() - 0.5) * 0.7,
      4.4 - index * 0.55,
      0.8,
    ];
    segments.push(...previous, ...next);
    if (index > 3 && index % 3 === 0) {
      segments.push(
        ...next,
        next[0] + (random() - 0.5) * 1.2,
        next[1] - 0.45 - random() * 0.5,
        next[2],
      );
    }
    previous = next;
  }
  return new Float32Array(segments);
}

const skyVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = /* glsl */ `
  uniform vec3 uSky;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform float uTime;
  uniform float uWind;
  uniform float uTexture;
  uniform float uHazeAmount;
  uniform float uVibrance;
  varying vec2 vUv;

  float weatherNoise(vec2 point) {
    float broad = sin(point.x * 7.0 + point.y * 3.0 + uTime * 0.018);
    float folds = sin(point.x * 16.0 - point.y * 9.0 - uTime * (0.012 + uWind * 0.025));
    float grain = sin((point.x + point.y) * 31.0 + uTime * 0.01);
    return broad * 0.52 + folds * 0.32 + grain * 0.16;
  }

  void main() {
    float horizon = smoothstep(0.08, 0.76, 1.0 - vUv.y);
    float noise = weatherNoise(vUv + vec2(uTime * uWind * 0.002, 0.0)) * 0.5 + 0.5;
    vec3 color = mix(uSky, uHorizon, horizon * 0.48);
    color = mix(color, uHaze, noise * uTexture * uHazeAmount * 0.34);
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, 1.0 + uVibrance * 0.58);
    color += uHorizon * noise * uTexture * uVibrance * 0.12;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const entryFluidVertexShader = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float wave = sin(position.x * 5.2 + uTime * 0.6) * sin(position.y * 4.1 - uTime * 0.42);
    transformed.z += wave * (0.012 + uProgress * 0.075);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const entryFluidFragmentShader = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uCloud;
  uniform vec3 uHaze;
  uniform vec3 uGlow;
  uniform vec3 uPrecipitation;
  uniform float uIntensity;
  uniform float uProgress;
  uniform float uTime;
  varying vec2 vUv;

  float metaball(vec2 point, vec2 center, float radius) {
    vec2 delta = point - center;
    return radius * radius / max(dot(delta, delta), 0.003);
  }

  void main() {
    vec2 point = vUv * 2.0 - 1.0;
    float entry = smoothstep(0.0, 1.0, uProgress);
    float slowTime = uTime * 0.19;
    float sway = sin(slowTime) * (0.025 + entry * 0.12);
    vec2 lobeA = vec2(-0.22 - entry * 0.3, 0.12 + sway);
    vec2 lobeB = vec2(0.25 + entry * 0.38, -0.13 - sway * 0.7);
    vec2 lobeC = vec2(sin(slowTime * 0.72) * (0.05 + entry * 0.24), 0.3 + cos(slowTime) * 0.04);
    float field = metaball(point, vec2(0.0), 0.54 + entry * 0.2);
    field += metaball(point, lobeA, 0.23 + entry * 0.22);
    field += metaball(point, lobeB, 0.18 + entry * 0.24);
    field += metaball(point, lobeC, 0.13 + entry * 0.16);
    float body = smoothstep(1.02, 1.68, field);
    float edge = smoothstep(0.72, 1.34, field) - body;
    float orderedDrift = point.y * 0.42 + point.x * 0.18 + sin(point.x * 4.0 - slowTime) * 0.09;
    float hazeBand = smoothstep(-0.62, -0.06, orderedDrift);
    float cloudBand = smoothstep(-0.08, 0.38, orderedDrift);
    float rainBand = smoothstep(0.32, 0.74, orderedDrift + entry * 0.15);
    vec3 pigment = mix(uCore, uHaze, hazeBand);
    pigment = mix(pigment, uCloud, cloudBand);
    pigment = mix(pigment, uPrecipitation, rainBand * (0.22 + uIntensity * 0.42));
    pigment = mix(pigment, uGlow, edge * (0.34 + entry * 0.38));
    float breathing = 0.9 + sin(slowTime * 1.4) * 0.1;
    float alpha = (body * (0.56 + uIntensity * 0.26) + edge * 0.7) * breathing;
    alpha *= 1.0 - smoothstep(0.62, 1.0, entry) * 0.84;
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(pigment, alpha);
  }
`;

function SkyAndLight({ profile, reducedMotion, visualState }: LayerProps) {
  const material = useRef<ShaderMaterial>(null);
  const forces = weatherForces({ profile, visualState });
  const baseline = visualState.climate.baseline;
  const light = clamp(baseline.sunlight * 0.22 + visualState.weather.sunlight * 0.78);
  const warmth = clamp(
    baseline.temperature * 0.35 + visualState.weather.temperature * 0.65,
  );
  const uniforms = useMemo(
    () => ({
      uHaze: { value: new Color(profile.palette.haze) },
      uHazeAmount: { value: visualState.weather.haze },
      uHorizon: { value: new Color(profile.palette.horizon) },
      uSky: { value: new Color(profile.palette.sky) },
      uTexture: { value: profile.layers.skyTexture },
      uTime: { value: 0 },
      uVibrance: { value: profile.layers.vibrance },
      uWind: { value: visualState.weather.wind + forces.atmosphericMotion * 0.7 },
    }),
    [
      forces.atmosphericMotion,
      profile,
      visualState.weather.haze,
      visualState.weather.wind,
    ],
  );

  useFrame(({ clock }) => {
    if (!material.current) return;
    material.current.uniforms.uTime!.value = reducedMotion ? 0 : clock.elapsedTime;
    material.current.uniforms.uWind!.value =
      visualState.weather.wind + forces.atmosphericMotion * 0.7;
    material.current.uniforms.uHazeAmount!.value = clamp(
      visualState.weather.haze + forces.obscurity * 0.22,
    );
  });

  return (
    <>
      <mesh position={[0, 0.2, -5]} scale={[1.3, 1, 1]}>
        <planeGeometry args={[18, 14]} />
        <shaderMaterial
          depthWrite={false}
          fragmentShader={skyFragmentShader}
          ref={material}
          uniforms={uniforms}
          vertexShader={skyVertexShader}
        />
      </mesh>
      <ambientLight color={profile.palette.haze} intensity={0.08 + light * 0.32} />
      <pointLight
        color={profile.palette.glow}
        intensity={light * (0.8 + warmth * 0.8)}
        position={[-3.4, 2.8, 2.2]}
      />
    </>
  );
}

function CloudMass({ profile, quality, reducedMotion, visualState }: LayerProps) {
  const group = useRef<Group>(null);
  const seeds = useMemo(() => createCloudSeeds(profile, quality), [profile, quality]);
  const presence = visualState.semantics.clouds * visualState.weather.cloudCover;
  const forces = weatherForces({ profile, visualState });

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion || presence <= 0.01) return;
    const wind = visualState.weather.wind;
    const storm = visualState.weather.stormIntensity;
    const lurch = Math.sin(clock.elapsedTime * 2.3) * forces.viewportPressure;
    group.current.rotation.z =
      Math.sin(clock.elapsedTime * (0.34 + storm * 0.9)) * storm * 0.04 +
      lurch * 0.018;
    group.current.position.x = lurch * 0.32;
    group.current.position.y =
      Math.sin(clock.elapsedTime * (0.22 + storm * 0.48)) * storm * 0.25;
    group.current.children.forEach((cloud, index) => {
      const seed = seeds[index]!;
      const travel = (
        clock.elapsedTime *
        seed.speed *
        (0.5 +
          wind * 1.4 +
          profile.layers.turbulence * 0.85 +
          forces.atmosphericMotion * 1.8)
      ) % 20;
      cloud.position.x = ((seed.position[0] + travel + 10) % 20) - 10;
      cloud.position.y =
        seed.position[1] +
        Math.sin(clock.elapsedTime * seed.speed + index) *
          (0.16 +
            profile.layers.turbulence * 0.2 +
            storm * 0.14 +
            forces.atmosphericMotion * 0.22);
    });
  });

  return (
    <group ref={group} visible={presence > 0.01}>
      {seeds.map((seed, index) => (
        <mesh
          key={index}
          position={seed.position}
          rotation={[0, 0, seed.rotation]}
          scale={seed.scale}
        >
          <circleGeometry args={[1, 48]} />
          <meshBasicMaterial
            color={index % 3 === 0 ? profile.palette.cloudLight : profile.palette.cloudDark}
            depthWrite={false}
            opacity={
              presence *
              seed.opacity *
              (0.6 +
                profile.layers.cloudDepth * 0.8 +
                profile.layers.vibrance * 0.22)
            }
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

function MistField({ profile, quality, reducedMotion, visualState }: LayerProps) {
  const group = useRef<Group>(null);
  const seeds = useMemo(() => createMistSeeds(profile, quality), [profile, quality]);
  const presence = profile.layers.mistDensity * visualState.weather.haze;
  const forces = weatherForces({ profile, visualState });

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion || presence <= 0.01) return;
    group.current.children.forEach((band, index) => {
      const seed = seeds[index]!;
      const travel = (
        clock.elapsedTime *
        seed.speed *
        (0.6 +
          visualState.weather.wind * 1.5 +
          profile.layers.turbulence * 0.7 +
          forces.atmosphericMotion * 1.4)
      ) % 18;
      band.position.x = ((seed.position[0] - travel + 9) % 18) - 9;
      band.rotation.z =
        Math.sin(clock.elapsedTime * seed.speed + index) *
        (0.035 +
          profile.layers.turbulence * 0.055 +
          forces.viewportPressure * 0.08);
    });
  });

  return (
    <group ref={group} visible={presence > 0.01}>
      {seeds.map((seed, index) => (
        <mesh key={index} position={seed.position} scale={seed.scale}>
          <circleGeometry args={[1, 64]} />
          <meshBasicMaterial
            color={profile.palette.haze}
            depthWrite={false}
            opacity={
              presence *
              seed.opacity *
              (1 + forces.obscurity * 0.5 + profile.layers.vibrance * 0.18)
            }
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

function RainSheet({
  near,
  profile,
  quality,
  reducedMotion,
  visualState,
}: LayerProps & { near: boolean }) {
  const lines = useRef<LineSegments>(null);
  const count = Math.round(
    ((near ? 220 : 300) +
      profile.layers.precipitationDensity * (near ? 520 : 700)) *
      qualityDensity(quality),
  );
  const positions = useMemo(
    () => createRainPositions(profile.seed + (near ? 211 : 197), count, near),
    [count, near, profile.seed],
  );
  const rainMembership = phenomenonMembership(profile, "rain");
  const forces = weatherForces({ profile, visualState });
  const precipitation = Math.max(
    visualState.climate.baseline.precipitation * 0.82,
    visualState.weather.precipitation,
  );
  const presence =
    rainMembership * visualState.semantics.precipitation * precipitation;

  useFrame(({ clock }, delta) => {
    if (!lines.current || reducedMotion || presence <= 0.01) return;
    const attribute = lines.current.geometry.getAttribute("position");
    const storm = visualState.weather.stormIntensity;
    const fall =
      delta *
      (near ? 6.8 : 4.4) *
      (0.8 + visualState.weather.wind * 1.2 + storm * 0.7);
    const gust =
      Math.max(0, Math.sin(clock.elapsedTime * 4.7) - 0.18) *
      (visualState.weather.wind + forces.viewportPressure) *
      (storm + forces.atmosphericMotion);
    const drift =
      delta *
      (visualState.weather.wind + gust + forces.atmosphericMotion * 0.7) *
      (near ? 4.6 : 2.5);
    for (let index = 0; index < count; index += 1) {
      const start = index * 2;
      const end = start + 1;
      attribute.setY(start, attribute.getY(start) - fall);
      attribute.setY(end, attribute.getY(end) - fall);
      attribute.setX(start, attribute.getX(start) + drift);
      attribute.setX(end, attribute.getX(end) + drift);
      if (attribute.getY(end) < -6.2) {
        const length = attribute.getY(start) - attribute.getY(end);
        const x = ((index * 47 + profile.seed) % 173) / 173 * 18 - 9;
        attribute.setXYZ(start, x, 6.2, attribute.getZ(start));
        attribute.setXYZ(
          end,
          x - length * (0.42 + visualState.weather.wind * 0.85),
          6.2 - length,
          attribute.getZ(end),
        );
      }
    }
    attribute.needsUpdate = true;
  });

  return (
    <lineSegments
      ref={lines}
      rotation={[
        0,
        0,
        -(visualState.weather.wind + forces.viewportPressure * 0.52) *
          (near ? 0.32 : 0.2),
      ]}
      visible={presence > 0.01}
    >
      <bufferGeometry>
        <bufferAttribute
          args={[positions, 3]}
          attach="attributes-position"
          count={count * 2}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        blending={near ? AdditiveBlending : undefined}
        color={profile.palette.precipitation}
        depthWrite={false}
        opacity={
          presence *
          (near ? 0.82 : 0.42) *
          (0.82 + profile.layers.vibrance * 0.28)
        }
        transparent
      />
    </lineSegments>
  );
}

function WindShear({ profile, quality, reducedMotion, visualState }: LayerProps) {
  const lines = useRef<LineSegments>(null);
  const data = useMemo(() => createWindPositions(profile, quality), [profile, quality]);
  const forces = weatherForces({ profile, visualState });
  const rainMembership = phenomenonMembership(profile, "rain");
  const presence = rainMembership * forces.viewportPressure;

  useFrame((_, delta) => {
    if (!lines.current || reducedMotion || presence <= 0.01) return;
    const positions = lines.current.geometry.getAttribute("position");
    const travel =
      delta *
      (4.5 + visualState.weather.wind * 8 + forces.atmosphericMotion * 7);
    for (let index = 0; index < data.count; index += 1) {
      const start = index * 2;
      const end = start + 1;
      positions.setX(start, positions.getX(start) + travel);
      positions.setX(end, positions.getX(end) + travel);
      if (positions.getX(start) > 9.5) {
        const length = positions.getX(end) - positions.getX(start);
        positions.setX(start, -9.5);
        positions.setX(end, -9.5 + length);
      }
    }
    positions.needsUpdate = true;
  });

  return (
    <lineSegments ref={lines} visible={presence > 0.01}>
      <bufferGeometry>
        <bufferAttribute
          args={[data.positions, 3]}
          attach="attributes-position"
          count={data.count * 2}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        blending={AdditiveBlending}
        color={profile.palette.cloudLight}
        depthWrite={false}
        opacity={presence * (0.18 + profile.layers.vibrance * 0.2)}
        transparent
      />
    </lineSegments>
  );
}

function PrecipitationField(props: LayerProps) {
  return (
    <>
      <RainSheet {...props} near={false} />
      <RainSheet {...props} near />
      <SnowField {...props} />
    </>
  );
}

function SnowField({ profile, quality, reducedMotion, visualState }: LayerProps) {
  const points = useRef<Points>(null);
  const data = useMemo(() => createSnowData(profile, quality), [profile, quality]);
  const membership = phenomenonMembership(profile, "snow");
  const presence =
    membership *
    visualState.semantics.precipitation *
    Math.max(visualState.climate.baseline.precipitation, visualState.weather.precipitation);

  useFrame(({ clock }, delta) => {
    if (!points.current || reducedMotion || presence <= 0.01) return;
    const positions = points.current.geometry.getAttribute("position");
    for (let index = 0; index < data.count; index += 1) {
      const phase = data.phases[index]!;
      const weight = data.sizes[index]!;
      let y = positions.getY(index) - delta * (0.16 + weight * 0.32);
      let x = positions.getX(index) +
        Math.sin(clock.elapsedTime * (0.24 + weight * 0.08) + phase) * delta *
          (0.18 + visualState.weather.wind * 0.42);
      if (y < -6.2) y = 6.2;
      if (x > 9.2) x = -9.2;
      if (x < -9.2) x = 9.2;
      positions.setXY(index, x, y);
    }
    positions.needsUpdate = true;
  });

  return (
    <points ref={points} visible={presence > 0.01}>
      <bufferGeometry>
        <bufferAttribute
          args={[data.positions, 3]}
          attach="attributes-position"
          count={data.count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        blending={AdditiveBlending}
        color={profile.palette.precipitation}
        depthWrite={false}
        opacity={presence * 0.92}
        size={0.034 + profile.layers.vibrance * 0.032}
        sizeAttenuation
        transparent
      />
    </points>
  );
}

function SolarField({ profile, quality, reducedMotion, visualState }: LayerProps) {
  const group = useRef<Group>(null);
  const points = useRef<Points>(null);
  const data = useMemo(() => createSolarData(profile, quality), [profile, quality]);
  const membership = phenomenonMembership(profile, "sun");
  const sunlight = Math.max(
    visualState.climate.baseline.sunlight * 0.72,
    visualState.weather.sunlight,
  );
  const presence = membership * sunlight;

  useFrame(({ clock }, delta) => {
    if (group.current && !reducedMotion) {
      group.current.rotation.z = clock.elapsedTime * 0.035;
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.6) * 0.045 * presence;
      group.current.scale.setScalar(pulse);
    }
    if (!points.current || reducedMotion || presence <= 0.01) return;
    const positions = points.current.geometry.getAttribute("position");
    for (let index = 0; index < data.phases.length; index += 1) {
      const offset = index * 3;
      const phase = data.phases[index]!;
      const burst = 1 + Math.sin(clock.elapsedTime * 1.8 + phase * 3) * 0.12;
      positions.setX(index, 3 + (data.origins[offset]! - 3) * burst + delta * 0.02);
      positions.setY(index, 1.1 + (data.origins[offset + 1]! - 1.1) * burst);
    }
    positions.needsUpdate = true;
  });

  return (
    <group ref={group} visible={presence > 0.01}>
      <mesh position={[3, 1.1, -0.5]}>
        <circleGeometry args={[1.15, 96]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={profile.palette.horizon}
          depthWrite={false}
          opacity={0.8 * presence}
          transparent
        />
      </mesh>
      <mesh position={[3, 1.1, -0.65]}>
        <ringGeometry args={[1.2, 3.8, 96]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={profile.palette.glow}
          depthWrite={false}
          opacity={0.16 * presence}
          transparent
        />
      </mesh>
      <mesh position={[3, 1.1, -0.8]}>
        <ringGeometry args={[3.9, 6.8, 96]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={profile.palette.horizon}
          depthWrite={false}
          opacity={0.055 * presence}
          transparent
        />
      </mesh>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute
            args={[data.positions, 3]}
            attach="attributes-position"
            count={data.phases.length}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          blending={AdditiveBlending}
          color={profile.palette.particle}
          depthWrite={false}
          opacity={0.78 * presence}
          size={0.035 + profile.layers.vibrance * 0.045}
          sizeAttenuation
          transparent
        />
      </points>
    </group>
  );
}

function AirborneMatter({ profile, quality, reducedMotion, visualState }: LayerProps) {
  const points = useRef<Points>(null);
  const data = useMemo(() => createParticleData(profile, quality), [profile, quality]);
  const presence = visualState.semantics.particles * profile.layers.particleDensity;
  const forces = weatherForces({ profile, visualState });

  useFrame(({ clock }) => {
    if (!points.current || reducedMotion || presence <= 0.01) return;
    const positions = points.current.geometry.getAttribute("position");
    const storm = visualState.weather.stormIntensity;
    const speed =
      0.1 +
      visualState.weather.wind * 0.34 +
      storm * 0.22 +
      forces.particleAgitation * 0.72;
    for (let index = 0; index < data.phases.length; index += 1) {
      const offset = index * 3;
      const phase = data.phases[index]!;
      positions.setX(
        index,
        data.origins[offset]! +
          Math.sin(clock.elapsedTime * speed + phase) *
            (0.5 + storm * 0.7 + forces.particleAgitation * 0.9),
      );
      positions.setY(
        index,
        data.origins[offset + 1]! +
          Math.cos(clock.elapsedTime * speed * 0.7 + phase) *
            (0.25 + storm * 0.38 + forces.particleAgitation * 0.52),
      );
    }
    positions.needsUpdate = true;
  });

  return (
    <points ref={points} visible={presence > 0.01}>
      <bufferGeometry>
        <bufferAttribute
          args={[data.positions, 3]}
          attach="attributes-position"
          count={data.phases.length}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        blending={AdditiveBlending}
        color={profile.palette.particle}
        depthWrite={false}
        opacity={
          presence *
          (0.18 +
            visualState.weather.haze * 0.28 +
            profile.layers.vibrance * 0.12)
        }
        size={
          0.018 +
          profile.layers.particleDensity * 0.035 +
          forces.particleAgitation * 0.016
        }
        sizeAttenuation
        transparent
      />
    </points>
  );
}

function Electricity({ profile, reducedMotion, visualState }: LayerProps) {
  const lines = useRef<LineSegments>(null);
  const material = useRef<LineBasicMaterial>(null);
  const flashMaterial = useRef<MeshBasicMaterial>(null);
  const light = useRef<PointLight>(null);
  const positions = useMemo(() => createBoltPositions(profile), [profile]);
  const forces = weatherForces({ profile, visualState });
  const presence =
    visualState.semantics.electricity *
    visualState.weather.stormIntensity *
    profile.layers.electricityFrequency;

  useFrame(({ clock }) => {
    if (
      !material.current ||
      !flashMaterial.current ||
      !light.current ||
      !lines.current
    ) return;
    const phase =
      clock.elapsedTime *
        (0.7 +
          profile.layers.electricityFrequency * 2.4 +
          forces.lightVolatility * 1.8) +
      profile.seed * 0.013;
    const primary = Math.max(0, Math.sin(phase) - 0.9) * 10;
    const echo = Math.max(0, Math.sin(phase * 1.93 + 1.7) - 0.955) * 22;
    const flash =
      reducedMotion
        ? 0
        : clamp(primary + echo) *
          presence *
          (0.62 + forces.lightVolatility * 0.9);
    material.current.opacity = Math.min(1, flash * 1.2);
    flashMaterial.current.opacity = flash *
      (0.38 + profile.layers.vibrance * 0.18);
    light.current.intensity = flash * (7.2 + profile.layers.vibrance * 3.8);
    lines.current.visible = flash > 0.01;
  });

  return (
    <>
      <mesh position={[0, 0, 2.2]}>
        <planeGeometry args={[18, 14]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={profile.palette.electricity}
          depthWrite={false}
          opacity={0}
          ref={flashMaterial}
          transparent
        />
      </mesh>
      <lineSegments ref={lines} visible={false}>
        <bufferGeometry>
          <bufferAttribute
            args={[positions, 3]}
            attach="attributes-position"
            count={positions.length / 3}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          blending={AdditiveBlending}
          color={profile.palette.electricity}
          depthWrite={false}
          opacity={0}
          ref={material}
          transparent
        />
      </lineSegments>
      <pointLight
        color={profile.palette.electricity}
        decay={1.4}
        intensity={0}
        position={[2.5, 2.2, 1.8]}
        ref={light}
      />
    </>
  );
}

function StormBody({
  children,
  expanded,
  profile,
  reducedMotion,
  visualState,
}: LayerProps & { children: ReactNode }) {
  const group = useRef<Group>(null);
  const forces = weatherForces({ profile, visualState });

  useFrame(({ clock }) => {
    if (!group.current) return;
    const pressure = expanded && !reducedMotion ? forces.viewportPressure : 0;
    if (pressure <= 0.01) {
      group.current.position.set(0, 0, 0);
      group.current.rotation.z = 0;
      group.current.scale.setScalar(1);
      return;
    }
    const time = clock.elapsedTime;
    const lash =
      Math.sin(time * 2.1) +
      Math.sin(time * 5.7 + 1.2) * 0.46 +
      Math.sin(time * 11.3) * 0.16;
    group.current.position.x = lash * pressure * 0.34;
    group.current.position.y =
      (Math.sin(time * 3.2 + 0.8) + Math.sin(time * 7.1) * 0.3) *
      pressure *
      0.2;
    group.current.rotation.z = lash * pressure * 0.014;
    group.current.scale.setScalar(
      1 + Math.max(0, Math.sin(time * 4.4)) * pressure * 0.014,
    );
  });

  return <group ref={group}>{children}</group>;
}

function WeatherExpansion({
  entryProgress,
  entryVisualState,
  expanded,
  profile,
  reducedMotion,
}: LayerProps) {
  const group = useRef<Group>(null);
  const material = useRef<ShaderMaterial>(null);
  const fallbackProgress = useRef(0);
  const entryPressure = clamp(
    entryVisualState.weather.cloudCover * 0.4 +
      entryVisualState.weather.precipitation * 0.35 +
      entryVisualState.weather.stormIntensity * 0.25,
  );
  const uniforms = useMemo(
    () => ({
      uCloud: { value: new Color(profile.palette.cloudLight) },
      uCore: { value: new Color(profile.palette.sky) },
      uGlow: { value: new Color(profile.palette.glow) },
      uHaze: { value: new Color(profile.palette.haze) },
      uIntensity: { value: entryPressure },
      uPrecipitation: { value: new Color(profile.palette.precipitation) },
      uProgress: { value: 0 },
      uTime: { value: 0 },
    }),
    [entryPressure, profile.palette],
  );

  useEffect(() => {
    if (expanded) fallbackProgress.current = 0;
  }, [expanded]);

  useFrame(({ clock }, delta) => {
    if (!group.current || !material.current) return;
    if (!expanded) fallbackProgress.current = 0;
    if (expanded && entryProgress === undefined) {
      fallbackProgress.current = reducedMotion
        ? 1
        : Math.min(1, fallbackProgress.current + delta / 2.8);
    }
    const amount = reducedMotion
      ? (expanded ? 1 : 0)
      : expanded
        ? clamp(entryProgress ?? fallbackProgress.current)
        : 0;
    const bloom = 1 - Math.pow(1 - amount, 3);
    const localScale = 0.56 + entryPressure * 0.22;
    const viewportScale = 8.8 + entryPressure * 2.1;

    // The starting point stays local to the entry orb. Its weather gains
    // amplitude only after entry, then becomes the viewport atmosphere.
    group.current.position.set(-3.15 * (1 - bloom * 0.78), 0.62 * (1 - bloom), 0.2);
    group.current.scale.setScalar(localScale + bloom * viewportScale);
    group.current.rotation.z = amount * (0.2 + entryPressure * 0.28);
    material.current.uniforms.uIntensity!.value = entryPressure;
    material.current.uniforms.uProgress!.value = amount;
    material.current.uniforms.uTime!.value = reducedMotion ? 0 : clock.elapsedTime;
  });

  return (
    <group position={[-3.15, 0.62, 0.2]} ref={group} scale={0.6}>
      <mesh renderOrder={1}>
        <planeGeometry args={[2.25, 2.25, 18, 18]} />
        <shaderMaterial
          blending={AdditiveBlending}
          depthWrite={false}
          fragmentShader={entryFluidFragmentShader}
          ref={material}
          transparent
          uniforms={uniforms}
          vertexShader={entryFluidVertexShader}
        />
      </mesh>
    </group>
  );
}

export function WeatherSystem(props: WeatherSystemProps) {
  const { profile, visualState } = props;
  const baseline = visualState.climate.baseline;
  const haze = clamp(baseline.haze * 0.34 + visualState.weather.haze * 0.66);
  const fogColor = useMemo(() => {
    const dark = new Color(profile.palette.sky);
    return dark.lerp(new Color(profile.palette.haze), haze * 0.46);
  }, [haze, profile.palette.haze, profile.palette.sky]);

  return (
    <>
      <fog attach="fog" args={[fogColor, 3.8, 13 - haze * 6.4]} />
      <SkyAndLight {...props} />
      <StormBody {...props}>
        <CloudMass {...props} />
        <MistField {...props} />
        <PrecipitationField {...props} />
        <WindShear {...props} />
        <AirborneMatter {...props} />
        <SolarField {...props} />
        <Electricity {...props} />
      </StormBody>
      <WeatherExpansion {...props} />
    </>
  );
}
