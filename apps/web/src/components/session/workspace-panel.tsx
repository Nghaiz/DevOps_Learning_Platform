'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ExternalLink, SquareTerminal, FileCode2 } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';
import { WorkspaceLayoutProvider } from './workspace-layout';
import {
  EDITOR_TAB,
  TERMINAL_TAB,
  WORKSPACE_TAB_LABEL,
  browserStorage,
  isEditorVisible,
  listWorkspaceTabs,
  nextTabOnKey,
  readWorkspaceState,
  resolveActiveTab,
  workspaceLayoutToken,
  workspaceStorageKey,
  writeWorkspaceState,
  type WorkspaceTabId,
} from './workspace-tabs';

/**
 * §Y1/§Y4 — khoang phải: HAI tab loại trừ nhau, dùng chung MỘT terminal.
 *
 * ```
 * TAB EDITOR                      TAB TERMINAL
 * ┌──────────────────┐            ┌──────────────────┐
 * │ Theia (iframe)   │            │                  │
 * │ cây file+editor  │            │  CÙNG terminal   │
 * │ chiếm trọn khoang│            │  chiếm trọn khoang│
 * │                  │            │                  │
 * └──────────────────┘            └──────────────────┘
 * ```
 *
 * ## SỬA ĐỔI 3 (2026-09-13) — vì sao terminal thôi nằm dưới editor
 *
 * Chỉ đạo của chủ dự án: *"tab IDE thì hiện IDE, tab terminal thì hiện
 * terminal, hết."* Bản trước dựng theo KillerCoda — một dải terminal ~40% neo
 * đáy tab Editor, kèm thanh kéo chỉnh chiều cao. Cả dải đó lẫn thanh kéo đã
 * được gỡ, không phải ẩn đi: một thanh kéo không bao giờ hiện được là mã chết.
 *
 * ## ⛔ BẤT BIẾN SỐNG-CHẾT: terminal KHÔNG ĐỔI NODE CHA
 *
 * Đây là điều kiện đúng-sai của cả sửa đổi, không phải một tối ưu. Dời một
 * component giữa hai cha là **unmount + mount lại** — WebSocket đóng, phiên làm
 * việc của người học mất, và không có thông báo lỗi nào.
 *
 * ⚠ Đọc kỹ vế này, vì bản trước của chính file này nói ngược: bất biến là
 * *không đổi cha*, **không** phải *không bao giờ `hidden`*. Thuộc tính `hidden`
 * để nguyên node tại chỗ trong cây React — nó chỉ thôi được vẽ. Câu "hàng 2
 * KHÔNG BAO GIỜ mang `hidden`" của SỬA ĐỔI 2 là hệ quả của LỰA CHỌN THIẾT KẾ
 * KillerCoda (terminal có mặt ở cả hai tab), chứ chưa bao giờ là ràng buộc kỹ
 * thuật. Lựa chọn đó đã bị thay, nên câu đó đi theo.
 *
 * Khoang vẫn là MỘT ngăn xếp dọc CỐ ĐỊNH, nay hai con tĩnh, luôn ở đúng vị trí:
 *
 * 1. hàng 1 — editor (Theia). `hidden` khi ở tab Terminal.
 * 2. hàng 2 — terminal. `hidden` khi ở tab Editor. **Không bao giờ bị bỏ khỏi
 *    cây, không bao giờ đổi cha.**
 *
 * ⚠ Hàng 1 phải LUÔN được render kể cả khi bài không có Editor (chỉ `hidden`),
 * vì React so trùng các con tĩnh theo VỊ TRÍ: bỏ hẳn hàng 1 sẽ đẩy hàng 2 lên
 * một bậc và khớp nó với vị trí cũ của hàng 1 — tức unmount cái xterm, tức
 * đóng WebSocket. Số con của ngăn xếp phải là một HẰNG SỐ ở mọi lượt render;
 * việc SỬA ĐỔI 3 xoá vĩnh viễn thanh kéo (3 con → 2 con) là an toàn đúng vì nó
 * là một thay đổi ở mức mã nguồn, không phải một nhánh điều kiện lúc chạy.
 *
 * ⚠ Hệ quả CSS phải nhớ: phần tử mang thuộc tính `hidden` KHÔNG được mang một
 * tiện ích `display` nào (`flex`, `grid`, `block`…). Luật `[hidden]{display:none}`
 * đến từ stylesheet của trình duyệt, còn `.flex{display:flex}` đến từ stylesheet
 * của tác giả — cùng độ đặc hiệu thì tác giả THẮNG, và `hidden` trở thành một
 * thuộc tính không có tác dụng gì, không báo gì. `workspace-panel.dom.test.tsx`
 * quét mọi thẻ ở cả hai tab để giữ điều này, và nay quét cả hàng 2.
 *
 * ## Ẩn terminal có làm vỡ xterm không — không, và chỗ chặn nằm ở đâu
 *
 * Phần tử `display:none` đo ra 0×0. Một `fit()` chạy lúc đó mà không ai chặn sẽ
 * chốt số cột/hàng rác và đẩy một `resize` 1 cột xuống PTY, làm mọi TUI đang
 * chạy vỡ layout. Chốt ĐÃ CÓ, ở đúng chỗ thấp nhất: `fit()` trong
 * `packages/terminal/src/terminal-core.ts` đo trước bằng `tryMeasure()` và
 * `return` khi phép đo trả `null`. Nên lượt fit lúc vừa ẩn là một no-op thật,
 * không phải một lượt may mắn.
 *
 * Chiều ngược lại vẫn cần: khi terminal hiện lại, kích thước đổi từ 0×0 thành
 * kích thước thật, nên PHẢI fit. Đường đó là `workspaceLayoutToken` đổi giá trị
 * ⇒ `useFitOnLayoutChange` chạy lại ⇒ `requestAnimationFrame` ⇒ `fit()` sau khi
 * trình duyệt đã tính xong bố cục (xem `workspace-layout.tsx`).
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
 * ⚠ Chỗ lệch của SỬA ĐỔI 2 đã TỰ HẾT. Bản trước phải chấp nhận một tabpanel
 * hiện trong khi tab của nó không được chọn (hàng 2 ở tab Editor). Nay hai hàng
 * loại trừ nhau nên mỗi tabpanel hiện đúng khi tab của nó được chọn — khuôn
 * ARIA khớp, không còn gì phải đánh đổi.
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

  useRememberedTab({ storageKey, hasEditor, activeTab: resolvedActive, onActivate });

  const layout = workspaceLayoutToken({ activeTab: resolvedActive, hasEditor });

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

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-card">
      {/* Thanh tab — cao cố định, có mặt ở mọi trạng thái. Xem chú thích đầu file. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
        {tabs.length > 1 ? (
          <div
            role="tablist"
            aria-label={t('session.workspace.tablist')}
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
              title={t('session.workspace.popout-title')}
              className={cn(
                'flex size-6 items-center justify-center rounded text-muted-foreground',
                'transition-colors duration-(--motion-fast) hover:bg-accent hover:text-accent-foreground',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">{t('session.workspace.popout-sr')}</span>
            </a>
          )}
        </div>
      </div>

      {/*
        ⛔ NGĂN XẾP DỌC CỐ ĐỊNH — HAI con tĩnh, luôn ở đúng vị trí này. Đọc chú
        thích đầu file trước khi thêm/bớt bất cứ gì ở đây: số con phải là một
        hằng số ở mọi lượt render, nếu không React so trùng nhầm và cái xterm bị
        unmount.
      */}
      <div className="flex min-h-0 flex-1 flex-col">
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
          Hàng 2 — TERMINAL. ⛔ KHÔNG BAO GIỜ rời vị trí này và KHÔNG BAO GIỜ bị
          bỏ khỏi cây: đổi cha là unmount, tức đóng WebSocket của người học mà
          không có lỗi nào bắn.

          `hidden` thì ĐƯỢC, và nó là cách SỬA ĐỔI 3 dựng "tab IDE chỉ có IDE":
          node ở nguyên chỗ cũ trong cây React, chỉ thôi được vẽ. Phân biệt này
          là toàn bộ nội dung của bất biến — xem đầu file.

          ⛔ KHÔNG tiện ích `display` nào trên phần tử này (`flex-1`/`min-h-0`/
          `min-w-0`/`overflow-hidden` đều không phải `display`). `.flex` của tác
          giả thắng `[hidden]{display:none}` của trình duyệt, và khi đó `hidden`
          là một thuộc tính không làm gì cả, không báo gì.
        */}
        <div
          {...(tabs.length > 1
            ? { role: 'tabpanel', 'aria-labelledby': tabDomId(TERMINAL_TAB) }
            : {})}
          id={terminalPanelId}
          hidden={editorVisible}
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
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

/**
 * Ghi nhớ tab đang hoạt qua `localStorage`.
 *
 * ## Vì sao khôi phục bằng `onActivate` chứ không bằng state nội bộ
 *
 * §Y4 khai `activeTab` là prop ĐIỀU KHIỂN — cha giữ sự thật, nên panel chỉ có
 * thể YÊU CẦU cha đổi, đúng một lần ngay sau khi mount. Giữ một bản sao thứ hai
 * bên trong panel sẽ lệch với cha ngay lần cha đổi `activeTab` vì lý do riêng
 * của nó.
 *
 * ## Vì sao đọc trong effect, không đọc trong `useState(() => …)`
 *
 * Trang render ở server trước (`localStorage` không tồn tại ở đó). Đọc lúc dựng
 * state là hai kết quả khác nhau giữa server và client cho cùng một cây — tức
 * lỗi hydrate.
 *
 * `restoredRef` chặn lượt GHI đầu tiên: không có nó thì effect ghi đè giá trị
 * vừa lưu bằng giá trị mặc định của cha, ngay trước khi kịp đọc nó.
 *
 * ⚠ SỬA ĐỔI 3 (2026-09-13) gỡ phần chiều cao. Bản trước còn nhớ một phần trăm
 * chia đôi khoang; thanh kéo sinh ra nó đã bị gỡ cùng mô hình hai-hàng-cùng-hiện,
 * nên cả `percentRef` lẫn `persistTerminalPercent` đi theo. Bản ghi cũ trong
 * storage vẫn đọc được — `parseWorkspaceState` bỏ qua trường thừa thay vì từ
 * chối cả bản ghi, để không ai mất tab đã nhớ ở đúng lượt cập nhật này.
 */
function useRememberedTab(input: {
  readonly storageKey?: string | undefined;
  readonly hasEditor: boolean;
  readonly activeTab: WorkspaceTabId;
  readonly onActivate: (tab: WorkspaceTabId) => void;
}): void {
  const { storageKey, hasEditor, activeTab, onActivate } = input;
  const restoredRef = useRef(false);

  const key = storageKey === undefined ? null : workspaceStorageKey(storageKey, hasEditor);

  // Callback + tab mới nhất trong ref — effect khôi phục chỉ được chạy ĐÚNG MỘT
  // LẦN, nên nó không được phụ thuộc vào danh tính hàm của cha (cha re-render
  // mỗi giây vì đồng hồ đếm ngược TTL; xem `use-sandbox-session.ts`).
  const latest = useRef({ activeTab, onActivate });
  latest.current = { activeTab, onActivate };

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
    if (saved.activeTab !== current.activeTab) {
      current.onActivate(saved.activeTab);
    }
  }, [key]);

  // Đổi tab là một sự kiện RỜI RẠC (một cú bấm), nên ghi ngay ở đây.
  useEffect(() => {
    if (!restoredRef.current || key === null) {
      return;
    }
    writeWorkspaceState(key, { activeTab }, browserStorage());
  }, [key, activeTab]);
}
