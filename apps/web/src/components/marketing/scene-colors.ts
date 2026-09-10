import { createCanvasColorResolver, type Rgb } from '../k8s-arena/shared/scene-tokens';

/**
 * Màu của cảnh trang chủ, đọc từ design token. Không một giá trị màu nào viết
 * thẳng ở đây.
 *
 * ## Vì sao IMPORT bộ phân giải của arena thay vì chép lại
 *
 * `k8s-arena/shared/scene-tokens.ts` đã giải xong đúng bài toán này và ghi lại
 * hai cái bẫy mà một bản viết lại gần như chắc chắn dẫm phải:
 *
 * 1. `getPropertyValue('--primary')` KHÔNG phân giải thành màu, nó trả lại đúng
 *    chuỗi `oklch(...)` đã khai, và `THREE.Color.setStyle` không hiểu `oklch()`.
 *    Nó cảnh báo rồi giữ màu cũ, nên cả cảnh ra trắng mà không có lỗi nào.
 * 2. Ngay cả `getComputedStyle(el).color` cũng không chắc trả `rgb()`: theo CSS
 *    Color 4, màu khai bằng `oklch()` được serialize lại trong chính không gian
 *    đó. Đường duy nhất đúng với mọi cú pháp màu là vẽ lên canvas 1x1 rồi đọc
 *    BYTE ra.
 *
 * Chép 60 dòng đó sang đây là dựng một bản sao của phần dễ sai nhất, và bản sao
 * sẽ trôi. `createCanvasColorResolver` là hàm THUẦN, chỉ nhận một `Document`,
 * không mang ngữ nghĩa nào của arena và không kéo runtime nào của
 * `@devops-platform/games` (khoá `StatusToken` bên đó là `import type`, bị xoá
 * lúc biên dịch).
 *
 * ⚠ Đây là một phụ thuộc đi qua ranh giới mà P16 cố ý vẽ: `k8s-arena/**` nằm
 * NGOÀI phạm vi chặng này. Chấp nhận vì module đó đóng băng suốt chặng, và cái
 * giá của lựa chọn kia (một bản sao im lặng sai màu) cao hơn. Đã ghi vào report
 * lane 16.E mục "quyết định đáng tranh luận". Không import gì khác từ arena.
 *
 * ## Bảng token của trang chủ là bảng RIÊNG
 *
 * `SCENE_TOKEN_VARS` bên arena khoá theo `ObjectView['statusToken']` và chở 26
 * `ResourceKind`. Trang chủ không có tài nguyên Kubernetes nào để tô màu; nó cần
 * đúng bảy token. Dùng lại bảng kia sẽ đọc 26 lượt `getComputedStyle` cho 19
 * giá trị không ai dùng, và buộc trang chủ phụ thuộc vào hợp đồng dữ liệu của
 * một trò chơi.
 */

export type { Rgb };

/**
 * Bảy token, và vai trò của từng cái trong cảnh.
 *
 * Cả bảy đều là token NGỮ NGHĨA, nên cảnh tự đổi theo nhánh sáng/tối mà không
 * có một dòng điều kiện nào. `--brand-emblem` cố ý KHÔNG có mặt: §1.5 của hợp
 * đồng token cấm nó làm màu giao diện, và một vòng ellipse 3D là giao diện chứ
 * không phải một lượt tái hiện logo.
 */
export const HOME_SCENE_TOKEN_VARS = {
  /** Nền cảnh và sương mù. Bằng nền trang nên canvas không lộ mép. */
  background: '--background',
  /** Vòng ellipse lúc chưa đi qua. */
  track: '--border',
  /** Khối hình của các chặng chưa tới. */
  idle: '--muted-foreground',
  /** Khối hình của chặng đang được nói tới. */
  active: '--foreground',
  /** Phần vòng đã đi qua, và gói tin đang chạy. */
  flow: '--primary',
  /** Pod vừa được cụm dựng lại ở chặng sáu. */
  healthy: '--success',
  /** Pod chết ở chặng sáu. */
  failed: '--destructive',
} as const satisfies Record<string, string>;

export type HomeSceneTokenName = keyof typeof HOME_SCENE_TOKEN_VARS;

export const HOME_SCENE_TOKEN_NAMES = Object.keys(
  HOME_SCENE_TOKEN_VARS,
) as readonly HomeSceneTokenName[];

export type HomeSceneColors = Readonly<Record<HomeSceneTokenName, Rgb>>;

/**
 * Xám trung tính khi không phân giải được.
 *
 * Không phải hex (cổng màu trần cấm) và cố ý không phải đen: đen trên nền tối là
 * vô hình, mà vô hình đọc ra thành cảnh hỏng. Xám thì nhìn là biết có gì sai.
 */
const FALLBACK: Rgb = { r: 0.5, g: 0.5, b: 0.5 };

export interface HomeSceneColorsResult {
  readonly colors: HomeSceneColors;
  /**
   * `true` khi ít nhất một token rơi về màu dự phòng.
   *
   * Trả ra chứ không nuốt. Nơi gọi ghi `console.warn` một lần: cảnh trang chủ
   * là trang trí, nên một dòng cảnh báo cho người vận hành là đủ, không dựng
   * thêm chữ cho người đọc về một thứ họ không điều khiển được.
   */
  readonly degraded: boolean;
}

/**
 * Đọc bảy màu qua một phần tử dò đặt TRONG cây DOM đang mang theme.
 *
 * `probe` phải nằm dưới `<html>` (nơi lớp `.dark` được gắn). Đặt nó ngoài
 * document thì nó thừa hưởng nhánh sáng và đổi theme sẽ không đổi màu cảnh.
 */
export function readHomeSceneColors(
  probe: HTMLElement,
  getComputedColor: (el: HTMLElement) => string,
  resolve: (css: string) => Rgb | null,
): HomeSceneColorsResult {
  const colors: Record<string, Rgb> = {};
  let degraded = false;

  for (const name of HOME_SCENE_TOKEN_NAMES) {
    let value: Rgb | null;
    try {
      probe.style.color = `var(${HOME_SCENE_TOKEN_VARS[name]})`;
      value = resolve(getComputedColor(probe));
    } catch {
      value = null;
    }
    if (value === null) {
      degraded = true;
      value = FALLBACK;
    }
    colors[name] = value;
  }

  return { colors: colors as HomeSceneColors, degraded };
}

/** Bảng dự phòng đồng nhất, cho khung đầu tiên trước khi có DOM để dò. */
export function fallbackHomeSceneColors(): HomeSceneColors {
  const colors: Record<string, Rgb> = {};
  for (const name of HOME_SCENE_TOKEN_NAMES) {
    colors[name] = FALLBACK;
  }
  return colors as HomeSceneColors;
}

/**
 * Dựng bảng màu từ một document thật. Trả bảng dự phòng khi chưa có DOM.
 *
 * Phần tử dò được gắn vào `body` rồi gỡ ngay trong cùng một lượt đồng bộ. Nó
 * `aria-hidden` và không chiếm chỗ, nên không lọt vào cây trợ năng lẫn bố cục.
 */
export function readHomeSceneColorsFrom(doc: Document | undefined): HomeSceneColorsResult {
  if (doc === undefined) {
    return { colors: fallbackHomeSceneColors(), degraded: true };
  }

  const probe = doc.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.position = 'absolute';
  probe.style.width = '0';
  probe.style.height = '0';
  probe.style.overflow = 'hidden';
  doc.body.appendChild(probe);

  try {
    return readHomeSceneColors(
      probe,
      (el) => doc.defaultView?.getComputedStyle(el).color ?? '',
      createCanvasColorResolver(doc),
    );
  } finally {
    probe.remove();
  }
}
