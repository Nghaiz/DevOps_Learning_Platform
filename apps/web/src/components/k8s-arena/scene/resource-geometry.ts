import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ResourceKind } from '@devops-platform/games';

/** One merged, vertex-shaded model per kind; instances share all GPU geometry. */
export function createResourceGeometry(kind: ResourceKind, detail: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const segments = Math.max(2, detail);
  const round = Math.max(24, detail * 10);
  const add = (source: THREE.BufferGeometry, x = 0, y = 0, z = 0, shade = 1): void => {
    const geometry = source.index === null ? source : source.toNonIndexed();
    if (geometry !== source) source.dispose();
    geometry.translate(x, y, z);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3).fill(shade);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(geometry);
  };
  const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0, shade = 1): void =>
    add(new RoundedBoxGeometry(w, h, d, segments, Math.min(w, h, d) * 0.18), x, y, z, shade);
  const cylinder = (r: number, h: number, x = 0, y = 0, z = 0, shade = 1, sides = round): void =>
    add(new THREE.CylinderGeometry(r, r, h, sides), x, y, z, shade);
  const ring = (r: number, tube: number, x = 0, y = 0, z = 0, flat = false, shade = 1): void => {
    const g = new THREE.TorusGeometry(r, tube, 8, round);
    if (flat) g.rotateX(Math.PI / 2);
    add(g, x, y, z, shade);
  };
  const plate = (): void => cylinder(0.55, 0.09, 0, -0.45, 0, 0.3, 6);
  const shield = (scale = 1): void => {
    const s = new THREE.Shape();
    s.moveTo(-0.4, 0.38);
    s.lineTo(0, 0.49);
    s.lineTo(0.4, 0.38);
    s.lineTo(0.35, -0.12);
    s.quadraticCurveTo(0.25, -0.35, 0, -0.48);
    s.quadraticCurveTo(-0.25, -0.35, -0.35, -0.12);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.18,
      bevelEnabled: true,
      bevelSize: 0.045,
      bevelThickness: 0.04,
      bevelSegments: segments,
      curveSegments: 12,
    });
    g.center();
    g.scale(scale, scale, scale);
    add(g);
  };
  const check = (z = 0.16): void => {
    add(
      new RoundedBoxGeometry(0.12, 0.29, 0.07, segments, 0.025).rotateZ(0.7),
      -0.12,
      -0.06,
      z,
      1.8,
    );
    add(
      new RoundedBoxGeometry(0.12, 0.48, 0.07, segments, 0.025).rotateZ(-0.65),
      0.09,
      0.035,
      z,
      1.8,
    );
  };

  switch (kind) {
    case 'Pod':
      cylinder(0.51, 0.15, 0, -0.34, 0, 0.35, 6);
      cylinder(0.46, 0.55, 0, 0, 0, 1, 6);
      cylinder(0.47, 0.07, 0, 0.3, 0, 1.5, 6);
      cylinder(0.29, 0.09, 0, 0.38, 0, 0.38, 6);
      box(0.28, 0.045, 0.035, 0, -0.02, 0.405, 1.8);
      break;
    case 'Deployment':
      for (let i = 0; i < 3; i++) {
        box(0.78, 0.55, 0.18, (i - 1) * 0.12, i * 0.17 - 0.18, -i * 0.17, 0.65 + i * 0.2);
      }
      for (let i = 0; i < 3; i++) box(0.14, 0.16, 0.045, (i - 1) * 0.22 - 0.12, -0.16, 0.12, 1.8);
      break;
    case 'ReplicaSet':
      for (let i = 0; i < 3; i++) box(0.92, 0.15, 0.68, 0, i * 0.29 - 0.29, 0, 0.65 + i * 0.25);
      break;
    case 'StatefulSet':
      plate();
      for (let i = 0; i < 3; i++) {
        cylinder(0.145, 0.72, (i - 1) * 0.34, 0, 0);
        ring(0.15, 0.025, (i - 1) * 0.34, 0.24, 0, true, 1.8);
      }
      break;
    case 'DaemonSet':
      ring(0.39, 0.045, 0, -0.1, 0, true, 0.6);
      cylinder(0.18, 0.45, 0, 0, 0, 1.3, 6);
      for (let i = 0; i < 4; i++)
        cylinder(
          0.13,
          0.3,
          Math.cos((i * Math.PI) / 2) * 0.4,
          -0.1,
          Math.sin((i * Math.PI) / 2) * 0.4,
          1,
          6,
        );
      break;
    case 'Job':
      add(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 8).rotateX(Math.PI / 2));
      check();
      break;
    case 'CronJob':
      ring(0.4, 0.09);
      box(0.075, 0.3, 0.08, 0, 0.12, 0.06, 1.8);
      box(0.23, 0.075, 0.08, 0.09, 0, 0.06, 1.8);
      box(0.22, 0.11, 0.22, -0.3, 0.41);
      box(0.22, 0.11, 0.22, 0.3, 0.41);
      break;
    case 'Service':
      cylinder(0.3, 0.28, 0, 0.05, 0, 1.1);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        add(
          new RoundedBoxGeometry(0.1, 0.1, 0.42, segments, 0.025).rotateY(a),
          Math.sin(a) * 0.25,
          -0.14,
          Math.cos(a) * 0.25,
          0.65,
        );
        cylinder(0.13, 0.15, Math.sin(a) * 0.48, -0.14, Math.cos(a) * 0.48, 1.5);
      }
      ring(0.2, 0.03, 0, 0.22, 0, true, 1.7);
      break;
    case 'Ingress':
      box(0.17, 0.9, 0.35, -0.37);
      box(0.17, 0.9, 0.35, 0.37);
      box(0.85, 0.18, 0.35, 0, 0.37);
      box(0.18, 0.1, 0.8, 0, -0.34, 0.1, 1.7);
      add(new THREE.ConeGeometry(0.2, 0.28, 3).rotateX(Math.PI / 2), 0, -0.28, 0.47, 1.5);
      break;
    case 'NetworkPolicy':
      shield();
      box(0.55, 0.08, 0.06, 0, 0, 0.17, 0.25);
      break;
    case 'PodDisruptionBudget':
      shield();
      check(0.17);
      break;
    case 'Secret':
      box(0.76, 0.5, 0.34, 0, -0.15);
      ring(0.25, 0.075, 0, 0.23, 0, false, 1.4);
      add(new THREE.SphereGeometry(0.065, 16, 12), 0, -0.12, 0.19, 0.16);
      box(0.045, 0.13, 0.04, 0, -0.22, 0.18, 0.16);
      break;
    case 'ConfigMap':
      box(0.7, 0.92, 0.15, 0, 0, -0.06, 0.65);
      box(0.67, 0.85, 0.12, 0.09, 0.06, 0.08);
      for (let i = 0; i < 3; i++)
        box(i === 2 ? 0.25 : 0.42, 0.055, 0.035, 0.05, 0.27 - i * 0.2, 0.16, 1.8);
      break;
    case 'PersistentVolume':
    case 'PersistentVolumeClaim':
      for (let i = 0; i < 3; i++) cylinder(0.39, 0.22, 0, i * 0.28 - 0.28, 0, 0.65 + i * 0.25);
      if (kind === 'PersistentVolumeClaim') box(0.28, 0.27, 0.09, 0.28, -0.18, 0.34, 1.8);
      else ring(0.24, 0.035, 0, 0.41, 0, true, 1.7);
      break;
    case 'StorageClass':
      box(0.92, 0.32, 0.72, 0, -0.15);
      cylinder(0.27, 0.09, 0, 0.05, 0, 1.5);
      box(0.4, 0.045, 0.04, -0.1, -0.13, 0.37, 0.3);
      break;
    case 'ServiceAccount':
      box(0.73, 0.88, 0.15, 0, 0, 0, 0.65);
      add(new THREE.SphereGeometry(0.16, 20, 12), 0, 0.17, 0.13, 1.5);
      box(0.4, 0.22, 0.13, 0, -0.16, 0.12, 1.3);
      break;
    case 'Role':
      ring(0.22, 0.08, -0.2, 0.18);
      box(0.13, 0.57, 0.12, 0, -0.13);
      box(0.25, 0.11, 0.12, 0.1, -0.29, 0, 1.4);
      break;
    case 'ClusterRole':
      shield();
      ring(0.12, 0.04, 0, 0.13, 0.19, false, 1.8);
      box(0.055, 0.22, 0.045, 0, -0.08, 0.19, 1.8);
      break;
    case 'RoleBinding':
    case 'ClusterRoleBinding':
      ring(0.26, 0.085, -0.19, 0.1);
      ring(0.26, 0.085, 0.19, -0.1, 0.04, false, 1.5);
      if (kind === 'ClusterRoleBinding') ring(0.13, 0.045, 0, 0.4, 0, false, 0.65);
      break;
    case 'Namespace':
      for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) box(0.085, 0.85, 0.085, x, 0, z);
      for (const y of [-0.4, 0.4]) {
        for (const z of [-0.4, 0.4]) box(0.88, 0.085, 0.085, 0, y, z);
        for (const x of [-0.4, 0.4]) box(0.085, 0.085, 0.88, x, y, 0);
      }
      break;
    case 'HorizontalPodAutoscaler':
    case 'ResourceQuota':
    case 'LimitRange':
      plate();
      for (let i = 0; i < 3; i++) {
        const h = kind === 'LimitRange' ? 0.65 : 0.3 + i * 0.23;
        box(0.2, h, 0.25, (i - 1) * 0.31, -0.35 + h / 2, 0, 0.7 + i * 0.25);
        if (kind === 'LimitRange') box(0.28, 0.09, 0.34, (i - 1) * 0.31, i * 0.17 - 0.2, 0, 1.8);
      }
      if (kind === 'ResourceQuota') box(1, 0.075, 0.3, 0, 0.47, 0, 1.6);
      if (kind === 'HorizontalPodAutoscaler')
        add(new THREE.ConeGeometry(0.16, 0.23, 4), 0.31, 0.51, 0, 1.5);
      break;
    case 'Node':
      box(0.82, 0.94, 0.6, 0, 0, 0, 0.6);
      for (let i = 0; i < 3; i++) {
        box(0.69, 0.19, 0.09, 0, (i - 1) * 0.26, 0.33);
        box(0.08, 0.055, 0.025, -0.22, (i - 1) * 0.26, 0.39, 2);
      }
      break;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Missing resource model: ${exhaustive}`);
    }
  }
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (merged === null) throw new Error(`Cannot build resource model: ${kind}`);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
