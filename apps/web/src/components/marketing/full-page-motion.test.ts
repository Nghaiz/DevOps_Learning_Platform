import { describe, expect, it } from 'vitest';
import { sampleJourney, sectionTravel, type JourneyAnchor } from './full-page-motion';

const anchors: JourneyAnchor[] = [
  { x: 750, y: 500, progress: 0, scale: 0.8, opacity: 1, chapter: 0 },
  { x: 250, y: 1500, progress: 1 / 3, scale: 0.9, opacity: 1, chapter: 1 },
  { x: 820, y: 2500, progress: 1, scale: 0.7, opacity: 0.4, chapter: 3 },
];

describe('full-page scene travel', () => {
  it('follows the first and last document anchors offscreen instead of pinning them', () => {
    expect(sampleJourney(anchors, -200, 1000, 1000).placement.y).toBe(0.7);
    expect(sampleJourney(anchors, 2800, 1000, 1000).placement.y).toBe(-0.3);
  });

  it('travels left and right with vertical drift and reverses deterministically', () => {
    const forward = [0, 250, 500, 1000, 1500, 2000].map((scroll) =>
      sampleJourney(anchors, scroll, 1000, 1000),
    );
    expect(forward[0]?.placement.x).toBe(0.75);
    expect(forward[3]?.placement.x).toBe(0.25);
    expect(forward[5]?.placement.x).toBe(0.82);
    expect(forward[1]?.placement.y).not.toBe(0.5);
    for (const [index, scroll] of [2000, 1500, 1000, 500, 250, 0].entries()) {
      expect(sampleJourney(anchors, scroll, 1000, 1000)).toEqual(forward[5 - index]);
    }
  });

  it('handles later content changing model state and opacity without a separate renderer', () => {
    const result = sampleJourney(
      [...anchors, { x: 100, y: 3500, progress: 0.1, scale: 0.6, opacity: 0.7, chapter: 3 }],
      3000,
      1000,
      1000,
    );
    expect(result.progress).toBeCloseTo(0.1);
    expect(result.opacity).toBeCloseTo(0.7);
    expect(result.chapter).toBe(3);
  });

  it('stays finite for empty, coincident and zero-sized measurements', () => {
    expect(sampleJourney([], 0, 0, 0).opacity).toBe(0);
    const result = sampleJourney([anchors[0]!, anchors[0]!], 100, 0, 0);
    expect(Object.values(result.placement).every(Number.isFinite)).toBe(true);
  });

  it('bounds content depth independently of total document height', () => {
    expect(sectionTravel(3000, 500, 0, 800)).toBe(24);
    expect(sectionTravel(0, 500, 3000, 800)).toBe(-24);
    expect(sectionTravel(100, 600, 0, 800)).toBe(0);
  });
});
