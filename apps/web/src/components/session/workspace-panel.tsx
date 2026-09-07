'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ExternalLink, SquareTerminal, FileCode2 } from 'lucide-react';
import { cn } from '@devops-platform/ui';
import { WorkspaceLayoutProvider } from './workspace-layout';
import {
  EDITOR_TAB,
  TERMINAL_PERCENT_DEFAULT,
  TERMINAL_PERCENT_MAX,
  TERMINAL_PERCENT_MIN,
  TERMINAL_TAB,
  WORKSPACE_TAB_LABEL,
  browserStorage,
  clampTerminalPercent,
  isEditorVisible,
  listWorkspaceTabs,
  nextTabOnKey,
  nextTerminalPercentOnKey,
  readWorkspaceState,
  resolveActiveTab,
  workspaceLayoutToken,
  workspaceStorageKey,
  writeWorkspaceState,
  type WorkspaceTabId,
} from './workspace-tabs';

/**
 * §Y1/§Y4/§Y6 — khoang phải kiểu KillerCoda: **MỘT terminal, hiện ở CẢ HAI tab**.
 *
 * ```
 * TAB EDITOR                      TAB TERMINAL
 * ┌──────────────────┐            ┌──────────────────┐
 * │ Theia (iframe)   │            │                  │
 * │ cây file+editor  │            │  CÙNG terminal   │
 * ├──────────────────┤            │  toàn khoang     │
 * │ CÙNG terminal    │            │                  │
 * │ (neo đáy, ~40%)  │            │                  │
 * └──────────────────┘            └──────────────────┘
 * ```
 *
 * ## ⛔ BẤT BIẾN SỐNG-CHẾT: terminal KHÔNG đổi cha, KHÔNG bị ẩn
 *
 * Đây là điều kiện đúng-sai của cả sửa đổi, không phải một tối ưu. Dời một
 * component giữa hai cha là **unmount + mount lại** — WebSocket đóng, phiên làm
 * việc của người học mất, và không có thông báo lỗi nào.
 *
 * Nên khoang là MỘT ngăn xếp dọc CỐ ĐỊNH với ba con tĩnh, luôn ở đúng vị trí:
 *
 * 1. hàng 1 — editor (Theia). `hidden` khi ở tab Terminal.
 * 2. thanh kéo — `hidden` khi hàng 1 ẩn.
 * 3. hàng 2 — terminal. **KHÔNG BAO GIỜ `hidden`**, chỉ đổi chiều cao.
 *
 * Chuyển tab đổi đúng hai thứ: hàng 1 ẩn/hiện, và `flex` của hàng 2 (một dải
 * ~40% neo đáy ⇄ chiếm trọn khoang).
 *
 * ⚠ Hàng 1 phải LUÔN được render kể cả khi bài không có Editor (chỉ `hidden`),
 * vì React so trùng các con tĩnh theo VỊ TRÍ: bỏ hẳn hàng 1 sẽ đẩy thanh kéo và
 * hàng 2 lên một bậc, khớp hàng 2 với vị trí của thanh kéo — tức unmount cái
 * xterm, tức đóng WebSocket.
 *
 * ⚠ Hệ quả CSS phải nhớ: phần tử mang thuộc tính `hidden` KHÔNG được mang một
 * tiện ích `display` nào (`flex`, `grid`, `block`…). Luật `[hidden]{display:none}`
 * đến từ stylesheet của trình duyệt, còn `.flex{display:flex}` đến từ stylesheet
 * của tác giả — cùng độ đặc hiệu thì tác giả THẮNG, và `hidden` trở thành một
 * thuộc tính không có tác dụng gì, không báo gì. `workspace-panel.test.tsx` quét
 * mọi thẻ ở cả hai tab để giữ điều này.
 *
 * ⚠ Đổi chiều cao là đổi kích thước ⇒ xterm phải `fit()` lại. Panel không cầm
 * `TerminalHandle` (nó chỉ nhận `ReactNode`), nên nó phát một chuỗi mô tả hình
 * học qua `WorkspaceLayoutProvider`; `TerminalPane` nghe chuỗi đó và fit sau
 * `requestAnimationFrame`. Xem `workspace-layout.tsx`.
 *
 * ## Thanh tab: cao CỐ ĐỊNH, và không có tablist khi chỉ có một mục
 *
 * Chiều cao cố định không phải để cho đẹp: bất cứ thứ gì xuất hiện/biến mất
 * quanh terminal đều làm `ResizeObserver` của xterm bắn và fit lại đúng lúc
 * người dùng đang gõ — cùng lo ngại đã ghi ở `terminal-pane.tsx` quanh gợi ý
 * Esc-Esc. `h-9 shrink-0` ở MỌI trạng thái.
 *
 * Nhưng khi bài không khai `layout: ide` thì chỉ còn MỘT tab, và một
 * `role="tablist"` một mục là nhiễu thị giác chứ không phải chức năng (§Y4) —
 * người dùng không chuyển đi đâu được, còn trình đọc màn hình thì nghe "tab 1
 * trên 1". Ở trạng thái đó thanh này vẫn còn (nó mang nút mở-ra-cửa-sổ-riêng
 * của §C7, một chức năng thật), nhưng phần trái là một nhãn tĩnh và hai hàng
 * KHÔNG mang `role="tabpanel"` — không có tab thì không có tabpanel, và trỏ
 * `aria-labelledby` vào một id không tồn tại là vi phạm `aria-valid-attr-value`
 * của axe.
 *
 * ⚠ Điều đã cân nhắc và chấp nhận: khi ở tab Editor, hàng 2 (`role="tabpanel"`
 * của tab Terminal) VẪN hiện dù tab Terminal không được chọn. Đó là đúng mô
 * hình — tab ở đây quyết định *editor có chiếm chỗ không*, chứ terminal thì
 * luôn có mặt — nhưng nó lệch khuôn tabpanel thông thường. Đổi hàng 2 thành
 * `role="region"` sẽ làm tab Terminal không còn `aria-controls` hợp lệ, tức đổi
 * một chỗ lệch nhỏ lấy một chỗ lệch to hơn.
 */
export interface WorkspacePanelProps {
  /** Vắng mặt ⇒ không có tab Editor (bài không khai layout ide). */
  readonly editor?: ReactNode;
  readonly terminal: ReactNode;
  readonly activeTab: WorkspaceTabId;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  /** URL mở tab hiện tại ra cửa sổ trình duyệt riêng. null ⇒ ẩn nút. */
  readonly popOutUrl: string | null;
  readonly storageKey?: string;
}

const TAB_ICON = {
  editor: FileCode2,
  terminal: SquareTerminal,
} as const;

export function WorkspacePanel({
  editor,
  terminal,
  activeTab,
  onActivate,
  popOutUrl,
  storageKey,
}: WorkspacePanelProps): ReactElement {
  const hasEditor = editor !== undefined;
  const tabs = listWorkspaceTabs(hasEditor);
  const resolvedActive = resolveActiveTab(activeTab, hasEditor);
  const editorVisible = isEditorVisible(resolvedActive, hasEditor);

  const domId = useId();
  const tabDomId = (tab: WorkspaceTabId): string => `${domId}-tab-${tab}`;
  const editorPanelId = `${domId}-panel-editor`;
  const terminalPanelId = `${domId}-panel-terminal`;

  const { terminalPercent, setTerminalPercent, persistTerminalPercent } = useWorkspaceMemory({
    storageKey,
    hasEditor,
    activeTab: resolvedActive,
    onActivate,
  });

  const stackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const layout = workspaceLayoutToken({ activeTab: resolvedActive, hasEditor, terminalPercent });

  const handleTablistKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const next = nextTabOnKey(event.key, tabs, resolvedActive);
      if (next === null) {
        // Phím ngoài khuôn (`Tab`, phím tắt trình duyệt) — KHÔNG nuốt.
        return;
      }
      event.preventDefault();
      onActivate(next);
    },
    [tabs, resolvedActive, onActivate],
  );

  // ── Thanh kéo chiều cao (§Y6) ─────────────────────────────────────────────
  //
  // ⛔ Tuyệt đối KHÔNG dựng bằng cách render terminal ở hai nhánh khác nhau —
  // đó là đúng thứ §Y1 cấm. Ở đây chỉ có một hàng terminal, và thanh kéo đổi
  // `flexBasis` của chính nó.
  //
  // Không dùng `SplitPane` của `packages/ui`: nó chia NGANG và chỉ chia ngang
  // (flex-row, đọc `event.clientX`, `cursor-col-resize`,
  // `aria-orientation="vertical"`). Nới nó ra thành hai chiều là sửa file của
  // lane khác; một thanh kéo dọc tối giản ở đây rẻ hơn và không đụng ai.

  const commitPercentFromPointer = useCallback(
    (clientY: number) => {
      const stack = stackRef.current;
      if (stack === null) {
        return;
      }
      const rect = stack.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      // Đo từ ĐÁY lên: hàng 2 nằm dưới, nên kéo thanh lên là terminal cao thêm.
      setTerminalPercent(((rect.bottom - clientY) / rect.height) * 100);
    },
    [setTerminalPercent],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // `setPointerCapture` thay vì listener trên `window`: giữ được luồng kéo cả
    // khi con trỏ rời khỏi thanh lúc kéo nhanh, và chạy luôn cho cảm ứng.
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) {
        return;
      }
      commitPercentFromPointer(event.clientY);
    },
    [dragging, commitPercentFromPointer],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) {
        return;
      }
      setDragging(false);
      // Ghi `localStorage` ĐÚNG một lần lúc thả — `pointermove` bắn hàng chục
      // lần/giây, ghi ở mỗi lần là I/O đồng bộ thừa vô ích (cùng quyết định với
      // `SplitPane`).
      persistTerminalPercent();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Đã tự nhả (phần tử unmount giữa chừng khi đang kéo) — bỏ qua.
      }
    },
    [dragging, persistTerminalPercent],
  );

  const handleSeparatorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const next = nextTerminalPercentOnKey(event.key, terminalPercent);
      if (next === null) {
        return;
      }
      event.preventDefault();
      setTerminalPercent(next);
      // Mỗi lần nhấn phím là một bước "chốt" rời rạc (khác `pointermove` liên
      // tục), nên ghi ngay — không cần đợi một sự kiện "thả" riêng.
      persistTerminalPercent(next);
    },
    [terminalPercent, setTerminalPercent, persistTerminalPercent],
  );

  /*
    Hàng 2 ở tab Editor: một dải cố định `terminalPercent`% neo đáy (hàng 1 mang
    `flex-1` nên nó nuốt phần còn lại). Ở tab Terminal: hàng 1 `display:none`
    nên không chiếm chỗ, và hàng 2 phải GIÃN ra — `flexBasis` giữ nguyên % thì
    khoang chỉ đầy 40% và 60% còn lại là một mảng trống.
  */
  const terminalRowStyle: CSSProperties = editorVisible
    ? { flexBasis: `${String(terminalPercent)}%`, flexGrow: 0, flexShrink: 0 }
    : { flexBasis: 'auto', flexGrow: 1, flexShrink: 1 };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-card">
      {/* Thanh tab — cao cố định, có mặt ở mọi trạng thái. Xem chú thích đầu file. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
        {tabs.length > 1 ? (
          <div
            role="tablist"
            aria-label="Khoang làm việc"
            aria-orientation="horizontal"
            className="flex min-w-0 items-center gap-1 overflow-x-auto"
            onKeyDown={handleTablistKeyDown}
          >
            {tabs.map((tab) => (
              <WorkspaceTabButton
                key={tab}
                tab={tab}
                id={tabDomId(tab)}
                controls={tab === EDITOR_TAB ? editorPanelId : terminalPanelId}
                active={tab === resolvedActive}
                onActivate={onActivate}
              />
            ))}
          </div>
        ) : (
          /*
            Một tab ⇒ nhãn tĩnh, không `role="tab"`. Vẫn giữ icon + chữ để thanh
            này đọc ra là "đây là khoang terminal" chứ không phải một dải trống
            có mỗi một nút ở góc phải.
          */
          <span className="flex h-7 shrink-0 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
            <SquareTerminal aria-hidden="true" className="size-3.5 shrink-0" />
            {WORKSPACE_TAB_LABEL[TERMINAL_TAB]}
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {popOutUrl === null ? null : (
            <a
              href={popOutUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Mở tab này ra một cửa sổ riêng"
              className={cn(
                'flex size-6 items-center justify-center rounded text-muted-foreground',
                'transition-colors duration-(--motion-fast) hover:bg-accent hover:text-accent-foreground',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">Mở tab này ra cửa sổ riêng</span>
            </a>
          )}
        </div>
      </div>

      {/*
        ⛔ NGĂN XẾP DỌC CỐ ĐỊNH — ba con tĩnh, luôn ở đúng vị trí này. Đọc chú
        thích đầu file trước khi thêm/bớt bất cứ gì ở đây.

        `select-none` lúc kéo: không có nó thì con trỏ quét qua nội dung editor
        và bôi đen chữ trong lúc người dùng chỉ định đổi chiều cao.
      */}
      <div
        ref={stackRef}
        className={cn('flex min-h-0 flex-1 flex-col', dragging && 'select-none')}
      >
        {/*
          Hàng 1 — editor. ⛔ KHÔNG có tiện ích `display` trên phần tử mang
          `hidden`; `flex-1`/`min-h-0`/`min-w-0` không phải `display`.
        */}
        <div
          {...(tabs.length > 1
            ? { role: 'tabpanel', 'aria-labelledby': tabDomId(EDITOR_TAB) }
            : {})}
          id={editorPanelId}
          hidden={!editorVisible}
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <div className="h-full w-full">{editor}</div>
        </div>

        {/*
          Thanh kéo. `hidden` chứ không render có điều kiện: cùng một lý do như
          hai hàng — đổi cấu trúc cây quanh terminal là mời React so trùng lại.
        */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Kéo để đổi chiều cao khoang terminal"
          aria-valuenow={terminalPercent}
          aria-valuemin={TERMINAL_PERCENT_MIN}
          aria-valuemax={TERMINAL_PERCENT_MAX}
          tabIndex={editorVisible ? 0 : -1}
          hidden={!editorVisible}
          className={cn(
            'h-1.5 shrink-0 grow-0 cursor-row-resize touch-none bg-border',
            'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleSeparatorKeyDown}
        />

        {/*
          Hàng 2 — TERMINAL. ⛔ KHÔNG BAO GIỜ mang `hidden`, không bao giờ rời
          vị trí này. Nếu bạn đang định thêm `hidden={...}` ở đây thì hãy đọc lại
          §Y1: đó là đóng WebSocket của người học.
        */}
        <div
          {...(tabs.length > 1
            ? { role: 'tabpanel', 'aria-labelledby': tabDomId(TERMINAL_TAB) }
            : {})}
          id={terminalPanelId}
          className="min-h-0 min-w-0 overflow-hidden"
          style={terminalRowStyle}
        >
          <WorkspaceLayoutProvider layout={layout}>
            <div className="h-full w-full">{terminal}</div>
          </WorkspaceLayoutProvider>
        </div>
      </div>
    </div>
  );
}

function WorkspaceTabButton({
  tab,
  id,
  controls,
  active,
  onActivate,
}: {
  readonly tab: WorkspaceTabId;
  readonly id: string;
  readonly controls: string;
  readonly active: boolean;
  readonly onActivate: (tab: WorkspaceTabId) => void;
}): ReactElement {
  const Icon = TAB_ICON[tab];

  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      /* Roving tabindex: đúng MỘT tab trong vòng Tab, mũi tên đi giữa các tab.
         Đây là khuôn ARIA APG — không có nó thì thanh tab ngốn thêm một lần Tab
         của ngân sách 30 lần mà `e2e/keyboard.spec.ts` gác. */
      tabIndex={active ? 0 : -1}
      onClick={() => {
        onActivate(tab);
      }}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs font-medium whitespace-nowrap',
        'transition-colors duration-(--motion-fast)',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-accent text-accent-foreground shadow-elevation-1'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {WORKSPACE_TAB_LABEL[tab]}
    </button>
  );
}

interface WorkspaceMemory {
  readonly terminalPercent: number;
  /** Đổi giá trị đang hiển thị. KHÔNG ghi storage — dùng lúc đang kéo. */
  readonly setTerminalPercent: (percent: number) => void;
  /** Chốt vào storage. Truyền `percent` khi giá trị mới chưa kịp vào state. */
  readonly persistTerminalPercent: (percent?: number) => void;
}

/**
 * Ghi nhớ (tab đang hoạt + chiều cao khoang terminal) qua `localStorage`.
 *
 * ## Vì sao tab khôi phục bằng `onActivate` còn chiều cao thì bằng state
 *
 * §Y4 khai `activeTab` là prop ĐIỀU KHIỂN — cha giữ sự thật, nên panel chỉ có
 * thể YÊU CẦU cha đổi, đúng một lần ngay sau khi mount. Giữ một bản sao thứ hai
 * bên trong panel sẽ lệch với cha ngay lần cha đổi `activeTab` vì lý do riêng
 * của nó.
 *
 * Chiều cao thì ngược lại: §Y4 KHÔNG khai nó là prop, nên panel là chủ sở hữu
 * duy nhất và một `useState` ở đây chính là nguồn sự thật, không phải bản sao.
 *
 * ## Vì sao đọc trong effect, không đọc trong `useState(() => …)`
 *
 * Trang render ở server trước (`localStorage` không tồn tại ở đó). Đọc lúc dựng
 * state là hai kết quả khác nhau giữa server và client cho cùng một cây — tức
 * lỗi hydrate.
 *
 * `restored` chặn lượt GHI đầu tiên: không có nó thì effect ghi đè giá trị vừa
 * lưu bằng giá trị mặc định của cha, ngay trước khi kịp đọc nó.
 */
function useWorkspaceMemory(input: {
  readonly storageKey?: string | undefined;
  readonly hasEditor: boolean;
  readonly activeTab: WorkspaceTabId;
  readonly onActivate: (tab: WorkspaceTabId) => void;
}): WorkspaceMemory {
  const { storageKey, hasEditor, activeTab, onActivate } = input;
  const [terminalPercent, setPercentState] = useState(TERMINAL_PERCENT_DEFAULT);
  const restoredRef = useRef(false);

  const key = storageKey === undefined ? null : workspaceStorageKey(storageKey, hasEditor);

  /*
    ⚠ `percentRef` là BẢN SAO ĐỒNG BỘ của `terminalPercent`, và nó không thừa.

    Effect khôi phục và effect ghi chạy trong CÙNG một lượt commit. Nếu effect
    ghi đọc `terminalPercent` từ state thì nó đọc giá trị của lượt render VỪA
    RỒI — tức mặc định 40 — và ghi đè đúng con số vừa khôi phục được. Triệu
    chứng: kéo lên 70%, phiên này vẫn 70%, lần vào sau về 40%. Không có gì báo.
  */
  const percentRef = useRef(TERMINAL_PERCENT_DEFAULT);

  // Callback + tab mới nhất trong ref — effect khôi phục chỉ được chạy ĐÚNG MỘT
  // LẦN, nên nó không được phụ thuộc vào danh tính hàm của cha (cha re-render
  // mỗi giây vì đồng hồ đếm ngược TTL; xem `use-sandbox-session.ts`).
  const latest = useRef({ activeTab, onActivate, key });
  latest.current = { activeTab, onActivate, key };

  const setTerminalPercent = useCallback((percent: number) => {
    const clamped = clampTerminalPercent(percent);
    percentRef.current = clamped;
    setPercentState(clamped);
  }, []);

  const persistTerminalPercent = useCallback((percent?: number) => {
    const current = latest.current;
    if (current.key === null || !restoredRef.current) {
      return;
    }
    writeWorkspaceState(
      current.key,
      {
        activeTab: current.activeTab,
        terminalPercent: clampTerminalPercent(percent ?? percentRef.current),
      },
      browserStorage(),
    );
  }, []);

  useEffect(() => {
    if (restoredRef.current) {
      return;
    }
    restoredRef.current = true;
    if (key === null) {
      return;
    }
    const saved = readWorkspaceState(key, browserStorage());
    if (saved === null) {
      return;
    }
    const current = latest.current;
    setTerminalPercent(saved.terminalPercent);
    if (saved.activeTab !== current.activeTab) {
      current.onActivate(saved.activeTab);
    }
  }, [key, setTerminalPercent]);

  // Tab đổi là một sự kiện RỜI RẠC (một cú bấm), nên ghi ngay ở đây. Chiều cao
  // thì KHÔNG nằm trong deps: nó đổi hàng chục lần/giây lúc kéo, và
  // `persistTerminalPercent` mới là chỗ chốt nó.
  useEffect(() => {
    if (!restoredRef.current || key === null) {
      return;
    }
    writeWorkspaceState(key, { activeTab, terminalPercent: percentRef.current }, browserStorage());
  }, [key, activeTab]);

  return { terminalPercent, setTerminalPercent, persistTerminalPercent };
}
