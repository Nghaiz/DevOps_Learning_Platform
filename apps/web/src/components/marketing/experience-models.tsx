'use client';

import { useEffect, useMemo, type RefObject } from 'react';
import {
  CatmullRomCurve3,
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
  type Mesh,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type JourneyPalette = Readonly<
  Record<
    'bg' | 'panel' | 'ink' | 'muted' | 'coral' | 'cyan' | 'violet' | 'mint' | 'amber' | 'metal',
    string
  >
>;

type Triple = [number, number, number];
interface Part {
  readonly at: Triple;
  readonly size: Triple;
  readonly rotate?: Triple;
  readonly radius?: number;
}

interface SolidProps {
  readonly parts: readonly Part[];
  readonly color: string;
  readonly metalness?: number;
  readonly glow?: number;
}

/** Static details share a merged mesh, so every key or vent is not another draw call. */
function Solid({ parts, color, metalness = 0.12, glow = 0 }: SolidProps) {
  const geometry = useMemo(() => {
    const pieces = parts.map(({ at, size, rotate, radius = 0.025 }) => {
      // Subpixel keys, circuit traces and vent slits do not need 300-triangle bevels.
      // Keep the rounded silhouette on the monitor, container and server housings.
      const piece =
        Math.min(...size) <= 0.075
          ? new BoxGeometry(...size).toNonIndexed()
          : new RoundedBoxGeometry(...size, 2, radius);
      piece.applyMatrix4(
        new Matrix4().compose(
          new Vector3(...at),
          new Quaternion().setFromEuler(new Euler(...(rotate ?? [0, 0, 0]))),
          new Vector3(1, 1, 1),
        ),
      );
      return piece;
    });
    const merged = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    return merged;
  }, [parts]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh
      geometry={geometry}
      castShadow={parts.some(({ size }) => Math.min(...size) > 0.12 && Math.max(...size) > 0.75)}
      receiveShadow={parts.some(({ size }) => Math.max(...size) > 0.7)}
    >
      <meshStandardMaterial
        color={color}
        roughness={metalness > 0.4 ? 0.3 : 0.48}
        metalness={metalness}
        emissive={color}
        emissiveIntensity={glow}
      />
    </mesh>
  );
}

const WORKSTATION_CASING: readonly Part[] = [
  { at: [0, 0.13, 0.15], size: [2.1, 0.24, 1.48], radius: 0.1 },
  { at: [0, 0.78, -0.45], size: [0.25, 1.1, 0.19], radius: 0.06 },
  { at: [0, 1.38, -0.48], size: [2.25, 1.52, 0.25], radius: 0.14 },
];
const WORKSTATION_SCREEN: readonly Part[] = [
  { at: [0, 1.4, -0.335], size: [1.99, 1.24, 0.045], radius: 0.065 },
  { at: [0.13, 0.275, 0.16], size: [1.6, 0.04, 0.64], radius: 0.045 },
  { at: [0, 0.269, 0.645], size: [0.58, 0.025, 0.26], radius: 0.04 },
];
const KEYS: readonly Part[] = Array.from({ length: 30 }, (_, index) => ({
  at: [-0.57 + (index % 10) * 0.156, 0.31, -0.035 + Math.floor(index / 10) * 0.15],
  size: [0.125, 0.047, 0.11],
  radius: 0.018,
}));
const CODE_CYAN: readonly Part[] = [
  { at: [-0.56, 1.71, -0.3], size: [0.43, 0.04, 0.02] },
  { at: [-0.52, 1.46, -0.3], size: [0.32, 0.035, 0.02] },
  { at: [-0.38, 1.22, -0.3], size: [0.48, 0.035, 0.02] },
  { at: [-0.52, 0.98, -0.3], size: [0.64, 0.035, 0.02] },
];
const CODE_AMBER: readonly Part[] = [
  { at: [0.14, 1.71, -0.3], size: [0.65, 0.04, 0.02] },
  { at: [0.03, 1.46, -0.3], size: [0.58, 0.035, 0.02] },
  { at: [0.4, 1.22, -0.3], size: [0.55, 0.035, 0.02] },
];
const CODE_MUTED: readonly Part[] = [
  { at: [-0.15, 1.59, -0.3], size: [1.03, 0.025, 0.02] },
  { at: [-0.1, 1.34, -0.3], size: [0.72, 0.025, 0.02] },
  { at: [0.02, 1.1, -0.3], size: [0.98, 0.025, 0.02] },
];
const MONITOR_TRIM: readonly Part[] = [
  { at: [0.84, 0.675, -0.337], size: [0.12, 0.033, 0.025] },
  { at: [-0.77, 0.265, 0.6], size: [0.07, 0.02, 0.07] },
];

export function Workstation({ colors }: { readonly colors: JourneyPalette }) {
  return (
    <group>
      <Solid parts={WORKSTATION_CASING} color={colors.coral} />
      <Solid parts={WORKSTATION_SCREEN} color={colors.bg} metalness={0.3} />
      <Solid parts={KEYS} color={colors.ink} />
      <Solid parts={CODE_CYAN} color={colors.cyan} glow={0.6} />
      <Solid parts={CODE_AMBER} color={colors.amber} glow={0.45} />
      <Solid parts={CODE_MUTED} color={colors.metal} glow={0.25} />
      <Solid parts={MONITOR_TRIM} color={colors.mint} glow={0.8} />
    </group>
  );
}

const CONTAINER_SHELL: readonly Part[] = [
  { at: [0, 0.08, 0], size: [2.34, 0.16, 1.35], radius: 0.055 },
  { at: [-1.09, 0.57, 0], size: [0.12, 1, 1.35] },
  { at: [1.09, 0.57, 0], size: [0.12, 1, 1.35] },
  { at: [0, 0.57, -0.6], size: [2.1, 1, 0.12] },
  { at: [0, 0.54, 0.6], size: [2.1, 0.92, 0.12] },
];
const CONTAINER_RIBS: readonly Part[] = Array.from({ length: 13 }, (_, index) => ({
  at: [-0.94 + index * 0.156, 0.54, 0.678],
  size: [0.047, 0.78, 0.053],
  radius: 0.015,
}));
const CONTAINER_CORNERS: readonly Part[] = [
  ...[-1.13, 1.13].flatMap((x) =>
    [-0.62, 0.62].flatMap((z) => [
      { at: [x, 0.14, z] as Triple, size: [0.13, 0.25, 0.16] as Triple },
      { at: [x, 0.99, z] as Triple, size: [0.13, 0.2, 0.16] as Triple },
    ]),
  ),
  { at: [0, 0.08, 0.71], size: [2.3, 0.04, 0.03] },
];
const CONTAINER_LID: readonly Part[] = [
  { at: [0, 1.095, 0], size: [2.38, 0.14, 1.4], radius: 0.06 },
  ...Array.from({ length: 8 }, (_, index) => ({
    at: [-0.89 + index * 0.255, 1.174, 0] as Triple,
    size: [0.045, 0.028, 1.08] as Triple,
  })),
];
const CONTAINER_HANDLES: readonly Part[] = [
  { at: [1.169, 0.57, -0.24], size: [0.05, 0.85, 0.025] },
  { at: [1.169, 0.57, 0.24], size: [0.05, 0.85, 0.025] },
  { at: [1.2, 0.54, -0.16], size: [0.06, 0.055, 0.18] },
  { at: [1.2, 0.54, 0.32], size: [0.06, 0.055, 0.18] },
];
const CONTAINER_BADGE: readonly Part[] = [
  { at: [0.5, 0.62, 0.714], size: [0.49, 0.32, 0.045], radius: 0.025 },
];
const PACKAGE_LAYERS: readonly Part[] = [
  { at: [0, 0.29, 0], size: [1.48, 0.15, 0.81], radius: 0.045 },
  { at: [0, 0.49, 0], size: [1.38, 0.13, 0.74], radius: 0.04 },
  { at: [0, 0.68, 0], size: [1.25, 0.12, 0.66], radius: 0.04 },
];

export function ContainerModule({
  colors,
  lidRef,
  layerRefs,
}: {
  readonly colors: JourneyPalette;
  readonly lidRef: RefObject<Group | null>;
  readonly layerRefs: RefObject<(Group | null)[]>;
}) {
  return (
    <group>
      <Solid parts={CONTAINER_SHELL} color={colors.cyan} metalness={0.35} />
      <Solid parts={CONTAINER_RIBS} color={colors.cyan} metalness={0.55} />
      <Solid parts={CONTAINER_CORNERS} color={colors.panel} metalness={0.5} />
      <Solid parts={CONTAINER_HANDLES} color={colors.ink} metalness={0.7} />
      <Solid parts={CONTAINER_BADGE} color={colors.panel} />
      {PACKAGE_LAYERS.map((layer, index) => (
        <PackageLayer
          key={index}
          layer={layer}
          index={index}
          colors={colors}
          layerRefs={layerRefs}
        />
      ))}
      <group ref={lidRef}>
        <Solid parts={CONTAINER_LID} color={colors.cyan} metalness={0.4} />
      </group>
    </group>
  );
}

function PackageLayer({
  layer,
  index,
  colors,
  layerRefs,
}: {
  readonly layer: Part;
  readonly index: number;
  readonly colors: JourneyPalette;
  readonly layerRefs: RefObject<(Group | null)[]>;
}) {
  const parts = useMemo(() => [layer], [layer]);
  return (
    <group
      ref={(group) => {
        layerRefs.current[index] = group;
      }}
    >
      <Solid parts={parts} color={index === 1 ? colors.violet : colors.amber} metalness={0.2} />
    </group>
  );
}

const SERVER_SHELL: readonly Part[] = [
  { at: [0, 1.28, 0], size: [1.31, 2.52, 1.29], radius: 0.13 },
  { at: [0, 0.06, 0], size: [1.46, 0.14, 1.45], radius: 0.045 },
];
const SERVER_FACE: readonly Part[] = [
  { at: [0, 1.28, 0.66], size: [1.13, 2.27, 0.045], radius: 0.05 },
  { at: [0.674, 1.29, 0], size: [0.024, 1.87, 0.95], radius: 0.02 },
];
const SERVER_DRAWERS: readonly Part[] = Array.from({ length: 5 }, (_, index) => ({
  at: [0, 0.4 + index * 0.395, 0.708],
  size: [0.99, 0.285, 0.07],
  radius: 0.025,
}));
const SERVER_VENTS: readonly Part[] = Array.from({ length: 35 }, (_, index) => ({
  at: [-0.19 + (index % 7) * 0.065, 0.4 + Math.floor(index / 7) * 0.395, 0.756],
  size: [0.025, 0.14, 0.02],
  radius: 0.005,
}));
const SERVER_LIGHTS: readonly Part[] = Array.from({ length: 5 }, (_, index) => ({
  at: [0.37, 0.4 + index * 0.395, 0.754],
  size: [0.075, 0.04, 0.022],
  radius: 0.014,
}));
const SERVER_TRIM: readonly Part[] = [
  { at: [-0.42, 2.21, 0.761], size: [0.06, 0.06, 0.021], radius: 0.02 },
  { at: [0.02, 2.2, 0.761], size: [0.64, 0.026, 0.021] },
  ...Array.from({ length: 8 }, (_, index) => ({
    at: [-0.42 + index * 0.12, 2.55, 0] as Triple,
    size: [0.045, 0.016, 0.66] as Triple,
  })),
];

function ServerFans({ colors }: { readonly colors: JourneyPalette }) {
  const geometry = useMemo(() => {
    const pieces: BufferGeometry[] = [0.74, 1.68].map((y) => {
      const cylinder = new CylinderGeometry(0.32, 0.32, 0.032, 20);
      cylinder.rotateZ(Math.PI / 2);
      cylinder.translate(0.7, y, 0);
      return cylinder;
    });
    const merged = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    return merged;
  }, []);
  const blades = useMemo<readonly Part[]>(
    () =>
      [0.74, 1.68].flatMap((y) =>
        [0, 1, 2, 3].map((index) => ({
          at: [0.723, y, 0] as Triple,
          size: [0.027, 0.46, 0.056] as Triple,
          rotate: [(Math.PI / 4) * index, 0, 0] as Triple,
          radius: 0.014,
        })),
      ),
    [],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return (
    <group>
      {geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial color={colors.bg} metalness={0.45} roughness={0.4} />
        </mesh>
      )}
      <Solid parts={blades} color={colors.metal} metalness={0.6} />
    </group>
  );
}

export function ServerTower({
  colors,
  accent,
  status,
  trayRefs,
}: {
  readonly colors: JourneyPalette;
  readonly accent: string;
  readonly status: string;
  readonly trayRefs?: RefObject<(Group | null)[]>;
}) {
  return (
    <group>
      <Solid parts={SERVER_SHELL} color={accent} metalness={0.2} />
      <Solid parts={SERVER_FACE} color={colors.bg} />
      {trayRefs ? (
        SERVER_DRAWERS.map((drawer, index) => (
          <ServerTray
            key={index}
            drawer={drawer}
            index={index}
            colors={colors}
            status={status}
            trayRefs={trayRefs}
          />
        ))
      ) : (
        <>
          <Solid parts={SERVER_DRAWERS} color={colors.panel} metalness={0.45} />
          <Solid parts={SERVER_VENTS} color={colors.metal} metalness={0.5} />
          <Solid parts={SERVER_LIGHTS} color={status} glow={1.1} />
        </>
      )}
      <Solid parts={SERVER_TRIM} color={colors.muted} metalness={0.55} />
      <ServerFans colors={colors} />
    </group>
  );
}

function ServerTray({
  drawer,
  index,
  colors,
  status,
  trayRefs,
}: {
  readonly drawer: Part;
  readonly index: number;
  readonly colors: JourneyPalette;
  readonly status: string;
  readonly trayRefs: RefObject<(Group | null)[]>;
}) {
  const parts = useMemo(() => [drawer], [drawer]);
  const vents = useMemo(() => SERVER_VENTS.slice(index * 7, index * 7 + 7), [index]);
  const lights = useMemo(() => SERVER_LIGHTS.slice(index, index + 1), [index]);
  return (
    <group
      ref={(group) => {
        trayRefs.current[index] = group;
      }}
    >
      <Solid parts={parts} color={colors.panel} metalness={0.45} />
      <Solid parts={vents} color={colors.metal} metalness={0.5} />
      <Solid parts={lights} color={status} glow={1.1} />
    </group>
  );
}

const CIRCUIT_FOUNDATION: readonly Part[] = [
  { at: [-0.08, -0.29, 0.05], size: [7.65, 0.36, 4.76], radius: 0.17 },
];
const CIRCUIT_SURFACE: readonly Part[] = [
  { at: [-0.08, -0.095, 0.05], size: [7.48, 0.045, 4.58], radius: 0.12 },
];
const SOCKETS: readonly Part[] = [
  { at: [-2.2, 0, 0.67], size: [2.52, 0.19, 2.02], radius: 0.09 },
  { at: [0.4, 0, 1.0], size: [2.76, 0.19, 1.71], radius: 0.09 },
  { at: [2.33, 0, -0.62], size: [1.82, 0.19, 1.82], radius: 0.09 },
  { at: [0.33, 0, -1.03], size: [1.52, 0.19, 1.63], radius: 0.09 },
];
const TRACE_DETAILS: readonly Part[] = [
  { at: [-1.68, -0.058, -1.54], size: [2.79, 0.022, 0.023] },
  { at: [-1.4, -0.056, -1.35], size: [2.44, 0.021, 0.021] },
  { at: [-3.31, -0.055, -0.86], size: [0.024, 0.02, 1.75] },
  { at: [-3.08, -0.055, -0.85], size: [0.024, 0.02, 1.25] },
  { at: [2.22, -0.055, 1.94], size: [2.41, 0.02, 0.024] },
  { at: [2.51, -0.056, 1.75], size: [1.66, 0.02, 0.024] },
  { at: [3.42, -0.055, 0.33], size: [0.024, 0.02, 2.78] },
];
const EDGE_LIGHTS: readonly Part[] = [
  { at: [-2.76, -0.27, 2.436], size: [1.19, 0.045, 0.014] },
  { at: [0.42, -0.27, 2.436], size: [1.53, 0.045, 0.014] },
  { at: [3.756, -0.27, 0.43], size: [0.014, 0.045, 1.21] },
];
const CHIP_PARTS: readonly Part[] = [
  { at: [-2.32, 0.026, -1.03], size: [0.68, 0.17, 0.61], radius: 0.045 },
  { at: [-2.32, 0.121, -1.03], size: [0.41, 0.025, 0.35], radius: 0.025 },
];
const CHIP_PINS: readonly Part[] = Array.from({ length: 16 }, (_, index) => ({
  at: [-2.59 + (index % 8) * 0.078, 0.031, -1.03 + (index < 8 ? -0.37 : 0.37)],
  size: [0.035, 0.035, 0.2],
  radius: 0.006,
}));

export function CircuitPlatform({ colors }: { readonly colors: JourneyPalette }) {
  return (
    <group>
      <Solid parts={CIRCUIT_FOUNDATION} color={colors.metal} metalness={0.6} />
      <Solid parts={CIRCUIT_SURFACE} color={colors.panel} metalness={0.3} />
      <Solid parts={SOCKETS} color={colors.bg} metalness={0.35} />
      <Solid parts={TRACE_DETAILS} color={colors.metal} metalness={0.65} />
      <Solid parts={EDGE_LIGHTS} color={colors.cyan} glow={0.8} />
      <Solid parts={CHIP_PARTS} color={colors.violet} metalness={0.4} />
      <Solid parts={CHIP_PINS} color={colors.muted} metalness={0.6} />
    </group>
  );
}

export const PACKET_ROUTES = [
  new CatmullRomCurve3([
    new Vector3(-1.65, 0.13, 1.85),
    new Vector3(-1.1, 0.17, 2.0),
    new Vector3(-0.35, 0.17, 2.01),
    new Vector3(0.55, 0.16, 1.7),
  ]),
  new CatmullRomCurve3([
    new Vector3(1.13, 0.16, 1.47),
    new Vector3(1.83, 0.22, 1.53),
    new Vector3(2.55, 0.22, 0.81),
    new Vector3(2.35, 0.14, 0.18),
  ]),
  new CatmullRomCurve3([
    new Vector3(1.84, 0.14, -1.54),
    new Vector3(1.53, 0.23, -1.84),
    new Vector3(0.76, 0.23, -1.83),
    new Vector3(0.31, 0.17, -1.62),
  ]),
  new CatmullRomCurve3([
    new Vector3(1.13, 0.19, 1.47),
    new Vector3(1.62, 0.23, 0.59),
    new Vector3(1.47, 0.23, -0.42),
    new Vector3(0.4, 0.21, -0.36),
  ]),
] as const;

export function PacketRoutes({
  colors,
  packetRefs,
  connectionRefs,
}: {
  readonly colors: JourneyPalette;
  readonly packetRefs: RefObject<(Mesh | null)[]>;
  readonly connectionRefs: RefObject<(Mesh | null)[]>;
}) {
  const geometries = useMemo(
    () => PACKET_ROUTES.map((route) => new TubeGeometry(route, 36, 0.024, 6, false)),
    [],
  );
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  return (
    <group>
      {geometries.map((geometry, index) => (
        <group key={index}>
          <mesh
            geometry={geometry}
            ref={(mesh) => {
              connectionRefs.current[index] = mesh;
            }}
          >
            <meshStandardMaterial
              color={colors.metal}
              emissive={index === 3 ? colors.mint : colors.cyan}
              emissiveIntensity={0.12}
              roughness={0.4}
              transparent={index === 3}
              opacity={index === 3 ? 0 : 1}
              depthWrite={index !== 3}
            />
          </mesh>
          <mesh
            ref={(mesh) => {
              packetRefs.current[index] = mesh;
            }}
            position={PACKET_ROUTES[index]?.getPoint(0) ?? [0, 0, 0]}
          >
            <sphereGeometry args={[0.073, 12, 8]} />
            <meshStandardMaterial
              color={colors.ink}
              emissive={index === 3 ? colors.mint : colors.cyan}
              emissiveIntensity={1.2}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
