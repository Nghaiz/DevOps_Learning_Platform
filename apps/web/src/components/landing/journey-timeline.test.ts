import { describe, expect, it } from 'vitest';
import {
  JOURNEY_INTRO,
  STATION_COUNT,
  STATION_SPAN,
  TRAVEL_START,
  activeStationAt,
  stationEventAt,
  stationStart,
  trackAt,
} from './journey-timeline';

/**
 * Nhịp chung của DOM (thẻ ga) và cảnh 3D (camera, sự kiện ga). Một ô đỏ ở đây nghĩa là chữ
 * "Ga X" và camera đang nói về hai ga khác nhau.
 */

const SWEEP_STEPS = 20_000;
const sweep = (): number[] => Array.from({ length: SWEEP_STEPS + 1 }, (_, k) => k / SWEEP_STEPS);
const stations = Array.from({ length: STATION_COUNT }, (_, i) => i);

describe('journey-timeline · hằng số', () => {
  it('sáu ga chia đều phần sau lời dẫn, không dư không thiếu', () => {
    expect(STATION_COUNT).toBe(6);
    expect(JOURNEY_INTRO + STATION_COUNT * STATION_SPAN).toBeCloseTo(1, 12);
    expect(stationStart(0)).toBe(JOURNEY_INTRO);
  });
});

describe('journey-timeline · activeStationAt', () => {
  it('trả -1 trong lời dẫn và ga cuối ở t=1', () => {
    expect(activeStationAt(0)).toBe(-1);
    expect(activeStationAt(JOURNEY_INTRO / 2)).toBe(-1);
    expect(activeStationAt(1)).toBe(STATION_COUNT - 1);
  });

  it('đổi ga đúng ở mốc stationStart(i)', () => {
    for (const i of stations) {
      expect(activeStationAt(stationStart(i) + 1e-9), `ga ${String(i)}`).toBe(i);
      expect(activeStationAt(stationStart(i) - 1e-9), `trước ga ${String(i)}`).toBe(i - 1);
    }
  });

  it('không bao giờ vượt ga cuối, kể cả khi t > 1', () => {
    expect(activeStationAt(1.5)).toBe(STATION_COUNT - 1);
  });
});

describe('journey-timeline · trackAt', () => {
  it('hai đầu: t=0 là đầu tuyến (-1), t=1 là ga cuối (5)', () => {
    expect(trackAt(0)).toBe(-1);
    expect(trackAt(1)).toBe(STATION_COUNT - 1);
  });

  it('không bao giờ đi lùi trên một lượt quét dày', () => {
    let previous = Number.NEGATIVE_INFINITY;
    const regressions: string[] = [];
    for (const t of sweep()) {
      const track = trackAt(t);
      if (track < previous) regressions.push(`t=${String(t)}: ${String(previous)} -> ${String(track)}`);
      previous = track;
    }
    expect(regressions).toEqual([]);
  });

  it('nằm trong [-1, 5] trên toàn đoạn', () => {
    for (const t of sweep()) {
      const track = trackAt(t);
      expect(track).toBeGreaterThanOrEqual(-1);
      expect(track).toBeLessThanOrEqual(STATION_COUNT - 1);
    }
  });

  it('camera ĐỨNG YÊN đúng ở ga i trong phần đầu khoảng ga (dwell)', () => {
    for (const i of stations) {
      expect(trackAt(stationStart(i) + STATION_SPAN * 0.3), `ga ${String(i)}`).toBe(i);
    }
  });

  it('camera chỉ bay sau TRAVEL_START của khoảng ga', () => {
    for (const i of stations.slice(0, -1)) {
      const beforeTravel = stationStart(i) + STATION_SPAN * (TRAVEL_START - 0.01);
      const midTravel = stationStart(i) + STATION_SPAN * ((TRAVEL_START + 1) / 2);
      expect(trackAt(beforeTravel), `ga ${String(i)} trước khi bay`).toBe(i);
      expect(trackAt(midTravel), `ga ${String(i)} giữa chặng bay`).toBeGreaterThan(i);
      expect(trackAt(midTravel)).toBeLessThan(i + 1);
    }
  });

  it('kết thúc lời dẫn ở đúng ga 0 (liền mạch với khoảng ga đầu)', () => {
    expect(trackAt(JOURNEY_INTRO)).toBe(0);
    expect(trackAt(JOURNEY_INTRO + 1e-9)).toBe(0);
  });
});

describe('journey-timeline · stationEventAt', () => {
  it('bằng 0 trước khi tới khoảng của ga và tại mốc bắt đầu', () => {
    for (const i of stations) {
      expect(stationEventAt(0, i), `ga ${String(i)} ở t=0`).toBe(0);
      expect(stationEventAt(stationStart(i) - 1e-6, i), `ngay trước ga ${String(i)}`).toBe(0);
      expect(stationEventAt(stationStart(i), i), `mốc ga ${String(i)}`).toBe(0);
    }
  });

  it('bằng 1 sau khi đã qua khoảng của ga', () => {
    for (const i of stations) {
      expect(stationEventAt(stationStart(i) + STATION_SPAN, i), `hết khoảng ga ${String(i)}`).toBe(1);
      expect(stationEventAt(1, i), `ga ${String(i)} ở t=1`).toBe(1);
    }
  });

  it('sự kiện xong TRƯỚC khi camera rời ga', () => {
    for (const i of stations) {
      const leave = stationStart(i) + STATION_SPAN * TRAVEL_START;
      expect(stationEventAt(leave, i)).toBeCloseTo(1, 9);
      expect(stationEventAt(leave + 1e-6, i)).toBe(1);
    }
  });

  it('không giảm theo t trong khoảng của ga', () => {
    for (const i of stations) {
      let previous = Number.NEGATIVE_INFINITY;
      for (let k = 0; k <= 200; k += 1) {
        const value = stationEventAt(stationStart(i) + (STATION_SPAN * k) / 200, i);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });
});
