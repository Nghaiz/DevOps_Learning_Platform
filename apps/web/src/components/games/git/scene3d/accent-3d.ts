/**
 * Sáu `SceneAccent` → ba kênh của tầng 3D (17.K.10). **Toán/dữ liệu thuần.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG `three`, VÀ ĐÓ LÀ MỘT RÀNG BUỘC CÓ CỔNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cùng ba lý do `scene3d-contract.ts` nêu ở đầu file nó: test được ở env `node`,
 * không kéo ~631KB engine vào chỗ không cần, và đọc được mà không phải đọc mã
 * dựng mesh. Ô `accent-3d.test.ts` § "không import three" đọc CHÍNH file này và
 * đỏ nếu một dòng `from 'three'` lọt vào — nên câu trên không phải một lời hứa
 * trong chú thích.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẢNG NÀY **KHÔNG** KHAI LẠI MÀU, VÀ CŨNG KHÔNG KHAI LẠI HÌNH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `ACCENT_STYLE` của `../git-palette.ts` đã là SSOT cho màu · hình học · chuyển
 * động · sigil, và bảng đó có phép đo tương phản đứng sau từng token. Chép sang
 * đây một bảng thứ hai là dựng đúng thứ `docs/code-conventions.md` § No
 * Duplicated Logic cấm — và tệ hơn ở đây: hai renderer của CÙNG một game sẽ nói
 * hai điều khác nhau về cùng một commit, mà ô AC-B chỉ so tập node/cạnh nên nó
 * vẫn xanh.
 *
 * Nên file này chỉ khai phần 3D **không tồn tại ở 2D**: khối hình tương ứng, hệ
 * số phóng, và cờ bloom. Màu, sigil, và danh tính hình học đọc xuyên qua từ
 * `ACCENT_STYLE`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ BLOOM CHỈ CHO `head` — VÀ K.10 VIẾT SAI TÊN TRẠNG THÁI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Plan §17.K.10 viết "selective bloom chỉ cho `running`". `running` là trạng
 * thái của game **K8s** (một pod đang chạy); game Git không có trạng thái nào
 * tên vậy. Chủ dự án đã chốt ánh xạ: `running` ↦ `head` — "thứ đang sống, thứ
 * bạn đang đứng ở đó".
 *
 * Ghi lại vì nó là một quyết định, không phải một phép suy: `fresh` (vừa tạo)
 * cũng có thể đọc ra là "đang sống", và chọn nó thì cả bài học `reset`/`reflog`
 * mất mốc thị giác "bạn đang ở đây". Năm accent còn lại `bloom: false`, và test
 * ghim con số MỘT — thêm accent thứ hai phát sáng là mất luôn nghĩa của kênh đó.
 */

import type { SceneAccent } from '../../shared/scene-props.ts';
import { ACCENT_STYLE, type ColorToken, type NodeShape } from '../git-palette.ts';
import { NODE_RADIUS, X_STEP, Y_STEP, Z_STEP } from './scene3d-contract.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Kênh HÌNH HỌC — năm khối, gương của năm `NodeShape`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Khối 3D. Mỗi giá trị là MỘT lô `InstancedMesh` ở `commit-instances.tsx`, nên
 * số phần tử của kiểu này chính là số lệnh vẽ của tầng thân commit.
 */
export type NodeSolid =
  /** Hộp bo góc đặc. */
  | 'rounded'
  /** Hộp bo góc + một vòng xuyến đồng tâm — gương của viền-dày-cộng-vòng-ngoài. */
  | 'ringed'
  /** Khung dây rỗng ruột — gương của viền ĐỨT. Xem ghi chú "mờ" bên dưới. */
  | 'cage'
  /** Tám mặt, cạnh sắc — khác silhouette ngay cả khi chỉ còn vài pixel. */
  | 'sharp'
  /** Hai phiến lệch nhau, như hai tờ giấy chồng lên. */
  | 'stacked';

/**
 * `NodeShape` (2D) → `NodeSolid` (3D). Ánh xạ 1-1, và đó là điểm chính.
 *
 * Hai renderer phải phân loại commit theo CÙNG một phép chia. Nếu 3D tự gom
 * `round` và `sharp` vào một khối thì một người chơi đổi qua lại giữa hai chế
 * độ sẽ thấy hai commit lúc khác nhau lúc giống nhau, và không cổng nào bắt —
 * `satisfies Record<NodeShape, …>` làm phép chia đó thành một cổng biên dịch.
 */
export const SOLID_OF_SHAPE = {
  round: 'rounded',
  ringed: 'ringed',
  dashed: 'cage',
  sharp: 'sharp',
  stacked: 'stacked',
} as const satisfies Record<NodeShape, NodeSolid>;

/**
 * Thứ tự lô. Cố định, vì chỉ số lô đi vào bảng tra `instanceId → node` ở
 * `hit-proxy.tsx` và một thứ tự trôi là một cú bấm trúng nhầm commit.
 */
export const NODE_SOLIDS = [
  'rounded',
  'ringed',
  'cage',
  'sharp',
  'stacked',
] as const satisfies readonly NodeSolid[];

// ═══════════════════════════════════════════════════════════════════════════
// Kênh 3D-RIÊNG — phóng và bloom
// ═══════════════════════════════════════════════════════════════════════════

interface Accent3DExtra {
  /**
   * Hệ số phóng so với `NODE_RADIUS`.
   *
   * ⚠ Đây là kênh THAY THẾ cho `opacity`, không phải trang trí. `git-palette.ts`
   * § "VÌ SAO MỜ KHÔNG ĐƯỢC LÀM BẰNG opacity" đã loại đường mờ-bằng-alpha vì nó
   * hạ tương phản chữ theo đúng hệ số đó. Ở 3D bẫy còn nặng hơn: một khối trong
   * suốt cần sắp xếp theo chiều sâu, và hai khối trong suốt chồng nhau cho ra
   * một màu thứ ba không có trong bảng đo nào. `orphaned` vì vậy NHỎ LẠI chứ
   * không mờ đi — vẫn đặc, vẫn đủ tương phản, và vẫn đọc ra là "kém quan trọng".
   */
  readonly scale: number;
  /** Có vào lớp selective bloom không. Xem khối ⚠ ở đầu file — chỉ `head`. */
  readonly bloom: boolean;
}

const ACCENT_3D_EXTRA = {
  normal: { scale: 1, bloom: false },
  head: { scale: 1.18, bloom: true },
  fresh: { scale: 1.06, bloom: false },
  orphaned: { scale: 0.84, bloom: false },
  duplicate: { scale: 1, bloom: false },
  conflicted: { scale: 1.1, bloom: false },
} as const satisfies Record<SceneAccent, Accent3DExtra>;

// ═══════════════════════════════════════════════════════════════════════════
// Bảng hợp nhất
// ═══════════════════════════════════════════════════════════════════════════

export interface Accent3D {
  readonly solid: NodeSolid;
  readonly scale: number;
  /** Màu thân. Tên biến CSS — phân giải lúc chạy ở `node-material.ts`. */
  readonly fill: ColorToken;
  /** Màu viền/vòng/khung. Với `cage` đây là màu của toàn bộ khối. */
  readonly stroke: ColorToken;
  /** Màu sigil trên nền `fill`. Cặp đã đo ≥ 4.5:1 ở cả hai theme. */
  readonly text: ColorToken;
  readonly sigil: string;
  readonly bloom: boolean;
}

/** Sáu accent, theo thứ tự khai của `ACCENT_STYLE`. Suy ra, không chép tay. */
export const SCENE_ACCENTS = Object.keys(ACCENT_STYLE) as readonly (keyof typeof ACCENT_STYLE)[];

export const ACCENT_3D: Readonly<Record<SceneAccent, Accent3D>> = Object.fromEntries(
  SCENE_ACCENTS.map((accent): readonly [SceneAccent, Accent3D] => {
    const flat = ACCENT_STYLE[accent];
    const extra = ACCENT_3D_EXTRA[accent];
    return [
      accent,
      {
        solid: SOLID_OF_SHAPE[flat.shape],
        scale: extra.scale,
        fill: flat.fill,
        stroke: flat.stroke,
        text: flat.text,
        sigil: flat.sigil,
        bloom: extra.bloom,
      },
    ];
  }),
) as Readonly<Record<SceneAccent, Accent3D>>;

// ═══════════════════════════════════════════════════════════════════════════
// Bảng ký hiệu (sigil) — ô của texture atlas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Các ô của bảng ký hiệu, đã khử trùng, theo thứ tự `SCENE_ACCENTS`.
 *
 * Ô **0 rỗng** và đó là cố ý: `normal` khai `sigil: ''`, và nó đứng đầu
 * `ACCENT_STYLE`. Một ô trống ở đầu bảng rẻ hơn một nhánh `if` trong shader —
 * mọi instance đều trỏ vào một ô hợp lệ, ô của `normal` chỉ tình cờ trong suốt.
 */
export const SIGIL_CELLS: readonly string[] = [
  ...new Set(SCENE_ACCENTS.map((accent) => ACCENT_STYLE[accent].sigil)),
];

const CELL_OF_SIGIL = new Map(SIGIL_CELLS.map((glyph, index) => [glyph, index]));

/** Chỉ số ô atlas của một accent. Đi thẳng vào instance attribute `aCell`. */
export function sigilCell(accent: SceneAccent): number {
  return CELL_OF_SIGIL.get(ACCENT_3D[accent].sigil) ?? 0;
}

/*
 * ⛔ KHÔNG có danh sách token màu ở file này.
 *
 * Bản đầu của lane B khai một `NODE_COLOR_TOKENS` suy ra từ `ACCENT_3D`. Nó bị
 * XOÁ khi lead giao `scene3d/scene3d-tokens.ts` (commit `e369df7`):
 * `GIT_SCENE_TOKENS` ở đó đã gom từ CẢ BA bảng (`ACCENT_STYLE` · `EDGE_STYLE` ·
 * `REF_STYLE`) cộng token nền cảnh, tức nó là SIÊU TẬP của danh sách này.
 *
 * Giữ lại cả hai sẽ cho hai danh sách "trông đúng" khi đọc riêng, và chỗ lệch
 * chỉ lộ ra dưới dạng một ô commit màu xám mà không ai giải thích được. Ô
 * `accent-3d.test.ts` § "mọi token accent nằm trong GIT_SCENE_TOKENS" gác chiều
 * còn lại: thêm một accent dùng token mới mà bộ đọc không biết ⇒ ĐỎ.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Hình học suy ra
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nửa cạnh hộp bao của một commit, theo đơn vị cảnh.
 *
 * Hình học dựng ở kích thước ĐƠN VỊ (cạnh 1, tâm ở gốc) rồi phóng bằng
 * `2 × nodeHalfExtent()`, nên hàm này là nguồn duy nhất của "một ô commit to
 * bằng nào" — và `hit-proxy.tsx` gọi CHÍNH nó. Contract §116 đòi lane hình học
 * và lane bắt tia dùng chung `NODE_RADIUS`; đây là chỗ dùng chung đó.
 */
export function nodeHalfExtent(accent: SceneAccent): number {
  return NODE_RADIUS * ACCENT_3D[accent].scale;
}

/**
 * Hộp bấm rộng hơn hộp vẽ bao nhiêu lần.
 *
 * SÀN 1.0 — nhỏ hơn thì có phần vật nhìn thấy mà bấm không trúng, đúng lỗi mà
 * hộp bấm sinh ra để sửa. TRẦN là khoảng cách giữa hai commit gần nhau nhất:
 * hai làn kề nhau cách `sqrt(Z_STEP² + Y_STEP²)` ≈ 2.07, hai mốc thời gian kề
 * nhau cách `X_STEP` = 2.4. Hai `head` kề nhau (accent to nhất, 1.18) ở 1.15
 * chiếm 2 × 0.62 × 1.18 × 1.15 = 1.68, còn khe 0.39. Ô
 * `accent-3d.test.ts` § "hộp bấm không ăn cắp cú bấm của hàng xóm" tính lại
 * đúng phép này, nên đổi `Y_STEP` ở hợp đồng mà quên chỗ này thì nó ĐỎ.
 */
export const HIT_PADDING_3D = 1.15;

/** Khoảng cách tâm-tâm NHỎ NHẤT giữa hai commit kề nhau trong cảnh. */
export function minNeighbourDistance(): number {
  const lane = Math.hypot(Z_STEP, Y_STEP);
  return Math.min(X_STEP, lane);
}
