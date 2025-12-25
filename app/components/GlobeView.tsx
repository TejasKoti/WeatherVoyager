"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, useTexture } from "@react-three/drei";
import { OBJLoader } from "three-stdlib";
import * as THREE from "three";
import type { BalloonHistoryWithWeatherResponse } from "@/lib/types";

type GlobeViewProps = {
  history: BalloonHistoryWithWeatherResponse;
  selectedBalloonId: string | null;
  onBalloonSelect: (id: string) => void;
  altitudeRangeKm: [number, number];
  focusCenter: { lat: number; lon: number } | null;
};

type TooltipState = {
  id: string;
  x: number;
  y: number;
};

// Converts geographic coordinates into 3D space on the sphere
function latLonToVector3(lat: number, lon: number, radius = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// Picks a visual color based on altitude for a quick heatmap cue
function colorForAlt(altKm: number): string {
  if (altKm < 5) return "#22c55e";
  if (altKm < 10) return "#84cc16";
  if (altKm < 18) return "#eab308";
  if (altKm < 25) return "#f97316";
  return "#ef4444";
}

type TrackLineProps = {
  positions: THREE.Vector3[];
  color: string;
};

// Draws a smooth line showing a balloon’s previous path
const TrackLine: React.FC<TrackLineProps> = ({ positions, color }) => {
  if (positions.length < 2) return null;

  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(positions, false, "catmullrom", 0.02),
    [positions]
  );

  const segments = Math.max(64, positions.length * 3);

  return (
    <mesh>
      <tubeGeometry args={[curve, segments, 0.01, 12, false]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={1.2}
      />
    </mesh>
  );
};

type BalloonModelProps = {
  template: THREE.Object3D;
  color: string;
  scale: number;
  opacity: number;
  emissiveIntensity: number;
};

// Renders the balloon OBJ model with per-balloon styling
const BalloonModel: React.FC<BalloonModelProps> = ({
  template,
  color,
  scale,
  opacity,
  emissiveIntensity,
}) => {
  const model = useMemo(() => {
    const clone = template.clone(true);

    clone.traverse((child: any) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          emissive: new THREE.Color(color),
          emissiveIntensity,
          transparent: true,
          opacity,
          roughness: 0.3,
          metalness: 0.2,
          toneMapped: false,
        });
      }
    });

    return clone;
  }, [template, color, opacity, emissiveIntensity]);

  return <primitive object={model} scale={scale} />;
};

type SceneProps = {
  history: BalloonHistoryWithWeatherResponse;
  selectedBalloonId: string | null;
  onBalloonSelect: (id: string) => void;
  altitudeRangeKm: [number, number];
  isDragging: boolean;
  onBalloonHover: (id: string, e: any) => void;
  onBalloonMove: (id: string, e: any) => void;
  onBalloonOut: (id: string) => void;
};

// Main 3D scene: globe, stars, markers, and interactions
const GlobeScene: React.FC<SceneProps> = ({
  history,
  selectedBalloonId,
  onBalloonSelect,
  altitudeRangeKm,
  isDragging,
  onBalloonHover,
  onBalloonMove,
  onBalloonOut,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const earthTexture = useTexture("/textures/EarthLightTexture.jpg");

  // Preload the balloon OBJ once and reuse it for all markers
  const balloonTemplate = useLoader(
    OBJLoader,
    "/models/BalloonSimple.obj"
  ) as THREE.Object3D;

  // Converts raw balloon history into track lines + marker points
  const { markers, tracks } = useMemo(() => {
    const markers: { id: string; position: THREE.Vector3; color: string }[] = [];
    const tracks: Record<string, { points: THREE.Vector3[]; color: string }> = {};

    Object.values(history.balloons).forEach((track) => {
      if (!track.points.length) return;

      const lastPoint = track.points[track.points.length - 1];
      const altKm = lastPoint.alt ?? 0;
      const color = colorForAlt(altKm);
      const [minAlt, maxAlt] = altitudeRangeKm;

      if (altKm < minAlt || altKm > maxAlt) return;

      const pts = track.points.map((p) =>
        latLonToVector3(p.lat, p.lon, 1.04)
      );

      tracks[track.id] = { points: pts, color };
      const last = pts[pts.length - 1];
      markers.push({ id: track.id, position: last, color });
    });

    return { markers, tracks };
  }, [history, altitudeRangeKm]);

  const showOnlySelected = !!selectedBalloonId;

  return (
    <>
      {/* Star-field backdrop for depth */}
      <Stars radius={80} depth={50} count={2000} factor={4} fade speed={1} />

      {/* Basic lighting to keep the globe readable */}
      <ambientLight intensity={0.5} />
      <directionalLight intensity={1.1} position={[3, 3, 2]} />
      <directionalLight intensity={0.6} position={[-2, -1, -2]} />

      {/* Earth sphere */}
      <mesh>
        <sphereGeometry args={[1, 72, 72]} />
        <meshStandardMaterial
          map={earthTexture}
          roughness={0.95}
          metalness={0.1}
          emissive="#ffffff"
          emissiveIntensity={0.01}
        />
      </mesh>

      {/* Balloon markers + interaction logic */}
      {markers.map((m) => {
        if (showOnlySelected && m.id !== selectedBalloonId) return null;

        const isSelected = m.id === selectedBalloonId;
        const isHovered = m.id === hoveredId;

        const sphereSize = isHovered || isSelected ? 0.028 : 0.02;
        const objScale = 0.055;
        const objOpacity = 0.7;
        const objEmissive = 1.6;

        const directionToCore = m.position.clone().normalize().negate();
        const balloonBase = new THREE.Vector3(0, -1, 0);
        const rotation = new THREE.Quaternion().setFromUnitVectors(
          balloonBase,
          directionToCore
        );

        return (
          <group
            key={m.id}
            position={m.position}
            quaternion={rotation}
          >
            <group
              onClick={(e) => {
                e.stopPropagation();
                onBalloonSelect(m.id);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredId(m.id);
                onBalloonHover(m.id, e);
              }}
              onPointerMove={(e) => {
                e.stopPropagation();
                if (hoveredId === m.id) onBalloonMove(m.id, e);
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoveredId((prev) => (prev === m.id ? null : prev));
                onBalloonOut(m.id);
              }}
            >
              {isSelected ? (
                <BalloonModel
                  template={balloonTemplate}
                  color={m.color}
                  scale={objScale}
                  opacity={objOpacity}
                  emissiveIntensity={objEmissive}
                />
              ) : (
                <mesh>
                  <sphereGeometry args={[sphereSize, 16, 16]} />
                  <meshStandardMaterial
                    color={m.color}
                    emissive={m.color}
                    emissiveIntensity={isHovered ? 1.3 : 0.9}
                    transparent
                    opacity={0.9}
                  />
                </mesh>
              )}
            </group>
          </group>
        );
      })}

      {/* Draws the full historical path for the selected balloon */}
      {selectedBalloonId &&
        tracks[selectedBalloonId] &&
        tracks[selectedBalloonId].points.length > 1 && (
          <TrackLine
            positions={tracks[selectedBalloonId].points}
            color={tracks[selectedBalloonId].color}
          />
        )}
    </>
  );
};

// Camera controller that recenters the globe when focusCenter changes
const GlobeCameraController: React.FC<{
  focusCenter: { lat: number; lon: number } | null;
}> = ({ focusCenter }) => {
  const { camera } = useThree();

  useEffect(() => {
    if (!focusCenter) return;

    const target = latLonToVector3(
      focusCenter.lat,
      focusCenter.lon,
      2.1
    );

    camera.position.lerp(target, 0.85);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [focusCenter, camera]);

  return null;
};

// Wraps the 3D scene with pointer/drag logic and tooltip display
const GlobeView: React.FC<GlobeViewProps> = ({
  history,
  selectedBalloonId,
  onBalloonSelect,
  altitudeRangeKm,
  focusCenter,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleBalloonHover = (id: string, e: any) => {
    if (isDragging) return;
    setTooltip({ id, x: e.clientX, y: e.clientY });
  };

  const handleBalloonMove = (id: string, e: any) => {
    if (isDragging) return;
    setTooltip((current) =>
      current && current.id === id
        ? { id, x: e.clientX, y: e.clientY }
        : current
    );
  };

  const handleBalloonOut = (id: string) => {
    setTooltip((current) =>
      current && current.id === id ? null : current
    );
  };

  return (
    <div
      className="globe-wrapper"
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <Canvas
        camera={{ position: [0, 1.3, 2.1], fov: 40 }}
        style={{ width: "100%", height: "100%", borderRadius: "0px" }}
        onPointerDown={() => {
          setIsDragging(true);
          setTooltip(null);
        }}
        onPointerUp={() => {
          setTimeout(() => setIsDragging(false), 120);
        }}
      >
        <GlobeCameraController focusCenter={focusCenter} />

        <GlobeScene
          history={history}
          selectedBalloonId={selectedBalloonId}
          onBalloonSelect={onBalloonSelect}
          altitudeRangeKm={altitudeRangeKm}
          isDragging={isDragging}
          onBalloonHover={handleBalloonHover}
          onBalloonMove={handleBalloonMove}
          onBalloonOut={handleBalloonOut}
        />

        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.5}
          minDistance={1.5}
          maxDistance={3}
          onStart={() => {
            setIsDragging(true);
            setTooltip(null);
          }}
          onEnd={() => {
            setTimeout(() => setIsDragging(false), 120);
          }}
        />
      </Canvas>

      {/* Tooltip attached to the cursor while hovering markers */}
      {tooltip && !isDragging && (
        <div
          className="globe-tooltip"
          style={{
            position: "fixed",
            left: tooltip.x + 16,
            top: tooltip.y - 8,
            pointerEvents: "none",
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "11px",
            lineHeight: 1.2,
            color: "#e5e7eb",
            background:
              "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,64,175,0.96))",
            border: "1px solid rgba(148,163,184,0.75)",
            boxShadow: "0 8px 20px rgba(15,23,42,0.7)",
            whiteSpace: "nowrap",
            zIndex: 50,
          }}
        >
          {tooltip.id}
        </div>
      )}
    </div>
  );
};

export default GlobeView;