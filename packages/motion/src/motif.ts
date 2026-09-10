/**
 * §8 — motif ellipse. MỘT hình dùng chung cho cả hệ, không phải hai hình vẽ
 * riêng ở trang chủ và ở khoang lab rồi lệch nhau ở lần sửa thứ hai.
 *
 * Logo PTIT có một vòng ellipse **hở** quét quanh chữ PTIT. Vòng lặp CI/CD là
 * biểu tượng phổ quát của DevOps. Lõi của Kubernetes — mà chính bài học của dự
 * án gọi tên ở `packages/games/src/k8s/levels/l06.ts:68` — là reconciliation
 * loop. Cùng một hình, cùng một ý.
 *
 * File này là HÌNH HỌC THUẦN: không import React, không đụng DOM, không đọc
 * đồng hồ. Mọi hàm khẳng định được bằng một bảng vào/ra (cùng lối viết với
 * `apps/web/src/components/session/workspace-tabs.ts`).
 *
 * ## Quy ước góc — đọc trước khi đổi bất cứ hằng số nào dưới đây
 *
 * §8.1 nói ba điều phải cùng đúng: `--arc-tilt` = `-22deg`, `--arc-start` đo
 * **ngược chiều kim đồng hồ** từ trục `+x` **trong hệ đã nghiêng**, và khe hở
 * nằm ở **phía trên bên phải**. Chỉ đúng MỘT cách đọc thoả cả ba:
 *
 * 1. góc đo theo quy ước TOÁN HỌC (ngược kim đồng hồ, `y` hướng LÊN);
 * 2. nghiêng cũng áp trong hệ toán học đó (quay `-22°` ngược kim đồng hồ, tức
 *    22° THEO kim đồng hồ);
 * 3. lật `y` một lần duy nhất ở bước cuối, khi đổi sang toạ độ SVG (`y` hướng
 *    XUỐNG).
 *
 * Kiểm: tâm khe hở ở `θ = 90°`. Theo cách đọc trên nó rơi vào `(61.24, 22.18)`
 * — bên PHẢI tâm và BÊN TRÊN. Đổi dấu nghiêng thì nó sang trái, tức trái §8.1.
 * `motif.test.ts` khẳng định đúng bất đẳng thức đó, nên đây là một quyết định
 * có cổng gác chứ không phải một chú thích.
 *
 * ⚠ Hệ quả gây bất ngờ: `x-axis-rotation` trong lệnh `A` của SVG là **+22**,
 * không phải `-22`. SVG đo góc THEO kim đồng hồ (vì `y` hướng xuống), nên quay
 * `-22°` toán học ≡ quay `+22°` SVG. Token vẫn là `-22deg`; phép đổi dấu nằm ở
 * đúng một chỗ (`SVG_X_AXIS_ROTATION_DEG`) và có tên.
 *
 * ## Không có `transform` trên phần tử cung
 *
 * Nghiêng được nướng thẳng vào toạ độ của `d`. Một `transform="rotate(...)"`
 * đứng ngoài thì bất kỳ ai cũng ghi đè được bằng một class Tailwind
 * (`rotate-*`), và khi đó hình học không còn là thứ file này bảo đảm nữa — nó
 * hỏng im lặng, cung vẫn vẽ, chỉ là khe hở nằm sai chỗ.
 */

import type { CSSProperties } from 'react';

// ── §8.1 Hình học, trong hệ toạ độ chuẩn hoá ─────────────────────────────────

/** Mọi cung vẽ trong hệ này. Tiêu thụ đặt thẳng vào thuộc tính `viewBox`. */
export const ARC_VIEWBOX = '0 0 100 100';
export const ARC_CENTER = 50;

/** `--arc-rx` — bán trục ngang. */
export const ARC_RX = 42;
/**
 * `--arc-ry` — bán trục dọc. **Ellipse, không phải tròn**: tỉ lệ 42/30 = 1.4 là
 * thứ làm nó đọc ra là logo chứ không phải một spinner bất kỳ.
 */
export const ARC_RY = 30;
/** `--arc-tilt` — nghiêng trục lớn, khớp nét quét chéo của logo. Quy ước toán học. */
export const ARC_TILT_DEG = -22;
/** `--arc-start` — góc bắt đầu, trong hệ đã nghiêng. */
export const ARC_START_DEG = 120;
/** `--arc-sweep` — tổng góc quét. */
export const ARC_SWEEP_DEG = 300;
/** `--arc-gap` — khe hở. Đây là thứ làm vòng **hở**; khép nó lại là bỏ motif. */
export const ARC_GAP_DEG = 360 - ARC_SWEEP_DEG;

/** Góc kết thúc: `120° → 420°`, nên khe hở nằm ở nêm `60°..120°`. */
export const ARC_END_DEG = ARC_START_DEG + ARC_SWEEP_DEG;

// ── §8.2 Nét ─────────────────────────────────────────────────────────────────

/** Cung nhỏ ở góc thẻ danh mục, chấm chỉ mục. */
export const ARC_STROKE_HAIRLINE = 2;
/** Mặc định: thanh tiến độ, trạng thái tải, trạng thái rỗng. */
export const ARC_STROKE = 4;
/** Cung nhiệm vụ trong khoang lab, cung hero. */
export const ARC_STROKE_HEAVY = 6;

// ── §7 Chuyển động của cung ──────────────────────────────────────────────────

/**
 * §8.4 — cung chạy bằng **CSS transition**, KHÔNG bằng `requestAnimationFrame`.
 *
 * Khối `prefers-reduced-motion` trong `globals.css` phủ `transition-duration`
 * bằng `!important`, nên đẩy cung sang CSS làm nó tự động tuân thủ mà không cần
 * thêm cổng nào. Một cung chạy bằng rAF sẽ *trông như* tuân thủ trong khi nó
 * vẫn quay.
 *
 * ⛔ Không thêm `!important` vào đây. `!important` của tác giả thắng
 * `!important` của khối `@media` trong CÙNG một origin khi độ đặc hiệu cao hơn,
 * và một khai báo inline thì luôn đặc hiệu hơn một bộ chọn phổ quát — tức là
 * cung sẽ **thoát** khỏi cổng reduced-motion. `motif.test.ts` gác điều này.
 */
export const ARC_TRANSITION = 'stroke-dashoffset var(--motion-slow) var(--ease-out)';

/**
 * §8.3 — biểu thức `stroke-dashoffset`, chép đúng dạng hợp đồng quy định.
 *
 * `--p` được đặt trên CHÍNH phần tử cung, nên một lần render React đổi `--p` là
 * đủ để `stroke-dashoffset` tính lại và transition chạy.
 */
export const ARC_DASH_OFFSET_EXPRESSION = 'calc(1 - var(--p))';

/**
 * §8.3 trạng thái tải — cung tự vẽ ra rồi tự thu lại, `--motion-slow` mỗi
 * chiều, lặp vô hạn. `alternate` là chiều "thu lại"; viết hai nửa keyframe
 * bằng tay sẽ ra cùng kết quả với gấp đôi chỗ để lệch.
 *
 * ⚠ Khối `@keyframes` KHÔNG khai được inline. Chủ sở hữu stylesheet phải dán
 * `ARC_SPIN_KEYFRAMES_CSS` vào đúng một lần; `packages/motion` không sở hữu
 * file CSS nào nên nó chỉ cấp chuỗi.
 */
export const ARC_SPIN_ANIMATION_NAME = 'dlp-arc-sweep';
export const ARC_SPIN_KEYFRAMES_CSS = `@keyframes ${ARC_SPIN_ANIMATION_NAME}{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}`;
export const ARC_SPIN_ANIMATION = `${ARC_SPIN_ANIMATION_NAME} var(--motion-slow) var(--ease-out) infinite alternate`;

// ── Hình học thuần ───────────────────────────────────────────────────────────

export interface ArcPoint {
  readonly x: number;
  readonly y: number;
}

const DEG_TO_RAD = Math.PI / 180;
const TILT_COS = Math.cos(ARC_TILT_DEG * DEG_TO_RAD);
const TILT_SIN = Math.sin(ARC_TILT_DEG * DEG_TO_RAD);

/**
 * Điểm trên cung ở góc `angleDeg`, trả về trong toạ độ `viewBox` (y hướng
 * xuống). Xem khối quy ước góc ở đầu file.
 */
export function arcPointAt(angleDeg: number): ArcPoint {
  const t = angleDeg * DEG_TO_RAD;
  const localX = ARC_RX * Math.cos(t);
  const localY = ARC_RY * Math.sin(t);
  // Quay `ARC_TILT_DEG` ngược kim đồng hồ trong hệ toán học.
  const tiltedX = localX * TILT_COS - localY * TILT_SIN;
  const tiltedY = localX * TILT_SIN + localY * TILT_COS;
  // Lật `y` một lần duy nhất, ở đây, khi sang toạ độ SVG.
  return { x: ARC_CENTER + tiltedX, y: ARC_CENTER - tiltedY };
}

/**
 * Kẹp tiến độ về `[0, 1]`. `NaN` ⇒ **0**, không phải 1.
 *
 * §8.3 chỉ khai `p ∈ [0, 1]` nên hành vi ngoài miền là quyết định của file này,
 * và nó không đối xứng có chủ ý: một tiến độ KHÔNG BIẾT không được phép đọc ra
 * là ĐÃ XONG. Cùng lớp lỗi với `clampTerminalPercent`: `NaN` lan qua
 * `Math.min`/`Math.max`, `stroke-dashoffset: NaN` là khai báo CSS không hợp lệ,
 * trình duyệt bỏ qua nó trong im lặng, và giá trị còn lại là mặc định `0` — tức
 * cung vẽ ĐẦY. Một phép chia cho tổng-số-bước bằng 0 sẽ hiển thị "hoàn thành".
 */
export function clampProgress(p: number): number {
  if (!Number.isFinite(p)) {
    return 0;
  }
  return Math.min(1, Math.max(0, p));
}

/** §8.3 — `θ(p) = --arc-start + p × --arc-sweep`. */
export function sweepAngleAt(p: number): number {
  return ARC_START_DEG + clampProgress(p) * ARC_SWEEP_DEG;
}

/**
 * §8.3 — `stroke-dashoffset` cho một `p`. `1` ⇒ không vẽ gì, `0` ⇒ cung khép
 * tới mép xa của khe hở.
 *
 * Chỗ tiêu thụ nào không dùng được biến CSS `--p` thì đặt thẳng số này vào
 * `strokeDashoffset`; kết quả nhìn thấy y hệt.
 */
export function dashOffsetAt(p: number): number {
  return 1 - clampProgress(p);
}

/**
 * Cờ `large-arc-flag` và `sweep-flag` của lệnh `A`.
 *
 * `sweep-flag = 0` vì góc tăng theo quy ước toán học là ngược kim đồng hồ, mà
 * `sweep-flag = 1` của SVG lại là THEO kim đồng hồ (hệ `y` hướng xuống).
 */
const ARC_LARGE_ARC_FLAG = ARC_SWEEP_DEG > 180 ? 1 : 0;
const ARC_SWEEP_FLAG = 0;
/** Xem ⚠ ở đầu file: SVG đo góc theo kim đồng hồ nên phải đổi dấu. */
export const SVG_X_AXIS_ROTATION_DEG = -ARC_TILT_DEG;

const PATH_PRECISION = 3;

function fmt(n: number): string {
  return String(Number(n.toFixed(PATH_PRECISION)));
}

/**
 * `d` của cung ĐẦY (300°). **Không phụ thuộc `p`** — và đó là điểm mấu chốt,
 * không phải một sự tiện tay: thuộc tính `d` không transition được, nên nếu
 * tiến độ nằm trong `d` thì §8.4 không thi công được và cung buộc phải chạy
 * bằng rAF. Tiến độ đi qua `stroke-dashoffset`, chỉ vậy.
 */
export const ARC_PATH_D = ((): string => {
  const from = arcPointAt(ARC_START_DEG);
  const to = arcPointAt(ARC_END_DEG);
  return [
    'M',
    fmt(from.x),
    fmt(from.y),
    'A',
    ARC_RX,
    ARC_RY,
    SVG_X_AXIS_ROTATION_DEG,
    ARC_LARGE_ARC_FLAG,
    ARC_SWEEP_FLAG,
    fmt(to.x),
    fmt(to.y),
  ].join(' ');
})();

// ── Thuộc tính phần tử (§8.2, §8.5) ──────────────────────────────────────────

/**
 * Nền chung của mọi cung.
 *
 * `vectorEffect: 'non-scaling-stroke'` **không phải trang trí**. Ellipse có tỉ
 * lệ trục 1.4, và bất kỳ phép co giãn không đều nào của container cũng làm bề
 * dày nét BIẾN THIÊN dọc theo cung nếu thiếu cờ này. Nó hỏng im lặng: cung vẫn
 * vẽ, chỉ là chỗ dày chỗ mỏng.
 */
export interface ArcStrokeProps {
  readonly d: string;
  readonly fill: 'none';
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeLinecap: 'round';
  readonly vectorEffect: 'non-scaling-stroke';
}

export type ArcTrackProps = ArcStrokeProps;

export type ArcProgressStyle = CSSProperties & {
  readonly '--p': string;
  readonly strokeDashoffset: string;
  readonly transition?: string;
};

export interface ArcProgressProps extends ArcStrokeProps {
  readonly pathLength: 1;
  readonly strokeDasharray: 1;
  readonly style: ArcProgressStyle;
}

export type ArcSpinnerStyle = CSSProperties & { readonly animation: string };

export interface ArcSpinnerProps extends ArcStrokeProps {
  readonly pathLength: 1;
  readonly strokeDasharray: 1;
  readonly style: ArcSpinnerStyle;
}

/**
 * §8.5 — vai trò của RÃNH (phần cung chưa đi qua) quyết định màu của nó.
 *
 * `'control'` khi bản thân cung là một control đọc được (`role="progressbar"`):
 * lúc đó SC 1.4.11 áp vào nó và ngưỡng 3:1 là bắt buộc, nên rãnh dùng
 * `--input` (đo được 3.50 sáng / 3.49 tối). `'decorative'` dùng `--border`
 * (1.30) — đúng với miễn trừ tường minh của SC 1.4.11 cho ranh giới trang trí.
 */
export type ArcTrackRole = 'decorative' | 'control';

export interface ArcTrackOptions {
  readonly role?: ArcTrackRole;
  readonly width?: number;
}

export function arcTrackProps(options: ArcTrackOptions = {}): ArcTrackProps {
  const { role = 'decorative', width = ARC_STROKE } = options;
  return {
    d: ARC_PATH_D,
    fill: 'none',
    stroke: role === 'control' ? 'var(--input)' : 'var(--border)',
    strokeWidth: width,
    strokeLinecap: 'round',
    vectorEffect: 'non-scaling-stroke',
  };
}

export interface ArcProgressOptions {
  /** Tiến độ `0..1`. Ngoài miền bị kẹp; `NaN` ⇒ 0 (xem `clampProgress`). */
  readonly p: number;
  readonly width?: number;
  /** Tắt transition cho lượt vẽ ĐẦU TIÊN, để cung không chạy từ 0 lúc mở trang. */
  readonly transition?: boolean;
}

/**
 * §8.3 + §8.5 — thuộc tính của phần cung ĐÃ đi qua.
 *
 * `stroke: currentColor` chứ không một token màu: chỗ gọi quyết định màu bằng
 * `text-*`, nên cung thừa hưởng đúng ngữ nghĩa của bề mặt nó nằm trên và danh
 * sách token ở §1 giữ được trạng thái đóng.
 *
 * `pathLength={1}` là đường DUY NHẤT. Chu vi một ellipse không có công thức sơ
 * cấp (nó là tích phân elliptic; mọi thứ đang lưu hành là xấp xỉ kiểu
 * Ramanujan), nên một lane tự tính `2πr` sẽ ra sai số phụ thuộc tỉ lệ trục và
 * `p = 1` không khép đúng vào mép khe hở — lệch vài phần trăm, đủ để nhìn thấy
 * nhưng không đủ để ai gọi tên. `pathLength={1}` bắt trình duyệt tự chuẩn hoá
 * độ dài thật về đúng `1`.
 */
export function arcProgressProps(options: ArcProgressOptions): ArcProgressProps {
  const { p, width = ARC_STROKE, transition = true } = options;
  const base = {
    '--p': String(clampProgress(p)),
    strokeDashoffset: ARC_DASH_OFFSET_EXPRESSION,
  } as const;
  return {
    d: ARC_PATH_D,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: width,
    strokeLinecap: 'round',
    vectorEffect: 'non-scaling-stroke',
    pathLength: 1,
    strokeDasharray: 1,
    style: transition ? { ...base, transition: ARC_TRANSITION } : base,
  };
}

export interface ArcSpinnerOptions {
  readonly width?: number;
}

/**
 * §8.3 trạng thái tải. Chỗ gọi phải bảo đảm `ARC_SPIN_KEYFRAMES_CSS` đã có
 * trong stylesheet, nếu không thuộc tính `animation` trỏ vào một tên không tồn
 * tại — trình duyệt bỏ qua trong im lặng và cung đứng yên ở dạng ĐẦY.
 *
 * Ở chế độ giảm chuyển động, `animation-duration: 0.01ms !important` +
 * `animation-iteration-count: 1 !important` của `globals.css` biến nó thành một
 * vòng tĩnh vẽ đầy — đúng ý, và không cần cổng JS nào.
 */
export function arcSpinnerProps(options: ArcSpinnerOptions = {}): ArcSpinnerProps {
  const { width = ARC_STROKE } = options;
  return {
    d: ARC_PATH_D,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: width,
    strokeLinecap: 'round',
    vectorEffect: 'non-scaling-stroke',
    pathLength: 1,
    strokeDasharray: 1,
    style: { animation: ARC_SPIN_ANIMATION },
  };
}
