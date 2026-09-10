import {
  ARC_START_DEG,
  ARC_SWEEP_DEG,
  ARC_CENTER,
  arcPointAt,
  clampProgress,
} from '@devops-platform/motion/motif';
import type { TextKey } from '@devops-platform/copy';

/**
 * Bảy chặng của vòng CI/CD, và hình học đặt chúng lên cung ellipse.
 *
 * NGUỒN DUY NHẤT cho cả hai bản dựng: danh sách thẻ mà server render (thứ máy
 * tìm kiếm đọc, và thứ duy nhất còn lại khi máy không có WebGL2) và cảnh 3D
 * chồng lên trên. Hai bản đó phải cùng thứ tự và cùng số lượng, nên chúng đọc
 * chung một mảng thay vì mỗi bên tự khai.
 *
 * ⛔ Không `'use client'`, và cố ý: file này được import từ CẢ Server Component
 * (danh sách thẻ) LẪN chunk 3D chỉ chạy phía client. Một chỉ thị `'use client'`
 * ở đây sẽ kéo cả bảng chặng sang bundle trình duyệt kể cả trên máy không bao
 * giờ dựng canvas.
 *
 * ## Toạ độ đến từ `packages/motion/motif`, không phải một hình học thứ hai
 *
 * Design §3 nói cả hệ dùng MỘT hình: vòng ellipse hở của logo PTIT. Cung đó đã
 * là token trong `packages/motion` (rx 42, ry 30, nghiêng 22 độ, quét 300 độ,
 * hở 60 độ). Cảnh 3D vì vậy lấy điểm từ `arcPointAt()` rồi đổi hệ, thay vì khai
 * lại một ellipse với ba con số của riêng nó. Đổi motif một chỗ thì trang chủ
 * đi theo.
 *
 * Khe hở 60 độ nằm đúng giữa chặng bảy và chặng một. Đó là chỗ vòng KHÔNG khép
 * trên logo, và ở đây nó mang nghĩa: lần thay đổi kế tiếp bắt đầu lại từ đầu.
 */

/** Khoá ổn định của một chặng. Dùng làm `key` React và làm nhánh hình học. */
export type StageId =
  | 'laptop'
  | 'commit'
  | 'build'
  | 'push'
  | 'schedule'
  | 'heal'
  | 'serve';

export interface Stage {
  readonly id: StageId;
  readonly title: TextKey;
  readonly body: TextKey;
}

/**
 * Bảy chặng, đúng thứ tự design §7.
 *
 * `satisfies` giữ hai điều ở tầng biên dịch: mọi khoá copy phải TỒN TẠI trong
 * bản đồ (gõ sai tên là lỗi biên dịch, không phải một chuỗi khoá hiện trên màn
 * hình), và mảng này phải phủ đủ bảy `StageId`, không thiếu không thừa.
 */
export const STAGES = [
  { id: 'laptop', title: 'home.stage-title.laptop', body: 'home.stage-body.laptop' },
  { id: 'commit', title: 'home.stage-title.commit', body: 'home.stage-body.commit' },
  { id: 'build', title: 'home.stage-title.build', body: 'home.stage-body.build' },
  { id: 'push', title: 'home.stage-title.push', body: 'home.stage-body.push' },
  { id: 'schedule', title: 'home.stage-title.schedule', body: 'home.stage-body.schedule' },
  { id: 'heal', title: 'home.stage-title.heal', body: 'home.stage-body.heal' },
  { id: 'serve', title: 'home.stage-title.serve', body: 'home.stage-body.serve' },
] as const satisfies readonly Stage[];

export const STAGE_COUNT = STAGES.length;

/** Số khoảng giữa bảy chặng. `p = 0` ở chặng một, `p = 1` ở chặng bảy. */
const SPANS = STAGE_COUNT - 1;

/**
 * Hệ số đổi từ đơn vị `viewBox` 100x100 sang đơn vị cảnh.
 *
 * `ARC_RX` là 42, nên bán trục lớn ra 4.2 đơn vị cảnh. Con số đó chọn để cả
 * vòng nằm gọn trong tầm nhìn của một camera fov 45 đặt cách khoảng 9 đơn vị,
 * không phải một hằng số tuỳ tiện: đổi nó thì phải đổi khoảng cách camera ở
 * `loop-scene.tsx` theo cùng tỉ lệ.
 */
export const SCENE_SCALE = 0.1;

export interface ScenePoint {
  readonly x: number;
  readonly z: number;
}

/**
 * Điểm trên vòng ở góc `angleDeg`, trong mặt phẳng ngang của cảnh.
 *
 * `viewBox` có `y` hướng XUỐNG, còn `z` của cảnh hướng về phía người xem. Phép
 * đổi vì vậy là `z = (y - tâm) * tỉ lệ` chứ không có dấu trừ: hai lần lật (một
 * ở SVG, một ở hệ toạ độ tay phải) triệt tiêu nhau, nên thứ tự các chặng nhìn
 * từ camera đặt phía `+z` khớp đúng thứ tự đọc trong danh sách thẻ.
 */
export function stagePointAt(angleDeg: number): ScenePoint {
  const p = arcPointAt(angleDeg);
  return { x: (p.x - ARC_CENTER) * SCENE_SCALE, z: (p.y - ARC_CENTER) * SCENE_SCALE };
}

/** Góc trên cung ứng với tiến độ `0..1`. Ngoài miền bị kẹp, `NaN` về 0. */
export function angleAtProgress(p: number): number {
  return ARC_START_DEG + ARC_SWEEP_DEG * clampProgress(p);
}

/** Góc của chặng thứ `index` (0 based). Chỉ số ngoài miền bị kẹp. */
export function angleOfStage(index: number): number {
  const i = Number.isFinite(index) ? Math.min(Math.max(Math.round(index), 0), SPANS) : 0;
  return angleAtProgress(i / SPANS);
}

/**
 * Chặng đang được nói tới ở tiến độ `p`.
 *
 * Làm TRÒN chứ không cắt: ở `p = 0.5` người xem đang nhìn giữa chặng bốn, và
 * `Math.floor` sẽ nói chặng ba trong khi camera đã đi qua nó.
 */
export function stageIndexAtProgress(p: number): number {
  return Math.round(clampProgress(p) * SPANS);
}

/**
 * Bám tiến độ về đúng một chặng. Dùng khi người dùng đã bật giảm chuyển động.
 *
 * Đây là nửa thứ hai của cổng giảm chuyển động, và nó nằm ở tầng DỮ LIỆU chứ
 * không phải tầng vẽ: nửa thứ nhất (`startGatedFrameLoop`) ngừng cấp khung, còn
 * hàm này bảo đảm những khung lẻ do cuộn sinh ra rơi vào một tư thế đã thiết
 * kế. Thiếu nó thì cảnh vẫn nội suy, chỉ là nội suy giật.
 */
export function snapProgress(p: number): number {
  return stageIndexAtProgress(p) / SPANS;
}
