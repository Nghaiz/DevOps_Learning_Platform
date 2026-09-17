/**
 * Mã hoá trạng thái BA KÊNH — bảng dùng chung cho cảnh 2D và cảnh 3D (19.D.1.3).
 *
 * SSOT thiết kế: §4.6 của `2026-09-11-brainstorm-git-cicd-games.md` (bảng Okabe &
 * Ito), phạm vi: `plans/devops-learning-platform/phase-19-d-exec.md` §2.2.
 *
 * ## Vì sao ba kênh chứ không phải màu
 *
 * Khoảng 8% nam giới không phân biệt được đỏ với xanh lá. Một giao diện phân
 * biệt `passed` với `failed` CHỈ bằng màu là giao diện mà nhóm đó không chơi
 * được, và ô nghiệm thu a11y (AC-6) không cho qua. Nên mỗi trạng thái mang ba
 * dấu hiệu độc lập: **màu + hình học + chuyển động**, cộng một icon chữ.
 *
 * Phép thử để biết bảng này còn đúng: **in bảng ra thang xám rồi tắt mọi chuyển
 * động — bảy dòng vẫn phải phân biệt được từng đôi một.** Đó là lý do
 * `pending` và `skipped` dùng CHUNG `status-locked` mà vẫn hợp lệ: chúng khác
 * nhau ở `geometry` (`outline` vs `hollow`) và ở icon.
 *
 * ## Vì sao bảng này giữ luôn `statusToken`
 *
 * §2.2 của kế hoạch ghi cột màu là `--primary` cho `running` và `--muted` cho
 * `skipped`. Hai token đó KHÔNG nằm trong union `StageNodeView['statusToken']`
 * (`success | destructive | warning | status-progress | status-locked`), nên đi
 * theo đúng chữ của kế hoạch sẽ đẻ ra **hai bảng màu song song**: một ở view,
 * một ở đây, và không gì đối chiếu chúng.
 *
 * Nên bảng này là nguồn DUY NHẤT: `scene-view.ts` điền
 * `StageNodeView.statusToken` bằng chính cột dưới đây. Đổi màu một trạng thái là
 * sửa đúng một dòng, và cả hai renderer đổi theo.
 *
 * ⛔ Không có mã màu nào ở file này, chỉ có TÊN token. Màu thật do CSS giữ và
 * renderer đọc qua `getComputedStyle` — cổng `pnpm tokens:check` cấm `#hex`,
 * thang Tailwind và `0xRRGGBB`.
 */

import type { StageNodeView, StageRunState } from './contract.ts';

/**
 * Hình dạng khối. Tên mô tả Ý NGHĨA, không mô tả cách vẽ — 2D và 3D hiện thực
 * khác nhau cho cùng một giá trị.
 *
 * | Giá trị | 2D | 3D |
 * |---|---|---|
 * | `solid` | khối đặc, mặt trên sáng hơn | hộp đặc |
 * | `outline` | chỉ viền, ruột nền | hộp viền mảnh, ruột trong |
 * | `notched` | khối khuyết một góc | hộp khuyết một góc |
 * | `ringed` | khối có vành bao | hộp có vành quanh trục Y |
 * | `ringed-double` | vành kép | vành kép |
 * | `hollow` | gạch chéo | wireframe |
 * | `sunken` | khối chìm dưới mặt tầng | hộp chìm dưới mặt tầng |
 *
 * ⚠ **Theme sáng không phải theme tối đảo ngược.** `hollow` dạng wireframe rỗng
 * gần như biến mất trên nền trắng; ở theme sáng nó phải là "đặc xám nhạt có gạch
 * chéo". Đây là việc của từng renderer, và phải tự mắt kiểm CẢ HAI theme —
 * không ô tự động nào bắt được "nhìn không ra".
 */
export type NodeGeometry =
  | 'solid'
  | 'outline'
  | 'notched'
  | 'ringed'
  | 'ringed-double'
  | 'hollow'
  | 'sunken';

/**
 * Chuyển động. ⛔ Mọi giá trị KHÁC `none` phải tắt sạch khi
 * `prefers-reduced-motion: reduce` (AC-D10) — và "tắt" nghĩa là về trạng thái
 * tĩnh đọc được, không phải đóng băng giữa chừng một khung bất kỳ.
 *
 * `shake-once` cố ý KHÔNG lặp: một cú rung báo "vừa đỏ", còn rung vĩnh viễn là
 * một thứ người chơi phải nhìn suốt phiên và nó thắng mọi thứ khác trên màn hình.
 */
export type NodeMotion = 'none' | 'shake-once' | 'spin' | 'pulse-slow' | 'fade-dim';

export interface StateEncoding {
  /** Kênh 1 — màu. Token ngữ nghĩa, renderer tra sang màu thật. */
  readonly statusToken: StageNodeView['statusToken'];
  /** Kênh 2 — hình học. */
  readonly geometry: NodeGeometry;
  /** Kênh 3 — chuyển động. */
  readonly motion: NodeMotion;
  /** Dấu chữ, đọc được cả khi in thang xám. */
  readonly icon: string;
  /** Tiếng Việt, một hoặc hai chữ. Đi thẳng vào `ariaLabel`. */
  readonly label: string;
}

/**
 * Bảng bảy dòng, một dòng mỗi `StageRunState`.
 *
 * `satisfies Record<StageRunState, StateEncoding>` là cổng: thêm một trạng thái
 * vào `STAGE_RUN_STATES` mà quên bảng này thì **đỏ lúc biên dịch**, không phải
 * một node vẽ ra không màu lúc chạy. `as const` đứng trước để kiểu vẫn hẹp cho
 * bên đọc.
 *
 * ⚠ Kế hoạch §2.2 chỉ liệt kê NĂM dòng (thiếu `pending` và `retrying`). Hai dòng
 * đó không phải phần thêm cho vui: `pending` là trạng thái của MỌI node trước
 * lượt chạy đầu tiên — tức thứ người chơi nhìn thấy khi vừa mở level — và
 * `retrying` là thứ bài C10 dạy.
 */
export const STATE_ENCODING = {
  /** Chưa tới lượt: phụ thuộc chưa xong. Cũng là trạng thái trước lượt chạy đầu. */
  pending: {
    statusToken: 'status-locked',
    geometry: 'outline',
    motion: 'none',
    icon: '○',
    label: 'chưa chạy',
  },
  /** Phụ thuộc xong rồi nhưng không còn máy. Chìm xuống = đang bị giữ lại. */
  queued: {
    statusToken: 'warning',
    geometry: 'sunken',
    motion: 'pulse-slow',
    icon: '⏸',
    label: 'đang xếp hàng',
  },
  running: {
    statusToken: 'status-progress',
    geometry: 'ringed',
    motion: 'spin',
    icon: '◐',
    label: 'đang chạy',
  },
  /**
   * Lần thử thứ hai trở đi. Vành KÉP để phân biệt với `running` khi đã tắt
   * chuyển động — hai trạng thái này dùng chung màu, nên hình học phải gánh.
   */
  retrying: {
    statusToken: 'status-progress',
    geometry: 'ringed-double',
    motion: 'spin',
    icon: '↻',
    label: 'đang thử lại',
  },
  passed: {
    statusToken: 'success',
    geometry: 'solid',
    motion: 'none',
    icon: '✓',
    label: 'đã xong',
  },
  failed: {
    statusToken: 'destructive',
    geometry: 'notched',
    motion: 'shake-once',
    icon: '✕',
    label: 'đỏ',
  },
  /** Không chạy vì một phụ thuộc `blocking` đã đỏ. */
  skipped: {
    statusToken: 'status-locked',
    geometry: 'hollow',
    motion: 'fade-dim',
    icon: '⊘',
    label: 'bị bỏ qua',
  },
} as const satisfies Record<StageRunState, StateEncoding>;

/** Tra bảng. Tồn tại để bên gọi không phải nhớ rằng `STATE_ENCODING` là một object. */
export function encodingOf(state: StageRunState): StateEncoding {
  return STATE_ENCODING[state];
}
