/**
 * D10 — đường thoát khỏi bẫy focus của terminal, bằng **`Esc` rồi `Tab`** (hoặc
 * `Shift+Tab`) trong ≤500ms. Quy ước của CodeMirror 6 cho cùng bài toán.
 *
 * ## M1 — vì sao KHÔNG còn là `Esc Esc`
 *
 * Gõ Esc hai lần cho chắc đã về normal mode là thói quen vim phổ biến nhất, và
 * `Esc Esc` đá focus ra đúng giữa lúc đó. Phương án "bỏ qua khi đang ở alternate
 * screen" KHÔNG dùng được ở nền tảng này: gateway exec vào `tmux new-session -A
 * -s dlp` với `TERM=xterm-256color`, tmux bật alternate screen của xterm ngay
 * khi attach — tức terminal LUÔN ở alternate screen (vim chạy BÊN TRONG tmux nên
 * xterm không phân biệt được), và phép chặn đó tắt cử chỉ vĩnh viễn. Tab sau Esc
 * thì gần như không chương trình TUI nào cần, và nó là phím rời focus chuẩn.
 *
 * ## Vì sao KHÔNG phải một lần Esc
 *
 * `Esc` là một phím THẬT của terminal: vim rời insert mode bằng nó, readline
 * dùng nó làm tiền tố meta, `less`/`fzf`/`htop` đều đọc nó. Bắt một lần Esc để
 * rời focus là lấy mất một phím mà người học đang dùng — và mất đúng ở lúc họ
 * cần nó nhất. Nên cử chỉ rời terminal phải là một chuỗi mà không chương trình
 * TUI nào coi là có nghĩa, và `Esc Esc` nhanh là chuỗi đó.
 *
 * ## Vì sao module này là hàm THUẦN, không phải một `useEffect`
 *
 * Thứ duy nhất khó ở đây là NGƯỠNG THỜI GIAN, và nó không cần DOM để kiểm:
 * "một lần thì không kích hoạt", "hai lần cách 499ms thì có", "hai lần cách
 * 501ms thì không", "Esc → phím khác → Esc thì không". Bốn ca đó là bốn dòng
 * test chạy ở project `node`. Nhét chúng vào một test trình duyệt là đổi bốn
 * assertion tức thời lấy một suite cần chromium và cần `await` thời gian thật.
 *
 * ⛔ Detector này CHỈ QUAN SÁT. Nó không nhận `Event`, nên nó không có cách nào
 * gọi `preventDefault()`/`stopPropagation()` — tức nó **cấu trúc-học** không
 * nuốt được phím Esc đơn. Đó là chủ ý: chỗ dễ sai nhất của tính năng này là
 * chặn nhầm phím thật, và cách chắc nhất để không chặn là không cầm cái để chặn.
 */

/** Cửa sổ giữa Esc và Tab. D10 chốt 500ms, và ngưỡng là **≤**, không phải `<`. */
export const ESCAPE_FOCUS_WINDOW_MS = 500;

const ESCAPE_KEY = 'Escape';
const EXIT_KEY = 'Tab';

/**
 * Keydown của CHÍNH phím bổ trợ. Gõ `Shift+Tab` sinh một keydown `Shift` trước
 * keydown `Tab`; coi nó là "phím khác xen vào" thì `Esc Shift+Tab` không bao giờ
 * kích hoạt được.
 */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

export interface EscapeFocusDetector {
  /**
   * Nạp một lần nhấn phím. Trả `true` ĐÚNG khi lần nhấn này là `Tab` khép lại
   * chuỗi `Esc → Tab` trong cửa sổ — tức là lúc rời focus. `Esc Esc` KHÔNG
   * kích hoạt (M1).
   *
   * @param key    `KeyboardEvent.key` thô.
   * @param atMs   Mốc thời gian của lần nhấn. Người gọi phải dùng MỘT nguồn
   *               thời gian duy nhất (production dùng `event.timeStamp`); trộn
   *               `timeStamp` với `Date.now()` cho hiệu số vô nghĩa vì hai đồng
   *               hồ có gốc khác nhau.
   */
  press(key: string, atMs: number): boolean;
  /** Quên lần Esc đang treo (mất focus, đổi kết nối, …). */
  reset(): void;
}

export function createEscapeFocusDetector(
  windowMs: number = ESCAPE_FOCUS_WINDOW_MS,
): EscapeFocusDetector {
  let pendingAtMs: number | null = null;

  return {
    press(key: string, atMs: number): boolean {
      if (MODIFIER_KEYS.has(key)) {
        return false;
      }
      if (key === ESCAPE_KEY) {
        // Esc lặp lại chỉ làm MỚI mốc — `Esc Esc Tab` vẫn là cử chỉ rời đi.
        pendingAtMs = atMs;
        return false;
      }
      const completes = key === EXIT_KEY && pendingAtMs !== null && atMs - pendingAtMs <= windowMs;
      // Mọi phím khác (kể cả Tab quá hạn) đều hết treo: người dùng vẫn đang LÀM
      // VIỆC trong terminal, và Tab kế tiếp phải là Tab thường của shell.
      pendingAtMs = null;
      return completes;
    },
    reset(): void {
      pendingAtMs = null;
    },
  };
}

/**
 * Danh sách phần tử nhận được focus bằng Tab. Cố ý KHÔNG lọc theo
 * `offsetParent`/`getBoundingClientRect`: jsdom không có bố cục thật (mọi ô
 * đều 0×0) nên phép lọc đó sẽ loại SẠCH ứng viên trong test mà vẫn chạy đúng
 * trên trình duyệt — đúng hạng "xanh/đỏ vì môi trường, không vì hành vi".
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isHidden(element: Element): boolean {
  return element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true';
}

/**
 * Chuyển focus sang phần tử focus-được ĐẦU TIÊN đứng sau `element` trong thứ tự
 * tài liệu — nghĩa đen của "rời focus ra phần tử kế tiếp" ở D10.
 *
 * Phần tử NẰM TRONG `element` bị loại, và đó là cả điểm: xterm dựng một
 * `<textarea>` ẩn bên trong container để nhận bàn phím, và textarea đó khớp
 * selector trên. Không loại thì "thoát khỏi terminal" sẽ focus lại đúng chỗ vừa
 * rời — một no-op trông y như tính năng hỏng.
 *
 * @returns `true` khi đã focus được một phần tử khác; `false` khi terminal là
 *          thứ focus-được cuối trang (lúc đó chỉ `blur`, và người dùng vẫn
 *          thoát được — Tab tiếp theo bắt đầu lại từ đầu tài liệu).
 */
export function focusNextAfter(element: HTMLElement): boolean {
  const doc = element.ownerDocument;
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

  for (const candidate of candidates) {
    if (candidate === element || element.contains(candidate) || isHidden(candidate)) {
      continue;
    }
    const position = element.compareDocumentPosition(candidate);
    if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      candidate.focus();
      return true;
    }
  }

  const active = doc.activeElement;
  if (active !== null && 'blur' in active && typeof active.blur === 'function') {
    (active as HTMLElement).blur();
  }
  return false;
}
