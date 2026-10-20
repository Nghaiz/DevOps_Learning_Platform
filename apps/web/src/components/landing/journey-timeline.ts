import { STATION_IDS } from './content';

/**
 * Nhịp của đoạn hành trình ghim, dùng chung cho DOM (timeline GSAP của các thẻ ga) và cảnh 3D
 * (camera, sự kiện từng ga). Một nguồn duy nhất: nếu hai bên tự tính, chữ "Ga Docker" sẽ hiện
 * trong lúc camera còn đứng ở ga Git.
 *
 * `t` là tiến độ cuộn của đoạn ghim, 0..1. Đoạn đầu (`JOURNEY_INTRO`) là lời dẫn và chuyến bay
 * từ bó tuyến tới ga đầu tiên; phần còn lại chia đều cho sáu ga. Trong mỗi ga, sự kiện 3D chạy ở
 * đoạn [0, TRAVEL_START), camera bay sang ga kế ở đoạn [TRAVEL_START, 1).
 */

export const STATION_COUNT = STATION_IDS.length;
export const JOURNEY_INTRO = 0.07;
export const STATION_SPAN = (1 - JOURNEY_INTRO) / STATION_COUNT;
export const TRAVEL_START = 0.62;
/** Thẻ ga hiện vào ở đoạn đầu và rút ra ở đoạn cuối của khoảng ga đó. */
export const PANEL_IN_END = 0.12;
export const PANEL_OUT_START = 0.88;

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

export const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

export const stationStart = (index: number): number => JOURNEY_INTRO + index * STATION_SPAN;

/** Vị trí bên trong khoảng của ga `index`, 0..1 (âm hoặc >1 nếu chưa tới / đã qua). */
const localAt = (t: number, index: number): number => (t - stationStart(index)) / STATION_SPAN;

/** Ga đang có thẻ hiện, -1 khi còn ở lời dẫn. */
export function activeStationAt(t: number): number {
  if (t < JOURNEY_INTRO) return -1;
  return Math.min(STATION_COUNT - 1, Math.floor((t - JOURNEY_INTRO) / STATION_SPAN));
}

/**
 * Vị trí camera trên đường ray: -1 là đầu tuyến, `i` là đứng cạnh ga `i`. Giá trị lẻ là đang
 * bay giữa hai ga. Ga cuối không bay tiếp: chặng sang giá máy terminal do đoạn sau lo.
 */
export function trackAt(t: number): number {
  if (t <= JOURNEY_INTRO) return -1 + easeInOutCubic(clamp01(t / JOURNEY_INTRO));
  const index = activeStationAt(t);
  if (index === STATION_COUNT - 1) return index;
  const travel = clamp01((localAt(t, index) - TRAVEL_START) / (1 - TRAVEL_START));
  return index + easeInOutCubic(travel);
}

/** Tiến độ sự kiện 3D của ga `index`: 0 trước khi tới, 1 sau khi đã rời ga. */
export function stationEventAt(t: number, index: number): number {
  return clamp01(localAt(t, index) / TRAVEL_START);
}
