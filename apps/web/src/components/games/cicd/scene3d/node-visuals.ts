/**
 * `STATE_ENCODING` → cách vẽ một node 3D. Toán thuần, không `three` (19.D.3.3/6).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO GOM THEO "KIỂU THÂN" CHỨ KHÔNG THEO `NodeGeometry`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bảy giá trị `NodeGeometry` mô tả Ý NGHĨA. Nhưng thứ quyết định số lệnh vẽ là
 * cặp (hình học, vật liệu): hai node chỉ khác nhau ở chỗ "có vành hay không" vẫn
 * dùng chung một khối hộp và một vật liệu, nên chúng vẽ được trong CÙNG một
 * `InstancedMesh`. Vành là một lô riêng.
 *
 * Gom lại còn **năm** kiểu thân, nên phần thân của cả cảnh tốn tối đa 5 lệnh vẽ
 * bất kể có 8 hay 80 node — đó là điều kiện để ô AC-D4 (dưới 100 lệnh vẽ) không
 * phụ thuộc vào độ lớn của level.
 *
 * ## ⚠ `InstancedMesh` ở đây CHƯA được đo trên trình duyệt
 *
 * Kế hoạch D.3.3 dặn đo trước, vì issue mở `mrdoob/three.js#30352` cho thấy
 * `InstancedMesh` chậm hơn `Mesh` dùng shared attributes ở vài cấu hình. Lane
 * này **không chạy được phép đo đó** (không có e2e trong phạm vi, và một phép đo
 * fps cần trình duyệt thật). Nên nói thẳng: lựa chọn dưới đây KHÔNG dựa trên một
 * phép đo fps, nó dựa trên đại lượng mà ô nghiệm thu thật sự đo — **số lệnh
 * vẽ**. Ở đó `InstancedMesh` thắng tuyệt đối và không cần đo: 5 lệnh thay vì một
 * lệnh mỗi node.
 *
 * Phép đo fps vẫn nên làm, và `frame-pump-3d.tsx` mở sẵn cửa sổ
 * `globalThis.__dlpCicdScene` để làm nó. Chừng nào chưa ai chạy, đừng viết ở đâu
 * rằng "đã đo".
 */

import type { NodeGeometry, NodeMotion, StageRunState } from '@devops-platform/games';
import { STATE_ENCODING } from '@devops-platform/games';

import type { Rgb } from '../../shared/scene-tokens';

/**
 * Kiểu thân — một lô `InstancedMesh` cho mỗi giá trị.
 *
 * | Kiểu | Hình | Vật liệu |
 * |---|---|---|
 * | `solid` | hộp đặc | chuẩn, đục |
 * | `frame` | 12 thanh mảnh tạo thành khung hộp | chuẩn, đục |
 * | `notched` | hộp khuyết một góc | chuẩn, đục |
 * | `ghost` | hộp | khung dây (nền tối) hoặc đục mờ (nền sáng) |
 * | `sunken` | hộp lùn, đặt chìm dưới mặt tầng | chuẩn, đục |
 */
export type BodyStyle = 'solid' | 'frame' | 'notched' | 'ghost' | 'sunken';

/** Thứ tự cố định — bên dựng lô lặp theo mảng này để số lô không đổi giữa các khung. */
export const BODY_STYLES: readonly BodyStyle[] = ['solid', 'frame', 'notched', 'ghost', 'sunken'];

const BODY_OF: Readonly<Record<NodeGeometry, BodyStyle>> = {
  solid: 'solid',
  outline: 'frame',
  notched: 'notched',
  // Vành là một lô RIÊNG; thân của `ringed`/`ringed-double` y hệt `solid`.
  ringed: 'solid',
  'ringed-double': 'solid',
  hollow: 'ghost',
  sunken: 'sunken',
};

export function bodyStyleOf(geometry: NodeGeometry): BodyStyle {
  return BODY_OF[geometry];
}

const RINGS_OF: Readonly<Record<NodeGeometry, 0 | 1 | 2>> = {
  solid: 0,
  outline: 0,
  notched: 0,
  ringed: 1,
  /*
   * Vành KÉP là thứ phân biệt `retrying` với `running` khi đã tắt chuyển động —
   * hai trạng thái đó dùng chung màu VÀ chung chuyển động `spin`, nên nếu hình
   * học không gánh thì người bật "giảm chuyển động" mất hẳn một trạng thái.
   */
  'ringed-double': 2,
  hollow: 0,
  sunken: 0,
};

export function ringCountOf(geometry: NodeGeometry): 0 | 1 | 2 {
  return RINGS_OF[geometry];
}

/** Node ở trạng thái này thì thêm một lớp vỏ phát sáng (một lô, một lệnh vẽ). */
export function hasGlowShell(state: StageRunState): boolean {
  return state === 'running' || state === 'retrying';
}

/**
 * Độ chìm của kiểu `sunken`, theo nửa chiều cao khối.
 *
 * `1` nghĩa là mặt trên của khối nằm ngang mặt tầng: nhìn ra ngay là "bị giữ
 * lại", và vẫn còn đủ mặt để bắt được màu.
 */
export const SUNKEN_DROP = 1;

/** Hệ số chiều cao của khối `sunken` — lùn hơn để cái chìm đọc ra là chìm. */
export const SUNKEN_HEIGHT = 0.55;

/**
 * Nền có phải nền tối không, suy từ chính màu token `--background` đã đọc được.
 *
 * ⚠ Đây là chỗ giải bài "theme sáng KHÔNG phải theme tối đảo ngược"
 * (`scene-encoding.ts`): khung dây rỗng cho `skipped` gần như biến mất trên nền
 * trắng. Cảnh 3D không hỏi `document.documentElement.classList.contains('dark')`
 * — bảng màu đã đọc qua `getComputedStyle` nên nó BIẾT nền đang là gì, và hỏi
 * lớp CSS là dựng một nguồn sự thật thứ hai sẽ trôi khỏi cái thứ nhất.
 *
 * Hệ số lấy theo độ sáng cảm nhận (Rec. 709), không phải trung bình ba kênh:
 * mắt người nhạy với lục hơn lam khoảng sáu lần, nên trung bình cộng đọc một nền
 * xanh lam đậm thành "sáng".
 */
export function isDarkBackground(background: Rgb): boolean {
  const luma = 0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b;
  return Number.isFinite(luma) ? luma < 0.5 : true;
}

/** Độ mạnh viền sáng (fresnel) của một node: đang chọn > đang rê > không. */
export const RIM_SELECTED = 1;
export const RIM_HOVERED = 0.45;

export function rimStrength(
  id: string,
  selectedId: string | null,
  hoveredId: string | null,
): number {
  if (id === selectedId) {
    return RIM_SELECTED;
  }
  return id === hoveredId ? RIM_HOVERED : 0;
}

/**
 * Chuyển động THẬT SỰ được chạy của một trạng thái.
 *
 * ⛔ AC-D10: bật `prefers-reduced-motion: reduce` thì mọi giá trị khác `none`
 * phải tắt — và "tắt" nghĩa là về một trạng thái tĩnh ĐỌC ĐƯỢC, không phải đóng
 * băng giữa chừng một khung bất kỳ. Ở đây tắt hẳn về `none`, và ba kênh mã hoá
 * còn lại (màu + hình học + icon) gánh phần thông tin — đó chính là lý do bảng
 * mã hoá có ba kênh chứ không một.
 */
export function motionOf(state: StageRunState, reducedMotion: boolean): NodeMotion {
  return reducedMotion ? 'none' : STATE_ENCODING[state].motion;
}

/**
 * Chuyển động này có LẶP VÔ HẠN không.
 *
 * Đây là câu hỏi mà vòng lặp vẽ-theo-yêu-cầu cần: chỉ chuyển động lặp mới buộc
 * phải xin khung hình mãi. `shake-once` chạy một lần rồi thôi, nên nó KHÔNG nằm
 * ở đây — nếu tính nhầm nó vào thì cảnh vẽ 60fps vĩnh viễn sau lượt chạy đầu
 * tiên có node đỏ, và đó đúng là cái bẫy `idleSpinAfterMs` đã gài một lần.
 */
export function isLoopingMotion(motion: NodeMotion): boolean {
  return motion === 'spin' || motion === 'pulse-slow';
}

/**
 * Cảnh có cần khung hình LIÊN TỤC không.
 *
 * Trả `false` là điều kiện để `frameloop="demand"` thật sự dừng — ô e2e "0 khung
 * hình khi tĩnh" đo đúng chỗ này.
 */
export function needsContinuousFrames(
  states: readonly StageRunState[],
  reducedMotion: boolean,
): boolean {
  if (reducedMotion) {
    return false;
  }
  for (const state of states) {
    if (isLoopingMotion(STATE_ENCODING[state].motion)) {
      return true;
    }
  }
  return false;
}

/** Độ mờ của node `skipped` — §2.2 chốt 35%. */
export const SKIPPED_OPACITY = 0.35;
