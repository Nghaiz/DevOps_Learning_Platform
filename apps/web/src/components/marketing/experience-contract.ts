/** Shared boundary between the native-scroll narrative and its lazy 3D renderer. */
export type JourneyEvent = 'idle' | 'fault' | 'recovered';

export interface JourneySceneProps {
  readonly progress: { current: number };
  readonly pointer: { current: readonly [number, number] };
  readonly event: JourneyEvent;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  /** Viewport-relative scene center (0..1), with offscreen coordinates allowed. */
  readonly placement?: { current: { x: number; y: number; scale: number } };
  readonly onReady: () => void;
  readonly onError: () => void;
  readonly onInvalidateReady: (invalidate: (() => void) | null) => void;
}
