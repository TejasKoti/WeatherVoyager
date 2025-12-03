"use client";

import {
  Suspense,
  useRef,
  useMemo,
  useEffect,
  type ReactNode,
  Component,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  useLoader,
} from "@react-three/fiber";
import {
  Environment,
  PerspectiveCamera,
  Stars,
  Cloud,
  Sparkles,
  Float,
} from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three-stdlib";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Guards the WebGL canvas so we can gracefully fall back when WebGL/context creation fails
class WebGLErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.warn(
      "WebGL context creation failed, using fallback:",
      error.message
    );
    console.debug("Component stack:", errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Main props passed from the landing page scroll container
interface Scene3DProps {
  scrollProgress: number;
}

// Small math helpers to keep scroll easing / fades readable
function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function rangeFade(p: number, start: number, end: number) {
  if (p <= start || p >= end) return 0;
  const mid = (start + end) / 2;
  if (p <= mid) return clamp01((p - start) / (mid - start));
  return clamp01(1 - (p - mid) / (end - mid));
}

// Drives the camera gently based on scroll so the whole sequence feels like one shot
function CameraController({ scrollProgress }: { scrollProgress: number }) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 0, 10));

  useFrame(() => {
    const targetY = THREE.MathUtils.lerp(0.2, -0.3, scrollProgress);
    targetRef.current.set(0, targetY, 10);
    camera.position.lerp(targetRef.current, 0.08);
    camera.lookAt(0, targetY, 0);
  });

  return null;
}

// Low-altitude clouds that reveal the balloon as the user scrolls down
function CloudBank({ scrollProgress }: { scrollProgress: number }) {
  const opacity = useMemo(() => {
    const t = clamp01(scrollProgress / 0.3);
    return (1 - t) * 1.3;
  }, [scrollProgress]);

  if (opacity <= 0.02) return null;

  return (
    <group position={[0, -0.05, 0]}>
      <Cloud
        opacity={opacity}
        speed={0.18}
        segments={40}
        scale={[16, 4.8, 5]}
      />
      <Cloud
        opacity={opacity * 0.7}
        speed={0.22}
        segments={30}
        position={[0, -0.5, -1]}
        scale={[13, 4, 4]}
      />
    </group>
  );
}

// Starfield and subtle sparkles that make the upper “space” region feel alive
function GalaxyField({ scrollProgress }: { scrollProgress: number }) {
  const alpha = rangeFade(scrollProgress, 0.15, 0.45);

  return (
    <>
      <Stars
        radius={80}
        depth={60}
        count={6000}
        factor={3}
        saturation={0}
        fade
        speed={0.3}
      />
      <Sparkles
        count={180}
        scale={30}
        size={2}
        speed={0.5}
        opacity={0.1 + 0.3 * alpha}
        color="#a5b4fc"
      />
    </>
  );
}

// Simple custom shader that lays a warm dusk gradient over the space background
const duskVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const duskFragmentShader = `
  varying vec2 vUv;
  uniform float uAlpha;

  void main() {
    // vUv.y: 0 bottom, 1 top
    float y = vUv.y;

    // Warm sunset gradient: orange near horizon, deep indigo above
    vec3 bottomColor = vec3(1.0, 0.60, 0.30);   // sunset orange
    vec3 midColor    = vec3(0.90, 0.45, 0.55);  // pinkish mid
    vec3 topColor    = vec3(0.06, 0.08, 0.18);  // deep dusk blue

    // Blend from bottom → mid → top
    vec3 color;
    if (y < 0.5) {
      float t = smoothstep(0.0, 0.5, y);
      color = mix(bottomColor, midColor, t);
    } else {
      float t = smoothstep(0.5, 1.0, y);
      color = mix(midColor, topColor, t);
    }

    // Slight darkening at top so it feels like night overhead
    float vignette = smoothstep(0.0, 0.9, y);
    color *= mix(1.0, 0.85, vignette);

    // uAlpha controls how strong / opaque the dusk overlay is
    gl_FragColor = vec4(color, uAlpha);
  }
`;

// Full-screen overlay plane that fades in a sunset gradient as we approach the horizon
function DuskSkyOverlay({ scrollProgress }: { scrollProgress: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, size } = useThree();

  const uniforms = useMemo(
    () => ({
      uAlpha: { value: 0 },
    }),
    []
  );

  useFrame(() => {
    if (!meshRef.current) return;

    const material = meshRef.current.material as THREE.ShaderMaterial;
    const p = scrollProgress;

    if (p <= 0.5) {
      material.uniforms.uAlpha.value = 0;
      meshRef.current.visible = false;
      return;
    }

    meshRef.current.visible = true;

    const t = (p - 0.5) / 0.3;
    const alpha = THREE.MathUtils.clamp(t, 0, 1);

    material.uniforms.uAlpha.value = alpha * 0.9;

    const distance = 30;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const position = new THREE.Vector3()
      .copy(camera.position)
      .add(dir.multiplyScalar(distance));

    meshRef.current.position.copy(position);
    meshRef.current.quaternion.copy(camera.quaternion);

    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const fovInRad = (perspectiveCamera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(fovInRad / 2) * distance;
    const width = height * (size.width / size.height || 1);

    meshRef.current.scale.set(width, height, 1);
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        vertexShader={duskVertexShader}
        fragmentShader={duskFragmentShader}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  );
}

// Simple stylized planes that cross the frame in mid-altitude, fading in/out with scroll
function PlanesAroundBalloon({ scrollProgress }: { scrollProgress: number }) {
  const groupRef = useRef<THREE.Group>(null);

  const targetAlpha = rangeFade(scrollProgress, 0.35, 0.65);
  const fadeAlphaRef = useRef(0);

  useFrame((state) => {
    if (!groupRef.current) return;

    const t = state.clock.getElapsedTime();
    const planes = groupRef.current.children;

    fadeAlphaRef.current = THREE.MathUtils.lerp(
      fadeAlphaRef.current,
      targetAlpha,
      0.08
    );
    const visibleAlpha = fadeAlphaRef.current;

    planes.forEach((plane, i) => {
      const fromLeft = i < 3;
      const localIndex = fromLeft ? i : i - 3;

      const baseSpeed = 0.28 + localIndex * 0.08;
      const progress = (t * baseSpeed + i * 0.23) % 1;

      const startX = fromLeft ? -18 : 18;
      const endX = fromLeft ? 18 : -18;
      const x = THREE.MathUtils.lerp(startX, endX, progress);

      const leftAltitudes = [-1.4, -0.2, 1.0];
      const rightAltitudes = [-0.8, 0.6, 1.6];

      const baseY = fromLeft
        ? leftAltitudes[localIndex]
        : rightAltitudes[localIndex];

      const y = baseY + Math.sin(t * 2 + i) * 0.15;
      const z = -2.0 + localIndex * 0.5;

      plane.position.set(x, y, z);

      plane.rotation.y = fromLeft ? 0 : Math.PI;
      plane.rotation.z = Math.sin(t * 4 + i) * 0.08;

      plane.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.Material & {
          opacity?: number;
          transparent?: boolean;
        };
        if (mat && "opacity" in mat) {
          mat.transparent = true;
          mat.opacity = visibleAlpha;
        }
      });

      plane.visible = visibleAlpha > 0.02;
    });
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: 6 }).map((_, i) => (
        <group key={i} scale={0.35}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.2, 0.08, 0.4]} />
            <meshStandardMaterial
              color="#e5e7eb"
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.4, 0.06, 1.6]} />
            <meshStandardMaterial
              color="#60a5fa"
              metalness={0.6}
              roughness={0.35}
            />
          </mesh>
          <mesh position={[-0.7, -0.05, 0]}>
            <boxGeometry args={[0.5, 0.12, 0.5]} />
            <meshStandardMaterial
              color="#111827"
              metalness={0.9}
              roughness={0.2}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Drone config types and helpers for the inspection / flyby drones around the balloon
type DroneModel = "inspire" | "mavic" | "phantom";
type DroneMode = "inspectOrbit" | "flyby";

interface DroneConfig {
  model: DroneModel;
  mode: DroneMode;
  direction: 1 | -1;
  altitude: number;
  z: number;
  speed: number;
  rangeX: number;
  phase: number;
  bobAmplitude: number;
  rollAmplitude: number;
  scale: number;
  bodyColor: string;
  armColor: string;
  lightColor: string;
  orbitRadius?: number;
  focusY?: number;
}

const dronePalettes: Record<
  DroneModel,
  { body: string; arm: string; light: string; baseScale: number }
> = {
  inspire: {
    body: "#020617",
    arm: "#e5e7eb",
    light: "#f97316",
    baseScale: 0.3,
  },
  mavic: {
    body: "#374151",
    arm: "#9ca3af",
    light: "#3b82f6",
    baseScale: 0.35,
  },
  phantom: {
    body: "#f9fafb",
    arm: "#e5e7eb",
    light: "#22c55e",
    baseScale: 0.3,
  },
};

function getBalloonZ(p: number): number {
  let z = 6;
  if (p <= 0.25) {
    z = 6;
  } else if (p <= 0.5) {
    const t = (p - 0.25) / 0.25;
    z = THREE.MathUtils.lerp(6.0, 5.5, t);
  } else if (p <= 0.8) {
    const t = (p - 0.5) / 0.3;
    z = THREE.MathUtils.lerp(5.5, 5.0, t);
  } else {
    const t = (p - 0.8) / 0.2;
    z = THREE.MathUtils.lerp(5.0, 4.8, t);
  }
  return z;
}

// Builds a bit of variety into the drone fleet so the motion feels emergent instead of copy/paste
function createDroneConfigs(): DroneConfig[] {
  const configs: DroneConfig[] = [];
  const models: DroneModel[] = ["inspire", "mavic", "phantom"];
  const jitter = (amount: number) => (Math.random() - 0.5) * amount * 2;

  for (let i = 0; i < 4; i++) {
    const model = models[i % models.length];
    const palette = dronePalettes[model];
    configs.push({
      model,
      mode: "inspectOrbit",
      direction: i % 2 === 0 ? 1 : -1,
      altitude: -0.1 + jitter(0.25),
      z: 0,
      speed: 0.18 + Math.random() * 0.08,
      rangeX: 0,
      phase: Math.random() * Math.PI * 2,
      bobAmplitude: 0.1 + Math.random() * 0.05,
      rollAmplitude: 0.03 + Math.random() * 0.02,
      scale:
        dronePalettes[model].baseScale *
        0.5 *
        (0.9 + Math.random() * 0.2),
      bodyColor: palette.body,
      armColor: palette.arm,
      lightColor: palette.light,
      orbitRadius: 2.0 + Math.random() * 0.7,
      focusY: 0,
    });
  }

  const jitterFly = (amount: number) => (Math.random() - 0.5) * amount * 2;
  models.forEach((model, index) => {
    const palette = dronePalettes[model];
    const direction: 1 | -1 = index % 2 === 0 ? 1 : -1;
    const baseAltitude = -0.3 + index * 0.4;
    const baseZ = -1.5 + index * 0.4;
    const baseSpeed = 0.26 + index * 0.05;
    const rangeX = 18;

    const flybyCount = model === "mavic" ? 3 : 2;
    for (let i = 0; i < flybyCount; i++) {
      configs.push({
        model,
        mode: "flyby",
        direction,
        altitude: baseAltitude + jitterFly(0.2),
        z: baseZ + jitterFly(0.3),
        speed: baseSpeed * (0.9 + Math.random() * 0.3),
        rangeX,
        phase: Math.random() * Math.PI * 2,
        bobAmplitude: 0.08 + Math.random() * 0.06,
        rollAmplitude: 0.03 + Math.random() * 0.03,
        scale:
          palette.baseScale *
          0.8 *
          (0.9 + Math.random() * 0.2),
        bodyColor: palette.body,
        armColor: palette.arm,
        lightColor: palette.light,
      });
    }
  });

  return configs;
}

// Drone group: handles motion, fading, and the simple boxy drone model
function Drones({ scrollProgress }: { scrollProgress: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const droneConfigs = useMemo(() => createDroneConfigs(), []);

  const targetAlpha = rangeFade(scrollProgress, 0.7, 0.95);
  const fadeAlphaRef = useRef(0);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const t = state.clock.getElapsedTime();
    const drones = groupRef.current.children;
    const balloonZ = getBalloonZ(scrollProgress);

    fadeAlphaRef.current = THREE.MathUtils.lerp(
      fadeAlphaRef.current,
      targetAlpha,
      0.08
    );
    const visibleAlpha = fadeAlphaRef.current;

    drones.forEach((drone, i) => {
      const cfg = droneConfigs[i];
      const time = t * cfg.speed + cfg.phase;

      let x = 0;
      let y = cfg.altitude;
      let z = cfg.z;

      if (cfg.mode === "flyby") {
        const progress = (time / (Math.PI * 2)) % 1;
        const startX = cfg.direction > 0 ? -cfg.rangeX : cfg.rangeX;
        const endX = -startX;
        x = THREE.MathUtils.lerp(startX, endX, progress);
        y = cfg.altitude + Math.sin(time * 2.0) * cfg.bobAmplitude;
        z = cfg.z;

        drone.position.set(x, y, z);
        drone.rotation.y = cfg.direction > 0 ? 0 : Math.PI;
        drone.rotation.z =
          -cfg.direction * 0.25 +
          Math.sin(time * 2.0) * cfg.rollAmplitude;
      } else if (cfg.mode === "inspectOrbit") {
        const radius = cfg.orbitRadius ?? 2.2;
        const angle = time * (cfg.direction ?? 1);

        x = Math.cos(angle) * radius;
        z = balloonZ + 0.4 + Math.sin(angle) * 0.4;
        y =
          cfg.altitude +
          Math.sin(angle * 2.0) * cfg.bobAmplitude;

        drone.position.set(x, y, z);
        (drone as THREE.Object3D).lookAt(0, cfg.focusY ?? 0, balloonZ);
        drone.rotation.z += Math.sin(time * 3.0) * 0.04;
      }

      const rotorAngle = delta * 90;
      for (let r = 1; r <= 4; r++) {
        const rotor = drone.getObjectByName(`rotor${r}`);
        if (rotor) {
          (rotor as THREE.Object3D).rotation.y += rotorAngle;
        }
      }

      drone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat) return;
        mat.transparent = true;
        mat.opacity = visibleAlpha;
      });

      drone.visible = visibleAlpha > 0.02;
      (drone as THREE.Object3D).scale.setScalar(cfg.scale);
    });
  });

  return (
    <group ref={groupRef}>
      {droneConfigs.map((cfg, i) => (
        <group key={i}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry
              args={
                cfg.model === "inspire"
                  ? [1.1, 0.16, 0.45]
                  : cfg.model === "mavic"
                  ? [0.9, 0.14, 0.4]
                  : [1.0, 0.18, 0.45]
              }
            />
            <meshStandardMaterial
              color={cfg.bodyColor}
              roughness={0.4}
              metalness={0.6}
            />
          </mesh>

          <mesh position={[0.35, -0.09, 0]}>
            <boxGeometry args={[0.2, 0.14, 0.18]} />
            <meshStandardMaterial
              color="#020617"
              roughness={0.3}
              metalness={0.8}
            />
          </mesh>

          <mesh position={[0.45, 0.02, 0.18]}>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshStandardMaterial
              color={cfg.lightColor}
              emissive={cfg.lightColor}
              emissiveIntensity={2}
              roughness={0.2}
              metalness={0.4}
            />
          </mesh>
          <mesh position={[0.45, 0.02, -0.18]}>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshStandardMaterial
              color={cfg.lightColor}
              emissive={cfg.lightColor}
              emissiveIntensity={2}
              roughness={0.2}
              metalness={0.4}
            />
          </mesh>

          {[
            { pos: [0.0, 0.06, 0.0], size: [1.4, 0.04, 0.06] },
            { pos: [0.0, 0.06, 0.0], size: [0.06, 0.04, 1.4] },
          ].map((arm, idx) => (
            <mesh
              key={`arm-${idx}`}
              position={arm.pos as [number, number, number]}
            >
              <boxGeometry args={arm.size as [number, number, number]} />
              <meshStandardMaterial
                color={cfg.armColor}
                roughness={0.45}
                metalness={0.5}
              />
            </mesh>
          ))}

          {[
            { name: "rotor1", pos: [0.7, 0.09, 0.7] },
            { name: "rotor2", pos: [-0.7, 0.09, 0.7] },
            { name: "rotor3", pos: [-0.7, 0.09, -0.7] },
            { name: "rotor4", pos: [0.7, 0.09, -0.7] },
          ].map((r) => (
            <group
              key={r.name}
              position={r.pos as [number, number, number]}
              name={r.name}
            >
              <mesh position={[0, -0.04, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.1, 8]} />
                <meshStandardMaterial
                  color={cfg.armColor}
                  roughness={0.4}
                  metalness={0.5}
                />
              </mesh>
              <mesh rotation={[0, 0, 0]}>
                <boxGeometry args={[0.6, 0.01, 0.09]} />
                <meshStandardMaterial
                  color="#000000"
                  roughness={0.2}
                  metalness={0.8}
                />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

// Final landing platform that eases in from below and adds a sci-fi dock for the balloon
function LandingPlatform({ scrollProgress }: { scrollProgress: number }) {
  const scroll = scrollProgress;

  const startAt = 0.9;
  const endAt = 0.995;

  const raw = THREE.MathUtils.clamp(
    (scroll - startAt) / (endAt - startAt),
    0,
    1
  );

  const appear = raw * raw * (3 - 2 * raw);

  const finalY = -1.9;
  const hiddenY = finalY - 10;

  const y = THREE.MathUtils.lerp(hiddenY, finalY, appear);

  const baseLightIntensity = 0.7 + 1.3 * appear;

  const timeAtBottomRef = useRef(0);
  const fieldProgressRef = useRef(0);

  const tubeRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const dockRingRef = useRef<THREE.Mesh>(null);

  const DOCK_RADIUS = 2.1;
  const FIELD_HEIGHT = 3.2;
  const BASE_TOP_Y = 0.16;
  const TUBE_HEIGHT = FIELD_HEIGHT * 1.7;
  const EFFECT_HEIGHT = FIELD_HEIGHT * 1.7;

  useFrame((_, delta) => {
    if (scroll >= 0.995) {
      timeAtBottomRef.current += delta;

      const delay = 3;
      const t = timeAtBottomRef.current - delay;

      let target = 0;
      if (t > 0) target = Math.min(1, t * 0.6);

      fieldProgressRef.current = THREE.MathUtils.lerp(
        fieldProgressRef.current,
        target,
        0.1
      );
    } else {
      timeAtBottomRef.current = 0;
      fieldProgressRef.current = 0;
    }

    const s = fieldProgressRef.current;

    if (ringRef.current) {
      const h = EFFECT_HEIGHT;
      const ringY = BASE_TOP_Y + s * h;

      ringRef.current.visible = appear > 0.01;
      ringRef.current.position.y = ringY;

      const mat = ringRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.6 + 1.8 * s;
    }

    if (tubeRef.current) {
      const h = EFFECT_HEIGHT;

      tubeRef.current.visible = s > 0.01;
      tubeRef.current.scale.set(1, s, 1);
      tubeRef.current.position.y = BASE_TOP_Y + (h * s) / 2;

      const mat = tubeRef.current.material as THREE.MeshPhysicalMaterial;
      mat.opacity = 0.08 + 0.28 * s;
      mat.transmission = 0.7 + 0.25 * s;
    }

    if (dockRingRef.current) {
      const mat = dockRingRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.5 + 2.5 * s;
    }
  });

  return (
    <group position={[0, y, 5]}>
      <mesh receiveShadow>
        <boxGeometry args={[20, 0.16, 3.8]} />
        <meshStandardMaterial
          color="#e5e7eb"
          metalness={0.95}
          roughness={0.16}
        />
      </mesh>

      <mesh position={[0, -0.11, 0]}>
        <boxGeometry args={[20.3, 0.04, 4.0]} />
        <meshStandardMaterial
          color="#020617"
          metalness={0.7}
          roughness={0.5}
        />
      </mesh>

      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[7.5, 0.12, 2.7]} />
        <meshStandardMaterial
          color="#020617"
          metalness={0.9}
          roughness={0.25}
          emissive="#020617"
          emissiveIntensity={0.7 * appear}
        />
      </mesh>

      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 6.6, 0.1, 0]}>
          <boxGeometry args={[0.1, 0.05, 3.4]} />
          <meshStandardMaterial
            color="#38bdf8"
            emissive="#38bdf8"
            emissiveIntensity={1.7 * appear}
            metalness={0.95}
            roughness={0.2}
          />
        </mesh>
      ))}

      {[-1.8, -0.6, 0.6, 1.8].map((zPos, i) => (
        <mesh key={i} position={[0, 0.11, zPos * 0.6]}>
          <boxGeometry args={[4.6, 0.03, 0.06]} />
          <meshStandardMaterial
            color="#22c55e"
            emissive="#22c55e"
            emissiveIntensity={1.2 * baseLightIntensity}
            metalness={0.9}
            roughness={0.25}
          />
        </mesh>
      ))}

      {[-7.5, -3.8, 0, 3.8, 7.5].map((x, i) => (
        <group key={i} position={[x, -0.02, 1.7]}>
          <mesh>
            <boxGeometry args={[1.4, 0.14, 0.28]} />
            <meshStandardMaterial
              color="#cbd5f5"
              metalness={0.9}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[1.2, 0.03, 0.16]} />
            <meshStandardMaterial
              color="#0f172a"
              metalness={0.8}
              roughness={0.3}
            />
          </mesh>
        </group>
      ))}

      {[-6.2, -2.2, 2.0, 6.2].map((x, i) => (
        <group key={i} position={[x, 0.28, -1.7]}>
          <mesh>
            <boxGeometry args={[1.6, 0.5, 0.9]} />
            <meshStandardMaterial
              color="#020617"
              metalness={0.9}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, 0.2, 0.3]}>
            <boxGeometry args={[1.3, 0.16, 0.25]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#38bdf8"
              emissiveIntensity={1.4 * baseLightIntensity}
              metalness={0.95}
              roughness={0.25}
            />
          </mesh>
          <mesh position={[0.55, 0.16, -0.25]}>
            <boxGeometry args={[0.3, 0.12, 0.3]} />
            <meshStandardMaterial
              color="#22c55e"
              emissive="#22c55e"
              emissiveIntensity={0.9 * baseLightIntensity}
              metalness={0.9}
              roughness={0.25}
            />
          </mesh>
        </group>
      ))}

      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[22, 0.25, 10]} />
        <meshStandardMaterial
          color="#0f1625"
          metalness={0.85}
          roughness={0.35}
        />
      </mesh>

      <mesh position={[0, -0.26, 0]}>
        <boxGeometry args={[22.2, 0.06, 10.2]} />
        <meshStandardMaterial
          color="#0a0f1a"
          emissive="#1e3a8a"
          emissiveIntensity={1.2 * appear}
        />
      </mesh>

      {[-3, 0, 3].map((x, i) => (
        <mesh key={i} position={[x, 0.15, -2]}>
          <cylinderGeometry args={[1.4, 1.4, 0.08, 6]} />
          <meshStandardMaterial
            color="#111827"
            emissive="#38bdf8"
            emissiveIntensity={1.0 * appear}
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>
      ))}

      {[-5, -2, 1, 4].map((x, i) => (
        <mesh key={i} position={[x, 0.14, 3.6]}>
          <boxGeometry args={[1.6, 0.04, 0.1]} />
          <meshStandardMaterial
            color="#22d3ee"
            emissive="#22d3ee"
            emissiveIntensity={
              0.6 + 1.2 * (appear * scrollProgress)
            }
            metalness={0.95}
          />
        </mesh>
      ))}

      <group position={[-7.8, 1.5, 0]}>
        <mesh>
          <boxGeometry args={[1.4, 3.2, 1.4]} />
          <meshStandardMaterial
            color="#0c121d"
            metalness={0.8}
            roughness={0.4}
          />
        </mesh>

        <group position={[0, 1.8, 0]}>
          <mesh rotation={[0, scroll * 6, 0]}>
            <cylinderGeometry args={[0.6, 0.2, 0.2, 24]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#38bdf8"
              emissiveIntensity={2}
            />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial
              color="#22d3ee"
              emissive="#22d3ee"
              emissiveIntensity={3}
            />
          </mesh>
        </group>

        <mesh position={[0, 2.6, 0.4]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={
              Math.sin(scroll * 10) > 0 ? 2.5 : 0.4
            }
          />
        </mesh>
      </group>

      <group position={[8, 1.1, -1]}>
        <mesh>
          <boxGeometry args={[1.2, 2.4, 1.2]} />
          <meshStandardMaterial
            color="#0d1522"
            metalness={0.85}
            roughness={0.38}
          />
        </mesh>

        {[-0.4, 0.4].map((zPos, i) => (
          <mesh
            key={i}
            position={[0.7, 0.6 + i * 0.7, zPos]}
          >
            <boxGeometry args={[0.02, 0.9, 0.6]} />
            <meshStandardMaterial
              color="#1e293b"
              emissive="#3b82f6"
              emissiveIntensity={
                i === 0 ? appear * 1.5 : appear * 0.8
              }
            />
          </mesh>
        ))}

        <mesh position={[0, 1.3, 0]}>
          <sphereGeometry args={[0.15, 12, 12]} />
          <meshStandardMaterial
            color="#38bdf8"
            emissive="#38bdf8"
            emissiveIntensity={1.4 + scroll * 2}
          />
        </mesh>
      </group>

      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry
          args={[
            (DOCK_RADIUS - 0.2) * 0.6,
            (DOCK_RADIUS - 0.2) * 0.6,
            0.04,
            40,
          ]}
        />
        <meshStandardMaterial
          color="#020617"
          metalness={0.9}
          roughness={0.3}
        />
      </mesh>

      <group scale={0.4}>
        <mesh
          ref={ringRef}
          position={[0, BASE_TOP_Y, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry
            args={[DOCK_RADIUS * 0.98, 0.06, 20, 80]}
          />
          <meshStandardMaterial
            color="#7dd3fc"
            emissive="#7dd3fc"
            emissiveIntensity={1.0}
            metalness={0.95}
            roughness={0.2}
          />
        </mesh>

        <mesh
          ref={tubeRef}
          position={[0, BASE_TOP_Y + TUBE_HEIGHT / 2, 0]}
        >
          <cylinderGeometry
            args={[
              DOCK_RADIUS * 1.02,
              DOCK_RADIUS * 1.02,
              TUBE_HEIGHT,
              64,
              1,
              true,
            ]}
          />
          <meshPhysicalMaterial
            color="#22d3ee"
            transparent
            opacity={0.1}
            metalness={0}
            roughness={0.15}
            transmission={0.85}
            clearcoat={0}
            thickness={0.7}
            envMapIntensity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

// Scroll-driven lighting so the scene gradually shifts from cool space to warm ground
function Lights({ scrollProgress }: { scrollProgress: number }) {
  const t = clamp01(scrollProgress);

  const ambientIntensity = 0.25 + t * 0.25;
  const mainLightIntensity = 0.9 - t * 0.3;

  const warmGround = new THREE.Color("#f97316");
  const coolSpace = new THREE.Color("#60a5fa");
  const sunColor = coolSpace.clone().lerp(warmGround, t * 0.6);

  return (
    <>
      <ambientLight intensity={ambientIntensity} color="#e5e7eb" />
      <directionalLight
        position={[8, 10, 6]}
        intensity={mainLightIntensity}
        color={sunColor}
        castShadow
      />
      <pointLight
        position={[0, -3, 3]}
        intensity={0.6 + t * 0.5}
        color={t > 0.6 ? "#22c55e" : "#38bdf8"}
        distance={14}
      />
    </>
  );
}

interface ParticleFieldProps {
  count?: number;
  scrollProgress: number;
}

// Big, slow cloud of particles that rotates around the camera for extra depth
function ParticleField({
  count = 700,
  scrollProgress,
}: ParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;

      colors[i * 3] = 0.5 + Math.random() * 0.4;
      colors[i * 3 + 1] = 0.6 + Math.random() * 0.3;
      colors[i * 3 + 2] = 0.8 + Math.random() * 0.2;
    }

    return { positions, colors };
  }, [count]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const t = state.clock.elapsedTime;

    pointsRef.current.rotation.y = t * 0.02;
    pointsRef.current.rotation.x = Math.sin(t * 0.05) * 0.08;

    const material = pointsRef.current
      .material as THREE.PointsMaterial;
    const alpha = 0.25 + (1 - scrollProgress) * 0.55;
    material.opacity = alpha;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.09}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Main balloon model: loads OBJ + PBR textures and moves along a scroll-based flight path
function Balloon3D({ scrollProgress }: { scrollProgress: number }) {
  const obj = useLoader(OBJLoader, "/models/BalloonDetailed.obj");

  const [diffuse, metallic, normal, roughness, pbr] = useLoader(
    THREE.TextureLoader,
    [
      "/models/texture_diffuse.png",
      "/models/texture_metallic.png",
      "/models/texture_normal.png",
      "/models/texture_roughness.png",
      "/models/texture_pbr.png",
    ]
  ) as THREE.Texture[];

  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if ((mesh as any).isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        mesh.material = new THREE.MeshStandardMaterial({
          map: diffuse,
          metalnessMap: metallic,
          normalMap: normal,
          roughnessMap: roughness,
          aoMap: pbr,
          color: "#ffffff",
          metalness: 1,
          roughness: 1,
          envMapIntensity: 1.2,
        });

        if (mesh.geometry && !mesh.geometry.attributes.uv2) {
          mesh.geometry.setAttribute(
            "uv2",
            mesh.geometry.attributes.uv
          );
        }
      }
    });
  }, [obj, diffuse, metallic, normal, roughness, pbr]);

  const p = scrollProgress;

  const BASE_CENTER_Y = -1.9;
  const BASE_CENTER_Z = 5;

  const BALLOON_GROUND_OFFSET = 0.2;
  const LANDING_Y = BASE_CENTER_Y + BALLOON_GROUND_OFFSET;
  const LANDING_Z = BASE_CENTER_Z;

  let y = 0;
  let z = 6;
  let scale = 1;

  if (p <= 0.1) {
    const t = p / 0.1;

    y = THREE.MathUtils.lerp(-5.3, 0.0, t);
    z = 6.0;
    scale = THREE.MathUtils.lerp(3.2, 1.0, t);
  } else if (p <= 0.78) {
    const tRaw = (p - 0.1) / 0.68;
    const t = tRaw * tRaw * (3 - 2 * tRaw);

    const startY = 0.0;
    const endY = -1.4;
    const startZ = 6.0;
    const endZ = 6.8;
    const startScale = 1.0;
    const endScale = 0.93;

    y = THREE.MathUtils.lerp(startY, endY, t);
    z = THREE.MathUtils.lerp(startZ, endZ, t);
    scale = THREE.MathUtils.lerp(startScale, endScale, t);
  } else {
    const tRaw = (p - 0.78) / 0.22;
    const t = tRaw * tRaw * (3 - 2 * tRaw);

    const startY = -1.4;
    const startZ = 6.8;
    const startScale = 0.93;

    y = THREE.MathUtils.lerp(startY, LANDING_Y, t);
    z = THREE.MathUtils.lerp(startZ, LANDING_Z, t);
    scale = THREE.MathUtils.lerp(startScale, 0.9, t);
  }

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();

    const landingT = THREE.MathUtils.clamp(
      (scrollProgress - 0.9) / 0.1,
      0,
      1
    );

    const motionFactor =
      1 -
      landingT * landingT * (3 - 2 * landingT);

    const swayAmp = 0.25 * motionFactor;
    const bobAmp = 0.25 * motionFactor;
    const rotSpeed = 0.2 * motionFactor;

    groupRef.current.position.set(
      Math.sin(t * 0.25) * swayAmp,
      y + Math.sin(t * 0.7) * bobAmp,
      z
    );

    groupRef.current.rotation.y += delta * rotSpeed;
  });

  return (
    <group ref={groupRef} scale={scale}>
      <primitive object={obj} />
    </group>
  );
}

const FALLBACK_STARS = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  left: `${(i * 17 + 31) % 100}%`,
  top: `${(i * 23 + 47) % 100}%`,
  delay: `${(i * 0.04) % 2}s`,
}));

// Basic CSS-only background for devices that can't render WebGL
function FallbackBackground({
  scrollProgress,
}: {
  scrollProgress: number;
}) {
  const getGradient = () => {
    if (scrollProgress < 0.25) {
      return "from-slate-950 via-slate-900 to-slate-800";
    } else if (scrollProgress < 0.5) {
      return "from-slate-900 via-indigo-900 to-sky-900";
    } else if (scrollProgress < 0.75) {
      return "from-sky-900 via-sky-800 to-slate-900";
    }
    return "from-slate-900 via-slate-800 to-slate-900";
  };

  return (
    <div
      className={`fixed inset-0 z-0 bg-gradient-to-b ${getGradient()} transition-all duration-1000`}
    >
      <div className="absolute inset-0 opacity-40">
        {FALLBACK_STARS.map((star) => (
          <div
            key={star.id}
            className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
            style={{
              left: star.left,
              top: star.top,
              animationDelay: star.delay,
              opacity: scrollProgress > 0.5 ? 0.8 : 0.3,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Main Scene3D export: wires all the layers together and ties them to scroll
export default function Scene3D({ scrollProgress }: Scene3DProps) {
  return (
    <WebGLErrorBoundary
      fallback={<FallbackBackground scrollProgress={scrollProgress} />}
    >
      <div className="fixed inset-0 w-screen h-screen z-0 pointer-events-none">
        <Canvas
          className="w-full h-full"
          shadows
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false,
          }}
          dpr={[1, 2]}
          onCreated={({ gl }) => {
            gl.setClearColor("#020617", 1);
          }}
        >
          <PerspectiveCamera
            makeDefault
            position={[0, 0, 10]}
            fov={60}
          />
          <CameraController scrollProgress={scrollProgress} />

          <Suspense fallback={null}>
            <GalaxyField scrollProgress={scrollProgress} />
            <DuskSkyOverlay scrollProgress={scrollProgress} />
            <CloudBank scrollProgress={scrollProgress} />
            <PlanesAroundBalloon scrollProgress={scrollProgress} />
            <Drones scrollProgress={scrollProgress} />
            <LandingPlatform scrollProgress={scrollProgress} />
            <Balloon3D scrollProgress={scrollProgress} />
            <Lights scrollProgress={scrollProgress} />
            <Environment preset="sunset" />
          </Suspense>

          <fog
            attach="fog"
            args={[
              scrollProgress < 0.5 ? "#020617" : "#020617",
              12,
              60,
            ]}
          />
        </Canvas>
      </div>
    </WebGLErrorBoundary>
  );
}