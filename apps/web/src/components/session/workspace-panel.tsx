/*
 * ⚠ Pragma trên là BẮT BUỘC để `pnpm --filter web test` chạy được file này, và
 * nó KHÔNG thừa dù Next đã dùng runtime tự động.
 *
 * `apps/web/tsconfig.json` khai `"jsx": "preserve"` (Next tự dịch JSX bằng SWC
 * của nó). vitest thì dịch bằng esbuild, và esbuild đọc đúng khoá đó: thấy
 * `preserve` nó rơi về runtime CỔ ĐIỂN, tức sinh ra `React.createElement` trong
 * một file không import `React`. Triệu chứng là `ReferenceError: React is not
 * defined` ném lúc RENDER — không phải lúc biên dịch, nên `typecheck` xanh còn
 * test đỏ ở mọi ô có render.
 *
 * Sửa đúng ở tầng cấu hình là `esbuild: { jsx: 'automatic' }` trong
 * `apps/web/vitest.config.ts`, nhưng file đó không thuộc đường sở hữu của lane
 * này (đã ghi vào report). Pragma theo từng file là cách vá không đụng file của
 * lane khác. Bỏ nó ra khi vitest.config đã khai — lúc đó nó thành thừa thật.
 */
'use client';

import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { Columns2, ExternalLink, Plus, SquareTerminal, FileCode2 } from 'lucide-react';
import { cn } from '@devops-platform/ui';
import { WorkspaceRegionVisibleProvider } from './workspace-visibility';
import {
  EDITOR_TAB,
  WORKSPACE_TAB_LABEL,
  browserStorage,
  computeRegionVisibility,
  isClosableTab,
  isTerminalTab,
  listWorkspaceTabs,
  nextTabOnKey,
  readWorkspaceState,
  resolveActiveTab,
  splitDisabledReason,
  workspaceStorageKey,
  writeWorkspaceState,
  type WorkspaceTabId,
} from './workspace-tabs';

/**
 * C5 — khoang phải kiểu KillerCoda: **tab ở trên, mỗi lúc một tab chiếm trọn**.
 *
 * ## Cái này thay thế cái gì
 *
 * Bản trước dựng `SplitPane` LỒNG trong `WorkspaceSplit` cho bố cục `ide`, nên
 * màn hình chia BA và editor chỉ còn ~1/3 bề rộng — một khoang soạn mã rộng
 * 400px trên màn 1280px. Ở đây khoang phải là một cái duy nhất, và tab quyết
 * định ai chiếm nó.
 *
 * ## ⛔ BẤT BIẾN SỐNG-CHẾT: mọi vùng giữ MOUNTED, ẩn bằng `hidden`
 *
 * TUYỆT ĐỐI không `{active === 'editor' && <Editor/>}`. Unmount vùng terminal
 * là đóng WebSocket, tức mất phiên làm việc của người học. Unmount iframe IDE là
 * khởi động nguội Theia lại ~20 giây (số đo P6). Cả hai đều KHÔNG có thông báo
 * lỗi nào — người dùng chỉ thấy công việc của mình biến mất.
 *
 * ⚠ Hệ quả CSS phải nhớ: phần tử mang thuộc tính `hidden` KHÔNG được mang một
 * tiện ích `display` nào (`flex`, `grid`, `block`…). Luật `[hidden]{display:none}`
 * đến từ stylesheet của trình duyệt, còn `.flex{display:flex}` đến từ
 * stylesheet của tác giả — cùng độ đặc hiệu thì tác giả THẮNG, và `hidden` trở
 * thành một thuộc tính không có tác dụng gì. Vùng ở dưới chỉ mang `flex-1` +
 * `min-h-0` (không phải thuộc tính `display`), phần bố cục nằm ở lớp con.
 *
 * ## Chỉ có HAI vùng cho BA tab
 *
 * Mọi tab terminal dùng chung MỘT vùng. Theo §C6 cả phiên chỉ có một WebSocket
 * và một xterm; bấm "Terminal 2" là gửi `\x02 2` vào chính cái PTY đang mở, nên
 * nội dung window 2 hiện ra TRONG CÙNG cái xterm. Xem `tmux-control.ts`.
 *
 * ⚠ Ràng buộc cho người tiêu thụ (Lane F): trong `terminals`, nhiều nhất MỘT
 * giá trị được là một `TerminalSurface` thật; các tab còn lại truyền `null` —
 * khoá của chúng vẫn vẽ ra nút trên thanh tab. Panel KHÔNG gác được điều này
 * (nó chỉ thấy `ReactNode`); truyền hai cái thật thì cả hai cùng vẽ chồng lên
 * nhau, và đó là vi phạm §C6 chứ không phải lỗi của panel.
 *
 * ## Thanh tab cao CỐ ĐỊNH và luôn có mặt
 *
 * Không phải để cho đẹp: bất cứ thứ gì xuất hiện/biến mất quanh terminal đều
 * làm `ResizeObserver` của xterm bắn và fit lại đúng lúc người dùng đang gõ —
 * cùng lo ngại đã ghi ở `terminal-pane.tsx` quanh gợi ý Esc-Esc. `h-9 shrink-0`
 * ở MỌI trạng thái, kể cả khi chỉ có một tab.
 */
export interface WorkspacePanelProps {
  /** Vắng mặt ⇒ không có tab Editor (bài không khai layout ide). */
  readonly editor?: ReactNode;
  /** Nội dung mỗi tab terminal, theo id. */
  readonly terminals: ReadonlyMap<WorkspaceTabId, ReactNode>;
  readonly activeTab: WorkspaceTabId;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  /** Bấm '+' — vắng mặt ⇒ ẩn nút. */
  readonly onAddTerminal?: () => void;
  readonly onCloseTerminal?: (tab: WorkspaceTabId) => void;
  /** Chế độ tách đôi: Editor | terminal đang hoạt. */
  readonly split: boolean;
  readonly onToggleSplit: () => void;
  /** URL mở tab hiện tại ra cửa sổ trình duyệt riêng. null ⇒ ẩn nút. */
  readonly popOutUrl: string | null;
  readonly storageKey?: string;
}

const TAB_ICON = {
  editor: FileCode2,
  'terminal-1': SquareTerminal,
  'terminal-2': SquareTerminal,
} as const;

export function WorkspacePanel({
  editor,
  terminals,
  activeTab,
  onActivate,
  onAddTerminal,
  onCloseTerminal,
  split,
  onToggleSplit,
  popOutUrl,
  storageKey,
}: WorkspacePanelProps): ReactElement {
  const hasEditor = editor !== undefined;
  const hasTerminal = terminals.size > 0;
  const tabs = listWorkspaceTabs(hasEditor, terminals.keys());
  const resolvedActive = resolveActiveTab(activeTab, tabs);
  const visibility = computeRegionVisibility({ hasEditor, hasTerminal, activeTab: resolvedActive, split });
  const bothVisible = visibility.editor && visibility.terminal;

  const domId = useId();
  const tabDomId = (tab: WorkspaceTabId): string => `${domId}-tab-${tab}`;
  const editorPanelId = `${domId}-panel-editor`;
  const terminalPanelId = `${domId}-panel-terminal`;
  const splitReasonId = `${domId}-split-reason`;

  const splitReason = splitDisabledReason(hasEditor, hasTerminal);
  const splitDisabled = splitReason !== null;

  // Vùng terminal DÙNG CHUNG cho mọi tab terminal, nên nhãn của nó là tab
  // terminal đang hoạt — hoặc tab terminal đầu tiên khi người dùng đang ở
  // Editor. `null` khi bài không có terminal nào (bỏ hẳn `aria-labelledby`).
  const labelTerminalTab: WorkspaceTabId | null =
    resolvedActive !== null && isTerminalTab(resolvedActive)
      ? resolvedActive
      : (tabs.find((tab) => isTerminalTab(tab)) ?? null);

  useWorkspaceMemory({ storageKey, hasEditor, tabs, activeTab: resolvedActive, split, onActivate, onToggleSplit, splitDisabled });

  const handleTablistKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (resolvedActive === null) {
        return;
      }
      // `Delete`/`Backspace` đóng tab đang hoạt — khuôn "deletable tabs" của
      // ARIA APG. Đây là đường DUY NHẤT để đóng bằng bàn phím: nút `×` bên
      // trong tab là một `<span>` không vào được vòng Tab (một `<button>` lồng
      // trong `role="tab"` là con có vai không hợp lệ của `tablist`, thứ axe
      // bắt ở luật `aria-required-children`).
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (onCloseTerminal !== undefined && isClosableTab(resolvedActive)) {
          event.preventDefault();
          onCloseTerminal(resolvedActive);
        }
        return;
      }
      const next = nextTabOnKey(event.key, tabs, resolvedActive);
      if (next === null) {
        // Phím ngoài khuôn (`Tab`, phím tắt trình duyệt) — KHÔNG nuốt.
        return;
      }
      event.preventDefault();
      onActivate(next);
    },
    [resolvedActive, tabs, onActivate, onCloseTerminal],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-card">
      {/* Thanh tab — cao cố định, có mặt ở mọi trạng thái. Xem chú thích đầu file. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
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
              {...(onCloseTerminal === undefined ? {} : { onClose: onCloseTerminal })}
            />
          ))}
        </div>

        {/*
          Nút '+' nằm NGOÀI `role="tablist"` có chủ ý: `tablist` chỉ được sở hữu
          các phần tử `role="tab"`, và một `<button>` lẫn vào trong là vi phạm
          `aria-required-children` — luật mà `e2e/a11y.spec.ts` chạy axe sẽ bắt.
          Về mặt thị giác nó vẫn nằm ngay sau tab cuối.
        */}
        {onAddTerminal === undefined ? null : (
          <button
            type="button"
            onClick={onAddTerminal}
            title="Mở thêm một terminal (tmux window mới)"
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground',
              'transition-colors duration-(--motion-fast) hover:bg-accent hover:text-accent-foreground',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <Plus aria-hidden="true" className="size-4" />
            <span className="sr-only">Mở thêm một terminal</span>
          </button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/*
            `aria-disabled` chứ KHÔNG phải thuộc tính `disabled`: một nút
            `disabled` không nhận sự kiện chuột, nên trình duyệt không bao giờ
            hiện `title` của nó — người dùng gặp một nút chết không kèm lý do,
            đúng thứ mà "kèm lý do trong title" sinh ra để tránh. Giữ nút vào
            được vòng Tab, có `aria-describedby` trỏ tới câu lý do, và chặn hành
            động ở handler.
          */}
          <button
            type="button"
            aria-pressed={split && !splitDisabled}
            aria-disabled={splitDisabled}
            {...(splitDisabled ? { 'aria-describedby': splitReasonId } : {})}
            title={splitReason ?? 'Tách đôi: Editor cạnh terminal đang hoạt'}
            onClick={() => {
              if (splitDisabled) {
                return;
              }
              onToggleSplit();
            }}
            className={cn(
              'flex size-6 items-center justify-center rounded transition-colors duration-(--motion-fast)',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              splitDisabled
                ? 'cursor-not-allowed text-muted-foreground/40'
                : split
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Columns2 aria-hidden="true" className="size-4" />
            <span className="sr-only">Tách đôi khoang làm việc</span>
          </button>
          {splitDisabled ? (
            <span id={splitReasonId} className="sr-only">
              {splitReason}
            </span>
          ) : null}

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

      <div className="flex min-h-0 flex-1">
        {/*
          ⛔ KHÔNG có tiện ích `display` trên phần tử mang `hidden` — xem chú
          thích đầu file. `flex-1`/`min-h-0`/`min-w-0` không phải `display`.
        */}
        {/*
          Ba phần tử dưới đây LUÔN được render, kể cả khi bài không có Editor.
          Không phải thừa: React so trùng các con tĩnh theo VỊ TRÍ, nên bỏ hẳn
          vùng editor sẽ đẩy vùng terminal lên khớp với gạch phân cách — tức
          unmount cái xterm, tức đóng WebSocket. Vùng không dùng thì rỗng và ẩn.

          `aria-labelledby` mới là thứ phải có điều kiện: trỏ tới một id không
          tồn tại là vi phạm `aria-valid-attr-value` của axe.
        */}
        <div
          role="tabpanel"
          id={editorPanelId}
          {...(hasEditor ? { 'aria-labelledby': tabDomId(EDITOR_TAB) } : {})}
          hidden={!visibility.editor}
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <WorkspaceRegionVisibleProvider visible={visibility.editor}>
            <div className="h-full w-full">{editor}</div>
          </WorkspaceRegionVisibleProvider>
        </div>

        {/* Gạch phân cách chỉ có nghĩa khi hai vùng cùng hiện. `hidden` chứ
            không render có điều kiện: cùng một lý do như hai vùng — đổi cấu
            trúc cây quanh terminal là mời React so trùng lại và unmount. */}
        <div aria-hidden="true" hidden={!bothVisible} className="w-px shrink-0 bg-border" />

        <div
          role="tabpanel"
          id={terminalPanelId}
          {...(labelTerminalTab === null ? {} : { 'aria-labelledby': tabDomId(labelTerminalTab) })}
          hidden={!visibility.terminal}
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <WorkspaceRegionVisibleProvider visible={visibility.terminal}>
            {/*
              MỌI node terminal nằm ở đây cùng lúc và KHÔNG cái nào bị ẩn so với
              cái nào — theo §C6 nhiều nhất một cái là surface thật, những cái
              còn lại là `null`. Ẩn `terminal-1` khi người dùng bấm sang
              `terminal-2` chính là ẩn cái xterm mà tmux vừa đổi window bên trong.
            */}
            <div className="h-full w-full">
              {tabs
                .filter((tab): tab is Exclude<WorkspaceTabId, 'editor'> => isTerminalTab(tab))
                .map((tab) => (
                  <TerminalSlot key={tab} node={terminals.get(tab)} />
                ))}
            </div>
          </WorkspaceRegionVisibleProvider>
        </div>
      </div>
    </div>
  );
}

/**
 * Bọc một node terminal. `null`/`undefined` (tab dùng chung vùng với tab khác,
 * §C6) không dựng lớp DOM nào — nếu không, một `<div class="h-full">` rỗng sẽ
 * chia đôi chiều cao với cái xterm thật.
 */
function TerminalSlot({ node }: { readonly node: ReactNode }): ReactElement | null {
  if (node === null || node === undefined) {
    return null;
  }
  return <div className="h-full w-full">{node}</div>;
}

function WorkspaceTabButton({
  tab,
  id,
  controls,
  active,
  onActivate,
  onClose,
}: {
  readonly tab: WorkspaceTabId;
  readonly id: string;
  readonly controls: string;
  readonly active: boolean;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  readonly onClose?: (tab: WorkspaceTabId) => void;
}): ReactElement {
  const Icon = TAB_ICON[tab];
  const closable = onClose !== undefined && isClosableTab(tab);

  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      /* Roving tabindex: đúng MỘT tab trong vòng Tab, mũi tên đi giữa các tab.
         Đây là khuôn ARIA APG — không có nó thì một thanh 3 tab ngốn 3 lần Tab
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
      {closable ? (
        <>
          {/*
            `<span>` chứ không `<button>`: một `<button>` lồng trong
            `role="tab"` biến nó thành con có vai không hợp lệ của `tablist`
            (axe: `aria-required-children`). Đây đúng là khuôn "deletable tabs"
            của ARIA APG — chuột bấm `×`, bàn phím nhấn `Delete`.

            `stopPropagation` để cú bấm `×` không leo lên `onClick` của tab và
            KÍCH HOẠT đúng cái tab vừa đóng.
          */}
          <span
            aria-hidden="true"
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab);
            }}
            className="ml-0.5 rounded px-1 leading-none hover:bg-background/60"
          >
            ×
          </span>
          <span className="sr-only">— nhấn Delete để đóng</span>
        </>
      ) : null}
    </button>
  );
}

/**
 * Ghi nhớ (tab đang hoạt + tách on/off) qua `localStorage`.
 *
 * ## Vì sao khôi phục bằng `onActivate`/`onToggleSplit` chứ không bằng state
 *
 * C5 khai `activeTab` và `split` là prop ĐIỀU KHIỂN — cha giữ sự thật. Nên
 * panel không thể tự "đặt" trạng thái đã lưu; nó chỉ có thể YÊU CẦU cha đổi,
 * đúng một lần, ngay sau khi mount. Cách này giữ nguyên một nguồn sự thật thay
 * vì tạo bản sao thứ hai bên trong panel (thứ sẽ lệch với cha ngay lần cha đổi
 * `activeTab` vì lý do của riêng nó — ví dụ khối `{{exec T2}}` trong bài).
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
  readonly tabs: readonly WorkspaceTabId[];
  readonly activeTab: WorkspaceTabId | null;
  readonly split: boolean;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  readonly onToggleSplit: () => void;
  readonly splitDisabled: boolean;
}): void {
  const { storageKey, hasEditor, tabs, activeTab, split, onActivate, onToggleSplit, splitDisabled } = input;
  const restoredRef = useRef(false);

  // Callback mới nhất trong ref — effect khôi phục chỉ được chạy ĐÚNG MỘT LẦN,
  // nên nó không được phụ thuộc vào danh tính hàm của cha (cha re-render mỗi
  // giây vì đồng hồ đếm ngược TTL; xem `use-sandbox-session.ts`).
  const latest = useRef({ tabs, activeTab, split, onActivate, onToggleSplit, splitDisabled });
  latest.current = { tabs, activeTab, split, onActivate, onToggleSplit, splitDisabled };

  const key = storageKey === undefined ? null : workspaceStorageKey(storageKey, hasEditor);

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
    if (saved.activeTab !== current.activeTab && current.tabs.includes(saved.activeTab)) {
      current.onActivate(saved.activeTab);
    }
    if (saved.split !== current.split && !current.splitDisabled) {
      current.onToggleSplit();
    }
  }, [key]);

  useEffect(() => {
    if (!restoredRef.current || key === null || activeTab === null) {
      return;
    }
    writeWorkspaceState(key, { activeTab, split }, browserStorage());
  }, [key, activeTab, split]);
}
