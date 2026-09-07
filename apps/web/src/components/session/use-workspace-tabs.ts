'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExecTarget } from '@devops-platform/scenario/content-blocks';
import type { TerminalHandle } from '@devops-platform/terminal';
/*
  Import THẲNG từng file, KHÔNG qua barrel `../../../components/session`.

  Barrel đó re-export `terminal-pane.tsx`, và file ấy kéo theo `next/dynamic`
  cùng `@devops-platform/terminal/style.css`. Ba thứ ta cần ở đây
  (`ideSessionUrl`, hai chuỗi tmux, một kiểu) đều là module thuần. Đi qua barrel
  là kéo cả xterm vào — chính bẫy mà chú thích đầu `terminal-pane.tsx` đã ghi,
  và ở đây nó còn làm file này không import được từ test chạy ở env `node`.
*/
import { ideSessionUrl } from './ide-layout';
import { TMUX_WINDOW_BY_TAB, tmuxNewWindowAt, tmuxSelectForTab } from './tmux-control';
import type { WorkspaceTabId } from './workspace-tabs';
import { PRIMARY_TERMINAL, SECONDARY_TERMINAL, planExec } from './exec-routing';

// Re-export để ba trang học chỉ phải nhớ MỘT đường import cho khoang làm việc.
export { buildTerminalTabs } from './exec-routing';

/**
 * Trạng thái tab của `WorkspacePanel` + định tuyến `onExec` theo đích (C1/C2/C6).
 *
 * ## Vì sao là MỘT hook chứ không ba bản chép
 *
 * Ba trang học (lesson, lab, playground) cần cùng bộ quyết định: tab nào đang
 * mở, gõ chuỗi tmux nào khi đổi tab, lệnh `{{exec T2}}` đi đâu. Bản chép thứ
 * hai là bản sẽ trôi, và triệu chứng của lần trôi đó ("T2 chạy đúng ở bài học,
 * sai ở lab") không trỏ về đâu cả.
 *
 * Nên file này ở `components/session/`, cạnh `tmux-control.ts` và
 * `workspace-tabs.ts` mà nó gọi. Bản đầu nằm tạm dưới `app/lessons/_workspace/`
 * vì ranh giới sở hữu lúc chạy song song; đã chuyển về đây. ⛔ Đừng chuyển
 * ngược lại vào một thư mục dưới `app/<route>/`: khi đó `labs` và `playgrounds`
 * phải import xuyên qua `../../lessons/...`, tức hai trang phụ thuộc vào cây
 * route của trang thứ ba mà không có lý do nào ngoài lịch sử.
 *
 * ## Bẫy thời gian khi chuyển tab, và vì sao chỉ MỘT nửa của nó cần chờ
 *
 * Đổi tab tmux là gõ `\x02 2` vào **chính** WebSocket đang mang lệnh. Nên với
 * một window ĐÃ TỒN TẠI thì **không có đua nào cả**, và cái không-đua đó đến từ
 * cấu trúc chứ không từ may mắn: mọi byte đi qua một dòng có thứ tự (WS trên
 * TCP) tới một pty duy nhất, và tmux đọc dòng đó tuần tự — nó thấy `\x02 2`,
 * đổi window đang hoạt, rồi mới đọc tới byte kế. Byte kế KHÔNG THỂ tới trước.
 * Chèn `setTimeout` ở nhánh này là thêm độ trễ cảm nhận được để mua một sự bảo
 * đảm vốn đã có sẵn.
 *
 * Nhánh **window MỚI** (`\x02 c`) thì khác thật, và đây là chỗ tôi phải nói
 * thẳng là mình chỉ giảm thiểu chứ không đóng được: window mới sinh ra một
 * shell mới, và một shell lúc khởi động chạy `stty` — thao tác đó **xả** input
 * đang nằm chờ trong pty (`TCIFLUSH`). Lệnh gõ vào ngay lúc ấy biến mất không
 * dấu vết: không lỗi, không echo, chỉ là một dấu nhắc trống.
 *
 * Không có ack nào để chờ: `TerminalHandle` (C3) chỉ có `sendInput`/`focus`/
 * `fit` — không có kênh đọc output, nên client KHÔNG CÁCH NÀO biết shell đã sẵn
 * sàng. Vậy nên nhánh này chờ một khoảng CỐ ĐỊNH, và đó là một phỏng đoán, đúng
 * nghĩa. Nó đặt riêng cho nhánh hiếm, để nhánh thường (gần như mọi lượt gõ) vẫn
 * đồng bộ và chính xác tuyệt đối.
 *
 * Muốn đóng hẳn thì cần Lane D/E mở một tín hiệu "pane đã sẵn sàng" trên
 * `TerminalHandle`; khi có, xoá hằng dưới đây và chờ tín hiệu đó.
 */
const NEW_WINDOW_SETTLE_MS = 350;

/** Ctrl+C. Gửi RIÊNG, không bao giờ nối vào chuỗi lệnh (xem `execTo`). */
const CTRL_C = '\x03';

export interface WorkspaceTabsOptions {
  /** `null` = terminal chưa nối; mọi thao tác gõ trở thành no-op thay vì ném. */
  readonly terminal: TerminalHandle | null;
  /** Bài có khai `layout: ide` không — quyết định tab Editor và chế độ tách đôi mặc định. */
  readonly hasEditor: boolean;
  readonly sessionId: string | null;
}

export interface WorkspaceExecOptions {
  readonly interrupt: boolean;
  readonly target: ExecTarget | null;
}

export interface WorkspaceTabsController {
  readonly activeTab: WorkspaceTabId;
  /** Tab terminal nào đang mở — dùng để dựng khoá của `terminals` map. */
  readonly openTerminals: readonly ExecTarget[];
  readonly split: boolean;
  readonly popOutUrl: string | null;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  /** `null` khi đã mở đủ hai tab ⇒ call-site bỏ hẳn prop để panel ẩn nút '+' (C5). */
  readonly onAddTerminal: (() => void) | null;
  readonly onToggleSplit: () => void;
  /** Chữ ký mới của C2 — `target: null` = "terminal đang hoạt". */
  readonly execTo: (command: string, options: WorkspaceExecOptions) => void;
}

export function useWorkspaceTabs(options: WorkspaceTabsOptions): WorkspaceTabsController {
  const { terminal, hasEditor, sessionId } = options;

  const [activeTab, setActiveTab] = useState<WorkspaceTabId>(PRIMARY_TERMINAL);
  const [openTerminals, setOpenTerminals] = useState<readonly ExecTarget[]>([PRIMARY_TERMINAL]);
  /*
    Bài IDE mở ở chế độ tách đôi, KHÔNG phải một tab Editor đơn độc — đây là giữ
    nguyên hành vi cũ, không phải một lựa chọn thẩm mỹ mới. Bố cục trước bản này
    là `nội dung | (editor | terminal)`: editor và terminal cùng nhìn thấy. Mặc
    định `split = false` sẽ làm mọi bài IDE đang chạy đột ngột mất một khoang, và
    người học phải tự tìm ra nút tách đôi để lấy lại thứ họ vốn có.
  */
  const [split, setSplit] = useState(hasEditor);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      // Lệnh đang chờ gõ vào một window vừa tạo phải chết cùng component: gõ vào
      // một terminal đã tháo là một lần ghi vào phiên đã đóng.
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const onActivate = useCallback(
    (tab: WorkspaceTabId) => {
      setActiveTab(tab);
      if (tab !== 'editor') {
        /*
          Gõ select KHÔNG điều kiện, kể cả khi ta tin tmux đã ở đúng window.
          `select-window` tới window đang hoạt là no-op ở phía tmux, nên cái giá
          là 2 byte; còn cái giá của việc bỏ qua là ta phải TIN vào một bản sao
          trạng thái phía client, thứ lệch được với tmux thật — người học tự gõ
          `Ctrl-B 2` là đủ lệch, và ta không nhìn thấy điều đó.
        */
        // `tmuxSelectForTab` trả `string | null` — `null` cho tab không do tmux
        // điều khiển. Nhánh này đã loại `editor`, nên `null` ở đây nghĩa là
        // Lane E thêm một tab terminal mà `TMUX_WINDOW_BY_TAB` chưa biết. Bỏ
        // qua thay vì gõ chuỗi rỗng: gõ '' vào terminal không làm gì, nhưng nó
        // che mất việc ta vừa yêu cầu một thứ hệ thống không làm được.
        const keys = tmuxSelectForTab(tab);
        if (keys !== null) {
          terminal?.sendInput(keys);
        }
      }
    },
    [terminal],
  );

  const addTerminal = useCallback((): void => {
    if (openTerminals.includes(SECONDARY_TERMINAL)) {
      return;
    }
    // Nêu chỉ số, không dùng `prefix c`: xem "Ánh xạ CỨNG" trong `tmux-control.ts`.
    terminal?.sendInput(tmuxNewWindowAt(TMUX_WINDOW_BY_TAB[SECONDARY_TERMINAL]));
    setOpenTerminals((prev) => [...prev, SECONDARY_TERMINAL]);
    setActiveTab(SECONDARY_TERMINAL);
  }, [openTerminals, terminal]);

  const execTo = useCallback(
    (command: string, exec: WorkspaceExecOptions) => {
      if (terminal === null) {
        return;
      }
      const plan = planExec({ activeTab, openTerminals, target: exec.target });

      const type = (): void => {
        // `exec-interrupt` = Ctrl+C RỒI mới tới lệnh. Gửi Ctrl+C riêng chứ không
        // nối vào chuỗi: chúng là hai sự kiện bàn phím, và nối lại thì ký tự
        // huỷ trở thành một phần của dòng lệnh thay vì một tín hiệu.
        if (exec.interrupt) {
          terminal.sendInput(CTRL_C);
        }
        terminal.sendInput(`${command}
`);
        terminal.focus();
      };

      // Tab đích chưa tồn tại thì tạo TRƯỚC, rồi mới gõ — và CHỈ nhánh này phải
      // chờ (xem khối chú thích ở `NEW_WINDOW_SETTLE_MS`).
      if (plan.createWindow) {
        addTerminal();
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(type, NEW_WINDOW_SETTLE_MS);
        return;
      }

      // Chuyển tab TRƯỚC, rồi gõ — đúng hành vi KillerCoda. Cả hai đi vào cùng
      // một dòng byte có thứ tự, nên "trước" ở đây là bảo đảm, không phải hy vọng.
      onActivate(plan.destination);
      type();
    },
    [activeTab, addTerminal, onActivate, openTerminals, terminal],
  );

  const onToggleSplit = useCallback(() => {
    setSplit((prev) => !prev);
  }, []);

  /*
    Nút mở ra cửa sổ riêng (C7). Tab Editor đi thẳng tới Theia do gateway phục
    vụ; tab terminal đi tới route Next chỉ-có-xterm của Lane E.

    `encodeURIComponent` cùng lý do `ideSessionUrl` đã có: `sessionId` đi vào
    một path, và một id mang `/` sẽ đẻ ra một URL trỏ chỗ khác.
  */
  const popOutUrl =
    sessionId === null
      ? null
      : activeTab === 'editor'
        ? ideSessionUrl(sessionId)
        : `/session/${encodeURIComponent(sessionId)}/terminal`;

  return {
    activeTab,
    openTerminals,
    split,
    popOutUrl,
    onActivate,
    onAddTerminal: openTerminals.includes(SECONDARY_TERMINAL) ? null : addTerminal,
    onToggleSplit,
    execTo,
  };
}
