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

import type {
  ClusterView,
  DispatchOutcome,
  GameAction,
  ResourceKind,
  ResourceRef,
} from '@devops-platform/games';

// ── Chế độ chơi ─────────────────────────────────────────────────────────────

/**
 * Đấu trường chạy được hai chế độ trên cùng một engine.
 *
 * - `level` — chế độ dạy. Nội dung lấy từ `LEVELS`, có ngăn tra cứu, gợi ý miễn
 *   phí, không tính giờ trừ khi level tự đặt.
 * - `problem` — chế độ làm bài. Nội dung lấy từ hệ OJ theo mã bài, gợi ý CÓ GIÁ,
 *   không có ngăn tra cứu (bài OJ không dạy), và kết thúc thì nộp nhật ký hành
 *   động lên máy chủ để chấm lại.
 *
 * Đường vào chốt là `/games/k8s?problem=<mã>`; thiếu tham số đó thì là chế độ
 * `level`. Lead đọc tham số này ở `app/games/k8s/page.tsx` và truyền xuống, KHÔNG
 * lane nào tự đọc `useSearchParams` cho việc này — hai chỗ cùng đọc một tham số
 * là hai chỗ có thể bất đồng về việc đang ở chế độ nào.
 *
 * ⚠ Chế độ KHÔNG được suy từ việc "có mã bài hay không" ở từng component. Một
 * component thấy `problemCode == null` rồi tự kết luận đang ở chế độ level sẽ
 * hiểu sai ngay khi bài đang tải. Đọc `mode`, đừng đoán.
 */
export type ArenaMode = 'level' | 'problem';

export interface ArenaModeContext {
  readonly mode: ArenaMode;
  /** Chỉ khác `null` khi `mode === 'problem'`. */
  readonly problemCode: string | null;
  /**
   * Ngăn tra cứu chỉ có ở chế độ `level`. Ở chế độ `problem` thì phím mở nó
   * không làm gì, và nút mở nó không được render — một nút bấm không phản ứng
   * tệ hơn là không có nút.
   */
  readonly codexAvailable: boolean;
  /** Gợi ý có trừ điểm hay không. `true` ở chế độ `problem`. */
  readonly hintsCostPoints: boolean;
}

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
  /**
   * Với `focus`: tên node cần bay tới, khi đích đến là một NODE chứ không phải
   * một object.
   *
   * Vì sao phải có trường thứ hai thay vì dùng chung `uid`: node không mang
   * uid. Trong `ClusterView` chúng được địa chỉ hoá bằng `name`, còn uid chỉ
   * cấp cho object nằm TRÊN node. Bản đồ thu nhỏ bấm vào một node, và không có
   * uid nào để đưa vào đây.
   *
   * Nhét tên node vào `uid` cũng chạy được, nhưng khi đó chỗ nhận phải đoán
   * xem chuỗi đang cầm là uid hay tên — và đoán sai thì camera bay tới hư
   * không mà không báo gì. Hai trường thì không có gì để đoán.
   */
  readonly nodeName?: string;
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
  /**
   * Chuột phải vào CHỖ TRỐNG của cảnh.
   *
   * Tách hẳn khỏi `onContextMenu` chứ không dùng chung với `uid === null`: hai
   * cú bấm này mở hai menu KHÁC NHAU (menu của một tài nguyên / menu của cảnh),
   * và một tham số nhận `null` sẽ bắt mọi chỗ nhận phải rẽ nhánh — rồi quên rẽ ở
   * một chỗ nào đó và mở menu tài nguyên với một tài nguyên không tồn tại.
   *
   * Bản trước KHÔNG có đường này, và hệ quả là chuột phải trượt sẽ bật menu của
   * TRÌNH DUYỆT lên giữa cảnh 3D (`preventDefault` chỉ chạy khi trúng vật).
   */
  readonly onSceneContextMenu: (screen: ScreenPoint) => void;
  /** Nhãn tên nổi trên vật. Tắt khi cụm đông và người chơi muốn nhìn hình. */
  readonly showLabels: boolean;
  /** Dây nối quan hệ giữa các tài nguyên. */
  readonly showEdges: boolean;
  readonly quality: QualityTier;
  readonly onQualityDowngrade: (next: QualityTier, reason: string) => void;
  /**
   * Có tài nguyên nào đang bị KÉO lệch khỏi bố cục tự động không.
   *
   * ⚠ Một cờ BOOLEAN, không phải số lượng, và đó là ràng buộc hiệu năng chứ
   * không phải sở thích: vị trí kéo sống ngoài React (`SceneRuntime.overrides`)
   * vì nó đổi mỗi khung hình trong lúc kéo. Báo lên một con số sẽ làm HUD dựng
   * lại 60 lần một giây suốt cú kéo; báo lên một cờ thì nó chỉ đổi đúng hai lần
   * cả phiên — lúc vật đầu tiên bị kéo, và lúc "sắp xếp lại".
   */
  readonly onMovedChange: (moved: boolean) => void;
  /**
   * Dấu thời gian của lệnh "sắp xếp lại" gần nhất (`performance.now()`), `0` =
   * chưa bấm lần nào.
   *
   * Cùng lý do với `CameraCommand.issuedAt`: đây là một SỰ KIỆN, không phải một
   * trạng thái. Bấm hai lần liên tiếp phải sắp xếp hai lần, mà hai prop giống
   * hệt nhau thì lần thứ hai rơi vào hư không.
   */
  readonly autoAlignAt: number;
  /**
   * Cảnh không đọc được màu từ biến CSS và đang chạy bằng bảng màu dự phòng.
   *
   * Khác hẳn `onQualityDowngrade`: hạ bậc chất lượng là đánh đổi có chủ ý để giữ
   * khung hình, còn cái này là một phép đọc HỎNG. Trước khi có đường báo này,
   * cảnh chỉ `console.warn` — tức là fallback không bao giờ tới được người dùng,
   * đúng thứ mà nguyên tắc "báo lỗi thay vì âm thầm quay về mặc định" cấm.
   *
   * Tuỳ chọn vì nó là tín hiệu chẩn đoán: nơi gọi có thể chọn hiện hay không,
   * nhưng cảnh thì luôn phải phát ra.
   */
  readonly onColorsDegraded?: (reason: string) => void;
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

  /**
   * Góc mở ống kính, độ.
   *
   * 45 là chỗ đứng giữa: hẹp hơn thì một cụm nhiều node không lọt khung nếu
   * không lùi camera ra tới mức mất hết cảm giác chiều sâu; rộng hơn thì phối
   * cảnh bẻ cong các bệ ở rìa và chúng trông như đổ nghiêng.
   */
  fov: 45,

  /**
   * Vị trí camera lúc mới dựng, TRƯỚC lần tự đóng khung đầu tiên.
   *
   * Nó chỉ sống được vài khung hình — `frame-all` chạy ngay khi cụm có hình
   * dạng thật — nhưng vẫn phải hợp lý, vì đó là khung hình đầu người chơi thấy.
   */
  initialPosition: [0, 12, 24],

  /**
   * Bán kính cụm × hệ số này = khoảng cách đóng khung.
   *
   * 1.35 để cụm lấp khung mà vẫn chừa lề. Bản trước dùng 1.75 và cụm chỉ chiếm
   * khoảng một phần ba giữa màn hình — phí đúng cái diện tích mà luật bố cục
   * "canvas chiếm trọn vùng dưới thanh trên cùng" dựng ra để giành lấy.
   */
  frameFillFactor: 1.35,

  /**
   * Khoảng cách × hệ số này = độ cao camera khi đóng khung.
   *
   * 0.46 ≈ 25° so với mặt sàn. Cao hơn (0.55+) là gần như nhìn từ đỉnh xuống,
   * bệ node dẹt lại và phần bo góc — chỗ bắt ánh viền — biến mất.
   */
  frameHeightFactor: 0.46,

  /**
   * Sàn của khoảng cách đóng khung.
   *
   * Cần thiết vì một cụm chỉ có MỘT node cho `radius` rất nhỏ, và không có sàn
   * thì camera chui vào bên trong cái bệ.
   */
  minFrameDistance: 8,

  /** Khoảng cách camera giữ lại khi bay tới một object hoặc một node cụ thể. */
  focusDistance: 7,
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
  | 'eventLog'
  | 'settings';

/**
 * ⛔ VÙNG THÔNG BÁO CHO TRÌNH ĐỌC MÀN HÌNH — quyết định của lead, 2026-09-08.
 *
 * Vấn đề: nhật ký sự kiện mặc định TẮT (`DEFAULT_OVERLAYS.eventLog === false`),
 * nên nếu vùng sống duy nhất nằm trong nhật ký thì cụm chạy hoàn toàn câm với
 * trình đọc màn hình cho tới khi người dùng tự bấm phím mở nhật ký — mà họ
 * không có cách nào biết là cần bấm.
 *
 * Chốt: **lead dựng một vùng thông báo thường trực, ẩn về mặt hình ảnh**, sống
 * trong `arena-root.tsx` bất kể lớp nào đang bật. Bảng nhật ký sự kiện KHÔNG
 * mang `aria-live` — bảng đó hiển thị bằng mắt, việc đọc thành tiếng thuộc về
 * vùng thông báo của lead. Hai vùng cùng đọc dòng sự kiện thì trình đọc màn
 * hình đọc lặp mỗi lần cụm đổi trạng thái.
 *
 * ⚠ Luật này nói về DÒNG SỰ KIỆN CỤM, không phải "cả trang chỉ được một vùng".
 * Một hộp thoại modal đọc lỗi nhập liệu tại chỗ (hộp đặt tên tài nguyên đang
 * làm vậy) là vùng sống hợp lệ và ĐỪNG gỡ nó: lỗi biểu mẫu phải đọc ngay cạnh ô
 * nhập, không phải dồn về một vùng chung ở nơi khác trên trang.
 *
 * Ràng buộc "đúng một vùng trên toàn trang" mà bạn có thể nghe nhắc tới là của
 * `playground.flow.spec.ts` (`toHaveCount(1)`) và nó gác TRANG SÂN CHƠI, không
 * gác arena — đã kiểm 2026-09-08. Đừng mang thẳng con số đó sang đây.
 */
export const ARIA_LIVE_OWNER = 'arena-root' as const;

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
  settings: false,
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
  toggleSettings: 's',
  resetCamera: 'r',
  frameAll: 'f',
  /**
   * Trả mọi tài nguyên về chỗ bố cục tự động tính — huỷ toàn bộ vị trí người
   * chơi đã KÉO. `g` = "gọn"; `a` bỏ trống vì nó là phím đầu của nhiều thao tác
   * chọn-tất-cả mà người dùng quen bấm theo phản xạ.
   */
  autoAlign: 'g',
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
/**
 * ⛔ MỌI Ô TRONG BẢNG ĐỀU DÙNG ĐƯỢC, Ở MỌI BÀI.
 *
 * Chỉ đạo trực tiếp của chủ dự án (2026-09-08): *"không được phép chặn thao tác
 * với các resource, bài nào cũng phải mở chứ không được khóa (không được hiện là
 * bài nào chưa mở loại tài nguyên này)"*.
 *
 * `Level.allowedResources` KHÔNG còn là một cái khoá. Nó vẫn ở lại trong dữ
 * liệu và vẫn được đọc, nhưng chỉ để ĐÁNH DẤU những loại bài học đang xoay
 * quanh — một chỉ dẫn, không phải một hàng rào. Người chơi muốn dựng thêm
 * Service ở một bài về Pod thì cứ dựng: đây là môi trường mô phỏng, và phạt
 * việc thử nghiệm là phạt đúng hành vi mà nó sinh ra để khuyến khích.
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

/**
 * Màu nhận dạng theo LOẠI tài nguyên — nguồn duy nhất cho cả bảng công cụ lẫn
 * cảnh 3D.
 *
 * ⛔ Vì sao phải là một bảng chung: bảng bên trái và các khối trong cảnh nói về
 * cùng một thứ. Nếu Pod xanh dương ở bảng mà xanh lá trong cảnh thì người chơi
 * phải học hai hệ màu cho một khái niệm, và cái thứ hai vô dụng. Hai lane khác
 * nhau dựng hai bảng màu riêng là cách chắc chắn nhất để chuyện đó xảy ra.
 *
 * Tám màu chứ không phải 26: mắt người phân biệt tin cậy được khoảng 8-12 màu
 * trong một giao diện, và 26 màu khác nhau sẽ có vài cặp gần như trùng — lúc đó
 * màu không còn phân biệt được gì mà chỉ làm rối. Nhóm theo VAI TRÒ, nên các
 * loại hay đứng cạnh nhau trong một sơ đồ luôn khác màu nhau.
 *
 * Giá trị thật nằm ở `globals.css` (`--kind-*`, có cả nhánh sáng và tối). Ở đây
 * chỉ có tên token, để đổi bảng màu là đổi một chỗ.
 */
export const KIND_ACCENT: Readonly<Record<ResourceKind, string>> = {
  /* Đơn vị chạy — màu chủ đạo, thứ người chơi nhìn nhiều nhất. */
  Pod: 'kind-pod',
  /* Bộ điều khiển sinh ra pod. Khác Pod để thấy rõ quan hệ cha-con trong cảnh. */
  ReplicaSet: 'kind-controller',
  Deployment: 'kind-controller',
  StatefulSet: 'kind-controller',
  DaemonSet: 'kind-controller',
  /* Việc chạy rồi kết thúc — khác hẳn workload chạy mãi. */
  Job: 'kind-batch',
  CronJob: 'kind-batch',
  /* Đường đi của gói tin. */
  Service: 'kind-network',
  Ingress: 'kind-network',
  NetworkPolicy: 'kind-network',
  /* Dữ liệu cấu hình bơm vào container. */
  ConfigMap: 'kind-config',
  Secret: 'kind-config',
  /* Ổ đĩa. */
  PersistentVolume: 'kind-storage',
  PersistentVolumeClaim: 'kind-storage',
  StorageClass: 'kind-storage',
  /* Ai được làm gì. */
  ServiceAccount: 'kind-security',
  Role: 'kind-security',
  RoleBinding: 'kind-security',
  ClusterRole: 'kind-security',
  ClusterRoleBinding: 'kind-security',
  /* Khung chứa và hạn mức — nền của mọi thứ khác, nên màu trầm nhất. */
  Namespace: 'kind-cluster',
  Node: 'kind-cluster',
  HorizontalPodAutoscaler: 'kind-cluster',
  PodDisruptionBudget: 'kind-cluster',
  ResourceQuota: 'kind-cluster',
  LimitRange: 'kind-cluster',
};

/**
 * ⛔ KHÔNG THANH TRƯỢT NÀO ĐƯỢC HIỆN RA trong bất kỳ lớp HUD nào.
 *
 * Chỉ đạo của chủ dự án (2026-09-08), sau hai lượt làm rõ nên đọc kỹ ranh giới:
 * *"cấm không cho xuất hiện cái thanh scroll dọc/ngang"*.
 *
 * Thứ bị cấm là **thanh trượt hiện ra**, KHÔNG phải khả năng cuộn. Nội dung dài
 * vẫn cuộn được; chỉ là cái thanh xám không được chiếm chỗ và không được nhìn
 * thấy. Ẩn bằng `scrollbar-width: none` cộng `::-webkit-scrollbar { display:
 * none }`.
 *
 * Hai hệ quả phải làm cùng, nếu không việc ẩn thanh trượt thành ra làm hại:
 *
 * 1. **Dải mờ ở mép còn nội dung.** Thanh trượt bị ẩn thì nó là thứ DUY NHẤT
 *    cho người dùng biết còn gì để xem. Bỏ dải đó khi đã cuộn hết.
 * 2. **Lăn chuột cuộn NGANG khi con trỏ ở trong vùng cuộn ngang** (bảng thông
 *    số bên phải: mô tả, YAML, tổng quan, sự kiện). Người dùng không phải giữ
 *    Shift và không có thanh trượt để kéo, nên nếu con lăn không làm gì thì nội
 *    dung bên phải là không với tới được. Listener `wheel` phải đăng ký
 *    `{ passive: false }` — thiếu nó thì `preventDefault` bị bỏ qua mà không có
 *    lỗi nào; cộng `deltaX + deltaY` để không chặn mất thao tác vuốt ngang thật;
 *    và chỉ nuốt sự kiện khi còn chỗ cuộn, nếu không con lăn chết cứng ở cuối.
 *
 * **Ngoại lệ theo trục, cho bảng CÔNG CỤ bên trái:** cuộn ngang ở một cột dọc
 * hẹp là lỗi bố cục chứ không phải nhu cầu — nó nghĩa là có phần tử rộng hơn
 * khung, và ẩn thanh trượt ở đó chỉ giấu triệu chứng trong khi nội dung vẫn bị
 * cắt mất mà không còn cách nào kéo tới. Sửa bố cục, đừng ẩn.
 */
export const NO_VISIBLE_SCROLLBARS = true;

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

/**
 * Sửa manifest của một tài nguyên, và NGHE ENGINE TRẢ LỜI.
 *
 * Tách khỏi `ArenaDispatch` vì một lý do đo được: `dispatch` trả `void`, nên
 * `ReduceResult.output` — chỗ engine viết *"Không lưu được thay đổi: …"* hay
 * *"Không đổi được `kind` hay `metadata.name` bằng `edit`"* — bị vứt đi trước
 * khi tới giao diện. Ô soạn thảo YAML mà không có đường này thì bấm Lưu trên
 * một manifest sai sẽ KHÔNG có phản ứng nào cả, và người chơi không có cách nào
 * biết mình sai ở đâu. Đó đúng là thứ `development-principles.md` § "Errors Over
 * Silent Fallbacks" cấm.
 *
 * Vẫn đi qua đúng một cửa xuống engine (`dispatchDetailed`), nên `RunLog` vẫn
 * ghi đủ và phần chấm điểm chống gian lận không mất gì.
 */
export interface ArenaEdit {
  (target: ResourceRef, yaml: string): DispatchOutcome;
}
