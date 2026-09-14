/**
 * Bảng màu game Git (17.C.4) + phép đo tương phản hai theme (17.C.5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ KHÔNG CẦN NGOẠI LỆ CỔNG MÀU — ĐỪNG ĐĂNG KÝ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Plan §17.C.1 dự trù đăng ký một ngoại lệ cho `components/games/git/**` trong
 * `scripts/check-design-tokens.mjs`. **Vùng này không cần nó.** Không một
 * `#hex`, một thang màu Tailwind, hay một `0xRRGGBB` nào nằm trong mã chạy được
 * của thư mục này: mọi giá trị dưới đây là tên biến CSS, phát ra dạng
 * `var(--token)` và để trình duyệt phân giải theo theme đang bật.
 *
 * Ngoại lệ hẹp nhất là ngoại lệ KHÔNG TỒN TẠI, và một dòng trong
 * `KNOWN_HARDCODED` cho một file sạch sẽ bị chính cổng đó báo là **hết hạn**
 * (chiều-xuống của sổ cái) — tức đăng ký thừa sẽ làm cổng ĐỎ, không phải xanh.
 *
 * Các giá trị hex trong bảng đo bên dưới nằm trong CHÚ THÍCH; `isCommentLine()`
 * của cổng bỏ qua dòng chú thích, nên chúng không kích hoạt luật nào.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA KÊNH CHO MỖI TRẠNG THÁI (design §4.6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mỗi `SceneAccent` mang **màu + hình học + chuyển động**, cộng một **sigil**
 * chữ. Một trạng thái chỉ phân biệt bằng màu là một trạng thái người mù màu
 * không đọc được — mà ba trong sáu trạng thái ở đây là đỏ/xanh lá/xanh dương,
 * đúng bộ ba mà deuteranopia và protanopia làm nhoè vào nhau.
 *
 * Kênh thứ tư (sigil) là kênh MẠNH NHẤT về a11y và được thêm có chủ ý: chuyển
 * động biến mất hoàn toàn dưới `prefers-reduced-motion`, nên một hệ chỉ có ba
 * kênh thực chất tụt xuống hai kênh cho đúng nhóm người dùng cần nó nhất.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẢNG ĐO TƯƠNG PHẢN — ĐO 2026-09-14, CẢ HAI THEME
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nguồn giá trị: `apps/web/src/app/globals.css` (`:root` và `.dark`). Phép toán
 * oklch → sRGB → độ chói tương đối → tỉ lệ tương phản lấy NGUYÊN từ
 * `packages/ui/src/theme/tokens.contract.test.ts` (đọc cùng ngày) thay vì viết
 * lại — hai bản cài đặt sẽ ra hai con số. Token có alpha (`--border` nhánh tối
 * là `oklch(1 0 0 / 12%)`) được trộn lên nền trước khi đo, trong sRGB đã mã hoá
 * gamma, đúng như `composite()` ở file đó.
 *
 * Ngưỡng: **4.5:1** cho chữ (WCAG 1.4.3 AA), **3:1** cho đồ hoạ mang nghĩa
 * (1.4.11) — nét vẽ cạnh và viền ô là đồ hoạ mang nghĩa, không phải trang trí.
 *
 * ── CẶP CHỮ / NỀN ──────────────────────────────────────────────────────────
 *
 * | Cặp                                          | sáng  | tối   |
 * |---|---|---|
 * | `--card-foreground` trên `--card`            | 10.81 | 16.43 |
 * | `--muted-foreground` trên `--card`           |  6.01 |  7.22 |
 * | `--primary-foreground` trên `--primary`      |  5.83 |  6.31 |
 * | `--success-foreground` trên `--success`      |  4.95 |  7.82 |
 * | `--muted-foreground` trên `--muted`          |  5.51 |  6.09 |
 * | `--status-progress-foreground` trên `--status-progress` | 5.20 | 7.32 |
 * | `--destructive-foreground` trên `--destructive` | 6.21 | 6.98 |
 * | `--warning-foreground` trên `--warning`      |  5.06 |  9.23 |
 * | `--background` trên `--foreground` (HEAD đảo màu) | 10.81 | 18.15 |
 * | `--foreground` trên `--background`           | 10.81 | 18.15 |
 * | `--muted-foreground` trên `--background`     |  6.01 |  7.98 |
 *
 * Thấp nhất: **4.95** (`--success-foreground` / `--success`, nhánh sáng). Đạt
 * AA ở cả hai theme, 11/11 cặp.
 *
 * ── NÉT VẼ / NỀN (ngưỡng 3:1) ──────────────────────────────────────────────
 *
 * | Cặp                                     | sáng | tối  |
 * |---|---|---|
 * | `--muted-foreground` trên `--background`|  6.01 | 7.98 |
 * | `--foreground` trên `--background`      | 10.81 | 18.15 |
 * | `--primary` trên `--background`         |  6.09 | 6.31 |
 * | `--success` trên `--background`         |  5.17 | 7.82 |
 * | `--destructive` trên `--background`     |  6.48 | 6.98 |
 * | `--status-progress` trên `--background` |  5.43 | 7.32 |
 * | `--warning` trên `--background`         |  5.29 | 9.23 |
 *
 * ── ⛔ HAI TOKEN BỊ PHÉP ĐO LOẠI ────────────────────────────────────────────
 *
 * |                                     | sáng | tối  | phán quyết |
 * |---|---|---|---|
 * | `--border` trên `--background`      | 1.30 | 1.33 | **TRƯỢT 3:1** |
 * | `--input` trên `--background`       | 3.50 | 3.50 | vừa đủ, không dùng |
 * | `--card` trên `--background`        | 1.00 | 1.10 | **nền ô = nền cảnh** |
 * | `--muted` trên `--background`       | 1.09 | 1.31 | như trên |
 *
 * Hai hệ quả THIẾT KẾ, không phải hai ghi chú:
 *
 * 1. **Cạnh và viền ô KHÔNG dùng `--border`.** Ở nhánh sáng nó đạt 1.30 — mắt
 *    thường còn thấy được trên một đường kẻ bảng, nhưng một cạnh cha-con là
 *    thứ MANG NGHĨA (nó LÀ quan hệ mà cả game dạy), nên nó chịu ngưỡng 1.4.11.
 *    Nét vẽ dùng `--muted-foreground`. Phản xạ tự nhiên là `--border`; phép đo
 *    nói không, và đây là chỗ ghi lại lý do để lần sau không ai đổi lại.
 *
 * 2. **`--card` bằng ĐÚNG `--background` ở nhánh sáng** (cả hai là
 *    `oklch(1 0 0)`, tỉ lệ 1.00 — trắng trên trắng). Một ô commit `normal` tô
 *    `--card` đặt trên nền cảnh `--background` là **vô hình**, và chỉ đường
 *    viền làm nó tồn tại. Nên viền của ô `normal` KHÔNG phải trang trí: nó là
 *    thứ duy nhất vẽ ra cái ô, và vì thế nó phải đạt 3:1 — `--muted-foreground`
 *    đạt 6.01/7.98.
 *
 * ── ⛔ VÌ SAO "MỜ" KHÔNG ĐƯỢC LÀM BẰNG `opacity` ───────────────────────────
 *
 * Commit `orphaned` phải trông MỜ (hợp đồng §6, và cả chương 3 sống trên đó).
 * Đường làm rõ nhất — `opacity: 0.45` lên cả ô — hạ tương phản chữ theo đúng hệ
 * số đó: 5.51 × 0.45 không còn là 5.51, và ô AC-6 mất. Nên "mờ" ở đây là một
 * NỀN nhạt hơn (`--muted` thay `--card`) cộng một VIỀN ĐỨT, còn chữ giữ nguyên
 * `--muted-foreground` — 5.51/6.09, vẫn AA. Cùng lý do, cạnh `cherry-source`
 * "mờ" bằng nét ĐỨT mảnh chứ không bằng `opacity`.
 *
 * Tái lập bảng trên: `scripts/` không có sẵn lệnh cho việc này (`tokens.contract.test.ts`
 * giữ phép toán ở phạm vi module, không export). Báo lead: tách phần oklch→sRGB
 * ra một module export được là điều kiện để bảng này thành một CỔNG thay vì một
 * bảng số trong chú thích.
 */

import type { SceneAccent, SceneEdgeKind, SceneRefKind } from '../shared/scene-props.ts';

/** Tên biến CSS, dùng qua `cssVar()`. Không bao giờ là một giá trị màu. */
export type ColorToken = string;

export function cssVar(token: ColorToken): string {
  return `var(${token})`;
}

/**
 * Hình dạng ô commit. Kênh HÌNH HỌC — đọc được khi màu bị nhoè hoặc khi in đen
 * trắng cho báo cáo NCKH (một trong bốn lý do 2D là chế độ ngang hàng, §2.3).
 */
export type NodeShape =
  /** Bo góc, viền liền. */
  | 'round'
  /** Bo góc, viền liền DÀY + một vòng ngoài đồng tâm. */
  | 'ringed'
  /** Bo góc, viền ĐỨT. */
  | 'dashed'
  /** Góc VUÔNG sắc — khác biệt thấy được ngay cả ở cỡ nhỏ nhất. */
  | 'sharp'
  /** Bo góc + một lớp lệch phía sau, như hai tờ giấy chồng lên nhau. */
  | 'stacked';

/** Kênh CHUYỂN ĐỘNG. Tất cả bị vô hiệu dưới `prefers-reduced-motion: reduce`. */
export type NodeMotion = 'none' | 'pulse' | 'pop' | 'shake';

export interface AccentStyle {
  /** Nền ô. */
  readonly fill: ColorToken;
  /** Chữ trên nền đó. Cặp `fill`/`text` đã đo ≥ 4.5:1 ở cả hai theme. */
  readonly text: ColorToken;
  /** Viền. Với `normal` đây là thứ DUY NHẤT vẽ ra cái ô — xem hệ quả #2 ở đầu file. */
  readonly stroke: ColorToken;
  readonly strokeWidth: number;
  readonly shape: NodeShape;
  readonly motion: NodeMotion;
  /** Một ký tự ở góc ô. Kênh thứ tư, và là kênh sống sót qua reduced-motion. */
  readonly sigil: string;
  /** Đọc ra cho trình đọc màn hình. Tiếng Việt, một cụm danh từ. */
  readonly label: string;
}

/**
 * Sáu trạng thái.
 *
 * `satisfies Record<SceneAccent, …>` là một cổng LÚC BIÊN DỊCH, cùng khuôn với
 * `SCENE_TOKEN_VARS` của arena: hợp đồng thêm một `CommitAccent` mà bảng này
 * chưa có ⇒ đỏ ở typecheck, thay vì một ô commit màu xám không ai giải thích
 * được.
 */
export const ACCENT_STYLE = {
  normal: {
    fill: '--card',
    text: '--card-foreground',
    stroke: '--muted-foreground',
    strokeWidth: 1.5,
    shape: 'round',
    motion: 'none',
    sigil: '',
    label: 'commit thường',
  },
  head: {
    fill: '--primary',
    text: '--primary-foreground',
    stroke: '--primary',
    strokeWidth: 2.5,
    shape: 'ringed',
    motion: 'pulse',
    sigil: '@',
    label: 'HEAD đang ở đây',
  },
  fresh: {
    fill: '--success',
    text: '--success-foreground',
    stroke: '--success',
    strokeWidth: 2,
    shape: 'round',
    motion: 'pop',
    sigil: '+',
    label: 'vừa được tạo',
  },
  orphaned: {
    fill: '--muted',
    text: '--muted-foreground',
    stroke: '--muted-foreground',
    strokeWidth: 1.5,
    shape: 'dashed',
    motion: 'none',
    sigil: '?',
    label: 'đã mất, không ref nào trỏ tới',
  },
  duplicate: {
    fill: '--status-progress',
    text: '--status-progress-foreground',
    stroke: '--status-progress',
    strokeWidth: 2,
    shape: 'stacked',
    motion: 'none',
    sigil: '=',
    label: 'bản sao của một commit khác',
  },
  conflicted: {
    fill: '--destructive',
    text: '--destructive-foreground',
    stroke: '--destructive',
    strokeWidth: 2.5,
    shape: 'sharp',
    motion: 'shake',
    sigil: '!',
    label: 'đang xung đột',
  },
} as const satisfies Record<SceneAccent, AccentStyle>;

export interface EdgeStyle {
  readonly stroke: ColorToken;
  readonly width: number;
  /** `null` = nét liền. Chuỗi `stroke-dasharray`. */
  readonly dash: string | null;
  /** Chấm tròn ở đầu cạnh phía CON — kênh hình học, phân biệt cha-thứ-hai. */
  readonly joint: boolean;
  readonly label: string;
}

/**
 * Bốn loại cạnh.
 *
 * `parent` và `merge-parent` phân biệt bằng **màu + độ dày + chấm nối**, không
 * chỉ bằng màu — chỗ hai nhánh GẶP NHAU là thông tin chính của mọi bài merge, và
 * nó phải thấy được trên bản in đen trắng.
 *
 * `cherry-source` và `remote-mirror` cùng dùng `--muted-foreground` và phân biệt
 * bằng NHỊP ĐỨT (chấm mảnh vs gạch dài). Cả hai đều là "sợi chỉ tham chiếu",
 * không phải quan hệ cha-con, nên chúng đứng cùng một bậc thị giác là đúng.
 */
export const EDGE_STYLE = {
  parent: {
    stroke: '--muted-foreground',
    width: 2,
    dash: null,
    joint: false,
    label: 'cha thứ nhất',
  },
  'merge-parent': {
    stroke: '--foreground',
    width: 3,
    dash: null,
    joint: true,
    label: 'cha thứ hai của commit merge',
  },
  'cherry-source': {
    stroke: '--muted-foreground',
    width: 1.5,
    dash: '2 4',
    joint: false,
    label: 'nguồn của bản sao',
  },
  'remote-mirror': {
    stroke: '--muted-foreground',
    width: 2,
    dash: '8 4',
    joint: false,
    label: 'cùng commit ở kho kia',
  },
} as const satisfies Record<SceneEdgeKind, EdgeStyle>;

/** Hình dạng nhãn ref. Kênh hình học của badge. */
export type BadgeShape = 'plain' | 'dashed' | 'notched' | 'double';

export interface RefStyle {
  readonly fill: ColorToken;
  readonly text: ColorToken;
  readonly shape: BadgeShape;
  readonly label: string;
}

/**
 * Bốn loại nhãn ref.
 *
 * `branch` dùng `--primary` cùng token với accent `head`, và điều đó là CÓ Ý:
 * "nhánh đang đứng" và "HEAD đang ở đây" là hai mặt của một khái niệm. Hai chỗ
 * dùng nằm ở hai kênh khác nhau (badge tô nền vs ô commit) nên chúng không
 * tranh nhau trên màn hình.
 */
export const REF_STYLE = {
  branch: { fill: '--primary', text: '--primary-foreground', shape: 'plain', label: 'nhánh' },
  remote: {
    fill: '--status-progress',
    text: '--status-progress-foreground',
    shape: 'dashed',
    label: 'nhánh theo dõi từ xa',
  },
  tag: { fill: '--warning', text: '--warning-foreground', shape: 'notched', label: 'tag' },
  head: { fill: '--foreground', text: '--background', shape: 'double', label: 'HEAD' },
} as const satisfies Record<SceneRefKind, RefStyle>;

/** Màu nét vẽ của một cạnh, đã thành chuỗi CSS dùng được. */
export function edgeStroke(kind: SceneEdgeKind): string {
  return cssVar(EDGE_STYLE[kind].stroke);
}

/**
 * Một câu tiếng Việt mô tả trạng thái, dùng trong `aria-label` của node.
 *
 * Tách khỏi component để test khẳng định được nội dung mà không phải render, và
 * để renderer 3D (P17b) đọc ra ĐÚNG một câu — hai renderer nói hai câu khác nhau
 * về cùng một commit là một lỗi a11y không cổng nào bắt được.
 */
export function accentLabel(accent: SceneAccent): string {
  return ACCENT_STYLE[accent].label;
}
