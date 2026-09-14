import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { ResourceKind } from '@devops-platform/games';
import { RESOURCE_COLOR } from '../shared/resource-identity';
import { createResourceGeometry } from './resource-geometry';
import { createNodeGeometry } from './node-geometry';

const kinds = Object.keys(RESOURCE_COLOR) as ResourceKind[];

describe('resource models', () => {
  it.each([2, 4])('builds finite, bounded, distinct models at detail %s', (detail) => {
    const signatures = new Set<string>();
    for (const kind of kinds) {
      const geometry = createResourceGeometry(kind, detail);
      const positions = geometry.getAttribute('position');
      expect(positions.count, kind).toBeGreaterThan(0);
      expect(geometry.getAttribute('normal').count, kind).toBe(positions.count);
      expect(geometry.getAttribute('color').count, kind).toBe(positions.count);
      for (const name of ['position', 'normal', 'color']) {
        expect(
          Array.from(geometry.getAttribute(name).array).every(Number.isFinite),
          `${kind}/${name}`,
        ).toBe(true);
      }
      // Fits the existing layout/picking footprint, including HPA arrow and rings.
      expect(geometry.boundingSphere!.radius, kind).toBeLessThan(1);
      signatures.add(
        createHash('sha256').update(Buffer.from(positions.array.buffer)).digest('hex'),
      );
      geometry.dispose();
    }
    expect(signatures.size).toBe(kinds.length);
  });

  it('builds a vertex-colored node tray with matching attributes', () => {
    const geometry = createNodeGeometry(2);
    expect(geometry.getAttribute('position').count).toBe(geometry.getAttribute('color').count);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBeCloseTo(-0.13, 2);
    expect(geometry.boundingBox!.max.y).toBeLessThan(0.2);
    geometry.dispose();
  });
});
