/**
 * Bảng phím tắt của sân chơi CI/CD (19.D.4.8).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHÍM TẮT LÀ LỚP THỨ HAI, KHÔNG PHẢI LỚP DUY NHẤT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * D.4.8 đòi *"bàn phím đủ cho mọi thao tác; không thao tác nào chỉ làm được bằng
 * chuột"*. Điều đó **không** đạt được bằng bảng này: một phím tắt không ai nhìn
 * thấy thì không phải một đường đi được, nó là một bí mật. Vế "đủ" được đóng
 * bằng chỗ khác — mọi thao tác đều có một `<button>` thật trong luồng Tab: công
 * tắc lớp phủ và nút 2D/3D ở thanh trên, chọn node ở bản đồ thu nhỏ, chạy thử ở
 * thanh trên.
 *
 * Bảng này rút ngắn đường đi cho người đã quen, và — quan trọng hơn — nó là DỮ
 * LIỆU: màn trợ giúp render chính mảng này, nên một phím thêm vào mà quên ghi
 * vào tài liệu là chuyện không xảy ra được.
 *
 * ⛔ Không nhận phím khi con trỏ đang ở trong ô soạn. `e` là một chữ cái người
 * chơi gõ vào YAML mỗi giây, và nuốt nó để mở một bảng là làm hỏng chính ô soạn.
 * Ngoại lệ: `Ctrl`/`Cmd`+`Enter` (chạy thử) và `Escape` — hai phím không ai gõ
 * vào giữa một dòng YAML, và là hai thứ người ta cần NHẤT khi tay đang ở ô soạn.
 */

export type CicdHotkeyAction =
  | { readonly kind: 'run' }
  | { readonly kind: 'panel'; readonly panel: string }
  | { readonly kind: 'close-all' }
  | { readonly kind: 'mode'; readonly mode: '2d' | '3d' }
  | { readonly kind: 'help' }
  | { readonly kind: 'deselect' };

export interface CicdHotkey {
  /** `event.key`, so KHÔNG phân biệt hoa thường ở tầng khớp. */
  readonly key: string;
  /** Cần `Ctrl` (hoặc `Cmd` trên máy Apple). */
  readonly ctrl?: boolean;
  /** Chuỗi hiện trên màn trợ giúp. */
  readonly label: string;
  readonly describe: string;
  readonly action: CicdHotkeyAction;
  /** Nhận cả khi con trỏ đang trong ô soạn — xem khối đầu file. */
  readonly whileTyping?: boolean;
}

export const CICD_HOTKEYS: readonly CicdHotkey[] = [
  {
    key: 'Enter',
    ctrl: true,
    label: 'Ctrl/Cmd + Enter',
    describe: 'Chạy thử workflow đang soạn',
    action: { kind: 'run' },
    whileTyping: true,
  },
  {
    key: 'Escape',
    label: 'Esc',
    describe: 'Bỏ chọn job đang chọn',
    action: { kind: 'deselect' },
    whileTyping: true,
  },
  { key: 'e', label: 'E', describe: 'Ô soạn workflow', action: { kind: 'panel', panel: 'editor' } },
  { key: 'd', label: 'D', describe: 'Đề bài và mục tiêu', action: { kind: 'panel', panel: 'mission' } },
  { key: 'i', label: 'I', describe: 'Thông số job đang chọn', action: { kind: 'panel', panel: 'inspector' } },
  { key: 'k', label: 'K', describe: 'Kết quả lượt chạy', action: { kind: 'panel', panel: 'result' } },
  { key: 'b', label: 'B', describe: 'Bảng núm', action: { kind: 'panel', panel: 'tools' } },
  { key: 'l', label: 'L', describe: 'Bài học và cẩm nang', action: { kind: 'panel', panel: 'learn' } },
  { key: 'm', label: 'M', describe: 'Bản đồ thu nhỏ', action: { kind: 'panel', panel: 'minimap' } },
  { key: '0', label: '0', describe: 'Thu hết lớp phủ — sân trống hoàn toàn', action: { kind: 'close-all' } },
  { key: '2', label: '2', describe: 'Chuyển sang cảnh 2D', action: { kind: 'mode', mode: '2d' } },
  { key: '3', label: '3', describe: 'Chuyển sang cảnh 3D', action: { kind: 'mode', mode: '3d' } },
  { key: '?', label: '?', describe: 'Mở màn trợ giúp này', action: { kind: 'help' } },
];

export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/**
 * Phím nào khớp sự kiện này, `null` nếu không phím nào.
 *
 * `typing` = con trỏ đang ở trong một ô nhập liệu.
 *
 * ⚠ `altKey` loại bỏ MỌI khớp: `Alt` + chữ cái là tổ hợp gõ dấu trên nhiều bố
 * cục bàn phím, và nuốt nó là chặn người ta gõ chính ngôn ngữ của họ.
 */
export function matchHotkey(event: KeyEventLike, typing: boolean): CicdHotkey | null {
  if (event.altKey) return null;
  const ctrl = event.ctrlKey || event.metaKey;

  for (const hotkey of CICD_HOTKEYS) {
    if ((hotkey.ctrl ?? false) !== ctrl) continue;
    if (hotkey.key.toLowerCase() !== event.key.toLowerCase()) continue;
    if (typing && !(hotkey.whileTyping ?? false)) continue;
    return hotkey;
  }
  return null;
}

/** Phần tử đang nhận phím có phải một ô nhập liệu không. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  /*
   * `=== true` chứ không trả thẳng: `isContentEditable` là `undefined` trên một
   * phần tử chưa gắn vào tài liệu ở jsdom, và một `undefined` lọt ra ngoài sẽ
   * làm mọi phép so `=== false` ở bên gọi sai — trong khi kiểu khai vẫn là
   * `boolean` nên `tsc` không thấy gì.
   */
  return target.isContentEditable === true;
}
