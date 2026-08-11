'use client';

import { useEffect, useRef } from 'react';
import { openConnection, type Connection } from './connection.ts';
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
export interface TerminalSurfaceProps {
  readonly wsUrl: string;
  /** Đổi giá trị = yêu cầu mở lại kết nối. `null` = không kết nối. */
  readonly connectionKey: number | null;
  readonly theme: ThemeName;
  readonly onControl: (message: ServerControl) => void;
  readonly onClose: (code: number) => void;
}

export function TerminalSurface(props: TerminalSurfaceProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<TerminalCore | null>(null);
  const connectionRef = useRef<Connection | null>(null);

  // Callback mới nhất trong ref: effect kết nối KHÔNG được phụ thuộc vào danh
  // tính hàm của props, nếu không mỗi lần trang re-render (đồng hồ đếm ngược
  // tick mỗi giây!) sẽ dựng lại toàn bộ WebSocket.
  const handlersRef = useRef({ onControl: props.onControl, onClose: props.onClose });
  handlersRef.current = { onControl: props.onControl, onClose: props.onClose };

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

    return () => {
      connection.close();
      if (connectionRef.current === connection) {
        connectionRef.current = null;
      }
    };
  }, [props.connectionKey, props.wsUrl]);

  return <div ref={containerRef} className="h-full w-full" data-testid="dlp-terminal" />;
}
