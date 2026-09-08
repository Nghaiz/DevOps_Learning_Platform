/**
 * Hợp đồng giao diện của K8s Arena — ranh giới giữa scene 3D, các lớp nổi HUD,
 * và engine mô phỏng.
 *
 * File này được chốt TRƯỚC khi các lane bắt đầu code, và mọi lane đọc chính nó
 * chứ không đọc lẫn nhau. Lý do: các lane chạy trong ngữ cảnh tách biệt, không
 * nhìn thấy code của nhau, nên nếu không có một hình dạng chung ghim sẵn thì
 * mỗi bên sẽ tự nghĩ ra một hình dạng hợp lý, cả hai đều qua typecheck của
 * chính mình, và chỗ lệch chỉ lộ ra lúc chạy thật.
 *
 * ⛔ HAI LUẬT BỐ CỤC — vi phạm là làm sai yêu cầu, không phải khác biệt thẩm mỹ.
 *
 * 1. **Canvas 3D chiếm TRỌN vùng dưới thanh trên cùng.** Không có bố cục chia
 *    cột. Mọi bảng đều là lớp NỔI bên trên canvas. Bản cũ dựng lưới ba cột với
 *    canvas ở giữa, và đó là lý do khung cảnh trông chật và nhỏ.
 *
 * 2. **Bảng thông số bên phải KHÔNG thường trực.** Nó chỉ tồn tại khi có object
 *    đang được chọn, và biến mất khi bỏ chọn. Đây là chỉ đạo trực tiếp của chủ
 *    dự án (2026-09-08): *"dock bên phải của họ là khi tôi bấm vào một item nào
 *    đó thì nó mới hiện ra chứ không phải nó cố định ở màn hình đâu, cấm làm
 *    sai"*. Một bảng rỗng ghi "chưa chọn gì" là đã vi phạm — đúng là không được
 *    render gì cả.
 *
 * ⚠ BẪY ĐÃ THẤY Ở BẢN CỦA HỌ, ĐỪNG DẪM LẠI: canvas của k8sgames.com nuốt
 * pointer-event của các nút menu phía trên nó (đo trực tiếp 2026-09-08: click
 * bằng Playwright bị chặn với thông báo `<canvas id="game-canvas"> intercepts
 * pointer events`). Nguyên nhân là canvas nằm trên cùng trong thứ tự xếp lớp.
 * Ở đây canvas phải nằm DƯỚI mọi lớp HUD, và lớp HUD nào không nhận tương tác
 * thì đặt `pointer-events: none` để chuột lọt xuống canvas.
 */

import type { ClusterView, GameAction, ResourceKind } from '@devops-platform/games';

// ── Chất lượng hiển thị ─────────────────────────────────────────────────────

/**
 * Bậc chất lượng. Giữ nguyên tên bậc của bản cũ (`scene-quality.ts`) vì cơ chế
 * tự hạ bậc khi tụt khung hình đã được kiểm chứng dưới SwiftShader và có test
 * e2e gác — thay tên bậc là làm hỏng phần đó mà không được gì.
 */
export type QualityTier = 'low' | 'medium' | 'high';

// ── Lệnh camera ─────────────────────────────────────────────────────────────

/**
 * Lệnh một chiều từ HUD xuống scene.
 *
 * Vì sao là lệnh có dấu thời gian chứ không phải một prop trạng thái: "đưa
 * camera về vị trí gốc" là một SỰ KIỆN, không phải một trạng thái. Nếu mô hình
 * hoá bằng prop thì bấm "về góc nhìn" hai lần liên tiếp không tạo ra thay đổi
 * prop nào ở lần thứ hai, và lần bấm đó rơi vào hư không. `issuedAt` làm mỗi
 * lần bấm là một giá trị mới.
 */
export interface CameraCommand {
  readonly kind: 'reset' | 'focus' | 'frame-all';
  /** Với `focus`: uid của object cần bay tới. Bỏ qua với hai kind kia. */
  readonly uid?: string;
  /** `performance.now()` lúc phát lệnh. Scene so sánh để biết lệnh mới. */
  readonly issuedAt: number;
}

// ── Scene 3D ────────────────────────────────────────────────────────────────

/**
 * Props của `<ArenaScene>`.
 *
 * ⚠ `view` KHÔNG nằm trong props, và đó là quyết định kiến trúc quan trọng
 * nhất ở đây. Engine đập nhịp nhiều lần mỗi giây; nếu trạng thái cluster đi qua
 * props thì React sẽ dựng lại cây scene ở mỗi nhịp, và với vài trăm pod thì
 * khung hình sập. Thay vào đó scene tự kéo dữ liệu trong vòng lặp vẽ qua
 * `getView()`, còn `subscribe()` chỉ để biết khi nào cần dựng lại phần cấu
 * trúc (thêm/bớt object) chứ không phải mỗi lần đổi số liệu.
 *
 * Hai hàm này BẮT BUỘC phải ổn định theo tham chiếu qua mọi lần render của
 * component cha — bọc `useCallback` với mảng phụ thuộc rỗng và đọc engine qua
 * ref. Bản cũ có một ghi chú hậu kiểm về đúng lỗi này: khi hai hàm đổi tham
 * chiếu, scene bị tháo dựng liên tục và kết quả là *không có cảnh 3D nào*.
 */
export interface ArenaSceneProps {
  readonly subscribe: (onStructuralChange: () => void) => () => void;
  readonly getView: () => ClusterView;
  readonly selectedUid: string | null;
  readonly hoveredUid: string | null;
  readonly onSelect: (uid: string | null) => void;
  readonly onHover: (uid: string | null) => void;
  /** Chuột phải trên một object. Toạ độ là toạ độ màn hình để đặt menu ngữ cảnh. */
  readonly onContextMenu: (uid: string, screen: ScreenPoint) => void;
  readonly quality: QualityTier;
  readonly onQualityDowngrade: (next: QualityTier, reason: string) => void;
  readonly cameraCommand: CameraCommand | null;
  /** Tắt hẳn 3D (người dùng chọn, hoặc máy không có WebGL). */
  readonly enabled: boolean;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

// ── Thông số camera ─────────────────────────────────────────────────────────

/**
 * Thông số điều khiển camera — SSOT, đặt ở đây để scene và test đọc cùng một
 * chỗ.
 *
 * Nguồn gốc các con số: đo từ bản của k8sgames.com (`ClusterRenderer.js:80-105`)
 * rồi chỉnh. Chúng dùng `dampingFactor` 0.08 thay vì mặc định 0.05 của
 * OrbitControls, và cảm giác "nặng tay, trôi mượt" mà chủ dự án khen chính là
 * con số đó. Ta lấy 0.075 làm điểm xuất phát rồi tinh chỉnh bằng cảm nhận thật,
 * không phải bằng suy đoán.
 *
 * `maxPolarAngle` dưới nửa vòng tròn một chút là để camera không bao giờ chui
 * xuống dưới mặt sàn — chui xuống thì thấy mặt đáy của node và toàn cảnh lộn
 * ngược, trông như lỗi.
 */
export const CAMERA_TUNING = {
  dampingFactor: 0.075,
  /** π/2.1 ≈ 85.7°, chặn ngay trước khi tới mặt phẳng sàn. */
  maxPolarAngle: Math.PI / 2.1,
  minPolarAngle: 0.15,
  minDistance: 5,
  maxDistance: 80,
  /** Bật xoay tự động khi người dùng đứng yên lâu — cảnh không bị chết cứng. */
  idleSpinAfterMs: 30_000,
  idleSpinSpeed: 0.25,
} as const;

// ── Lớp nổi HUD ─────────────────────────────────────────────────────────────

/**
 * Các lớp nổi, và luật hiện/ẩn của từng lớp.
 *
 * `inspector` cố tình KHÔNG có mặt trong danh sách bật/tắt: nó không phải thứ
 * người dùng bật, nó là hệ quả của việc có hay không một object đang chọn. Xem
 * luật bố cục số 2 ở đầu file.
 */
export type OverlayId =
  | 'palette'
  | 'mission'
  | 'terminal'
  | 'metrics'
  | 'incidents'
  | 'minimap'
  | 'codex'
  | 'eventLog';

/** Lớp nào bật sẵn khi vào bài. Số lớp bật sẵn ít là có chủ ý — vào là chơi ngay. */
export const DEFAULT_OVERLAYS: Readonly<Record<OverlayId, boolean>> = {
  palette: true,
  mission: true,
  terminal: false,
  metrics: false,
  incidents: false,
  minimap: true,
  codex: false,
  eventLog: false,
};

/**
 * Phím tắt. SSOT — bảng trợ giúp trong game đọc chính hằng số này, nên không
 * bao giờ có chuyện bảng trợ giúp nói một phím còn code nghe một phím khác.
 *
 * Dấu huyền (`` ` ``) mở terminal thay vì `/` như bên họ: `/` là phím thường
 * dùng khi gõ đường dẫn, và ở bàn phím tiếng Việt nó không đòi phím phụ nên rất
 * dễ bấm nhầm giữa lúc đang gõ. Dấu huyền là quy ước terminal quen thuộc trong
 * game.
 */
export const ARENA_KEYS = {
  toggleTerminal: '`',
  commandPalette: 'k',
  toggleMetrics: 'm',
  toggleIncidents: 'i',
  toggleCodex: '?',
  toggleEventLog: 'l',
  resetCamera: 'r',
  frameAll: 'f',
  pauseResume: ' ',
  closeTopmost: 'Escape',
} as const;

// ── Bảng tài nguyên (palette) ───────────────────────────────────────────────

/**
 * Một ô trong bảng bên trái.
 *
 * ⚠ Đây là thứ CHƯA TỪNG TỒN TẠI trong bản cũ, và sự vắng mặt của nó là một
 * lỗi có thể chỉ ra bằng chứng: gợi ý của level 1 viết *"Bảng tài nguyên bên
 * trái cho bạn tạo pod mà không cần gõ YAML"* (`levels/l01.ts:59`) trong khi
 * bảng bên trái của bản cũ chỉ LIỆT KÊ những gì đã có. Gợi ý đang mô tả một
 * tính năng không tồn tại, và người chơi làm theo sẽ không tìm thấy gì.
 */
export interface PaletteEntry {
  readonly kind: ResourceKind;
  /** Nhãn ngắn hiển thị trong ô, ví dụ `Deploy`. */
  readonly short: string;
  /** Tên đầy đủ hiện khi rê chuột. */
  readonly full: string;
  readonly group: PaletteGroup;
  /** Phím số bấm nhanh, `null` nếu không gán. Chỉ 1..9 mới gán được. */
  readonly hotkey: number | null;
}

export type PaletteGroup = 'workload' | 'network' | 'config' | 'storage' | 'cluster';

export const PALETTE_GROUP_LABELS: Readonly<Record<PaletteGroup, string>> = {
  workload: 'Workload',
  network: 'Mạng',
  config: 'Cấu hình',
  storage: 'Lưu trữ',
  cluster: 'Cụm',
};

// ── Cầu nối HUD → engine ────────────────────────────────────────────────────

/**
 * Mọi thay đổi trạng thái đi qua đúng một cửa.
 *
 * Không lane nào được gọi thẳng vào engine hay tự sửa `ClusterView`. Lý do
 * không phải là sự sạch sẽ kiến trúc: `RunLog` phải ghi lại đủ mọi hành động
 * thì `verify.ts` mới phát lại và chấm lại được, và một hành động đi tắt là một
 * lỗ hổng gian lận.
 */
export interface ArenaDispatch {
  (action: GameAction): void;
}
