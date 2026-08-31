import { Canvas, useFrame } from "@react-three/fiber";
import type { VisualState, WeatherProfile } from "@soundspace/shared";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  type Group,
  LinearFilter,
  type Points,
  SRGBColorSpace,
  type ShaderMaterial,
} from "three";
import { useEffect, useMemo, useRef, useState } from "react";

type SoundspaceOrbProps = {
  active: boolean;
  profile: WeatherProfile;
  title: string;
  visualState: VisualState;
};

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  uniform float uCloud;
  uniform float uHaze;
  uniform float uStorm;
  uniform float uSunlight;
  uniform float uVibrance;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    float folds =
      sin(position.x * 2.7 + 0.4) * 0.12 +
      sin(position.y * 3.3 - 0.7) * 0.09 +
      sin(position.z * 4.1 + 1.1) * 0.07;
    vec3 transformed = position + normal * folds;
    vNormal = normalize(normalMatrix * normal);
    vPosition = transformed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uActive;
  uniform float uCloud;
  uniform float uHaze;
  uniform float uStorm;
  uniform float uSunlight;
  uniform float uVibrance;
  uniform vec3 uCoreDark;
  uniform vec3 uCoreLight;
  uniform vec3 uGlow;
  uniform vec3 uCloudColor;
  uniform vec3 uHazeColor;
  uniform vec3 uElectricityColor;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    float facing = pow(max(vNormal.z, 0.0), 1.7);
    float ribbon = sin(vPosition.y * 3.2 + vPosition.x * 1.4 + uTime * 0.18) * 0.5 + 0.5;
    float rim = pow(1.0 - max(vNormal.z, 0.0), 2.3);
    float cloudBand = smoothstep(0.38, 0.72, sin(vPosition.y * 3.6 + vPosition.x * 1.8 + uTime * 0.16) * 0.5 + 0.5);
    vec3 color = mix(uCoreDark, uCoreLight, facing * 0.7 + ribbon * 0.2);
    color = mix(color, uCloudColor, cloudBand * uCloud * 0.68);
    color = mix(color, uHazeColor, uHaze * 0.18);
    color += uGlow * uSunlight * facing * 0.22;
    color += uElectricityColor * uStorm * rim * 0.36;
    color = mix(color, uGlow, rim * (0.18 + uActive * 0.12));
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, 1.0 + uVibrance * 0.62);
    color += uGlow * ribbon * uVibrance * 0.08;
    gl_FragColor = vec4(color, 0.98);
  }
`;

function createRainPreviewPositions() {
  return new Float32Array(
    Array.from({ length: 70 }, (_, index) => [
      ((index * 37) % 101) / 101 * 4.2 - 2.1,
      ((index * 61) % 97) / 97 * 4.4 - 2.2,
      1.25 + ((index * 17) % 19) / 80,
    ]).flat(),
  );
}

function createSnowPreviewData() {
  const origins = new Float32Array(
    Array.from({ length: 150 }, (_, index) => [
      ((index * 53) % 149) / 149 * 4.4 - 2.2,
      ((index * 71) % 151) / 151 * 4.5 - 2.25,
      1.2 + ((index * 23) % 31) / 90,
    ]).flat(),
  );
  return { origins, positions: origins.slice() };
}

const solarPositions = new Float32Array(
  Array.from({ length: 170 }, (_, index) => {
    const angle = index * 2.39996;
    const radius = 0.7 + (index % 29) / 16;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, 1.26];
  }).flat(),
);

function splitTitle(value: string): [string, string] {
  // Canvas text does not inherit the page's lowercase presentation rule.
  const words = value.trim().toLocaleLowerCase().split(/\s+/);
  if (words.length > 1) {
    const middle = Math.ceil(words.length / 2);
    return [words.slice(0, middle).join(" "), words.slice(middle).join(" ")];
  }

  const word = words[0] || "soundspace";
  const middle = Math.ceil(word.length / 2);
  return [word.slice(0, middle), word.slice(middle)];
}

function drawBlob(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  color: string,
) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.beginPath();
  context.moveTo(-width * 0.48, -height * 0.06);
  context.bezierCurveTo(-width * 0.52, -height * 0.5, -width * 0.08, -height * 0.58, width * 0.24, -height * 0.47);
  context.bezierCurveTo(width * 0.58, -height * 0.35, width * 0.54, height * 0.12, width * 0.4, height * 0.38);
  context.bezierCurveTo(width * 0.12, height * 0.58, -width * 0.42, height * 0.5, -width * 0.48, -height * 0.06);
  context.fillStyle = color;
  context.fill();
  context.restore();
}

const TITLE_INKS = {
  dark: "#21121e",
  light: "#fff1dd",
} as const;

function relativeLuminance(value: string): number {
  const normalized = value.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((channel) => `${channel}${channel}`).join("")
    : normalized;
  if (!/^[\da-f]{6}$/i.test(expanded)) return 0;

  const channels = [0, 2, 4].map((offset) => {
    const srgb = Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.04045
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(first: string, second: string): number {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function titleInkFor(background: string): typeof TITLE_INKS.dark | typeof TITLE_INKS.light {
  return contrastRatio(background, TITLE_INKS.dark) >= contrastRatio(background, TITLE_INKS.light)
    ? TITLE_INKS.dark
    : TITLE_INKS.light;
}

function drawTitleLine(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  background: string,
) {
  const ink = titleInkFor(background);
  const outline = ink === TITLE_INKS.dark ? TITLE_INKS.light : TITLE_INKS.dark;
  context.fillStyle = ink;
  context.strokeStyle = outline;
  context.lineJoin = "round";
  context.lineWidth = 5;
  context.shadowColor = ink === TITLE_INKS.dark
    ? "rgba(255, 241, 221, 0.28)"
    : "rgba(21, 8, 17, 0.62)";
  context.shadowBlur = 16;
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
}

function createTitleTexture(
  title: string,
  profile: WeatherProfile,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1_024;
  canvas.height = 1_024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("title canvas is unavailable");

  const [first, second] = splitTitle(title);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalAlpha = 0.9;
  drawBlob(context, 492, 420, 620, 230, -0.08, profile.palette.cloudLight);
  context.globalAlpha = 0.86;
  drawBlob(context, 552, 600, 590, 226, 0.1, profile.palette.glow);
  context.globalAlpha = 1;
  context.textAlign = "center";
  context.textBaseline = "middle";
  // The orb reads as a hand-made track label. It uses the utility face while
  // the page title stays expressive, so both feel from the same room without
  // becoming a duplicate lockup. Each fragment chooses its ink from the
  // weather color beneath it. The opposite ink becomes a fine outline so the
  // intentional crop remains readable when letters leave the blob.
  context.font = '700 92px "Space Mono", ui-monospace, monospace';
  drawTitleLine(context, first, 500, 410, profile.palette.cloudLight);
  context.font = '700 106px "Space Mono", ui-monospace, monospace';
  drawTitleLine(context, second, 544, 590, profile.palette.glow);
  context.shadowBlur = 0;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function RainPreview({
  active,
  profile,
  visualState,
}: {
  active: boolean;
  profile: WeatherProfile;
  visualState: VisualState;
}) {
  const points = useRef<Points>(null);
  const positionsData = useMemo(createRainPreviewPositions, [profile.seed]);
  const baseline = visualState.climate.baseline;
  const rainMembership = profile.relationships
    .filter((relationship) => relationship.phenomenon === "rain")
    .reduce((total, relationship) => total + relationship.membership, 0);
  const precipitation = Math.max(
    baseline.precipitation * 0.72,
    visualState.weather.precipitation * visualState.semantics.precipitation,
  );
  const wind = Math.max(baseline.wind * 0.5, visualState.weather.wind);

  useFrame((_, delta) => {
    if (!active || !points.current || precipitation <= 0.01) return;
    const frameDelta = Math.min(delta, 1 / 30);
    const positions = points.current.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index += 1) {
      let y = positions.getY(index) - frameDelta * (0.9 + precipitation * 4.4);
      let x = positions.getX(index) + frameDelta * wind * 0.6;
      if (y < -2.2) y = 2.75;
      if (x > 2.2) x = -2.2;
      positions.setXY(index, x, y);
    }
    positions.needsUpdate = true;
  });

  return (
    <points ref={points} rotation={[0, 0, -wind * 0.16]}>
      <bufferGeometry>
        <bufferAttribute
          args={[positionsData, 3]}
          attach="attributes-position"
          count={70}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={profile.palette.precipitation}
        opacity={
          (0.12 + precipitation * 0.58) *
          profile.layers.precipitationDensity *
          rainMembership
        }
        size={0.014 + precipitation * 0.028}
        transparent
      />
    </points>
  );
}

function MistPreview({
  active,
  profile,
  visualState,
}: {
  active: boolean;
  profile: WeatherProfile;
  visualState: VisualState;
}) {
  const group = useRef<Group>(null);
  const presence =
    profile.layers.mistDensity *
    Math.max(visualState.climate.baseline.haze, visualState.weather.haze);

  useFrame(({ clock }) => {
    if (!active || !group.current) return;
    group.current.position.x = Math.sin(clock.elapsedTime * 0.18) * 0.3;
    group.current.rotation.z = Math.cos(clock.elapsedTime * 0.12) * 0.06;
  });

  return (
    <group position={[0, 0, 1.18]} ref={group}>
      <mesh position={[-0.35, 0.42, 0]} rotation={[0, 0, -0.12]} scale={[1.7, 0.34, 1]}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial
          color={profile.palette.cloudLight}
          depthWrite={false}
          opacity={presence * 0.14}
          transparent
        />
      </mesh>
      <mesh position={[0.45, -0.55, 0.02]} rotation={[0, 0, 0.16]} scale={[1.9, 0.3, 1]}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial
          color={profile.palette.haze}
          depthWrite={false}
          opacity={presence * 0.12}
          transparent
        />
      </mesh>
    </group>
  );
}

function SnowPreview({
  active,
  profile,
  visualState,
}: {
  active: boolean;
  profile: WeatherProfile;
  visualState: VisualState;
}) {
  const points = useRef<Points>(null);
  const data = useMemo(createSnowPreviewData, [profile.seed]);
  const membership = profile.primaryPhenomenon === "snow" ? 1 : 0;
  const presence = membership * visualState.weather.precipitation;

  useFrame(({ clock }, delta) => {
    if (!active || !points.current || presence <= 0.01) return;
    const frameDelta = Math.min(delta, 1 / 30);
    const positions = points.current.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index += 1) {
      let y = positions.getY(index) - frameDelta * (0.4 + (index % 7) * 0.05);
      const x =
        data.origins[index * 3]! +
        Math.sin(clock.elapsedTime * (0.42 + (index % 7) * 0.02) + index) * 0.16;
      if (y < -2.25) y = 2.8;
      positions.setXY(index, x, y);
    }
    positions.needsUpdate = true;
  });

  return (
    <points position={[0, 0, 0.03]} ref={points} visible={presence > 0.01}>
      <bufferGeometry>
        <bufferAttribute args={[data.positions, 3]} attach="attributes-position" count={150} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        blending={AdditiveBlending}
        color={profile.palette.precipitation}
        depthWrite={false}
        opacity={presence * 0.86}
        size={0.035}
        transparent
      />
    </points>
  );
}

function SunPreview({
  active,
  profile,
  visualState,
}: {
  active: boolean;
  profile: WeatherProfile;
  visualState: VisualState;
}) {
  const group = useRef<Group>(null);
  const membership = profile.primaryPhenomenon === "sun" ? 1 : 0;
  const presence = membership * visualState.weather.sunlight;

  useFrame(({ clock }) => {
    if (!active || !group.current) return;
    group.current.rotation.z = clock.elapsedTime * 0.26;
    group.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2.8) * 0.07);
  });

  return (
    <group position={[0, 0, 1.3]} ref={group} visible={presence > 0.01}>
      <mesh>
        <ringGeometry args={[1.55, 2.12, 96]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={profile.palette.glow}
          depthWrite={false}
          opacity={presence * 0.26}
          transparent
        />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute args={[solarPositions, 3]} attach="attributes-position" count={170} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          blending={AdditiveBlending}
          color={profile.palette.particle}
          depthWrite={false}
          opacity={presence * 0.8}
          size={0.032}
          transparent
        />
      </points>
    </group>
  );
}

function OrbScene({ active, profile, title, visualState }: SoundspaceOrbProps) {
  const material = useRef<ShaderMaterial>(null);
  const group = useRef<Group>(null);
  const animationTime = useRef(0);
  const [fontReady, setFontReady] = useState(false);
  const titleTexture = useMemo(
    () => createTitleTexture(title, profile),
    [fontReady, profile, title],
  );

  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) setFontReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => titleTexture.dispose(), [titleTexture]);

  const uniforms = useMemo(
    () => ({
      uActive: { value: active ? 1 : 0 },
      uCloud: { value: 0 },
      uCloudColor: { value: new Color(profile.palette.cloudDark) },
      uCoreDark: { value: new Color(profile.palette.sky) },
      uCoreLight: { value: new Color(profile.palette.cloudLight) },
      uElectricityColor: { value: new Color(profile.palette.electricity) },
      uGlow: { value: new Color(profile.palette.glow) },
      uHaze: { value: 0 },
      uHazeColor: { value: new Color(profile.palette.haze) },
      uStorm: { value: 0 },
      uSunlight: { value: 0 },
      uTime: { value: 0 },
      uVibrance: { value: profile.layers.vibrance },
    }),
    [profile.palette],
  );

  useFrame((_, delta) => {
    if (active) animationTime.current += Math.min(delta, 1 / 30);
    const time = animationTime.current;
    if (material.current) {
      material.current.uniforms.uTime!.value = time;
      material.current.uniforms.uActive!.value = active ? 1 : 0;
      material.current.uniforms.uCloud!.value = Math.max(
        visualState.climate.baseline.cloudCover,
        visualState.weather.cloudCover,
      );
      material.current.uniforms.uHaze!.value = Math.max(
        visualState.climate.baseline.haze * 0.72,
        visualState.weather.haze,
      );
      material.current.uniforms.uStorm!.value = Math.max(
        visualState.climate.baseline.stormIntensity,
        visualState.weather.stormIntensity,
      );
      material.current.uniforms.uSunlight!.value = Math.max(
        visualState.climate.baseline.sunlight * 0.6,
        visualState.weather.sunlight,
      );
    }
    if (group.current && profile.primaryPhenomenon !== "sun") {
      if (active) {
        group.current.rotation.y += delta * 0.42;
        group.current.rotation.z = Math.sin(time * 0.5) * 0.08;
        group.current.scale.setScalar(1 + Math.sin(time * 2.2) * 0.055);
      }
    }
  });

  return (
    <>
      <group ref={group} rotation={[-0.08, -0.28, -0.1]}>
        <mesh scale={[1.08, 1, 0.92]}>
          <sphereGeometry args={[1.58, 96, 64]} />
          <shaderMaterial
            fragmentShader={fragmentShader}
            ref={material}
            uniforms={uniforms}
            vertexShader={vertexShader}
          />
        </mesh>
        {profile.primaryPhenomenon !== "sun" ? (
          <points rotation={[0.1, 0.2, 0]}>
            <icosahedronGeometry args={[1.83, 2]} />
            <pointsMaterial
              blending={AdditiveBlending}
              color={profile.palette.glow}
              opacity={0.23 + profile.layers.vibrance * 0.12}
              size={0.018}
              transparent
            />
          </points>
        ) : null}
        <MistPreview active={active} profile={profile} visualState={visualState} />
        <RainPreview active={active} profile={profile} visualState={visualState} />
        <SnowPreview active={active} profile={profile} visualState={visualState} />
        <SunPreview active={active} profile={profile} visualState={visualState} />
      </group>
      <sprite position={[0, -0.02, 1.48]} scale={[3.05, 3.05, 1]}>
        <spriteMaterial depthTest={false} map={titleTexture} transparent />
      </sprite>
    </>
  );
}

export function SoundspaceOrb(props: SoundspaceOrbProps) {
  return (
    <Canvas
      aria-hidden="true"
      camera={{ fov: 42, position: [0, 0, 5.5] }}
      dpr={[1, 1.6]}
      frameloop={props.active ? "always" : "demand"}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <OrbScene {...props} />
    </Canvas>
  );
}
