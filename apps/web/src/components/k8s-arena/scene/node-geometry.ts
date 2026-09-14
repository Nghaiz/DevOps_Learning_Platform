import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PLATFORM_WIDTH as W,
  PLATFORM_DEPTH as D,
  PLATFORM_HEIGHT as H,
} from '../shared/scene-layout';

/** A server tray with inset deck, edge rails, front ports and status lights. */
export function createNodeGeometry(segments: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: string,
  ): void => {
    const geometry = new RoundedBoxGeometry(
      w,
      h,
      d,
      Math.max(2, segments),
      Math.min(w, h, d) * 0.22,
    );
    geometry.translate(x, y, z);
    const pigment = new THREE.Color(color);
    const data = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < data.length; i += 3) {
      data[i] = pigment.r;
      data[i + 1] = pigment.g;
      data[i + 2] = pigment.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    parts.push(geometry);
  };
  box(W, H, D, 0, 0, 0, '#a2b6c9');
  box(W - 0.2, 0.035, D - 0.22, 0, H / 2, 0, '#5b7189');
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06])
    box(0.06, 0.045, D - 0.24, x, H / 2 + 0.015, 0, '#9ae4ed');
  box(W - 0.26, 0.045, 0.025, 0, -0.025, D / 2 + 0.005, '#4abbd2');
  for (let i = 0; i < 3; i++)
    box(0.12, 0.065, 0.025, -W / 2 + 0.3 + i * 0.22, 0.06, D / 2 + 0.018, '#b4ffcc');
  for (let i = 0; i < 5; i++)
    box(0.085, 0.07, 0.025, W / 2 - 0.3 - i * 0.12, 0.06, D / 2 + 0.018, '#233c52');
  const result = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (result === null) throw new Error('Cannot build node tray');
  return result;
}
