/**
 * Hình dạng dữ liệu mà cảnh 3D vẽ ra. CHỈ kiểu — không `three`, không DOM.
 *
 * Tách khỏi `scene-runtime.ts` vì mọi thành phần trong cảnh đều `import type` từ
 * đây trong khi chỉ đúng một chỗ gọi tới bộ dựng kho; gộp chung thì mỗi lần đọc
 * một kiểu là kéo theo cả phần logic đồng bộ.
 */

import type { ResourceKind } from '@devops-platform/games';
import type { StatusToken } from '../shared/scene-tokens';

export interface SceneEntry {
  readonly uid: string;
  readonly kind: ResourceKind;
  /** Token màu theo LOẠI, tra sẵn ở `sync` vì nó không bao giờ đổi với một uid. */
  readonly accent: string;
  label: string;
  /** Vị trí NGHỈ do `computeLayout` quyết định. */
  x: number;
  y: number;
  z: number;
  size: number;
  /** Pha bồng bềnh riêng, tất định theo `uid`. */
  phase: number;
  token: StatusToken;
  terminating: boolean;
  failing: boolean;
  /** 0..1 — tiến trình xuất hiện. */
  appear: number;
  /** 0..1 — tiến trình biến mất. `0` = đang sống. */
  dying: number;
  /** `true` khi object đã rời `ClusterView` và chỉ còn sống để chạy nốt hiệu ứng. */
  doomed: boolean;
  // ── Giá trị của khung hình hiện tại, do `advanceFrame` ghi ────────────────
  drawY: number;
  drawScale: number;
  /** 0..1 — cường độ hào quang. */
  drawGlow: number;
}

export interface NodeEntry {
  readonly name: string;
  x: number;
  ready: boolean;
  /** max(cpu, memory), 0..1. */
  load: number;
}

export interface EdgeBuffers {
  /** Toạ độ cặp đầu-cuối, 6 số một cạnh. */
  readonly solid: number[];
  readonly dashed: number[];
}

/**
 * Một quan hệ, ở dạng CHƯA thành toạ độ.
 *
 * Tách khỏi `EdgeBuffers` vì hai thứ đổi theo hai nhịp khác nhau: danh sách
 * quan hệ chỉ đổi khi cụm đổi cấu trúc, còn toạ độ hai đầu đổi mỗi lần người
 * chơi KÉO một đầu. Giữ nguyên cách cũ (nướng toạ độ vào buffer ngay lúc
 * `sync`) thì cạnh đứng yên trong khi vật ở đầu nó đã bị kéo đi — một sợi dây
 * nối vào chỗ trống.
 */
export interface EdgeLink {
  readonly fromUid: string;
  readonly toUid: string;
  readonly healthy: boolean;
}

/** Vị trí do người chơi tự đặt. Chỉ hai trục mặt sàn — độ cao vẫn do bố cục quyết. */
export interface PlacementOverride {
  readonly x: number;
  readonly z: number;
}

export interface FrameOptions {
  /** Bồng bềnh chỉ đáng trả giá khi người dùng đang thật sự nhìn vào khung. */
  readonly bobActive: boolean;
  readonly reducedMotion: boolean;
}

export interface SceneRuntime {
  readonly entries: Map<string, SceneEntry>;
  /**
   * Thứ tự duyệt ổn định của MỌI entry còn sống, sắp theo `uid`.
   *
   * Tách khỏi `visible` là có chủ ý: một pod vừa sinh có tỉ lệ đúng bằng 0 ở
   * khung hình đầu (`easeOutBack(0) === 0`), nên nếu danh sách duyệt cũng là
   * danh sách vẽ thì nó bị loại ngay khung hình đầu và KHÔNG BAO GIỜ xuất hiện.
   */
  readonly order: SceneEntry[];
  /** Danh sách vẽ của khung hình hiện tại. Chỉ số ở đây CHÍNH LÀ `instanceId`. */
  readonly visible: SceneEntry[];
  readonly nodes: NodeEntry[];
  readonly edges: EdgeBuffers;
  radius: number;
  /** Tăng mỗi lần hình dạng cảnh đổi — bóng đổ và buffer cạnh bám vào số này. */
  structureVersion: number;
  /**
   * Vị trí người chơi tự KÉO, đè lên `computeLayout`.
   *
   * ⛔ Thuần HIỂN THỊ. Không đi vào `GameAction`, không vào `RunLog`, không đổi
   * một bit nào của mô phỏng — kéo một pod sang chỗ khác trên màn hình KHÔNG
   * dời nó sang node khác, y như kéo một icon trên desktop không chuyển ổ đĩa.
   * Đưa nó vào log sẽ làm mọi lượt chơi trung thực trượt xác minh, vì bản phát
   * lại không có chuột.
   */
  readonly overrides: Map<string, PlacementOverride>;
  /** Ghi vị trí kéo cho một object và cập nhật ngay cạnh nối vào nó. */
  moveTo(uid: string, x: number, z: number): void;
  /** Bỏ MỌI vị trí kéo. Trả `true` khi thật sự có cái để bỏ. */
  resetLayout(): boolean;
  /** Đọc engine, cập nhật kho. Trả `true` khi có gì đó NHÌN THẤY ĐƯỢC đã đổi. */
  sync(): boolean;
  /** Chạy hoạt ảnh một khung hình. Trả `true` khi còn thứ đang chuyển động. */
  advanceFrame(elapsedS: number, dt: number, options: FrameOptions): boolean;
}
