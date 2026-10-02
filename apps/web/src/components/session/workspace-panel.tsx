'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Columns2, ExternalLink, FileCode2, PanelTopClose, SquareTerminal } from 'lucide-react';
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
 * Khoang làm việc: Editor (Theia) + Terminal, LUÔN tối ở cả hai theme.
 *
 * ## ⛔ Bất biến sống-chết: terminal KHÔNG đổi node cha
 *
 * Dời một component giữa hai cha là unmount + mount lại: WebSocket đóng, phiên
 * mất, không lỗi nào báo. Nên ngăn xếp luôn có đúng HAI con tĩnh ở đúng vị trí:
 *
 * 1. hàng 1, editor. Luôn được render (chỉ `hidden`) kể cả khi bài không có editor:
 *    React so trùng con tĩnh theo VỊ TRÍ, bỏ hàng 1 là hàng 2 bị khớp nhầm.
 * 2. hàng 2, terminal. Không bao giờ bị bỏ khỏi cây.
 *
 * Hai bố cục, cùng hai con đó:
 * - `tabs`: một hàng hiện, hàng kia mang `hidden`.
 * - `side-by-side` (chỉ bài có editor): hai hàng cạnh nhau, không hàng nào ẩn.
 *   Đổi bố cục chỉ đổi class của ngăn xếp, không đổi cây.
 *
 * ⚠ Phần tử mang `hidden` KHÔNG được mang tiện ích `display` (`flex`, `grid`…):
 * `.flex` của tác giả thắng `[hidden]{display:none}` của trình duyệt.
 *
 * ## Vì sao tối ở cả hai theme
 *
 * Gốc khoang mang class `dark`, nên mọi token bên trong (`bg-background`,
 * `bg-card`, `border-border`) phân giải về bản đêm. Một terminal sáng đặt cạnh
 * trang sáng không có ranh giới nào, và thứ người học nhìn nhiều nhất trong buổi
 * là cái khung này.
 */
export interface WorkspacePanelProps {
  /** Vắng mặt ⇒ không có tab Editor (bài không khai layout ide). */
  readonly editor?: ReactNode;
  readonly terminal: ReactNode;
  readonly activeTab: WorkspaceTabId;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  /** Mở terminal ra cửa sổ riêng (bàn giao kết nối). `null` ⇒ ẩn nút. */
  readonly onPopOut: (() => void) | null;
  readonly storageKey?: string;
  /** Viên trạng thái phiên, đặt bên phải thanh khoang. */
  readonly status?: ReactNode;
}

type Arrangement = 'tabs' | 'side-by-side';

const TAB_ICON = {
  editor: FileCode2,
  terminal: SquareTerminal,
} as const;

function arrangementKey(storageKey: string): string {
  return `${workspaceStorageKey(storageKey, true)}:arrangement`;
}

const BAR_BUTTON = cn(
  'flex size-7 items-center justify-center text-muted-foreground',
  'transition-colors duration-(--motion-fast) hover:bg-muted hover:text-foreground',
  'outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'aria-pressed:bg-ink aria-pressed:text-ink-foreground',
);

export function WorkspacePanel({
  editor,
  terminal,
  activeTab,
  onActivate,
  onPopOut,
  storageKey,
  status,
}: WorkspacePanelProps): ReactElement {
  const hasEditor = editor !== undefined;
  const tabs = listWorkspaceTabs(hasEditor);
  const resolvedActive = resolveActiveTab(activeTab, hasEditor);
  const editorVisible = isEditorVisible(resolvedActive, hasEditor);
  const [arrangement, setArrangement] = useState<Arrangement>('tabs');
  const sideBySide = hasEditor && arrangement === 'side-by-side';
  const showTablist = tabs.length > 1 && !sideBySide;

  const domId = useId();
  const tabDomId = (tab: WorkspaceTabId): string => `${domId}-tab-${tab}`;
  const editorPanelId = `${domId}-panel-editor`;
  const terminalPanelId = `${domId}-panel-terminal`;

  useRememberedTab({ storageKey, hasEditor, activeTab: resolvedActive, onActivate });

  // Bố cục đã chọn được nhớ riêng, đọc trong effect (server không có localStorage).
  useEffect(() => {
    if (storageKey === undefined || !hasEditor) return;
    const saved = browserStorage()?.getItem(arrangementKey(storageKey)) ?? null;
    if (saved === 'side-by-side' || saved === 'tabs') setArrangement(saved);
  }, [storageKey, hasEditor]);

  const toggleArrangement = (): void => {
    const next: Arrangement = arrangement === 'tabs' ? 'side-by-side' : 'tabs';
    setArrangement(next);
    if (storageKey !== undefined) {
      try {
        browserStorage()?.setItem(arrangementKey(storageKey), next);
      } catch {
        // Storage bị chặn: bố cục vẫn đổi trong lượt xem này.
      }
    }
  };

  const layout = `${workspaceLayoutToken({ activeTab: resolvedActive, hasEditor })}${sideBySide ? ':side-by-side' : ''}`;

  const handleTablistKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const next = nextTabOnKey(event.key, tabs, resolvedActive);
      if (next === null) {
        return; // Phím ngoài khuôn (Tab, phím tắt trình duyệt): không nuốt.
      }
      event.preventDefault();
      onActivate(next);
    },
    [tabs, resolvedActive, onActivate],
  );

  const editorHidden = sideBySide ? false : !editorVisible;
  const terminalHidden = sideBySide ? false : editorVisible;

  return (
    <div className="dark flex h-full min-h-0 w-full flex-col bg-background text-foreground [color-scheme:dark]">
      {/* Thanh khoang, cao CỐ ĐỊNH ở mọi trạng thái: thứ gì xuất hiện/biến mất quanh terminal làm xterm fit lại giữa lúc gõ. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-card px-1.5">
        {showTablist ? (
          <div
            role="tablist"
            aria-label={t('session.workspace.tablist')}
            aria-orientation="horizontal"
            className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
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
          <span className="flex min-w-0 items-center gap-3 px-2">
            {(sideBySide ? listWorkspaceTabs(true) : listWorkspaceTabs(false)).map((tab) => {
              const Icon = TAB_ICON[tab];
              return (
                <span key={tab} className="flex h-7 shrink-0 items-center gap-1.5 type-label text-muted-foreground">
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  {WORKSPACE_TAB_LABEL[tab]}
                </span>
              );
            })}
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {status}
          {hasEditor && (
            <button
              type="button"
              aria-pressed={sideBySide}
              title={sideBySide ? t('session.workspace.layout-tabs') : t('session.workspace.layout-split')}
              onClick={toggleArrangement}
              className={BAR_BUTTON}
            >
              {sideBySide ? (
                <PanelTopClose aria-hidden="true" className="size-4" />
              ) : (
                <Columns2 aria-hidden="true" className="size-4" />
              )}
              <span className="sr-only">{t('session.workspace.layout-split')}</span>
            </button>
          )}
          {onPopOut !== null && (
            <button type="button" title={t('session.workspace.popout')} onClick={onPopOut} className={BAR_BUTTON}>
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">{t('session.workspace.popout')}</span>
            </button>
          )}
        </div>
      </div>

      {/* ⛔ NGĂN XẾP CỐ ĐỊNH, HAI con tĩnh. Số con phải là hằng số ở mọi lượt render. */}
      <div className={cn('flex min-h-0 flex-1', sideBySide ? 'flex-row' : 'flex-col')}>
        {/* Hàng 1, editor. ⛔ Không tiện ích display trên phần tử mang `hidden`. */}
        <div
          {...(showTablist ? { role: 'tabpanel', 'aria-labelledby': tabDomId(EDITOR_TAB) } : {})}
          id={editorPanelId}
          hidden={editorHidden}
          className={cn('min-h-0 min-w-0 flex-1 overflow-hidden', sideBySide && 'border-r border-border')}
        >
          <div className="h-full w-full">{editor}</div>
        </div>

        {/* Hàng 2, TERMINAL. ⛔ Không bao giờ rời vị trí này, không bao giờ bị bỏ khỏi cây. */}
        <div
          {...(showTablist ? { role: 'tabpanel', 'aria-labelledby': tabDomId(TERMINAL_TAB) } : {})}
          id={terminalPanelId}
          hidden={terminalHidden}
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
      /* Roving tabindex: đúng MỘT tab trong vòng Tab, mũi tên đi giữa các tab (ARIA APG). */
      tabIndex={active ? 0 : -1}
      onClick={() => {
        onActivate(tab);
      }}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 px-2.5 font-mono text-xs whitespace-nowrap',
        'transition-colors duration-(--motion-fast)',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-ink text-ink-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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
 * `activeTab` là prop ĐIỀU KHIỂN: panel chỉ YÊU CẦU cha đổi, đúng một lần sau
 * khi mount. Đọc trong effect (không trong `useState`) vì server không có
 * `localStorage`. `restoredRef` chặn lượt GHI đầu tiên đè lên giá trị vừa lưu.
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

  // Callback + tab mới nhất trong ref: effect khôi phục chỉ chạy MỘT lần.
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

  useEffect(() => {
    if (!restoredRef.current || key === null) {
      return;
    }
    writeWorkspaceState(key, { activeTab }, browserStorage());
  }, [key, activeTab]);
}
