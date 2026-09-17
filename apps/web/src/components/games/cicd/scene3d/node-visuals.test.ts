/**
 * Ghim phép dịch `STATE_ENCODING` → cách vẽ 3D (19.D.3.3/6/10).
 *
 * Ba ô gác ba lỗi im lặng khác nhau:
 *
 * 1. **Mọi `NodeGeometry` đều có kiểu thân.** Engine thêm một hình học mới mà
 *    bảng này quên ⇒ `bodyStyleOf` trả `undefined`, node rơi ra khỏi mọi lô, và
 *    nó biến mất khỏi cảnh mà `data-cicd-node-count` vẫn đếm nó.
 * 2. **`retrying` phân biệt được với `running` khi đã tắt chuyển động.** Hai
 *    trạng thái này dùng chung màu VÀ chung `spin`; tắt chuyển động đi thì chỉ
 *    còn vành kép gánh. Mất nó là mất hẳn một trạng thái với người bật
 *    `prefers-reduced-motion`.
 * 3. **`shake-once` KHÔNG tính là chuyển động lặp.** Tính nhầm nó vào thì cảnh
 *    xin khung hình vĩnh viễn sau lượt chạy đầu có node đỏ — đúng cái bẫy
 *    `idleSpinAfterMs` đã gài một lần cho arena.
 */
import { describe, expect, it } from 'vitest';
import { STATE_ENCODING, type NodeGeometry, type StageRunState } from '@devops-platform/games';

import {
  BODY_STYLES,
  bodyStyleOf,
  hasGlowShell,
  isDarkBackground,
  isLoopingMotion,
  motionOf,
  needsContinuousFrames,
  RIM_HOVERED,
  RIM_SELECTED,
  ringCountOf,
  rimStrength,
} from './node-visuals';

const ALL_STATES = Object.keys(STATE_ENCODING) as readonly StageRunState[];
const ALL_GEOMETRIES = Array.from(
  new Set(ALL_STATES.map((state) => STATE_ENCODING[state].geometry)),
) as readonly NodeGeometry[];

describe('bodyStyleOf', () => {
  it('cho mọi hình học của bảng mã hoá một kiểu thân có thật', () => {
    for (const geometry of ALL_GEOMETRIES) {
      expect(BODY_STYLES).toContain(bodyStyleOf(geometry));
    }
  });

  it('gom `ringed` và `ringed-double` chung thân với `solid` — vành là lô riêng', () => {
    expect(bodyStyleOf('ringed')).toBe(bodyStyleOf('solid'));
    expect(bodyStyleOf('ringed-double')).toBe(bodyStyleOf('solid'));
  });

  it('giữ `hollow` và `sunken` tách khỏi `solid`', () => {
    expect(bodyStyleOf('hollow')).not.toBe(bodyStyleOf('solid'));
    expect(bodyStyleOf('sunken')).not.toBe(bodyStyleOf('solid'));
  });

  /*
   * Đây là ô gác ô AC-D4 ở tầng toán: số lô thân KHÔNG được phụ thuộc số node.
   * Nếu ai đó tách kiểu thân theo trạng thái thay vì theo cặp (hình, vật liệu),
   * số lệnh vẽ sẽ tăng theo độ lớn của level và ô draw call chỉ đỏ ở level đông
   * nhất — tức là muộn nhất có thể.
   */
  it('số kiểu thân không vượt số hình học — gom lại chứ không nở ra', () => {
    expect(BODY_STYLES.length).toBeLessThanOrEqual(ALL_GEOMETRIES.length);
  });
});

describe('ringCountOf', () => {
  it('phân biệt `retrying` với `running` bằng số vành', () => {
    const running = STATE_ENCODING.running;
    const retrying = STATE_ENCODING.retrying;
    expect(running.statusToken).toBe(retrying.statusToken);
    expect(ringCountOf(retrying.geometry)).toBeGreaterThan(ringCountOf(running.geometry));
  });

  it('chỉ hai hình học có vành', () => {
    for (const geometry of ALL_GEOMETRIES) {
      const rings = ringCountOf(geometry);
      const expected = geometry === 'ringed' ? 1 : geometry === 'ringed-double' ? 2 : 0;
      expect(rings).toBe(expected);
    }
  });
});

describe('hasGlowShell', () => {
  it('chỉ bật cho hai trạng thái đang chạy', () => {
    for (const state of ALL_STATES) {
      expect(hasGlowShell(state)).toBe(state === 'running' || state === 'retrying');
    }
  });
});

describe('isDarkBackground', () => {
  it('đọc nền trắng là sáng và nền đen là tối', () => {
    expect(isDarkBackground({ r: 1, g: 1, b: 1 })).toBe(false);
    expect(isDarkBackground({ r: 0, g: 0, b: 0 })).toBe(true);
  });

  /*
   * Đối chứng cho việc dùng độ sáng cảm nhận thay vì trung bình cộng: nền lam
   * đậm có trung bình (0+0+0.8)/3 = 0.27 — cả hai công thức cùng nói "tối", nên
   * ca đó không phân biệt được gì. Ca phân biệt được là nền LỤC sáng: trung bình
   * 0.29 đọc ra "tối", còn độ sáng cảm nhận 0.63 đọc ra "sáng" — và mắt người
   * đồng ý với vế sau.
   */
  it('dùng độ sáng cảm nhận: nền lục sáng là nền SÁNG', () => {
    const green = { r: 0, g: 0.88, b: 0 };
    expect((green.r + green.g + green.b) / 3).toBeLessThan(0.5);
    expect(isDarkBackground(green)).toBe(false);
  });

  it('coi màu hỏng là nền tối thay vì ném giữa lúc dựng cảnh', () => {
    expect(isDarkBackground({ r: Number.NaN, g: 0, b: 0 })).toBe(true);
  });
});

describe('rimStrength', () => {
  it('đang chọn thắng đang rê', () => {
    expect(rimStrength('a', 'a', 'a')).toBe(RIM_SELECTED);
    expect(rimStrength('a', null, 'a')).toBe(RIM_HOVERED);
    expect(rimStrength('a', 'b', 'c')).toBe(0);
  });

  it('không viền sáng khi chưa chọn và chưa rê gì', () => {
    expect(rimStrength('a', null, null)).toBe(0);
  });
});

describe('motionOf', () => {
  it('giữ nguyên chuyển động của bảng mã hoá khi không giảm chuyển động', () => {
    for (const state of ALL_STATES) {
      expect(motionOf(state, false)).toBe(STATE_ENCODING[state].motion);
    }
  });

  it('tắt SẠCH mọi chuyển động khi người dùng bật giảm chuyển động (AC-D10)', () => {
    for (const state of ALL_STATES) {
      expect(motionOf(state, true)).toBe('none');
    }
  });
});

describe('isLoopingMotion', () => {
  it('không tính `shake-once` là lặp', () => {
    expect(isLoopingMotion('shake-once')).toBe(false);
  });

  it('tính `spin` và `pulse-slow` là lặp', () => {
    expect(isLoopingMotion('spin')).toBe(true);
    expect(isLoopingMotion('pulse-slow')).toBe(true);
  });

  it('`fade-dim` và `none` không lặp', () => {
    expect(isLoopingMotion('fade-dim')).toBe(false);
    expect(isLoopingMotion('none')).toBe(false);
  });
});

describe('needsContinuousFrames', () => {
  it('cảnh toàn node đã xong thì KHÔNG xin khung hình nữa', () => {
    expect(needsContinuousFrames(['passed', 'passed', 'skipped', 'pending'], false)).toBe(false);
  });

  it('một node đỏ KHÔNG đủ để giữ vòng lặp chạy mãi', () => {
    expect(needsContinuousFrames(['passed', 'failed'], false)).toBe(false);
  });

  it('một node đang chạy thì có', () => {
    expect(needsContinuousFrames(['passed', 'running'], false)).toBe(true);
  });

  it('giảm chuyển động thì không bao giờ xin khung hình liên tục', () => {
    expect(needsContinuousFrames(['running', 'retrying', 'queued'], true)).toBe(false);
  });

  it('cảnh rỗng thì không', () => {
    expect(needsContinuousFrames([], false)).toBe(false);
  });
});
