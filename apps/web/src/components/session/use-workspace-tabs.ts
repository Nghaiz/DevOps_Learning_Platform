'use client';

import { useCallback, useState } from 'react';
import type { TerminalHandle } from '@devops-platform/terminal';
/*
  Import THẲNG từng file, KHÔNG qua barrel `../../../components/session`.

  Barrel đó re-export `terminal-pane.tsx`, và file ấy kéo theo `next/dynamic`
  cùng `@devops-platform/terminal/style.css`. Hai thứ ta cần ở đây
  (`ideSessionUrl`, một kiểu) đều là module thuần. Đi qua barrel là kéo cả xterm
  vào — chính bẫy mà chú thích đầu `terminal-pane.tsx` đã ghi, và ở đây nó còn
  làm file này không import được từ test chạy ở env `node` (env MẶC ĐỊNH của
  gói; từ 2026-09-08 một file test có thể tự bật jsdom bằng docblock
  `// @vitest-environment jsdom`, nhưng đó là lựa chọn của từng file chứ không
  phải nền chung — nên ràng buộc "đừng đi qua barrel" vẫn nguyên).
*/
import { ideSessionUrl } from './ide-layout';
import { EDITOR_TAB, TERMINAL_TAB, resolveActiveTab, type WorkspaceTabId } from './workspace-tabs';

/**
 * Trạng thái tab của `WorkspacePanel` + đường gõ lệnh vào terminal (§Y3/§Y4).
 *
 * ## Vì sao là MỘT hook chứ không ba bản chép
 *
 * Ba trang học (lesson, lab, playground) cần cùng bộ quyết định: tab nào đang
 * mở, nút "mở ra cửa sổ riêng" trỏ đi đâu, lệnh `{{exec}}` gõ thế nào. Bản chép
 * thứ hai là bản sẽ trôi, và triệu chứng của lần trôi đó ("Ctrl+C chạy đúng ở
 * bài học, sai ở lab") không trỏ về đâu cả.
 *
 * ## SỬA ĐỔI 2 đã bỏ những gì khỏi đây, và vì sao chúng KHÔNG cần thay thế
 *
 * Bản trước có `openTerminals`, `onAddTerminal`, `split`/`onToggleSplit`, một
 * `planExec` định tuyến `{{exec T2}}`, và `NEW_WINDOW_SETTLE_MS` — một khoảng
 * chờ phỏng đoán 350ms trước khi gõ vào một tmux window vừa tạo, vì `stty` của
 * shell mới xả sạch input đang chờ trong pty.
 *
 * Tất cả biến mất cùng terminal thứ hai. Đáng nói nhất là khoảng chờ phỏng
 * đoán: **cái đua nó che cũng biến mất**, chứ không phải bị giấu đi. Không tạo
 * window mới thì không có shell mới, không có `stty`, không có gì để xả.
 *
 * "Tách đôi" cũng không cần thay thế: tab Editor ĐÃ LÀ bố cục hai khoang
 * (editor trên, terminal neo đáy), nên nút cũ chỉ còn là một đường thứ hai tới
 * đúng thứ tab Editor đang làm.
 */

/** Ctrl+C. Gửi RIÊNG, không bao giờ nối vào chuỗi lệnh (xem `exec`). */
const CTRL_C = '\x03';

export interface WorkspaceTabsOptions {
  /** `null` = terminal chưa nối; mọi thao tác gõ trở thành no-op thay vì ném. */
  readonly terminal: TerminalHandle | null;
  /** Bài có khai `layout: ide` không — quyết định có tab Editor hay không. */
  readonly hasEditor: boolean;
  readonly sessionId: string | null;
}

export interface WorkspaceTabsController {
  readonly activeTab: WorkspaceTabId;
  readonly popOutUrl: string | null;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  /** §Y3 — chữ ký hai tham số. `interrupt` = gửi Ctrl+C trước khi gõ lệnh. */
  readonly exec: (command: string, interrupt: boolean) => void;
}

export function useWorkspaceTabs(options: WorkspaceTabsOptions): WorkspaceTabsController {
  const { terminal, hasEditor, sessionId } = options;

  /*
    ⚠ Lựa chọn của NGƯỜI DÙNG được lưu; mặc định thì SUY RA mỗi lượt render.

    Không dùng `useState(hasEditor ? EDITOR_TAB : TERMINAL_TAB)`: `hasEditor`
    đến từ `scenario.interfaceLayout`, mà ở lượt render ĐẦU TIÊN của trang bài
    học `scenario` còn là `null` (query chưa xong) — nên giá trị khởi tạo luôn
    được tính khi `hasEditor === false`, và mọi bài IDE sẽ mở ở tab Terminal.
    Đó chính là lỗi mà bản trước mắc với `useState(hasEditor)` cho `split`: chú
    thích của nó nói "bài IDE mở ở chế độ tách đôi", còn mã thì không bao giờ
    làm thế.

    Suy ra ở mỗi lượt render thì không có nhịp nào để lệch: bài chưa tải xong ⇒
    tab Terminal (đúng, chưa có editor); tải xong ⇒ tab Editor; người dùng bấm
    một lần ⇒ lựa chọn của họ thắng từ đó.
  */
  const [chosenTab, setChosenTab] = useState<WorkspaceTabId | null>(null);
  // `resolveActiveTab` kẹp thêm một lần ở đây, không chỉ trong panel: `popOutUrl`
  // ngay dưới rẽ nhánh theo tab, và một `editor` sót lại ở bài không có editor sẽ
  // trỏ nút mở-cửa-sổ-riêng vào một Theia không tồn tại.
  const activeTab = resolveActiveTab(chosenTab ?? (hasEditor ? EDITOR_TAB : TERMINAL_TAB), hasEditor);

  const onActivate = useCallback((tab: WorkspaceTabId) => {
    setChosenTab(tab);
  }, []);

  /*
    §Y3 — exec KHÔNG chuyển tab.

    Terminal luôn hiện ở cả hai tab (§Y1), nên không có gì để chuyển tới. Đây là
    chỗ sửa đổi này rẻ hơn bản trước: bản trước phải chuyển tab rồi mới gõ, và
    nhánh "tab đích chưa tồn tại" còn phải chờ một khoảng phỏng đoán.
  */
  const exec = useCallback(
    (command: string, interrupt: boolean) => {
      if (terminal === null) {
        return;
      }
      // `exec-interrupt` = Ctrl+C RỒI mới tới lệnh. Gửi Ctrl+C riêng chứ không
      // nối vào chuỗi: chúng là hai sự kiện bàn phím, và nối lại thì ký tự huỷ
      // trở thành một phần của dòng lệnh thay vì một tín hiệu.
      if (interrupt) {
        terminal.sendInput(CTRL_C);
      }
      terminal.sendInput(`${command}\n`);
      terminal.focus();
    },
    [terminal],
  );

  /*
    Nút mở ra cửa sổ riêng (§C7). Tab Editor đi thẳng tới Theia do gateway phục
    vụ; tab terminal đi tới route Next chỉ-có-xterm.

    `encodeURIComponent` cùng lý do `ideSessionUrl` đã có: `sessionId` đi vào
    một path, và một id mang `/` sẽ đẻ ra một URL trỏ chỗ khác.
  */
  const popOutUrl =
    sessionId === null
      ? null
      : activeTab === EDITOR_TAB
        ? ideSessionUrl(sessionId)
        : `/session/${encodeURIComponent(sessionId)}/terminal`;

  return { activeTab, popOutUrl, onActivate, exec };
}
