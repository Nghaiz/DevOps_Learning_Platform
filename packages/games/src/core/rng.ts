/**
 * PRNG có hạt giống — mulberry32.
 *
 * ⛔ Đây là NGUỒN NGẪU NHIÊN DUY NHẤT của cả package. Không `Math.random()` ở bất
 * kỳ file nào khác, và một test grep khẳng định điều đó (`rng.test.ts`).
 *
 * Vì sao dạng THUẦN (`(state) => { value, state }`) chứ không phải một closure
 * giữ biến đếm bên trong: reducer phải tất định tuyệt đối để cơ chế chống gian
 * lận ở `phase-14-exec.md` §8.3 chạy được — nó phát lại `actions` từ `seed` và so
 * kết quả. Một RNG có trạng thái ẩn bên ngoài `ClusterState` sẽ làm hai lần phát
 * lại cùng chuỗi action cho ra hai kết quả khác nhau, và triệu chứng là "điểm
 * hợp lệ bị báo gian lận" — cực khó truy.
 *
 * Chọn mulberry32 chứ không phải xorshift128 hay PCG: nó chạy trọn vẹn trong
 * 32-bit của `Math.imul`, nên KHÔNG có bước nào phụ thuộc `BigInt` hay số thực
 * 53-bit. Đó là điều kiện để cùng một hạt giống cho cùng một dãy trên mọi engine
 * JS — thứ mà một PRNG viết bằng phép nhân số thực không bảo đảm được.
 */

/** Trạng thái sinh số. Bất biến; mỗi lần rút trả về trạng thái mới. */
export interface RngState {
  /** uint32. Là bộ đếm của mulberry32, không phải hạt giống gốc. */
  readonly seed: number;
}

export interface RngDraw<T> {
  readonly value: T;
  readonly state: RngState;
}

const UINT32_RANGE = 4294967296;

/**
 * `seed` được ép về uint32. Số âm, số thực, `NaN` đều nhận được — nhưng `NaN`
 * quy về 0 chứ không ném: hạt giống tới từ dữ liệu người dùng (`RunResult.seed`
 * đọc lại từ `localStorage`), và một bản lưu hỏng không được phép làm sập game.
 */
export function seedRng(seed: number): RngState {
  if (!Number.isFinite(seed)) {
    return { seed: 0 };
  }
  return { seed: Math.trunc(seed) >>> 0 };
}

/** Rút một uint32. */
export function nextUint32(state: RngState): RngDraw<number> {
  const a = (state.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: (t ^ (t >>> 14)) >>> 0, state: { seed: a >>> 0 } };
}

/** Rút một số thực trong `[0, 1)`. */
export function nextFloat(state: RngState): RngDraw<number> {
  const draw = nextUint32(state);
  return { value: draw.value / UINT32_RANGE, state: draw.state };
}

/**
 * Rút một số nguyên trong `[0, maxExclusive)`.
 *
 * ⚠ Có lệch modulo về mặt lý thuyết (2^32 không chia hết cho mọi `max`). Với
 * `max` cỡ hàng chục — mọi chỗ dùng trong game này — độ lệch là 1 phần 10^8, nhỏ
 * hơn nhiều thứ ảnh hưởng tới trải nghiệm chơi. Ghi ra đây để lần sau ai cần một
 * bộ sinh không lệch (rút thăm có phần thưởng chẳng hạn) thì biết là phải viết
 * thêm vòng loại bỏ, chứ không giả định hàm này đã lo.
 */
export function nextInt(state: RngState, maxExclusive: number): RngDraw<number> {
  if (!Number.isFinite(maxExclusive) || maxExclusive < 1) {
    return { value: 0, state };
  }
  const draw = nextUint32(state);
  return { value: draw.value % Math.trunc(maxExclusive), state: draw.state };
}

/** Rút một phần tử. Mảng rỗng trả `null` — không ném, vì chaos mode có thể lọc hết. */
export function pick<T>(state: RngState, items: readonly T[]): RngDraw<T | null> {
  if (items.length === 0) {
    return { value: null, state };
  }
  const draw = nextInt(state, items.length);
  return { value: items[draw.value] ?? null, state: draw.state };
}

/** Fisher-Yates thuần: trả mảng MỚI, không sửa mảng vào. */
export function shuffle<T>(state: RngState, items: readonly T[]): RngDraw<readonly T[]> {
  const out = [...items];
  let cursor = state;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const draw = nextInt(cursor, i + 1);
    cursor = draw.state;
    const j = draw.value;
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return { value: out, state: cursor };
}

/**
 * Bọc có trạng thái, cho chỗ KHÔNG nằm trong reducer (sinh trước một đợt chaos,
 * dựng dữ liệu test). Trong reducer thì dùng bản thuần ở trên — một đối tượng
 * mang trạng thái đi qua `(state, action) => state` là đúng cái làm hỏng tính
 * tất định mà cả file này sinh ra để giữ.
 */
export class Rng {
  private current: RngState;

  constructor(seed: number) {
    this.current = seedRng(seed);
  }

  /** Trạng thái hiện tại — chụp lại được để phát lại. */
  get state(): RngState {
    return this.current;
  }

  float(): number {
    const draw = nextFloat(this.current);
    this.current = draw.state;
    return draw.value;
  }

  int(maxExclusive: number): number {
    const draw = nextInt(this.current, maxExclusive);
    this.current = draw.state;
    return draw.value;
  }

  pick<T>(items: readonly T[]): T | null {
    const draw = pick(this.current, items);
    this.current = draw.state;
    return draw.value;
  }
}
