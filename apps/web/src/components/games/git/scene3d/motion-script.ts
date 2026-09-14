/**
 * Chuyển động MANG THÔNG TIN của game Git (17.K.7) — **dữ liệu thuần**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO NGHĨA NẰM Ở ĐÂY CHỨ KHÔNG NẰM TRONG BỘ CHẠY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Năm chuyển động dưới đây KHÔNG phải năm hiệu ứng trang trí. Mỗi cái là một
 * câu khẳng định về git mà người học phải đọc ra được **chỉ bằng mắt**, và câu
 * đó thì kiểm được bằng số:
 *
 * | Lệnh | Câu phải đọc ra |
 * |---|---|
 * | `rebase` | commit MỚI được tạo; bản cũ **vẫn còn**, chỉ mờ đi |
 * | `reset --hard` | commit **chìm** xuống — khuất, chưa mất |
 * | `reflog` | commit chìm **nổi lại đúng chỗ cũ** — nó chưa bao giờ mất |
 * | `force-push` | bản ở kho xa **vỡ và tan** — đây mới là mất thật |
 * | `cherry-pick` | một **bản sao** tách ra, giữ một **chỉ mờ** về nguồn |
 *
 * Một hàm easing sai dấu, hay `reflog` trả commit về lệch nửa bước so với chỗ
 * `reset --hard` đã lấy đi, KHÔNG lộ ra trong ảnh chụp tĩnh và không cổng tự
 * động nào của repo bắt được. Tách phần nghĩa ra khỏi phần chạy thì bắt được —
 * cùng lý do `k8s-arena/shared/scene-motion.ts` tồn tại.
 *
 * ⛔ File này KHÔNG import `three`, không chạm DOM, chạy ở env `node`. Xem khối
 * đầu `scene3d-contract.ts` cho ba lý do đầy đủ (cổng `bundle:check` là lý do
 * đắt nhất trong ba).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ CHIỀU Y ĐÃ BỊ CHIẾM MỘT NỬA — ĐỪNG ĐẢO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hợp đồng quy định nhánh phụ **dâng lên** (`deviationY()` luôn `>= 0`). Chiều
 * **xuống** vì vậy còn trống, và K.7 dành trọn nó cho nghĩa "mất": `reset --hard`
 * chìm, `reflog` nổi lại. Nếu một chuyển động nào ở đây kéo commit xuống vì lý
 * do KHÁC "mất" thì hai nghĩa trái ngược dùng chung một hướng và cả hai mất
 * nghĩa — đó là lý do `rebase` và `cherry-pick` bay theo vòng cung **lên**, dù
 * đường thẳng sẽ ngắn hơn.
 *
 * Vòng cung lên là chuyển động **thoáng qua** (về 0 ở `t=1`), nên nó không
 * tranh chấp với phép mã hoá Y **thường trú** của độ lệch nhánh. Nhưng nó vẫn
 * phải tránh mặt phẳng ô file — xem `arcLift()`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TẤT ĐỊNH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mọi thứ ở đây là hàm của `(kind, t)` với `t ∈ [0,1]`. **Không `Date.now()`,
 * không `Math.random()`** — kể cả hướng văng của mảnh vỡ `force-push`, vốn là
 * chỗ cám dỗ nhất (xem `shardDirection()`). Cổng grep `check-git-determinism.mjs`
 * hiện chỉ quét `packages/games/src/git/**` nên nó chưa với tới file này; kỷ
 * luật giữ nguyên, và `motion-script.test.ts` gác bằng phép thử HÀNH VI (thay
 * hai hàm đó bằng bản ném lỗi rồi chạy cả năm chuyển động) — mạnh hơn grep.
 */

import { MAX_NODE_HALF_EXTENT, PLATE_FLOOR, type Vec3 } from './scene3d-contract.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Easing — bốn hàm đóng, không trạng thái
// ═══════════════════════════════════════════════════════════════════════════

/*
 * Bốn hàm dưới đây trùng tên với `k8s-arena/shared/scene-motion.ts`. Đó là một
 * khoản trùng lặp CÓ Ý THỨC, không phải sơ suất: chỗ đúng để đặt chúng là
 * `games/shared/`, mà thư mục đó thuộc lane khác trong đợt này. Chúng là công
 * thức đóng của easing chuẩn (không có nhánh, không có hằng tinh chỉnh riêng),
 * nên nguy cơ hai bản trôi khỏi nhau bằng không. Gộp về `games/shared/easing.ts`
 * khi đợt song song kết thúc.
 */

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Nội suy tuyến tính, dạng **chính xác ở hai đầu**.
 *
 * ⚠ KHÔNG dùng `a + (b - a) * t` — dạng quen thuộc hơn, và là dạng
 * `k8s-arena/shared/scene-motion.ts` đang dùng. Ở `t=1` nó trả về `a + (b - a)`,
 * mà phép cộng đó KHÔNG khôi phục lại `b` trong dấu phẩy động: đo được ngay
 * trong file này — `lerp(1, 0.32, 1)` ra `0.32000000000000006`, và
 * `lerp(1, 0.22, 1)` ra `0.21999999999999997`.
 *
 * Sai số cỡ 1e-17 vô hình trên màn hình, nhưng nó phá hai thứ **không** vô
 * hình: (1) `reflog` phải trả commit về ĐÚNG chỗ `reset --hard` lấy đi, và "đúng"
 * ở đây là bằng nhau từng bit chứ không phải gần bằng; (2) bên gọi so vị trí
 * cuối với chỗ đứng nghỉ để biết đã hạ cánh chưa sẽ không bao giờ thấy bằng.
 *
 * `(1 - t) * a + t * b` cho `t=0 ⇒ 1·a + 0·b = a` và `t=1 ⇒ 0·a + 1·b = b`,
 * cả hai chính xác tuyệt đối. Đây là chỗ hai bản easing của repo CỐ Ý khác
 * nhau — nếu có ngày gộp về `games/shared/`, giữ dạng này.
 */
export function lerp(a: number, b: number, t: number): number {
  /*
   * ⚠ Nhánh này KHÔNG phải tối ưu tốc độ. Dạng `(1 - t) * a + t * b` đổi lấy
   * chính xác-ở-hai-đầu bằng một nhược điểm ngược lại: khi `a === b` nó vẫn
   * trôi. Đo được — `lerp(6, 6, 0.35)` ra `5.999999999999999`.
   *
   * Hệ quả thấy được: một commit `reset --hard` chìm THẲNG xuống sẽ trượt ngang
   * cỡ 1e-15 trên X/Z trong lúc rơi. Vô hình trên màn hình, nhưng nó biến "trục
   * không đổi" thành "trục gần như không đổi", và bên nào so toạ độ với làn hay
   * bắt về lưới sẽ đọc ra nhiễu. Trục nào không đổi thì phải đứng YÊN.
   */
  if (a === b) return a;
  return (1 - t) * a + t * b;
}

/** Nhanh dần — dùng cho thứ RƠI. Vật rơi thì tăng tốc; rơi đều đọc ra là bị hạ xuống. */
export function easeInQuad(t: number): number {
  const x = clamp01(t);
  return x * x;
}

/** Chậm dần — dùng cho thứ NỔI LÊN và thứ TAN ĐI. */
export function easeOutCubic(t: number): number {
  const x = 1 - clamp01(t);
  return 1 - x * x * x;
}

/** Chậm hai đầu — dùng cho thứ BAY từ chỗ này sang chỗ kia. */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// ═══════════════════════════════════════════════════════════════════════════
// Hằng số — mỗi con số là một quyết định về NGHĨA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Độ mờ còn lại của bản CŨ sau `rebase`.
 *
 * ⚠ Khác 0 là toàn bộ bài học. `rebase` không di chuyển commit — nó tạo commit
 * mới và bỏ lại commit cũ, mà commit cũ vẫn còn trong `.git` cho tới lúc gc dọn.
 * Cho bản cũ tan hẳn là dạy sai, và dạy sai đúng chỗ người học hay hiểu nhầm
 * nhất. 0.32 là mức còn đọc được hình dạng trên nền tối lẫn nền sáng.
 */
export const GHOST_OPACITY = 0.32;

/**
 * Độ mờ của commit đã chìm vì `reset --hard`. Cũng khác 0, cũng vì cùng lý do —
 * và đây là chỗ phân biệt với `force-push`, thứ DUY NHẤT được về 0.
 */
export const SUNK_OPACITY = 0.22;

/** Cỡ của commit đã chìm. Nhỏ đi là kênh thứ hai, phòng khi độ mờ bị nền nuốt mất. */
export const SUNK_SCALE = 0.82;

/**
 * Độ sâu chìm, đơn vị world.
 *
 * Vùng DAG nằm trọn ở `y >= 0`, nên mọi giá trị âm đều là đất trống. 4.2 ≈ hai
 * bước làn (`Z_STEP` 2.0) — đủ xa để đọc ra "đã rời khỏi đồ thị", đủ gần để còn
 * nằm trong khung camera đang bao vùng DAG.
 */
export const SINK_DROP = 4.2;

/**
 * Đỉnh vòng cung khi commit BAY (`rebase`, `cherry-pick`).
 *
 * ⚠ Đây là trần MONG MUỐN, không phải trần THẬT — `arcLift()` hạ nó xuống khi
 * đồ thị đã cao. Đừng đọc hằng này như một bảo đảm.
 */
export const ARC_LIFT = 1.1;

/** Độ mờ của chỉ nối `cherry-pick` về nguồn. Còn lại ở `t=1` — nó là thông tin thường trú. */
export const TRACE_OPACITY = 0.45;

/** Số mảnh vỡ của `force-push`. Lẻ và nhỏ: đủ để đọc ra "vỡ", chưa đủ để thành khói. */
export const SHARD_COUNT = 7;

/** Bán kính văng của mảnh vỡ ở `t=1`, đơn vị world. */
export const SHARD_SPREAD = 2.4;

/** Cỡ mảnh vỡ ở `t=1`. Nhỏ dần + mờ dần: hai kênh cho cùng một câu "đang tan". */
export const SHARD_END_SCALE = 0.2;

/** Cỡ bản sao `cherry-pick` lúc vừa tách ra. Lớn dần lên 1 = "đang thành hình". */
export const COPY_START_SCALE = 0.6;

// ═══════════════════════════════════════════════════════════════════════════
// Kiểu
// ═══════════════════════════════════════════════════════════════════════════

export type MotionKind = 'rebase' | 'reset-hard' | 'reflog' | 'force-push' | 'cherry-pick';

/**
 * Vai của một vật trong một chuyển động. Bộ chạy ánh xạ vai → vật liệu; nó
 * KHÔNG cần biết `kind` để vẽ đúng.
 */
export type MotionRole =
  /** Bản đang được lệnh tác động — thứ mắt phải bám theo. */
  | 'primary'
  /** Bản cũ bị bỏ lại, mờ nhưng CÒN (`rebase`). */
  | 'ghost'
  /** Bản nguồn vẫn nguyên vẹn, không hề bị lệnh đụng tới (`cherry-pick`). */
  | 'source'
  /** Mảnh của một thứ đang tan (`force-push`). */
  | 'shard';

export interface MotionActorState {
  readonly role: MotionRole;
  readonly position: Vec3;
  /** 0..1. Về đúng 0 CHỈ khi vật thật sự mất — xem `GHOST_OPACITY`/`SUNK_OPACITY`. */
  readonly opacity: number;
  readonly scale: number;
}

/** Chỉ mờ nối nguồn → bản sao. Một đường, nên nó không phải một `MotionActorState`. */
export interface MotionTrace {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly opacity: number;
}

export interface MotionFrame {
  readonly kind: MotionKind;
  /** Thứ tự CỐ ĐỊNH theo `kind` — test so được bằng `toEqual`. */
  readonly actors: readonly MotionActorState[];
  readonly trace: MotionTrace | null;
}

/**
 * Đầu vào của một chuyển động.
 *
 * ⚠ Union PHÂN BIỆT, không phải một interface với `to?: Vec3`. `rebase` và
 * `cherry-pick` bắt buộc có đích; ba lệnh còn lại suy đích ra từ `from`. Để
 * `to` là tuỳ chọn thì gọi thiếu đích là một lỗi LÚC CHẠY phải tự đi bắt; ở
 * dạng này nó là một lỗi LÚC BIÊN DỊCH và không cần test nào gác.
 */
export type MotionInput =
  | { readonly kind: 'rebase'; readonly from: Vec3; readonly to: Vec3 }
  | { readonly kind: 'cherry-pick'; readonly from: Vec3; readonly to: Vec3 }
  | { readonly kind: 'reset-hard'; readonly from: Vec3 }
  | { readonly kind: 'reflog'; readonly from: Vec3 }
  | { readonly kind: 'force-push'; readonly from: Vec3 };

/**
 * Thời lượng mỗi chuyển động, giây.
 *
 * `satisfies Record<MotionKind, number>` là cổng lúc biên dịch: thêm một
 * `MotionKind` mà quên thời lượng ⇒ đỏ ở typecheck, thay vì một chuyển động
 * chạy với `duration === undefined` và cho `t = NaN` — mà `NaN` trong một
 * BufferAttribute làm three vứt cả draw call, im lặng.
 */
export const MOTION_DURATION_S = {
  rebase: 0.9,
  'reset-hard': 0.7,
  reflog: 0.8,
  'force-push': 0.6,
  'cherry-pick': 0.85,
} as const satisfies Record<MotionKind, number>;

// ═══════════════════════════════════════════════════════════════════════════
// Hình học phụ trợ
// ═══════════════════════════════════════════════════════════════════════════

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Chỗ một commit rơi xuống khi `reset --hard` bỏ nó lại.
 *
 * ⚠ Hàm này là ĐIỂM HẸN giữa `reset --hard` và `reflog`. Cả hai đọc nó, nên
 * `reflog` bắt buộc trả commit về ĐÚNG chỗ cũ chứ không phải "gần đúng" — và
 * "gần đúng" chính là thứ phá bài học, vì người học sẽ thấy commit nổi lên lệch
 * chỗ và kết luận rằng reflog dựng lại một thứ khác.
 */
export function sinkOf(from: Vec3): Vec3 {
  return [from[0], from[1] - SINK_DROP, from[2]];
}

/**
 * Độ nâng THẬT của vòng cung bay, đã trừ chỗ cho mặt phẳng ô file.
 *
 * ⚠ Đây là chỗ vá một khe hở của hợp đồng, không phải một tinh chỉnh thẩm mỹ.
 * `assertPlanesClearOfDag()` gác vùng DAG **tĩnh** — nó không biết gì về chuyển
 * động thoáng qua của K.7. Ở đúng biên mà cổng đó còn cho qua, một vòng cung
 * `ARC_LIFT` đầy đủ sẽ xuyên thẳng qua mặt phẳng HEAD, và cổng vẫn xanh: hai
 * tầng chồng lên nhau trông y hệt một lỗi render ngẫu nhiên.
 *
 * Chặn ở đây thay vì sửa cổng vì hợp đồng thuộc lane khác.
 *
 * ⚠ Trừ `MAX_NODE_HALF_EXTENT`, **không** trừ `NODE_RADIUS`. Đó là cùng một bẫy
 * mà hợp đồng vừa tự sửa trong chính `assertPlanesClearOfDag()`: `ACCENT_3D`
 * phóng accent `head` lên 1.18, nên ô commit cao nhất cao hơn `NODE_RADIUS` tới
 * 18%. Dùng bán kính trần trụi ở đây là để lại một khoảng hở nhỏ hơn 18% so với
 * thứ thật sự cần — và cái chọc thủng mặt phẳng sẽ là ô HEAD, đúng ô người chơi
 * nhìn nhiều nhất.
 *
 * Kẹp theo `max(fromY, toY)` là cận trên an toàn cho TOÀN đường bay: đường bay
 * không bao giờ vượt quá điểm cuối cao hơn cộng độ nâng.
 *
 * Trả 0 khi không còn chỗ — bay thẳng vẫn đúng nghĩa hơn là bay xuyên tường.
 */
export function arcLift(fromY: number, toY: number): number {
  const headroom = PLATE_FLOOR - MAX_NODE_HALF_EXTENT - Math.max(fromY, toY);
  return Math.max(0, Math.min(ARC_LIFT, headroom));
}

/**
 * Hướng văng của mảnh vỡ thứ `i`, trên mặt cầu đơn vị.
 *
 * ⚠ Đây là chỗ cám dỗ nhất để gọi `Math.random()`, và gọi nó ở đây sẽ hỏng theo
 * kiểu khó thấy: mảnh vỡ đổi hướng ở MỖI KHUNG HÌNH, nên thay vì bảy mảnh bay
 * ra, người xem thấy một đám nhiễu rung. Phân bố Fibonacci cho cùng thứ (tản
 * đều, không thành chùm) mà tất định theo `i`.
 */
export function shardDirection(index: number): Vec3 {
  const y = 1 - (2 * (index + 0.5)) / SHARD_COUNT;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return [Math.cos(theta) * radius, y, Math.sin(theta) * radius];
}

/**
 * Đường vòm của vòng cung, 0 ở hai đầu và 1 ở giữa.
 *
 * ⚠ Parabol chứ KHÔNG phải `Math.sin(Math.PI * t)`, và khác biệt không phải
 * thẩm mỹ: `Math.sin(Math.PI)` trong IEEE754 bằng **1.2246e-16**, không bằng 0.
 * Với `sin` thì commit hạ cánh lệch đích chừng ấy đơn vị — vô hình trên màn
 * hình, nhưng đủ để `position` ở `t=1` KHÔNG bằng chỗ đứng nghỉ của node. Bên
 * gọi nào so hai giá trị đó để biết "đã hạ cánh chưa" sẽ không bao giờ thấy
 * bằng nhau, và chuyển động treo lại ở khung cuối.
 *
 * `4u(1-u)` cho đúng 0 ở `u=0` (0×1) và `u=1` (1×0) — chính xác tuyệt đối
 * trong dấu phẩy động, không phải "gần 0" — và đúng 1 ở `u=0.5`.
 */
function archEnvelope(u: number): number {
  return 4 * u * (1 - u);
}

function flightPath(from: Vec3, to: Vec3, t: number): Vec3 {
  const u = clamp01(t);
  const eased = easeInOutCubic(u);
  const lift = arcLift(from[1], to[1]);
  return [
    lerp(from[0], to[0], eased),
    lerp(from[1], to[1], eased) + lift * archEnvelope(u),
    lerp(from[2], to[2], eased),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// Năm chuyển động
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Trạng thái của một chuyển động tại thời điểm chuẩn hoá `t ∈ [0,1]`.
 *
 * Hàm THUẦN và TẤT ĐỊNH: cùng `(input, t)` ⇒ cùng kết quả, cùng thứ tự phần tử.
 * `t` ngoài khoảng bị kẹp — bộ chạy đã kẹp rồi, nhưng một chỗ gọi khác thì chưa.
 */
export function motionFrame(input: MotionInput, t: number): MotionFrame {
  const u = clamp01(t);

  switch (input.kind) {
    case 'rebase': {
      /*
       * Hai vật cùng lúc, và ĐÓ LÀ BÀI HỌC: bản mới bay đi, bản cũ đứng yên mờ
       * dần. Ở `t=0` hai bản trùng chỗ và trùng độ mờ, nên mắt thấy MỘT commit
       * tách làm hai — đúng chuyện `rebase` làm.
       */
      const fade = easeOutCubic(u);
      return {
        kind: 'rebase',
        actors: [
          {
            role: 'ghost',
            position: input.from,
            opacity: lerp(1, GHOST_OPACITY, fade),
            scale: 1,
          },
          {
            role: 'primary',
            position: flightPath(input.from, input.to, u),
            opacity: 1,
            scale: 1,
          },
        ],
        trace: null,
      };
    }

    case 'reset-hard': {
      // Nhanh dần = RƠI. Mờ dần nhưng dừng ở `SUNK_OPACITY`: khuất, chưa mất.
      const fall = easeInQuad(u);
      return {
        kind: 'reset-hard',
        actors: [
          {
            role: 'primary',
            position: lerp3(input.from, sinkOf(input.from), fall),
            opacity: lerp(1, SUNK_OPACITY, fall),
            scale: lerp(1, SUNK_SCALE, fall),
          },
        ],
        trace: null,
      };
    }

    case 'reflog': {
      /*
       * Đi ngược ĐÚNG con đường của `reset --hard`, qua cùng một `sinkOf()`.
       * `t=0` ở đáy, `t=1` về đúng chỗ cũ — bằng nhau từng thành phần, không
       * phải xấp xỉ. Đó là toàn bộ sức thuyết phục của bài học "nó chưa mất".
       */
      const rise = easeOutCubic(u);
      return {
        kind: 'reflog',
        actors: [
          {
            role: 'primary',
            position: lerp3(sinkOf(input.from), input.from, rise),
            opacity: lerp(SUNK_OPACITY, 1, rise),
            scale: lerp(SUNK_SCALE, 1, rise),
          },
        ],
        trace: null,
      };
    }

    case 'force-push': {
      /*
       * Chuyển động DUY NHẤT được về độ mờ 0. Đó là cách phân biệt "mất thật"
       * với "khuất" — nếu `reset --hard` cũng tan hết thì hai lệnh trông giống
       * nhau và `reflog` trở thành phép màu thay vì một hệ quả.
       *
       * Độ mờ giảm TUYẾN TÍNH (không easing) để chạm đúng 0 ở `t=1`; easing ở
       * đây chỉ chi phối chỗ đứng và cỡ.
       */
      const spread = easeOutCubic(u);
      const actors: MotionActorState[] = [];
      for (let i = 0; i < SHARD_COUNT; i += 1) {
        const dir = shardDirection(i);
        actors.push({
          role: 'shard',
          position: [
            input.from[0] + dir[0] * SHARD_SPREAD * spread,
            input.from[1] + dir[1] * SHARD_SPREAD * spread,
            input.from[2] + dir[2] * SHARD_SPREAD * spread,
          ],
          opacity: 1 - u,
          scale: lerp(1, SHARD_END_SCALE, spread),
        });
      }
      return { kind: 'force-push', actors, trace: null };
    }

    case 'cherry-pick': {
      /*
       * Nguồn giữ NGUYÊN độ mờ 1 — khác hẳn `ghost` của `rebase`. Đó là chỗ hai
       * lệnh này phân biệt nhau bằng mắt: rebase bỏ lại một cái bóng, cherry-pick
       * không đụng gì tới nguồn cả.
       *
       * Chỉ mờ CÒN LẠI ở `t=1` vì nó là thông tin thường trú ("commit này chép
       * từ kia"), không phải một vệt hiệu ứng.
       */
      const copy = flightPath(input.from, input.to, u);
      const grow = easeInOutCubic(u);
      return {
        kind: 'cherry-pick',
        actors: [
          { role: 'source', position: input.from, opacity: 1, scale: 1 },
          {
            role: 'primary',
            position: copy,
            opacity: 1,
            scale: lerp(COPY_START_SCALE, 1, grow),
          },
        ],
        trace: {
          from: input.from,
          to: copy,
          opacity: TRACE_OPACITY * easeOutCubic(u),
        },
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Nhịp — phần bộ chạy dùng, tách ra để KIỂM ĐƯỢC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Khoảng thời gian tối đa còn được coi là "một khung hình".
 *
 * ⚠ Cảnh chạy `frameloop="demand"`, nên khung hình ĐẦU TIÊN sau một quãng đứng
 * yên mang `delta` bằng cả quãng đó — vài giây là chuyện thường. Cộng thẳng vào
 * thì chuyển động nhảy cóc tới `t=1` ngay khung đầu và người chơi không thấy gì
 * cả: thông tin mà chuyển động mang theo bị mất trọn, trong im lặng.
 *
 * Cùng hằng số và cùng lý do với `MAX_FRAME_S` của `k8s-arena/scene/frame-pump.tsx`.
 */
export const MAX_FRAME_S = 0.1;

export interface MotionTick {
  /** Thời điểm chuẩn hoá để đưa vào `motionFrame()`. */
  readonly t: number;
  /** Đồng hồ đã cộng dồn, giây. Bộ chạy giữ lại cho khung kế tiếp. */
  readonly elapsedS: number;
  /**
   * Còn phải xin thêm khung hình nữa không.
   *
   * ⚠ Đây là HỢP ĐỒNG với `frameloop="demand"`, đọc theo cả hai chiều:
   * `true` ⇒ bộ chạy **phải** gọi `invalidate()`, quên là chuyển động đứng hình
   * giữa chừng. `false` ⇒ bộ chạy **phải ngừng** gọi, quên là vẽ 60fps vĩnh
   * viễn — đúng lỗi đã bắt repo này gỡ `idleSpinAfterMs` ngày 2026-09-08.
   */
  readonly running: boolean;
}

/**
 * Một bước nhịp. Thuần, tất định, không đọc đồng hồ nào — bộ chạy đưa `deltaS`
 * vào, và nhờ vậy luật `invalidate()` ở trên kiểm được ở env `node`.
 *
 * `reducedMotion` nhảy thẳng tới trạng thái cuối và báo `running: false` ngay
 * khung đầu: không một khung hình nào được xin thêm. Đó là điều kiện để trạng
 * thái cuối TỰ NÓ đọc được — `git-palette.ts` nói rõ vì sao: chuyển động là một
 * trong các kênh phân biệt trạng thái, nên khi nó tắt, hệ tụt xuống ít kênh hơn
 * cho đúng nhóm người dùng cần nó nhất.
 */
export function advanceMotion(
  kind: MotionKind,
  elapsedS: number,
  deltaS: number,
  reducedMotion: boolean,
): MotionTick {
  const duration = MOTION_DURATION_S[kind];
  if (reducedMotion) {
    return { t: 1, elapsedS: duration, running: false };
  }
  const step = Math.min(Math.max(deltaS, 0), MAX_FRAME_S);
  const next = elapsedS + step;
  const t = clamp01(next / duration);
  return { t, elapsedS: next, running: t < 1 };
}
