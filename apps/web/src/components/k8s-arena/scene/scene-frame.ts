/**
 * Một bước hoạt ảnh. TOÁN THUẦN — tách khỏi `scene-runtime.ts` vì đây là trách
 * nhiệm khác hẳn: `sync` đối chiếu với engine (chạy theo nhịp TICK), còn hàm này
 * chỉ đẩy thời gian trôi (chạy theo nhịp KHUNG HÌNH). Trộn hai nhịp vào một file
 * là cách nhanh nhất để ai đó gọi nhầm cái này trong vòng lặp kia.
 *
 * ⛔ KHÔNG `import 'three'`.
 */

import {
  BOB_AMPLITUDE,
  DEATH_DURATION_S,
  SPAWN_DURATION_S,
  bobOffset,
  easeInQuad,
  easeOutBack,
  pulse01,
  transitionDuration,
} from '../shared/scene-motion';
import type { FrameOptions, SceneEntry } from './scene-entry';

/** Pod đang bị xoá chìm xuống bao nhiêu đơn vị world trước khi tắt hẳn. */
const DEATH_SINK = 0.5;
/** Hào quang nền của một vật khoẻ mạnh. Nhỏ — đây là "có sức sống", không phải đèn pha. */
const GLOW_IDLE = 0.28;
/** Dưới tỉ lệ này thì vật không còn một pixel nào đáng vẽ. */
const INVISIBLE_SCALE = 0.001;

export interface AdvanceResult {
  /** Còn thứ đang chuyển động ⇒ phải xin thêm một khung hình nữa. */
  readonly animating: boolean;
  /** Có entry vừa chạy hết hiệu ứng biến mất và bị xoá ⇒ thứ tự duyệt phải dựng lại. */
  readonly buried: boolean;
}

/**
 * Đẩy hoạt ảnh của mọi entry đi `dt` giây, và ghi danh sách vẽ của khung hình này.
 *
 * `order` và `visible` là hai mảng KHÁC NHAU có chủ ý: một pod vừa sinh có tỉ lệ
 * đúng bằng 0 ở khung hình đầu (`easeOutBack(0) === 0`), nên nếu danh sách duyệt
 * cũng là danh sách vẽ thì nó bị loại ngay khung hình đầu và không bao giờ hiện ra.
 */
export function advanceEntries(
  entries: Map<string, SceneEntry>,
  order: readonly SceneEntry[],
  visible: SceneEntry[],
  elapsedS: number,
  dt: number,
  options: FrameOptions,
): AdvanceResult {
  const spawn = transitionDuration(SPAWN_DURATION_S, options.reducedMotion);
  const death = transitionDuration(DEATH_DURATION_S, options.reducedMotion);
  let animating = false;
  let buried = false;
  // Cắt độ dài rồi ghi đè: mảng giữ nguyên sức chứa đã cấp, nên sau vài khung
  // hình đầu vòng lặp này không cấp phát gì nữa.
  visible.length = 0;

  for (let i = 0; i < order.length; i += 1) {
    const entry = order[i];
    if (entry === undefined) {
      continue;
    }

    if (entry.doomed) {
      entry.dying = Math.min(1, entry.dying + dt / death);
      if (entry.dying >= 1) {
        entries.delete(entry.uid);
        buried = true;
        continue;
      }
      animating = true;
    } else if (entry.appear < 1) {
      entry.appear = Math.min(1, entry.appear + dt / spawn);
      animating = true;
    }

    const grow = easeOutBack(entry.appear);
    const shrink = 1 - easeInQuad(entry.dying);
    const scale = entry.size * grow * shrink;
    if (scale <= INVISIBLE_SCALE) {
      entry.drawScale = 0;
      continue;
    }

    entry.drawScale = scale;
    entry.drawY =
      entry.y +
      (options.bobActive ? bobOffset(elapsedS, entry.phase) : 0) -
      entry.dying * DEATH_SINK -
      (entry.terminating ? BOB_AMPLITUDE * 2 : 0);
    /*
     * Nhịp thở của vật đang lỗi CHỈ chạy khi cảnh đang được vẽ liên tục. Nếu để
     * nó đổi giá trị mọi lúc thì cảnh không bao giờ "tĩnh" được, và cổng e2e
     * "0 khung hình khi đứng yên" mất chỗ dựa. Lúc tĩnh nó đứng ở mức sáng nhất
     * — vật lỗi vẫn nổi bật, chỉ là không nhấp nháy.
     */
    entry.drawGlow = entry.failing
      ? options.bobActive
        ? 0.35 + pulse01(elapsedS, entry.phase) * 0.65
        : 0.85
      : entry.terminating
        ? 0
        : GLOW_IDLE;
    visible.push(entry);
  }

  return { animating, buried };
}
