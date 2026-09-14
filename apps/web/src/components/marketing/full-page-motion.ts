/** A measured narrative destination, expressed in document pixels. */
export interface JourneyAnchor {
  readonly x: number;
  readonly y: number;
  readonly progress: number;
  readonly scale: number;
  readonly opacity: number;
  readonly chapter: number;
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

/**
 * Interpolate actual document anchors. Eased travel deliberately retains vertical drift:
 * linear interpolation here would accidentally pin every model to the viewport center.
 */
export function sampleJourney(
  anchors: readonly JourneyAnchor[],
  scrollY: number,
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const center = scrollY + safeHeight / 2;
  const first = anchors[0];
  if (!first) {
    return { progress: 0, placement: { x: 0.5, y: 0.5, scale: 1 }, opacity: 0, chapter: 0 };
  }
  let left = first;
  let right = first;
  for (const anchor of anchors) {
    right = anchor;
    if (anchor.y >= center) break;
    left = anchor;
  }
  const distance = right.y - left.y;
  const raw = distance > 0 ? clamp((center - left.y) / distance) : 0;
  // Quintic interpolation has zero first/second derivatives at chapter centers.
  const amount = raw * raw * raw * (raw * (raw * 6 - 15) + 10);
  return {
    progress: clamp(mix(left.progress, right.progress, amount)),
    placement: {
      x: mix(left.x, right.x, amount) / safeWidth,
      y: (mix(left.y, right.y, amount) - scrollY) / safeHeight,
      scale: Math.max(0.05, mix(left.scale, right.scale, amount)),
    },
    opacity: clamp(mix(left.opacity, right.opacity, amount)),
    chapter: raw < 0.5 ? left.chapter : right.chapter,
  };
}

/** Modest depth on every content section; all text stays readable before hydration. */
export function sectionTravel(
  top: number,
  height: number,
  scrollY: number,
  viewportHeight: number,
) {
  const position = (top + height / 2 - scrollY - viewportHeight / 2) / Math.max(1, viewportHeight);
  return clamp(position, -1, 1) * 24;
}
