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

/**
 * Về trạng thái đầu trang. Store là object tầng module nên SỐNG QUA lần điều hướng client: rời
 * `/` khi đang ở terminal rồi quay lại, camera sẽ đọc `terminalIn = 1` cũ và dựng nhầm cảnh giá
 * máy thay cho hero. Gọi khi landing unmount.
 */
export function resetLandingStore(): void {
  landingStore.velocity = 0;
  landingStore.pointerX = 0;
  landingStore.pointerY = 0;
  landingStore.heroOut = 0;
  landingStore.journey = 0;
  landingStore.terminalIn = 0;
  landingStore.terminal = 0;
  landingStore.closingIn = 0;
  landingStore.closing = 0;
  landingStore.runningPods = 0;
  landingStore.visible.hero = true;
  landingStore.visible.journey = false;
  landingStore.visible.terminal = false;
  landingStore.visible.closing = false;
}

export const canvasWanted = (): boolean => {
  const { visible } = landingStore;
  return visible.hero || visible.journey || visible.terminal || visible.closing;
};
