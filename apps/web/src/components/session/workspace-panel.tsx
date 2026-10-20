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
import { t } from '@devops-platform/copy';
import { Icon, Tip, cn, type IconName } from '@devops-platform/ds';
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
 * Khoang làm việc: Editor (Theia) + Terminal, LUÔN tối ở cả hai giao diện.
 *
 * ## ⛔ Bất biến sống-chết: terminal KHÔNG đổi node cha
 *
 * Dời một component giữa hai cha là unmount + mount lại: WebSocket đóng, phiên mất,
 * không lỗi nào báo. Nên ngăn xếp luôn có đúng HAI con tĩnh ở đúng vị trí:
 *
 * 1. hàng 1, editor. Luôn được render (chỉ `hidden`) kể cả khi bài không có editor:
 *    React so trùng con tĩnh theo VỊ TRÍ, bỏ hàng 1 là hàng 2 bị khớp nhầm.
 * 2. hàng 2, terminal. Không bao giờ bị bỏ khỏi cây.
 *
 * Hai bố cục, cùng hai con đó:
 * - `tabs`: một hàng hiện, hàng kia mang `hidden`.
 * - `side-by-side` (chỉ bài có editor): hai hàng cạnh nhau, không hàng nào ẩn. Đổi
 *   bố cục chỉ đổi class của ngăn xếp, không đổi cây.
 *
 * ⚠ Phần tử mang `hidden` KHÔNG được mang tiện ích `display` (`flex`, `grid`…):
 * `.flex` của tác giả thắng `[hidden]{display:none}` của trình duyệt.
 *
 * ## Vì sao tối ở cả hai giao diện
 *
 * Gốc khoang mang class `dark`, nên mọi token bên trong phân giải về bản tối. Một
 * terminal sáng đặt cạnh trang sáng không có ranh giới nào, và thứ người học nhìn
 * nhiều nhất trong buổi là cái khung này.
 */
export interface WorkspacePanelProps {
  /** Vắng mặt ⇒ không có tab Editor (máy không chạy IDE). */
  readonly editor?: ReactNode;
  readonly terminal: ReactNode;
  readonly activeTab: WorkspaceTabId;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  /** Mở terminal ra cửa sổ riêng (bàn giao kết nối). `null` ⇒ ẩn nút. */
  readonly onPopOut: (() => void) | null;
  readonly storageKey?: string;
  /** Viên trạng thái máy, đặt bên phải thanh khoang. */
  readonly status?: ReactNode;
}

type Arrangement = 'tabs' | 'side-by-side';

const TAB_ICON: Readonly<Record<WorkspaceTabId, IconName>> = {
  editor: 'editor',
  terminal: 'terminal',
};

function arrangementKey(storageKey: string): string {
  return `${workspaceStorageKey(storageKey, true)}:arrangement`;
}

/**
 * Bố cục đã chọn, đọc NGAY lúc khởi tạo chứ không trong effect: khoang này chỉ mount
 * sau khi dữ liệu bài về (tức chỉ ở trình duyệt), nên đọc `localStorage` lúc render
 * là an toàn, và tránh được nhịp vẽ bố cục mặc định rồi mới nhảy sang bố cục đã nhớ.
 */
function readArrangement(storageKey: string | undefined, hasEditor: boolean): Arrangement {
  if (storageKey === undefined || !hasEditor) return 'tabs';
  try {
    const saved = browserStorage()?.getItem(arrangementKey(storageKey)) ?? null;
    return saved === 'side-by-side' ? 'side-by-side' : 'tabs';
  } catch {
    return 'tabs';
  }
}

const BAR_BUTTON = cn(
  'grid size-7 place-items-center rounded-sm text-ink-3 outline-none',
  'transition-colors duration-150 hover:bg-well hover:text-ink',
  'focus-visible:outline-2 focus-visible:outline-focus',
  'aria-pressed:bg-acc-tint aria-pressed:text-acc-ink',
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
  const [arrangement, setArrangement] = useState<Arrangement>(() => readArrangement(storageKey, hasEditor));
  const sideBySide = hasEditor && arrangement === 'side-by-side';
  const showTablist = tabs.length > 1 && !sideBySide;

  const domId = useId();
  const tabDomId = (tab: WorkspaceTabId): string => `${domId}-tab-${tab}`;
  const editorPanelId = `${domId}-panel-editor`;
  const terminalPanelId = `${domId}-panel-terminal`;

  useRememberedTab({ storageKey, hasEditor, activeTab: resolvedActive, onActivate });

  // Bài vừa có editor (dữ liệu về sau lượt render đầu) thì đọc lại bố cục đã nhớ.
  useEffect(() => {
    setArrangement(readArrangement(storageKey, hasEditor));
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
      if (next === null) return; // Phím ngoài khuôn (Tab, phím tắt trình duyệt): không nuốt.
      event.preventDefault();
      onActivate(next);
    },
    [tabs, resolvedActive, onActivate],
  );

  const editorHidden = sideBySide ? false : !editorVisible;
  const terminalHidden = sideBySide ? false : editorVisible;

  return (
    <div className="dark flex h-full min-h-0 w-full flex-col bg-canvas text-ink [color-scheme:dark]">
      {/* Thanh khoang, cao CỐ ĐỊNH ở mọi trạng thái: thứ gì xuất hiện/biến mất quanh terminal làm xterm fit lại giữa lúc gõ. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-rule bg-paper pl-1 pr-1.5">
        {showTablist ? (
          <div
            role="tablist"
            aria-label={t('session.workspace.tablist')}
            aria-orientation="horizontal"
            className="flex h-full min-w-0 items-stretch overflow-x-auto"
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
          <span className="flex min-w-0 items-center gap-4 px-2.5">
            {(sideBySide ? listWorkspaceTabs(true) : listWorkspaceTabs(false)).map((tab) => (
              <span key={tab} className="flex h-7 shrink-0 items-center gap-1.5 text-sm text-ink-2">
                <Icon name={TAB_ICON[tab]} size={16} className="shrink-0 text-ink-3" />
                {WORKSPACE_TAB_LABEL[tab]}
              </span>
            ))}
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {status}
          {hasEditor ? (
            <Tip content={sideBySide ? t('session.workspace.layout-tabs') : t('session.workspace.layout-split')}>
              <button type="button" aria-pressed={sideBySide} onClick={toggleArrangement} className={BAR_BUTTON}>
                <Icon name={sideBySide ? 'layers' : 'columns'} size={17} />
                <span className="sr-only">{t('session.workspace.layout-split')}</span>
              </button>
            </Tip>
          ) : null}
          {onPopOut === null ? null : (
            <Tip content={t('session.workspace.popout')}>
              <button type="button" onClick={onPopOut} className={BAR_BUTTON}>
                <Icon name="external-link" size={17} />
                <span className="sr-only">{t('session.workspace.popout')}</span>
              </button>
            </Tip>
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
          className={cn('min-h-0 min-w-0 flex-1 overflow-hidden', sideBySide && 'border-r border-rule')}
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
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      /* Roving tabindex: đúng MỘT tab trong vòng Tab, mũi tên đi giữa các tab (ARIA APG). */
      tabIndex={active ? 0 : -1}
      onClick={() => onActivate(tab)}
      className={cn(
        'group/tab relative flex h-full shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm outline-none',
        'transition-colors duration-150 focus-visible:bg-well',
        active ? 'font-medium text-ink' : 'text-ink-3 hover:text-ink',
      )}
    >
      <Icon name={TAB_ICON[tab]} size={16} className={cn('shrink-0', active ? 'text-acc-mid' : undefined)} />
      {WORKSPACE_TAB_LABEL[tab]}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-2 bottom-0 h-0.5 origin-center rounded-full bg-acc-mid transition-transform duration-200 ease-out',
          active ? 'scale-x-100' : 'scale-x-0',
        )}
      />
    </button>
  );
}

/**
 * Ghi nhớ tab đang mở qua `localStorage`.
 *
 * `activeTab` là prop ĐIỀU KHIỂN: panel chỉ YÊU CẦU cha đổi, đúng một lần sau khi
 * mount. `restoredRef` chặn lượt GHI đầu tiên đè lên giá trị vừa lưu.
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
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (key === null) return;
    const saved = readWorkspaceState(key, browserStorage());
    if (saved === null) return;
    const current = latest.current;
    if (saved.activeTab !== current.activeTab) current.onActivate(saved.activeTab);
  }, [key]);

  useEffect(() => {
    if (!restoredRef.current || key === null) return;
    writeWorkspaceState(key, { activeTab }, browserStorage());
  }, [key, activeTab]);
}
