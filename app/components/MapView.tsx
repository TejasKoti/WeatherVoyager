"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { Canvas, useThree, extend, useFrame, useLoader } from "@react-three/fiber";
import { OBJLoader } from "three-stdlib";
import {
  OrbitControls,
  Stars,
  useTexture,
  shaderMaterial,
  PointerLockControls,
} from "@react-three/drei";
import * as THREE from "three";
import type { BalloonHistoryWithWeatherResponse } from "@/lib/types";

type MapType = "dark" | "satellite";

type MapViewProps = {
  history: BalloonHistoryWithWeatherResponse;
  selectedBalloonId: string | null;
  onBalloonSelect: (id: string | null) => void;
  focusCenter: { lat: number; lon: number } | null;
  focusRadiusKm: number;
  flyModeActive: boolean;
  mapType: MapType;
  showCompass: boolean;
  cameraResetToken: number;
  onHeadingChange?: (deg: number) => void;
};

type BalloonPathPoint = THREE.Vector3;

type BalloonTrackGeom = {
  id: string;
  points: BalloonPathPoint[];
  last: BalloonPathPoint;
  altKm: number;
};

// Core numeric tuning values for the flat map and altitude scaling
const BASE_SCENE_RADIUS = 140;
const ALT_SCALE = 3;
const TILE_SCENE_SIZE = 220;

// Custom shader material that shows a tile only within a circular radius
const MapClipMaterial = shaderMaterial(
  {
    map: null as THREE.Texture | null,
    radius: 100,
    brightness: 10.4,
  },
  `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  `
uniform sampler2D map;
uniform float radius;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  float d = length(vWorldPos.xz);
  if (d > radius) discard;

  vec4 color = texture2D(map, vUv);
  if (color.a < 0.001) discard;

  color.rgb = pow(color.rgb, vec3(0.45));
  color.rgb *= 1.35;
  color.rgb = mix(vec3(0.15), color.rgb, 1.45);

  gl_FragColor = color;
}
  `
);

extend({ MapClipMaterial });

declare global {
  namespace JSX {
    interface IntrinsicElements {
      mapClipMaterial: any;
    }
  }
}

// Geographic utilities for converting lat/lon to local scene coordinates
function localOffsetsKm(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number
) {
  const R = 6371;
  const centerLatRad = (centerLat * Math.PI) / 180;
  const dLat = ((lat - centerLat) * Math.PI) / 180;
  const dLon = ((lon - centerLon) * Math.PI) / 180;

  const x = R * dLon * Math.cos(centerLatRad);
  const z = R * dLat;
  const dist = Math.sqrt(x * x + z * z);
  return { xKm: x, zKm: z, distKm: dist };
}

function altToY(altKm?: number | null): number {
  const a = altKm ?? 0;
  return a * ALT_SCALE;
}

function colorForAlt(altKm: number): THREE.Color {
  if (altKm < 5) return new THREE.Color("#22c55e");
  if (altKm < 10) return new THREE.Color("#84cc16");
  if (altKm < 18) return new THREE.Color("#eab308");
  if (altKm < 25) return new THREE.Color("#f97316");
  return new THREE.Color("#ef4444");
}

function zoomForTiles(): number {
  return 9;
}

// Web Mercator helpers for converting lat/lon into fractional tile indices
function latLonToTileFraction(lat: number, lon: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;

  const x = ((lon + 180) / 360) * n;
  const y =
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
    n;
  return { x, y };
}

// Web Mercator helpers returning integer tile indices plus offsets inside the tile
function latLonToTileWithOffset(lat: number, lon: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;

  const xf = ((lon + 180) / 360) * n;
  const yf =
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
    n;

  const xTile = Math.floor(xf);
  const yTile = Math.floor(yf);

  const offsetX = xf - (xTile + 0.5);
  const offsetY = yf - (yTile + 0.5);

  return { x: xTile, y: yTile, offsetX, offsetY };
}

// Build balloon world-space geometry using the same Mercator basis as tiles
function buildTracks(
  history: BalloonHistoryWithWeatherResponse,
  focusCenter: { lat: number; lon: number } | null,
  focusRadiusKm: number,
  sceneRadius: number,
  zoom: number
): BalloonTrackGeom[] {
  const out: BalloonTrackGeom[] = [];
  if (!focusCenter) return out;

  const { lat: cLat, lon: cLon } = focusCenter;

  const radiusKmClamped = Math.max(500, Math.min(focusRadiusKm, 2500));

  const focusTile = latLonToTileFraction(cLat, cLon, zoom);
  const focusX = focusTile.x;
  const focusY = focusTile.y;

  Object.values(history.balloons).forEach((track) => {
    if (!track.points.length) return;

    const lastPt = track.points[track.points.length - 1];
    const lastAltKm = lastPt.alt ?? 0;

    const { distKm } = localOffsetsKm(lastPt.lat, lastPt.lon, cLat, cLon);
    if (distKm > radiusKmClamped * 1.05) return;

    const points: BalloonPathPoint[] = track.points.map((p) => {
      const tile = latLonToTileFraction(p.lat, p.lon, zoom);

      const dxTiles = tile.x - focusX;
      const dyTiles = tile.y - focusY;

      const x = dxTiles * TILE_SCENE_SIZE;
      const z = dyTiles * TILE_SCENE_SIZE;
      const y = altToY(p.alt ?? lastAltKm);

      return new THREE.Vector3(x, y, z);
    });

    const lastTile = latLonToTileFraction(lastPt.lat, lastPt.lon, zoom);
    const last = new THREE.Vector3(
      (lastTile.x - focusX) * TILE_SCENE_SIZE,
      altToY(lastAltKm),
      (lastTile.y - focusY) * TILE_SCENE_SIZE
    );

    out.push({ id: track.id, points, last, altKm: lastAltKm });
  });

  return out;
}

// Visual components for balloon trails and balloon meshes
type TrailsProps = {
  tracks: BalloonTrackGeom[];
  selectedBalloonId: string | null;
  onBalloonSelect: (id: string | null) => void;
};

const Trails: React.FC<TrailsProps> = ({
  tracks,
  selectedBalloonId,
  onBalloonSelect,
}) => (
  <>
    {tracks.map((t) => {
      if (t.points.length < 2) return null;

      const curve = new THREE.CatmullRomCurve3(
        t.points,
        false,
        "catmullrom",
        0.02
      );
      const segments = Math.max(64, t.points.length * 4);
      const baseColor = colorForAlt(t.altKm);

      const isSelected = selectedBalloonId === t.id;
      const dimmed = !!selectedBalloonId && !isSelected;

      return (
        <mesh
          key={`trail-${t.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onBalloonSelect(isSelected ? null : t.id);
          }}
        >
          <tubeGeometry
            args={[curve, segments, isSelected ? 2 : 1.5, 10, false]}
          />
          <meshStandardMaterial
            color={baseColor}
            emissive={baseColor}
            emissiveIntensity={isSelected ? 1.8 : dimmed ? 0.2 : 0.8}
            transparent
            opacity={dimmed ? 0.15 : 0.9}
            fog={false}
            toneMapped={false}
          />
        </mesh>
      );
    })}
  </>
);

type BalloonsProps = {
  tracks: BalloonTrackGeom[];
  selectedBalloonId: string | null;
  onBalloonSelect: (id: string | null) => void;
};

// Animated wrapper around a balloon model that handles bobbing and spinning
const AnimatedBalloon: React.FC<{
  object: THREE.Object3D;
  position: THREE.Vector3;
  scale: number;
  onClick: (e: any) => void;
}> = ({ object, position, scale, onClick }) => {
  const groupRef = useRef<THREE.Group>(null);

  const basePos = useMemo(() => position.clone(), [position]);
  const baseY = basePos.y;

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    const bob = Math.sin(t * 0.6) * 2;
    const spin = t * 0.09;

    groupRef.current.position.y = baseY + bob;
    groupRef.current.rotation.y = spin;
  });

  return (
    <group
      ref={groupRef}
      position={basePos}
      scale={scale}
      onClick={onClick}
    >
      <primitive object={object} />
      <mesh>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
};

// Balloon collection that clones the base OBJ and applies per-balloon materials
const Balloons: React.FC<BalloonsProps> = ({
  tracks,
  selectedBalloonId,
  onBalloonSelect,
}) => {
  const baseObj = useLoader(OBJLoader, "/models/BalloonSimple.obj");

  return (
    <>
      {tracks.map((t) => {
        const baseColor = colorForAlt(t.altKm);
        const isSelected = selectedBalloonId === t.id;
        const dimmed = !!selectedBalloonId && !isSelected;

        const opacity = dimmed ? 0.05 : isSelected ? 0.9 : 0.8;
        const emissiveIntensity = isSelected ? 1.5 : dimmed ? 0.5 : 0.7;

        const instance = baseObj.clone(true);
        instance.traverse((child: any) => {
          if (child.isMesh) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.opacity = opacity;
            child.material.color.copy(baseColor);
            child.material.emissive.copy(baseColor);
            child.material.emissiveIntensity = emissiveIntensity;
            child.material.depthWrite = true;
            child.material.fog = false;
            child.material.toneMapped = false;
            child.material.roughness = 0.3;
            child.material.metalness = 0.4;
          }
        });

        const scale = isSelected ? 50 : 40;

        return (
          <AnimatedBalloon
            key={`balloon-${t.id}`}
            object={instance}
            position={t.last}
            scale={scale}
            onClick={(e: any) => {
              e.stopPropagation();
              onBalloonSelect(isSelected ? null : t.id);
            }}
          />
        );
      })}
    </>
  );
};

// Thin wrapper that only enables PointerLockControls when the API is available
const SafePointerLockControls: React.FC = () => {
  if (typeof document === "undefined") return null;
  const body: any = document.body;
  if (!body || typeof body.requestPointerLock !== "function") {
    return null;
  }
  return <PointerLockControls />;
};

// WASD-style fly camera controls that update position each frame
const FlyCameraControls: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const { camera } = useThree();
  const keysRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled) return;

    const keys = keysRef.current;
    const move = new THREE.Vector3();

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.normalize();
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3()
      .crossVectors(forward, camera.up)
      .normalize();

    if (keys["KeyW"]) move.add(forward);
    if (keys["KeyS"]) move.sub(forward);
    if (keys["KeyA"]) move.sub(right);
    if (keys["KeyD"]) move.add(right);
    if (keys["Space"]) move.add(camera.up);
    if (keys["ShiftLeft"] || keys["ShiftRight"]) move.sub(camera.up);

    if (move.lengthSq() > 0) {
      move.normalize();
      const speed = 150;
      move.multiplyScalar(speed * delta);
      camera.position.add(move);
    }
  });

  if (!enabled) return null;

  return <SafePointerLockControls />;
};

// Main three.js scene: lights, tiles, fog, trails, balloons, and camera controls
type SceneProps = {
  history: BalloonHistoryWithWeatherResponse;
  selectedBalloonId: string | null;
  onBalloonSelect: (id: string | null) => void;
  focusCenter: { lat: number; lon: number } | null;
  focusRadiusKm: number;
  flyModeActive: boolean;
  mapType: MapType;
  cameraResetToken: number;
  onHeadingChange?: (deg: number) => void;
};

const MapScene: React.FC<SceneProps> = ({
  history,
  selectedBalloonId,
  onBalloonSelect,
  focusCenter,
  focusRadiusKm,
  flyModeActive,
  mapType,
  cameraResetToken,
  onHeadingChange,
}) => {
  const controlsRef = useRef<any>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const prevFlyModeRef = useRef<boolean>(false);
  const { camera } = useThree();

  const hasFocus = !!focusCenter;

  const radiusKmClamped = Math.max(500, Math.min(focusRadiusKm, 2500));
  const sceneRadius = (BASE_SCENE_RADIUS * radiusKmClamped) / 500;

  const zoom = zoomForTiles();

  const { tileUrls, tilePositions } = useMemo(() => {
    const halfRange = 3;

    const baseDark = "https://a.basemaps.cartocdn.com/dark_all";
    const baseSat =
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

    if (!focusCenter) {
      const url =
        mapType === "dark" ? `${baseDark}/0/0/0.png` : `${baseSat}/0/0/0`;
      return {
        tileUrls: [url],
        tilePositions: [{ x: 0, z: 0 }],
      };
    }

    const { x: tx, y: ty, offsetX, offsetY } = latLonToTileWithOffset(
      focusCenter.lat,
      focusCenter.lon,
      zoom
    );

    const urls: string[] = [];
    const positions: { x: number; z: number }[] = [];

    for (let dx = -halfRange; dx <= halfRange; dx += 1) {
      for (let dz = -halfRange; dz <= halfRange; dz += 1) {
        const tileX = tx + dx;
        const tileY = ty + dz;

        const url =
          mapType === "dark"
            ? `${baseDark}/${zoom}/${tileX}/${tileY}.png`
            : `${baseSat}/${zoom}/${tileY}/${tileX}`;

        urls.push(url);

        const xScene = (dx - offsetX) * TILE_SCENE_SIZE;
        const zScene = (dz - offsetY) * TILE_SCENE_SIZE;

        positions.push({ x: xScene, z: zScene });
      }
    }

    return { tileUrls: urls, tilePositions: positions };
  }, [focusCenter, mapType, zoom]);

  const textures = useTexture(tileUrls) as THREE.Texture[];
  textures.forEach((t) => {
    t.anisotropy = 8;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  });

  const tracks = useMemo(
    () =>
      buildTracks(
        history,
        focusCenter,
        radiusKmClamped,
        sceneRadius,
        zoom
      ),
    [history, focusCenter, radiusKmClamped, sceneRadius, zoom]
  );

  // Camera reset and mode transitions between orbit and fly controls
  useEffect(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    if (hasFocus) {
      controls.target.set(0, 60, 0);
      camera.position.set(0, 160, 260);
    } else {
      controls.target.set(0, 40, 0);
      camera.position.set(0, 220, 420);
    }

    controls.update();
  }, [cameraResetToken, hasFocus, camera]);

  useEffect(() => {
    const prev = prevFlyModeRef.current;

    if (prev && !flyModeActive && controlsRef.current) {
      const controls = controlsRef.current as any;

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.normalize();

      const newTarget = new THREE.Vector3()
        .copy(camera.position)
        .add(dir.multiplyScalar(200));

      controls.target.copy(newTarget);
      controls.update();
    }

    prevFlyModeRef.current = flyModeActive;
  }, [flyModeActive, camera]);

  // Heading reporting so the parent can render a compass UI
  useFrame(() => {
    if (!onHeadingChange) return;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const angleRad = Math.atan2(dir.x, -dir.z);
    const deg = (angleRad * 180) / Math.PI;

    if (
      lastHeadingRef.current === null ||
      Math.abs(deg - lastHeadingRef.current) > 0.5
    ) {
      lastHeadingRef.current = deg;
      onHeadingChange(deg);
    }
  });

  return (
    <>
      <color attach="background" args={["#020617"]} />
      <fog attach="fog" args={["#020617", 200, 900]} />

      <ambientLight intensity={0.3} />
      <directionalLight intensity={1.2} position={[150, 300, 200]} />
      <directionalLight intensity={0.4} position={[-200, 100, -200]} />
      <Stars radius={1000} depth={80} count={3000} factor={4} fade speed={0.8} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
        <planeGeometry args={[2000, 2000, 1, 1]} />
        <meshBasicMaterial color="#020617" />
      </mesh>

      {textures.map((tex, i) => {
        const pos = tilePositions[i] ?? { x: 0, z: 0 };
        return (
          <mesh
            key={i}
            position={[pos.x, 0, pos.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[TILE_SCENE_SIZE, TILE_SCENE_SIZE, 1, 1]} />
            {hasFocus ? (
                // @ts-ignore intrinsic element registered above
              <mapClipMaterial map={tex} radius={sceneRadius} transparent />
            ) : (
              <meshBasicMaterial map={tex} />
            )}
          </mesh>
        );
      })}

      {hasFocus && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]}>
          <ringGeometry args={[sceneRadius - 0.8, sceneRadius + 0.8, 128]} />
          <meshBasicMaterial color="#4b5563" transparent opacity={0.8} />
        </mesh>
      )}

      <Trails
        tracks={tracks}
        selectedBalloonId={selectedBalloonId}
        onBalloonSelect={onBalloonSelect}
      />
      <Balloons
        tracks={tracks}
        selectedBalloonId={selectedBalloonId}
        onBalloonSelect={onBalloonSelect}
      />

      {!flyModeActive && (
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enablePan
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.5}
          minDistance={hasFocus ? 120 : 150}
          maxDistance={hasFocus ? 420 : 700}
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI / 2.05}
        />
      )}

      <FlyCameraControls enabled={flyModeActive} />
    </>
  );
};

// Top-level React wrapper that mounts the three.js Canvas and scene
const MapView: React.FC<MapViewProps> = ({
  history,
  selectedBalloonId,
  onBalloonSelect,
  focusCenter,
  focusRadiusKm,
  flyModeActive,
  mapType,
  showCompass,
  cameraResetToken,
  onHeadingChange,
}) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      borderRadius: "0px",
      overflow: "hidden",
      boxShadow: "0 40px 120px rgba(15,23,42,0.95)",
    }}
  >
    <Canvas
      camera={{
        position: [0, 220, 420],
        fov: 40,
        near: 0.1,
        far: 3000,
      }}
    >
      <MapScene
        history={history}
        selectedBalloonId={selectedBalloonId}
        onBalloonSelect={onBalloonSelect}
        focusCenter={focusCenter}
        focusRadiusKm={focusRadiusKm}
        flyModeActive={flyModeActive}
        mapType={mapType}
        cameraResetToken={cameraResetToken}
        onHeadingChange={onHeadingChange}
      />
    </Canvas>
  </div>
);

export default MapView;