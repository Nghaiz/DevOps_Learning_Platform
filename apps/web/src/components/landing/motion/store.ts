import type Lenis from 'lenis';

/**
 * Trạng thái cuộn dùng chung giữa DOM và cảnh 3D. Là một object thường, KHÔNG phải React state:
 * ScrollTrigger ghi vào nó mỗi khung, `useFrame` của cảnh đọc ra, và không component nào phải
 * render lại theo nhịp 60 lần mỗi giây.
 *
 * Mọi tiến độ đều 0..1. `*In` là đoạn vào của một khu (mép trên của khu đi từ đáy màn hình lên
 * đỉnh), không trùng với đoạn ghim của chính khu đó.
 */
export interface LandingStore {
  lenis: Lenis | null;
  /** Vận tốc cuộn của Lenis, px mỗi khung; âm khi cuộn lên. */
  velocity: number;
  pointerX: number;
  pointerY: number;
  heroOut: number;
  journey: number;
  terminalIn: number;
  terminal: number;
  closingIn: number;
  closing: number;
  /** Số pod đang Running trong khung terminal, để giá máy 3D sáng đúng nhịp. */
  runningPods: number;
  /** Khu nào đang lộ ra sau nền trong suốt; canvas chỉ vẽ khi có ít nhất một khu như vậy. */
  readonly visible: Record<'hero' | 'journey' | 'terminal' | 'closing', boolean>;
}

export const landingStore: LandingStore = {
  lenis: null,
  velocity: 0,
  pointerX: 0,
  pointerY: 0,
  heroOut: 0,
  journey: 0,
  terminalIn: 0,
  terminal: 0,
  closingIn: 0,
  closing: 0,
  runningPods: 0,
  visible: { hero: true, journey: false, terminal: false, closing: false },
};

export const canvasWanted = (): boolean => {
  const { visible } = landingStore;
  return visible.hero || visible.journey || visible.terminal || visible.closing;
};
