import { afterEach, describe, expect, it } from 'vitest';
import { NODE_RADIUS, PLATE_FLOOR, type Vec3 } from './scene3d-contract.ts';
import {
  advanceMotion,
  arcLift,
  ARC_LIFT,
  GHOST_OPACITY,
  lerp,
  MAX_FRAME_S,
  MOTION_DURATION_S,
  motionFrame,
  shardDirection,
  SHARD_COUNT,
  sinkOf,
  SUNK_OPACITY,
  TRACE_OPACITY,
  type MotionActorState,
  type MotionFrame,
  type MotionInput,
  type MotionKind,
  type MotionRole,
} from './motion-script.ts';

/**
 * Chuyển động MANG THÔNG TIN (17.K.7).
 *
 * ⚠ Test này KHÔNG gác "hàm chạy không ném". Nó gác **câu mà mỗi chuyển động
 * phải nói ra** — bản cũ của `rebase` còn hay mất, `reflog` trả về đúng chỗ hay
 * gần đúng, `force-push` có phải thứ duy nhất về 0 hay không. Một chuyển động
 * sai nghĩa vẫn chạy trơn tru và vẫn đẹp; chỉ những khẳng định dưới đây mới
 * phân biệt được nó với bản đúng.
 */

const HOME: Vec3 = [4.8, 1.1, 6.0];
const TARGET: Vec3 = [12.0, 0, 2.0];

const ALL_KINDS: readonly MotionKind[] = [
  'rebase',
  'reset-hard',
  'reflog',
  'force-push',
  'cherry-pick',
];

function inputOf(kind: MotionKind): MotionInput {
  switch (kind) {
    case 'rebase':
      return { kind, from: HOME, to: TARGET };
    case 'cherry-pick':
      return { kind, from: HOME, to: TARGET };
    default:
      return { kind, from: HOME };
  }
}

function actorOf(frame: MotionFrame, role: MotionRole): MotionActorState {
  const found = frame.actors.find((a) => a.role === role);
  if (found === undefined) throw new Error(`chuyển động ${frame.kind} không có vai "${role}"`);
  return found;
}

/** 21 mốc đều nhau trên [0,1] — đủ dày để bắt một chỗ gãy đơn điệu. */
const SAMPLES = Array.from({ length: 21 }, (_, i) => i / 20);

describe('lerp · chính xác ở HAI ĐẦU, không chỉ gần đúng', () => {
  /*
    Ô gác chống một lần "dọn dẹp" trong tương lai đổi `lerp` về dạng quen thuộc
    `a + (b - a) * t`. Dạng đó KHÔNG khôi phục `b` ở `t=1` trong dấu phẩy động,
    và ba ô "bằng đúng chỗ cũ" ở dưới sẽ đỏ với thông báo nói về `reflog` chứ
    không nói về phép cộng — mất hàng giờ để lần ra. Ở đây thì nó đỏ đúng chỗ.
  */
  const PAIRS: readonly (readonly [number, number])[] = [
    [1, 0.32],
    [1, 0.22],
    [0.22, 1],
    [4.8, 12],
    [1.1, -3.1],
    [0, 0.55],
  ];

  it('t=0 trả về đúng a, t=1 trả về đúng b — từng bit', () => {
    for (const [a, b] of PAIRS) {
      expect(lerp(a, b, 0)).toBe(a);
      expect(lerp(a, b, 1)).toBe(b);
    }
  });

  it('a === b ⇒ ĐỨNG YÊN ở mọi t — trục không đổi thì không được trôi', () => {
    for (const value of [6, 4.8, 0, -3.1, 0.55]) {
      for (const t of SAMPLES) {
        expect(lerp(value, value, t)).toBe(value);
      }
    }
  });
});

describe('T0 · đối chứng chống-rỗng', () => {
  /*
    Chạy TRƯỚC mọi ô khác, theo khuôn T0 của repo. Không có nó thì một
    `motionFrame` trả `actors: []` làm mọi ô `every(...)` bên dưới xanh trong
    khi không đo gì cả — `rules/green-that-proves-nothing.md`.
  */
  it('cả năm chuyển động đều phát ra vật ở t=0 VÀ t=1', () => {
    expect(ALL_KINDS).toHaveLength(5);
    for (const kind of ALL_KINDS) {
      const input = inputOf(kind);
      expect(motionFrame(input, 0).actors.length).toBeGreaterThan(0);
      expect(motionFrame(input, 1).actors.length).toBeGreaterThan(0);
    }
  });
});

describe('rebase · commit MỚI bay đi, bản cũ CÒN đó', () => {
  const input = inputOf('rebase');

  it('bản chính rời chỗ cũ và tới đúng đích', () => {
    expect(actorOf(motionFrame(input, 0), 'primary').position).toEqual(HOME);
    expect(actorOf(motionFrame(input, 1), 'primary').position).toEqual(TARGET);
  });

  it('bản cũ ĐỨNG YÊN — rebase không di chuyển commit cũ', () => {
    for (const t of SAMPLES) {
      expect(actorOf(motionFrame(input, t), 'ghost').position).toEqual(HOME);
    }
  });

  it('bản cũ mờ đi nhưng KHÔNG biến mất — đây là toàn bộ bài học', () => {
    expect(actorOf(motionFrame(input, 0), 'ghost').opacity).toBe(1);
    const end = actorOf(motionFrame(input, 1), 'ghost').opacity;
    expect(end).toBe(GHOST_OPACITY);
    expect(end).toBeGreaterThan(0);
  });

  it('độ mờ của bản cũ giảm ĐƠN ĐIỆU, không nhấp nháy', () => {
    let previous = Infinity;
    for (const t of SAMPLES) {
      const current = actorOf(motionFrame(input, t), 'ghost').opacity;
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
  });

  it('bay theo vòng cung LÊN — chiều xuống dành riêng cho nghĩa "mất"', () => {
    const mid = actorOf(motionFrame(input, 0.5), 'primary').position[1];
    expect(mid).toBeGreaterThan(Math.max(HOME[1], TARGET[1]));
    const floor = Math.min(HOME[1], TARGET[1]);
    for (const t of SAMPLES) {
      const y = actorOf(motionFrame(input, t), 'primary').position[1];
      expect(y).toBeGreaterThanOrEqual(floor - 1e-9);
    }
  });
});

describe('reset --hard · commit CHÌM xuống', () => {
  const input = inputOf('reset-hard');

  it('t=0 ở chỗ cũ nguyên vẹn, t=1 ở đúng đáy của sinkOf()', () => {
    const start = motionFrame(input, 0).actors[0];
    expect(start?.position).toEqual(HOME);
    expect(start?.opacity).toBe(1);
    expect(motionFrame(input, 1).actors[0]?.position).toEqual(sinkOf(HOME));
  });

  it('đi XUỐNG đơn điệu, và chỉ đổi Y — X/Z giữ nguyên', () => {
    let previous = Infinity;
    for (const t of SAMPLES) {
      const [x, y, z] = motionFrame(input, t).actors[0]?.position ?? [0, 0, 0];
      expect(y).toBeLessThanOrEqual(previous);
      expect(x).toBe(HOME[0]);
      expect(z).toBe(HOME[2]);
      previous = y;
    }
    expect(previous).toBeLessThan(HOME[1]);
  });

  it('mờ đi nhưng KHÔNG về 0 — khuất, chưa mất', () => {
    const end = motionFrame(input, 1).actors[0]?.opacity ?? -1;
    expect(end).toBe(SUNK_OPACITY);
    expect(end).toBeGreaterThan(0);
  });
});

describe('reflog · commit chìm NỔI LẠI đúng chỗ cũ', () => {
  const input = inputOf('reflog');

  it('bắt đầu ĐÚNG chỗ reset --hard đã bỏ nó lại', () => {
    expect(motionFrame(input, 0).actors[0]?.position).toEqual(
      motionFrame(inputOf('reset-hard'), 1).actors[0]?.position,
    );
  });

  it('kết thúc ĐÚNG chỗ cũ — bằng nhau từng thành phần, không xấp xỉ', () => {
    expect(motionFrame(input, 1).actors[0]?.position).toEqual(HOME);
  });

  it('đi LÊN đơn điệu và sáng dần về 1', () => {
    let previous = -Infinity;
    for (const t of SAMPLES) {
      const y = motionFrame(input, t).actors[0]?.position[1] ?? 0;
      expect(y).toBeGreaterThanOrEqual(previous);
      previous = y;
    }
    expect(motionFrame(input, 1).actors[0]?.opacity).toBe(1);
  });

  it('vòng chìm-rồi-nổi khép kín: reflog(1) === điểm xuất phát của reset(0)', () => {
    const sank = motionFrame(inputOf('reset-hard'), 0).actors[0]?.position;
    expect(motionFrame(input, 1).actors[0]?.position).toEqual(sank);
  });
});

describe('force-push · bản ở kho xa VỠ và TAN', () => {
  const input = inputOf('force-push');

  it('vỡ thành đúng SHARD_COUNT mảnh, và mảnh bay ra các hướng KHÁC nhau', () => {
    const end = motionFrame(input, 1);
    expect(end.actors).toHaveLength(SHARD_COUNT);
    const spots = new Set(end.actors.map((a) => a.position.join(',')));
    expect(spots.size).toBe(SHARD_COUNT);
  });

  it('t=0 mọi mảnh còn chụm ở chỗ cũ — mắt thấy MỘT commit nguyên vẹn', () => {
    for (const actor of motionFrame(input, 0).actors) {
      expect(actor.position).toEqual(HOME);
      expect(actor.opacity).toBe(1);
    }
  });

  it('là chuyển động DUY NHẤT về độ mờ 0 — đó là chỗ "mất thật" khác "khuất"', () => {
    for (const actor of motionFrame(input, 1).actors) {
      expect(actor.opacity).toBe(0);
    }
    for (const kind of ALL_KINDS) {
      if (kind === 'force-push') continue;
      const lowest = Math.min(...motionFrame(inputOf(kind), 1).actors.map((a) => a.opacity));
      expect(lowest).toBeGreaterThan(0);
    }
  });

  it('hướng mảnh vỡ TẤT ĐỊNH và nằm trên mặt cầu đơn vị', () => {
    for (let i = 0; i < SHARD_COUNT; i += 1) {
      const [x, y, z] = shardDirection(i);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
      expect(shardDirection(i)).toEqual(shardDirection(i));
    }
  });
});

describe('cherry-pick · bản SAO tách ra, giữ chỉ mờ về nguồn', () => {
  const input = inputOf('cherry-pick');

  it('nguồn KHÔNG hề bị đụng tới — khác hẳn cái bóng của rebase', () => {
    for (const t of SAMPLES) {
      const source = actorOf(motionFrame(input, t), 'source');
      expect(source.position).toEqual(HOME);
      expect(source.opacity).toBe(1);
      expect(source.scale).toBe(1);
    }
  });

  it('bản sao lớn dần và về đúng đích', () => {
    const start = actorOf(motionFrame(input, 0), 'primary');
    const end = actorOf(motionFrame(input, 1), 'primary');
    expect(start.position).toEqual(HOME);
    expect(end.position).toEqual(TARGET);
    expect(end.scale).toBeGreaterThan(start.scale);
  });

  it('chỉ mờ CÒN LẠI ở t=1 — nó là thông tin thường trú, không phải vệt hiệu ứng', () => {
    expect(motionFrame(input, 0).trace?.opacity).toBe(0);
    const end = motionFrame(input, 1).trace;
    expect(end?.opacity).toBe(TRACE_OPACITY);
    expect(end?.from).toEqual(HOME);
    expect(end?.to).toEqual(TARGET);
  });

  it('bốn chuyển động còn lại KHÔNG có chỉ mờ', () => {
    for (const kind of ALL_KINDS) {
      if (kind === 'cherry-pick') continue;
      expect(motionFrame(inputOf(kind), 1).trace).toBeNull();
    }
  });
});

describe('năm chuyển động mang năm thông tin KHÁC nhau', () => {
  /*
    Ô gác chống "năm hiệu ứng trang trí". Không có nó, năm chuyển động có thể
    lần lượt trôi về cùng một dáng (đều bay, đều mờ) mà mọi ô riêng lẻ ở trên
    vẫn xanh — mỗi ô chỉ nhìn một chuyển động, không ô nào nhìn tập hợp.

    Chữ ký đọc theo bốn chiều mà người học thật sự phân biệt được bằng mắt.
  */
  function signature(kind: MotionKind): string {
    const end = motionFrame(inputOf(kind), 1);
    const start = motionFrame(inputOf(kind), 0);
    const startY = Math.max(...start.actors.map((a) => a.position[1]));
    const endY = Math.max(...end.actors.map((a) => a.position[1]));
    return [
      `vật=${String(end.actors.length)}`,
      `mờ-thấp-nhất=${String(Math.min(...end.actors.map((a) => a.opacity)))}`,
      `hướng-Y=${endY > startY + 1e-9 ? 'lên' : endY < startY - 1e-9 ? 'xuống' : 'ngang'}`,
      `chỉ-mờ=${String(end.trace !== null)}`,
    ].join(' · ');
  }

  it('bốn chiều chữ ký phân biệt được cả năm', () => {
    const signatures = ALL_KINDS.map(signature);
    expect(new Set(signatures).size).toBe(ALL_KINDS.length);
  });
});

describe('tất định', () => {
  const REAL_NOW = Date.now;
  const REAL_RANDOM = Math.random;

  afterEach(() => {
    Date.now = REAL_NOW;
    Math.random = REAL_RANDOM;
  });

  it('cùng (kind, t) ⇒ kết quả bằng nhau từng phần tử, kể cả thứ tự', () => {
    for (const kind of ALL_KINDS) {
      for (const t of SAMPLES) {
        expect(motionFrame(inputOf(kind), t)).toEqual(motionFrame(inputOf(kind), t));
      }
    }
  });

  it('KHÔNG đọc Date.now() / Math.random() — phép thử hành vi, không phải grep', () => {
    /*
      Mạnh hơn cổng grep `check-git-determinism.mjs` (vốn chỉ quét
      `packages/games/src/git/**` nên không với tới file này): grep bỏ lọt mọi
      đường gọi gián tiếp, còn bản ném lỗi thì không.

      ⚠ KHÔNG gọi `expect()` trong lúc hai hàm còn bị thay. Bản thân vitest đọc
      đồng hồ khi dựng thông báo lỗi và khi đo thời lượng ô test, nên một
      `expect(...).not.toThrow()` đặt bên trong sẽ ném từ RUỘT vitest và ô này
      đỏ vì lý do chẳng liên quan gì tới mã đang đo. Thu kết quả trước, khôi
      phục, rồi mới khẳng định.
    */
    let leaked: unknown = null;
    let ran = 0;
    Date.now = (): number => {
      throw new Error('chuyển động đọc Date.now()');
    };
    Math.random = (): number => {
      throw new Error('chuyển động đọc Math.random()');
    };
    try {
      for (const kind of ALL_KINDS) {
        for (const t of [0, 0.37, 1]) {
          motionFrame(inputOf(kind), t);
          ran += 1;
        }
        advanceMotion(kind, 0, 0.016, false);
        advanceMotion(kind, 0, 0.016, true);
        ran += 2;
      }
    } catch (error) {
      leaked = error;
    } finally {
      Date.now = REAL_NOW;
      Math.random = REAL_RANDOM;
    }
    expect(leaked).toBeNull();
    // Đối chứng chống-rỗng: một vòng lặp không chạy lượt nào cũng cho `null`.
    expect(ran).toBe(ALL_KINDS.length * 5);
  });

  it('t ngoài [0,1] bị kẹp, không ngoại suy ra ngoài cảnh', () => {
    for (const kind of ALL_KINDS) {
      expect(motionFrame(inputOf(kind), -3)).toEqual(motionFrame(inputOf(kind), 0));
      expect(motionFrame(inputOf(kind), 7)).toEqual(motionFrame(inputOf(kind), 1));
    }
  });
});

describe('arcLift · vòng cung không được xuyên qua mặt phẳng ô file', () => {
  /*
    ⚠ Ô này gác một khe hở CÓ THẬT của hợp đồng: `assertPlanesClearOfDag()` chỉ
    tính `maxDeviation * Y_STEP + NODE_RADIUS` và KHÔNG chừa chỗ cho chuyển động
    thoáng qua của K.7. Ở đúng biên mà cổng đó còn cho qua, một vòng cung
    `ARC_LIFT` đầy đủ sẽ đâm lên mặt phẳng HEAD — mà cổng vẫn xanh.
  */
  it('đồ thị thấp thì nâng đủ ARC_LIFT', () => {
    expect(arcLift(0, 0)).toBe(ARC_LIFT);
    expect(arcLift(1.1, 0.55)).toBe(ARC_LIFT);
  });

  it('đồ thị cao thì TỰ HẠ, không bao giờ chạm sàn mặt phẳng', () => {
    /*
      Quét mọi độ cao mà `assertPlanesClearOfDag()` CÒN cho qua (tức là chính
      vùng cổng đó tuyên bố an toàn). Ngoài vùng đó thì bản thân DAG đã đâm lên
      mặt phẳng rồi và không vòng cung nào cứu được — đó là việc của cổng.
      Ô này vô nghĩa nếu vòng lặp rỗng, nên đếm luôn số mốc đã quét.
    */
    let checked = 0;
    for (let y = 0; y + NODE_RADIUS < PLATE_FLOOR; y += 0.25) {
      expect(y + NODE_RADIUS + arcLift(y, y)).toBeLessThanOrEqual(PLATE_FLOOR + 1e-9);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('không bao giờ âm — hết chỗ thì bay thẳng, không bay chúi xuống', () => {
    expect(arcLift(PLATE_FLOOR, PLATE_FLOOR)).toBe(0);
    expect(arcLift(100, 100)).toBe(0);
  });

  it('kẹp theo điểm cuối CAO HƠN, không theo điểm xuất phát', () => {
    const high = PLATE_FLOOR - NODE_RADIUS - 0.4;
    expect(arcLift(0, high)).toBeCloseTo(0.4, 9);
    expect(arcLift(high, 0)).toBe(arcLift(0, high));
    expect(arcLift(0, high)).toBeLessThan(ARC_LIFT);
  });
});

describe('advanceMotion · hợp đồng invalidate() của frameloop="demand"', () => {
  it('còn chạy ⇒ running true (bộ chạy PHẢI xin thêm khung)', () => {
    const tick = advanceMotion('rebase', 0, 0.016, false);
    expect(tick.running).toBe(true);
    expect(tick.t).toBeGreaterThan(0);
    expect(tick.t).toBeLessThan(1);
  });

  it('xong ⇒ running false (bộ chạy PHẢI ngừng xin — nếu không là 60fps vĩnh viễn)', () => {
    const tick = advanceMotion('rebase', MOTION_DURATION_S.rebase, 0.05, false);
    expect(tick.t).toBe(1);
    expect(tick.running).toBe(false);
  });

  it('reduced-motion nhảy thẳng tới trạng thái cuối, KHÔNG xin khung nào', () => {
    for (const kind of ALL_KINDS) {
      const tick = advanceMotion(kind, 0, 0.016, true);
      expect(tick.t).toBe(1);
      expect(tick.running).toBe(false);
    }
  });

  it('delta khổng lồ của khung đầu sau lúc đứng yên bị KẸP, không nhảy cóc tới cuối', () => {
    const tick = advanceMotion('rebase', 0, 9.5, false);
    expect(tick.elapsedS).toBe(MAX_FRAME_S);
    expect(tick.running).toBe(true);
    expect(tick.t).toBeLessThan(1);
  });

  it('delta âm không kéo đồng hồ lùi', () => {
    expect(advanceMotion('rebase', 0.3, -5, false).elapsedS).toBe(0.3);
  });

  it('mọi kind đều có thời lượng dương', () => {
    for (const kind of ALL_KINDS) {
      expect(MOTION_DURATION_S[kind]).toBeGreaterThan(0);
    }
  });
});
