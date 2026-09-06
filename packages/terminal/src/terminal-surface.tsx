'use client';

import { useEffect, useRef } from 'react';
import { openConnection, type Connection } from './connection.ts';
import { createEscapeFocusDetector } from './escape-focus.ts';
import { createTerminalCore, waitForFonts, type TerminalCore } from './terminal-core.ts';
import type { ServerControl } from './protocol.ts';
import type { ThemeName } from './themes.ts';

/**
 * F6 — binding React cho MỘT lần nối.
 *
 * Ranh giới có chủ ý: component này KHÔNG biết gì về tRPC, backoff, hay máy
 * trạng thái. Nó chỉ dựng xterm, mở đúng một WebSocket, và báo ngược lên. Vòng
 * nối lại và quyết định "còn đáng nối không" nằm ở `session-machine.ts` (thuần,
 * test được) và ở trang `/session`. Trộn hai thứ vào một component là lý do
 * điển hình khiến logic reconnect chỉ test được bằng cách dựng cả DOM.
 *
 * `connectionKey` là cần câu để nối lại: đổi giá trị ⇒ effect kết nối chạy lại
 * ⇒ WS cũ đóng, WS mới mở. Terminal (và scrollback) KHÔNG bị dựng lại vì nó
 * nằm ở một effect khác với deps rỗng — nối lại phải thấy đúng màn hình cũ.
 */
/**
 * Tay cầm để GÕ VÀO PTY từ bên ngoài terminal — thứ mà nút `{{exec}}` của bài
 * học và `foreground` script của Killercoda cần.
 *
 * ⚠ Đừng nhầm với `TerminalCore.write()`: `write` VẼ byte lên màn hình (nó là
 * đường server → mắt người dùng). `sendInput` đi ngược lại, vào stdin của shell
 * — đúng như người dùng vừa gõ. Dùng nhầm `write` thì lệnh hiện ra trên màn
 * hình mà không có gì chạy, và trông y hệt như đã chạy.
 */
export interface TerminalHandle {
  /** Gõ chuỗi vào PTY. Muốn Enter thì tự kèm `'\r'` — hàm này không tự thêm. */
  sendInput(data: string): void;
  focus(): void;
}

export interface TerminalSurfaceProps {
  readonly wsUrl: string;
  /** Đổi giá trị = yêu cầu mở lại kết nối. `null` = không kết nối. */
  readonly connectionKey: number | null;
  readonly theme: ThemeName;
  readonly onControl: (message: ServerControl) => void;
  readonly onClose: (code: number) => void;
  /**
   * Phát handle mỗi khi kết nối MỞ, và phát `null` mỗi khi nó đóng.
   *
   * Vế `null` là phần quan trọng, không phải phần dọn dẹp cho gọn: không có nó
   * thì nút "Chạy lệnh này" vẫn sáng trong lúc PTY đã chết, người dùng bấm, và
   * `Connection.sendInput` NO-OP im lặng (có chủ ý — xem connection.ts, byte gõ
   * lúc đang nối lại cố tình không được xếp hàng). Người dùng thấy một nút bấm
   * được mà không có gì xảy ra, mà đây lại đúng là lúc terminal đang nối lại
   * nên trông như nền tảng bị treo.
   *
   * Callback chứ không phải `ref`: handle gắn với ĐÚNG một `Connection`, nên
   * nối lại là một handle mới. Một ref bền vững sẽ che mất chuyển tiếp đó.
   */
  readonly onReady?: (handle: TerminalHandle | null) => void;
  /**
   * Nhãn a11y cho container (D10). Container mang `role="application"`, và một
   * `application` KHÔNG có tên là một nút thắt cho trình đọc màn hình: nó vừa
   * tắt điều hướng thông thường vừa không nói mình là cái gì.
   */
  readonly ariaLabel?: string;
  /**
   * D10 — gọi khi người dùng nhấn `Esc` **hai lần trong 500ms**.
   *
   * `TerminalSurface` chỉ PHÁT HIỆN, không tự chuyển focus: "rời đi đâu" là
   * quyết định của trang (khoang kế tiếp, thanh công cụ, …), còn "khi nào là
   * cử chỉ rời đi" là quyết định của terminal. Người tiêu thụ mặc định
   * (`components/session/TerminalPane` ở apps/web) dùng `focusNextAfter`.
   */
  readonly onEscapeFocus?: () => void;
}

export function TerminalSurface(props: TerminalSurfaceProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<TerminalCore | null>(null);
  const connectionRef = useRef<Connection | null>(null);

  // Callback mới nhất trong ref: effect kết nối KHÔNG được phụ thuộc vào danh
  // tính hàm của props, nếu không mỗi lần trang re-render (đồng hồ đếm ngược
  // tick mỗi giây!) sẽ dựng lại toàn bộ WebSocket.
  const handlersRef = useRef({
    onControl: props.onControl,
    onClose: props.onClose,
    onReady: props.onReady,
    onEscapeFocus: props.onEscapeFocus,
  });
  handlersRef.current = {
    onControl: props.onControl,
    onClose: props.onClose,
    onReady: props.onReady,
    onEscapeFocus: props.onEscapeFocus,
  };

  // ── Vòng đời TERMINAL: mount một lần, sống qua mọi lần nối lại ──────────────
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    // StrictMode dev chạy effect hai lần. `cancelled` + dispose-ngay là hai vế
    // BẮT BUỘC: `waitForFonts()` là async, nên cleanup có thể chạy TRƯỚC khi
    // await xong. Thiếu vế này thì lần mount thứ hai để lại một xterm mồ côi
    // (2 canvas WebGL) mà không ref nào trỏ tới để dispose.
    let cancelled = false;
    let created: TerminalCore | null = null;

    const core = createTerminalCore({
      container,
      theme: props.theme,
      onData: (data) => connectionRef.current?.sendInput(data),
      onResize: (size) => connectionRef.current?.sendResize(size),
    });
    created = core;
    coreRef.current = core;

    void waitForFonts().then(() => {
      if (cancelled) {
        return;
      }
      // F4 — chỉ đo SAU khi font đã load, nếu không FitAddon chia theo metric
      // của font fallback và prompt vẽ sai bề rộng ngay lần đầu.
      core.measure();
      core.focus();
    });

    return () => {
      cancelled = true;
      created?.dispose();
      if (coreRef.current === created) {
        coreRef.current = null;
      }
    };
    // Deps RỖNG có chủ ý dù thân effect đọc `props.theme`: theme chỉ dùng làm
    // giá trị KHỞI TẠO, còn mọi lần đổi sau đi qua `setTheme` ở effect dưới.
    // Thêm `props.theme` vào deps sẽ dựng lại cả terminal mỗi lần đổi màu và
    // xoá sạch scrollback của người dùng.
    //
    // (Repo chưa bật plugin `react-hooks`, nên không có eslint-disable ở đây —
    // một `eslint-disable-next-line` trỏ vào rule không tồn tại là LỖI lint.)
  }, []);

  // ── Đổi theme tại chỗ ──────────────────────────────────────────────────────
  useEffect(() => {
    coreRef.current?.setTheme(props.theme);
  }, [props.theme]);

  // ── D10: Esc-Esc rời focus ─────────────────────────────────────────────────
  //
  // ⛔ Vị trí của listener này là phần ĐÚNG-SAI, không phải phần phong cách.
  //
  // Đo từ `@xterm/xterm@6.0.0/lib/xterm.js`: `_keyDown` kết thúc bằng
  // `this.cancel(e, true)`, và `cancel` là
  // `e.preventDefault(), e.stopPropagation()`. Nghĩa là **Escape bị chặn ngay
  // tại `<textarea>` nội bộ của xterm** — một `onKeyDown` React trên container
  // (pha bubble) sẽ KHÔNG BAO GIỜ thấy nó, và tính năng sẽ "im lặng không chạy"
  // đúng theo kiểu khó chẩn đoán nhất: không lỗi, không cảnh báo, chỉ là Esc-Esc
  // không làm gì cả.
  //
  // Nên: listener NATIVE ở pha CAPTURE trên container. Pha capture đi từ
  // window xuống, nên nó chạy TRƯỚC listener của xterm ở textarea.
  //
  // Và vì nó chạy trước, nó tuyệt đối KHÔNG được gọi `preventDefault()` hay
  // `stopPropagation()`: làm vậy là nuốt mất phím Esc ĐƠN mà vim đang cần. Đó
  // là lý do `createEscapeFocusDetector` chỉ nhận `(key, atMs)` chứ không nhận
  // `Event` — nó không cầm cái để nuốt. Kể cả lần Esc thứ hai cũng được thả cho
  // xterm: một `\x1b` thừa vào PTY là vô hại ở mọi TUI (vim normal mode bỏ qua),
  // còn một nhánh code có quyền huỷ sự kiện thì sớm muộn sẽ huỷ nhầm.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const detector = createEscapeFocusDetector();
    const handleKeyDown = (event: KeyboardEvent): void => {
      // `event.timeStamp` chứ không `Date.now()`: một nguồn thời gian duy nhất
      // (xem chú thích `press`), và nó là mốc của chính lần nhấn phím.
      if (detector.press(event.key, event.timeStamp)) {
        handlersRef.current.onEscapeFocus?.();
      }
    };
    // Rời khỏi terminal bằng chuột/Tab thì quên lần Esc đang treo — nếu không,
    // một Esc từ mười phút trước còn treo và lần Esc đầu tiên khi quay lại sẽ
    // đá người dùng ra ngay lập tức.
    const handleBlur = (): void => {
      detector.reset();
    };
    container.addEventListener('keydown', handleKeyDown, true);
    container.addEventListener('focusout', handleBlur);
    return () => {
      container.removeEventListener('keydown', handleKeyDown, true);
      container.removeEventListener('focusout', handleBlur);
    };
  }, []);

  // ── Vòng đời KẾT NỐI: mở lại mỗi khi connectionKey đổi ──────────────────────
  useEffect(() => {
    if (props.connectionKey === null) {
      return;
    }
    const core = coreRef.current;
    if (core === null) {
      return;
    }

    const connection = openConnection({
      url: props.wsUrl,
      // Đo NGAY tại đây thay vì dùng một giá trị cached: `init` phải mang kích
      // thước THẬT lúc mở (contract §3), và giữa lần mount và lần nối lại người
      // dùng có thể đã kéo cửa sổ.
      initialSize: core.measure(),
      onControl: (message) => handlersRef.current.onControl(message),
      onBinary: (chunk) => core.write(chunk),
      onClose: (code) => handlersRef.current.onClose(code),
    });
    connectionRef.current = connection;

    // Handle đóng kín quanh ĐÚNG `connection` này, không đọc `connectionRef` —
    // nên một handle cũ mà consumer lỡ giữ lại sau khi nối lại sẽ ghi vào socket
    // đã đóng (no-op), chứ KHÔNG lén ghi vào phiên mới. Ghi nhầm phiên là lỗi
    // im lặng tệ hơn nhiều so với một lệnh bị rơi.
    handlersRef.current.onReady?.({
      sendInput: (data) => connection.sendInput(data),
      focus: () => coreRef.current?.focus(),
    });

    return () => {
      connection.close();
      if (connectionRef.current === connection) {
        connectionRef.current = null;
      }
      handlersRef.current.onReady?.(null);
    };
  }, [props.connectionKey, props.wsUrl]);

  return (
    <div
      ref={containerRef}
      /*
        `role="application"` — xterm nuốt gần như mọi phím, nên trình đọc màn
        hình PHẢI ngừng chế độ duyệt và giao thẳng bàn phím cho widget. Cặp đôi
        bắt buộc của nó là `aria-label` (một `application` vô danh không nói
        được mình là gì) và một đường THOÁT bằng bàn phím — chính là Esc-Esc ở
        effect trên. Thiếu đường thoát thì `role="application"` biến terminal
        thành bẫy focus, tức đổi một lỗi a11y lấy một lỗi a11y nặng hơn.

        `tabIndex={0}` để Tab tới được container ngay cả trước khi xterm dựng
        xong textarea nội bộ của nó.
      */
      role="application"
      tabIndex={0}
      aria-label={props.ariaLabel}
      className="h-full w-full"
      data-testid="dlp-terminal"
    />
  );
}
