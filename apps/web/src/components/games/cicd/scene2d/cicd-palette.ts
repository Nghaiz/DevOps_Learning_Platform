/**
 * Bảng màu + ba kênh mã hoá của cảnh 2D game CI/CD (19.D.2.5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FILE NÀY KHÔNG ĐỊNH NGHĨA TRẠNG THÁI — NÓ CHỈ DIỄN DỊCH `STATE_ENCODING`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `packages/games/src/cicd/scene-encoding.ts` là SSOT: nó nói mỗi trạng thái
 * mang `statusToken` nào, `geometry` nào, `motion` nào, icon nào. File này chỉ
 * trả lời một câu hỏi mà SSOT cố ý không trả lời: **"vẽ ra SVG thì nó là cái
 * gì"** — token nền, token chữ, độ dày nét, có gạch chéo không.
 *
 * Nên ở đây KHÔNG có `Record<StageRunState, …>` thứ hai. Có một bảng như thế là
 * dựng nguồn sự thật song song, và nó sẽ lệch vào đúng ngày ai đó thêm một
 * trạng thái. Bảng dưới đây khoá theo `NodeGeometry` và `statusToken` — hai
 * trục mà SSOT đã chốt — nên thêm một `StageRunState` mới mà quên file này thì
 * **không có gì để quên**: trạng thái mới chỉ cần chọn một geometry và một
 * token đã có.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ KHÔNG ĐĂNG KÝ NGOẠI LỆ CHO `check-design-tokens.mjs`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Không một `#hex`, thang Tailwind, hay `0xRRGGBB` nào nằm trong mã chạy được
 * của thư mục này — mọi giá trị là TÊN biến CSS, phát ra `var(--token)`. Sổ cái
 * `KNOWN_HARDCODED` có chiều XUỐNG: một dòng miễn trừ cho một file sạch làm
 * cổng ĐỎ vì hết hạn. (Cùng kết luận `git-palette.ts` đã ghi cho game Git.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HAI KẾT LUẬN ĐO ĐƯỢC MƯỢN NGUYÊN TỪ `git-palette.ts` — ĐỪNG ĐO LẠI, ĐỪNG ĐỔI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bảng tương phản đầy đủ (11 cặp chữ/nền, 7 cặp nét/nền, đo 2026-09-14 trên
 * `globals.css` cả hai nhánh) nằm ở đầu `../../git/git-palette.ts`. Hai hệ quả
 * ràng buộc trực tiếp file này:
 *
 * 1. **Nét mang nghĩa KHÔNG dùng `--border`** — 1.30 ở nhánh sáng, trượt ngưỡng
 *    3:1 của WCAG 1.4.11. Một cạnh phụ thuộc LÀ thứ game này dạy, nên nó là đồ
 *    hoạ mang nghĩa, không phải đường kẻ trang trí. Nét vẽ dùng
 *    `--muted-foreground` (6.01 sáng / 7.98 tối).
 * 2. **`--card` bằng ĐÚNG `--background` ở nhánh sáng** (cả hai `oklch(1 0 0)`,
 *    tỉ lệ 1.00). Một node `outline` tô `--card` trên nền cảnh là VÔ HÌNH; cái
 *    viền không phải trang trí mà là thứ duy nhất vẽ ra cái hộp.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ "MỜ" KHÔNG BAO GIỜ LÀM BẰNG `opacity` — VÀ ĐÂY LÀ CHỖ NÓ SUÝT SAI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `STATE_ENCODING.skipped` ghi `motion: 'fade-dim'` và §2.2 của kế hoạch ghi
 * "tĩnh, mờ 35%". Làm đúng chữ đó — `opacity: 0.35` lên cả node — hạ tương phản
 * chữ theo đúng hệ số ấy: 6.01 × 0.35 = 2.10, trượt cả ngưỡng 3:1 lẫn 4.5:1, và
 * ô a11y mất. Nên `skipped` mờ bằng **nền `--muted` + gạch chéo**, chữ giữ
 * nguyên `--muted-foreground`.
 *
 * Đây cũng là chỗ cảnh báo "theme sáng không phải theme tối đảo ngược" cắn:
 * `hollow` kiểu wireframe RỖNG (chỉ viền, ruột trong suốt) gần như biến mất
 * trên nền trắng. Ở đây `hollow` là **đặc xám nhạt (`--muted`) + gạch chéo
 * `--muted-foreground`** ở CẢ HAI theme — gạch chéo là kênh hình học sống sót
 * qua cả bản in đen trắng lẫn `prefers-reduced-motion`.
 */

import {
  STATE_ENCODING,
  encodingOf,
  type NodeGeometry,
  type NodeMotion,
  type StageNodeView,
  type StageRunState,
} from '@devops-platform/games';

/** Tên biến CSS. KHÔNG bao giờ là một giá trị màu. */
export type ColorToken = string;

export function cssVar(token: ColorToken): string {
  return `var(${token})`;
}

/** Cặp nền/chữ của một `statusToken`, đã đo ≥ 4.5:1 ở cả hai theme. */
interface TokenPair {
  readonly fill: ColorToken;
  readonly text: ColorToken;
}

/**
 * Năm `statusToken` của `StageNodeView`. `satisfies` là cổng lúc biên dịch:
 * hợp đồng mở thêm một token mà bảng này chưa có ⇒ đỏ ở `tsc`, chứ không phải
 * một node xám không ai giải thích được lúc chạy.
 */
const STATUS_PAIR = {
  success: { fill: '--success', text: '--success-foreground' },
  destructive: { fill: '--destructive', text: '--destructive-foreground' },
  warning: { fill: '--warning', text: '--warning-foreground' },
  'status-progress': { fill: '--status-progress', text: '--status-progress-foreground' },
  'status-locked': { fill: '--status-locked', text: '--status-locked-foreground' },
} as const satisfies Record<StageNodeView['statusToken'], TokenPair>;

/**
 * Cách một `NodeGeometry` thành hình trong SVG.
 *
 * `depth` = có vẽ mặt trên sáng hơn không (chiều sâu giả của D.2.2). `rings` =
 * số vành đồng tâm. `hatch` = có phủ gạch chéo không. `sunk` = đẩy hộp xuống
 * dưới "mặt tầng" và để lại một mép hở phía trên.
 *
 * ⚠ `notch` cắt góc TRÊN-PHẢI, cùng góc với badge trạng thái. Đó là chủ ý: hai
 * kênh chồng lên nhau ở một chỗ mắt đã phải nhìn, thay vì bắt mắt quét hai góc.
 */
export interface GeometryStyle {
  readonly depth: boolean;
  readonly rings: 0 | 1 | 2;
  readonly hatch: boolean;
  readonly sunk: boolean;
  readonly notch: boolean;
  readonly strokeWidth: number;
  /** `null` = nét liền. Chuỗi `stroke-dasharray`. */
  readonly dash: string | null;
  /**
   * `true` = nền lấy từ `statusToken`; `false` = nền `--muted`, chữ
   * `--muted-foreground`.
   *
   * `outline` và `hollow` đi đường thứ hai vì cả hai là trạng thái "chưa/không
   * chạy" — tô chúng bằng màu trạng thái đầy đủ làm chúng tranh chỗ với những
   * node đang thực sự có chuyện xảy ra.
   */
  readonly filled: boolean;
}

export const GEOMETRY_STYLE = {
  solid: {
    depth: true,
    rings: 0,
    hatch: false,
    sunk: false,
    notch: false,
    strokeWidth: 2,
    dash: null,
    filled: true,
  },
  outline: {
    depth: false,
    rings: 0,
    hatch: false,
    sunk: false,
    notch: false,
    strokeWidth: 2,
    dash: null,
    filled: false,
  },
  notched: {
    depth: true,
    rings: 0,
    hatch: false,
    sunk: false,
    notch: true,
    strokeWidth: 2.5,
    dash: null,
    filled: true,
  },
  ringed: {
    depth: true,
    rings: 1,
    hatch: false,
    sunk: false,
    notch: false,
    strokeWidth: 2,
    dash: null,
    filled: true,
  },
  'ringed-double': {
    depth: true,
    rings: 2,
    hatch: false,
    sunk: false,
    notch: false,
    strokeWidth: 2,
    dash: null,
    filled: true,
  },
  hollow: {
    depth: false,
    rings: 0,
    hatch: true,
    sunk: false,
    notch: false,
    strokeWidth: 1.5,
    dash: '6 4',
    filled: false,
  },
  sunken: {
    depth: false,
    rings: 0,
    hatch: false,
    sunk: true,
    notch: false,
    strokeWidth: 2,
    dash: null,
    filled: true,
  },
} as const satisfies Record<NodeGeometry, GeometryStyle>;

/** Toàn bộ thứ một node cần để vẽ, đã gộp ba kênh. */
export interface NodePaint {
  readonly fill: ColorToken;
  readonly text: ColorToken;
  readonly stroke: ColorToken;
  readonly geometry: GeometryStyle;
  readonly motion: NodeMotion;
  readonly icon: string;
  /** Tiếng Việt, một hoặc hai chữ. */
  readonly stateLabel: string;
}

/**
 * Tra ba kênh của một trạng thái ra thứ vẽ được.
 *
 * Nét viền luôn là `--muted-foreground` khi nền không tô màu trạng thái (xem hệ
 * quả #2 ở đầu file), và là chính token trạng thái khi có tô — lúc đó cái viền
 * chỉ làm hộp sắc nét hơn chứ không phải thứ duy nhất vẽ ra nó.
 */
export function paintOf(state: StageRunState): NodePaint {
  const encoding = encodingOf(state);
  const geometry = GEOMETRY_STYLE[encoding.geometry];
  const pair = STATUS_PAIR[encoding.statusToken];
  return {
    fill: geometry.filled ? pair.fill : '--muted',
    text: geometry.filled ? pair.text : '--muted-foreground',
    stroke: geometry.filled ? pair.fill : '--muted-foreground',
    geometry,
    motion: encoding.motion,
    icon: encoding.icon,
    stateLabel: encoding.label,
  };
}

/**
 * Chuyển động THỰC SỰ chạy, sau khi tính `prefers-reduced-motion`.
 *
 * ⛔ `reduced` phải làm mọi thứ về `'none'`, không phải làm chậm lại. AC-D10 đòi
 * "tắt", và "tắt" nghĩa là về một trạng thái TĨNH ĐỌC ĐƯỢC — không phải đóng
 * băng giữa chừng một khung bất kỳ.
 *
 * `fade-dim` trả `'none'` kể cả khi KHÔNG giảm chuyển động, và đó không phải bỏ
 * sót: cái "mờ" của `skipped` là một thuộc tính TĨNH (nền `--muted` + gạch
 * chéo), không phải một hoạt ảnh. Xem khối `opacity` ở đầu file.
 */
export function effectiveMotion(motion: NodeMotion, reduced: boolean): NodeMotion {
  if (reduced) return 'none';
  if (motion === 'fade-dim') return 'none';
  return motion;
}

/** `true` khi chuyển động này LẶP VÔ HẠN — thứ AC-D10 cấm dưới reduced-motion. */
export function isLooping(motion: NodeMotion): boolean {
  return motion === 'spin' || motion === 'pulse-slow';
}

// ═══════════════════════════════════════════════════════════════════════════
// Cạnh
// ═══════════════════════════════════════════════════════════════════════════

export interface EdgePaint {
  readonly stroke: ColorToken;
  readonly width: number;
  readonly dash: string | null;
  readonly label: string;
}

/**
 * Hai loại cạnh, và chúng KHÔNG được trông giống nhau.
 *
 * `DagEdgeView.resourceEdge` nói "thứ giữ cạnh này lại là MÁY CHẠY, không phải
 * phụ thuộc". Vẽ nó như một phụ thuộc là dạy sai: người chơi sẽ đi sửa đồ thị
 * trong khi thứ phải sửa là số máy. Nên nó khác ở HAI kênh — nét ĐỨT (hình học)
 * và mảnh hơn (độ dày) — chứ không chỉ khác màu.
 */
export const DEPENDENCY_EDGE: EdgePaint = {
  stroke: '--muted-foreground',
  width: 2,
  dash: null,
  label: 'phụ thuộc',
};

export const RESOURCE_EDGE: EdgePaint = {
  stroke: '--muted-foreground',
  width: 1.5,
  dash: '9 6',
  label: 'chờ máy chạy',
};

export function edgePaint(resourceEdge: boolean): EdgePaint {
  return resourceEdge ? RESOURCE_EDGE : DEPENDENCY_EDGE;
}

/**
 * Token của ĐƯỜNG GĂNG (D.2.4).
 *
 * `--primary` chứ không phải một trong năm token trạng thái, và đó là quyết
 * định chứ không phải chọn bừa: đường găng KHÔNG phải một trạng thái của node —
 * nó là một tính chất của cả lượt chạy. Dùng lại `--warning` (đang là `queued`)
 * hay `--status-progress` (đang là `running`/`retrying`) làm người chơi đọc một
 * cạnh tô sáng thành "cạnh này đang chờ" / "cạnh này đang chạy".
 *
 * `--primary` đo được 6.09 (sáng) / 6.31 (tối) trên `--background` — vượt ngưỡng
 * 3:1 của đồ hoạ mang nghĩa, và không trùng token nào trong `STATE_ENCODING`.
 */
export const CRITICAL_TOKEN: ColorToken = '--primary';
export const CRITICAL_TEXT_TOKEN: ColorToken = '--primary-foreground';

/** Nét vẽ nền cảnh: dải môi trường, đường kẻ tầng. */
export const SURFACE_TOKEN: ColorToken = '--muted';
export const SURFACE_LINE_TOKEN: ColorToken = '--muted-foreground';
export const FOREGROUND_TOKEN: ColorToken = '--foreground';
export const BACKGROUND_TOKEN: ColorToken = '--background';
export const CARD_TOKEN: ColorToken = '--card';
export const CARD_TEXT_TOKEN: ColorToken = '--card-foreground';

/**
 * Câu tiếng Việt cho `aria-label` của một node.
 *
 * ⛔ KHÔNG dựng câu mới ở đây khi `node.ariaLabel` đã có — hợp đồng đã sinh sẵn
 * một câu, và hai renderer nói hai câu khác nhau về cùng một job là một lỗi a11y
 * không cổng nào bắt được (`git-palette.ts` ghi đúng kết luận này cho game Git).
 * Hàm này chỉ là đường lùi cho một view dựng tay thiếu `ariaLabel`.
 */
export function nodeAriaLabel(node: StageNodeView): string {
  if (node.ariaLabel.length > 0) return node.ariaLabel;
  return `${node.name}, ${STATE_ENCODING[node.state].label}`;
}
