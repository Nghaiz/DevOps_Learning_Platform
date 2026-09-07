import type { ReactNode } from 'react';
import type { ExecTarget } from '@devops-platform/scenario/content-blocks';
// Type-only ⇒ bị xoá lúc biên dịch, nên file này KHÔNG kéo theo `next/dynamic`
// hay xterm. Đó là điều kiện để nó test được ở `environment: 'node'`.
import type { WorkspaceTabId } from './workspace-tabs';

/**
 * Quyết định định tuyến của `onExec` (C1/C2), tách khỏi React.
 *
 * Cùng lý do Lane E tách `workspace-tabs.ts`: `apps/web` chạy vitest ở
 * `environment: 'node'` — không jsdom, không React Testing Library. Một quyết
 * định nằm lẫn trong thân hook là một quyết định KHÔNG có phép kiểm nào, và ô
 * AC "định tuyến `{{exec T2}}` đúng" khi ấy chỉ còn là một câu trong report.
 */

/** Tab terminal mặc định — cũng là đích khi người dùng đang ở tab Editor (C2). */
export const PRIMARY_TERMINAL: ExecTarget = 'terminal-1';

/** Tab terminal thứ hai. `WorkspaceTabId` chỉ có đúng hai, nên '+' mở đúng cái này. */
export const SECONDARY_TERMINAL: ExecTarget = 'terminal-2';

export interface ExecPlan {
  /** Terminal thật sự nhận lệnh. */
  readonly destination: ExecTarget;
  /** Tab đích chưa mở ⇒ phải tạo tmux window mới TRƯỚC khi gõ. */
  readonly createWindow: boolean;
  /** Có phải đổi tab đang hoạt không — `false` khi lệnh đi vào đúng tab đang mở. */
  readonly switchesTab: boolean;
}

export function planExec(input: {
  readonly activeTab: WorkspaceTabId;
  readonly openTerminals: readonly ExecTarget[];
  /** `null` = "terminal đang hoạt" theo C2. */
  readonly target: ExecTarget | null;
}): ExecPlan {
  const { activeTab, openTerminals, target } = input;

  /*
    Người dùng đang ở tab Editor ⇒ đích là Terminal 1, đúng chữ trong C2
    ("Terminal 1 nếu người dùng đang ở tab Editor").

    KHÔNG nhớ thêm "terminal nào hoạt trước khi sang Editor": hợp đồng đã chốt
    câu trả lời, và giữ một trạng thái nữa chỉ để đôi khi trả lời khác đi là tự
    tạo ra một chỗ lệch giữa thứ ta tin và thứ tmux đang làm.
  */
  const activeTerminal: ExecTarget = activeTab === 'editor' ? PRIMARY_TERMINAL : activeTab;
  const destination = target ?? activeTerminal;

  return {
    destination,
    createWindow: !openTerminals.includes(destination),
    switchesTab: destination !== activeTab,
  };
}

/**
 * Dựng map `terminals` của `WorkspacePanel` từ danh sách tab đang mở.
 *
 * ⛔ ĐÚNG MỘT giá trị được là `TerminalSurface` thật, và đó là ràng buộc C6
 * chứ không phải quy ước của panel. Đo trong repo trước khi viết hàm này:
 * `components/session/terminal-pane.tsx` truyền `wsUrl` + `connectionKey`
 * xuống `TerminalSurface`, tức CHÍNH surface mở WebSocket; còn
 * `lib/use-sandbox-session.ts` giữ đúng một ô `TerminalHandle` mà
 * `onTerminalReady` ghi vào. Nên mount `<TerminalPane>` lần thứ hai là mở
 * WebSocket thứ hai — vỡ `GATEWAY_MAX_WS_PER_SESSION = 1` — và handle thứ hai
 * ghi đè handle thứ nhất, tức nút "Kiểm tra" gõ vào một terminal khác với cái
 * người học đang nhìn.
 *
 * Tab thứ hai vì thế nhận `null`: `computeRegionVisibility` của Lane E render
 * mọi node của map vào CÙNG một vùng terminal dùng chung, nên khi người dùng
 * sang `terminal-2` thì node ở `terminal-1` VẪN hiện — và đó chính là điều
 * đúng, vì tmux đã đổi window và nội dung nằm trong chính cái xterm đó. Khoá
 * của map vẽ thanh tab; giá trị chỉ nói "vùng chung hiển thị cái gì".
 *
 * `terminal-1` KHÔNG BAO GIỜ đổi khoá và không bao giờ đóng được: đổi khoá là
 * unmount, unmount là đóng WebSocket, và đóng WebSocket là mất phiên đang học.
 */
export function buildTerminalTabs(
  openTerminals: readonly ExecTarget[],
  pane: ReactNode,
): ReadonlyMap<WorkspaceTabId, ReactNode> {
  const tabs = new Map<WorkspaceTabId, ReactNode>();
  for (const tab of openTerminals) {
    tabs.set(tab, tab === PRIMARY_TERMINAL ? pane : null);
  }
  return tabs;
}
