import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WorkspacePanelProps } from './workspace-panel';
import {
  EDITOR_TAB,
  TERMINAL_TAB,
  isWorkspaceTab,
  listWorkspaceTabs,
  type WorkspaceTabId,
} from './workspace-tabs';

/**
 * SỬA ĐỔI 2 §Y2/§Y4/§Y5 — mặt tiếp xúc ĐA terminal đã bị gỡ, và phải NẰM YÊN.
 *
 * ## Vì sao file này tồn tại (một va chạm THẬT, không phải phòng xa)
 *
 * Hợp đồng `plans/devops-learning-platform/contracts/killercoda-workspace.md`
 * có §C6 mô tả ba tab, một bảng ánh xạ `terminal-N → tmux window N`, và một nút
 * `×` "vẫn ẩn, chờ vế tái dùng chỉ số". SỬA ĐỔI 2 (2026-09-07) GHI ĐÈ §C6 và
 * xoá sạch cả cụm đó; `867c55e` là commit thực thi.
 *
 * Nhưng phần văn bản §C6 vẫn nằm nguyên trong file hợp đồng, phía TRÊN phần ghi
 * đè. Ngày 2026-09-08 một lượt giao việc đã đọc đúng dòng đó rồi giao "mở nút
 * `×`, viết quy tắc cấp lại chỉ số tmux" cho một lane — một nhiệm vụ đã chết,
 * và không có MỘT phép kiểm nào trong `apps/web` đỏ lên để nói điều đó. Cả cây
 * mã im lặng vì thứ cần gác không phải mã có mặt, mà mã đã VẮNG.
 *
 * Đây chính là hạng lỗi §C6 tự cảnh báo — "không lỗi, không cảnh báo" — chỉ là
 * lần này nó cắn ở tầng quy trình chứ không phải lúc chạy.
 *
 * ## Ba mệnh đề, và AI gác mệnh đề nào
 *
 * | Mệnh đề | Ai gác | Đỏ ở lệnh nào |
 * |---|---|---|
 * | `WorkspaceTabId` đúng hai giá trị, không có `terminal-N` | test + kiểu | `test` và `typecheck` |
 * | `WorkspacePanelProps` không có `onCloseTerminal`/`onAddTerminal`/`split`/`terminals` | CHỈ kiểu | `typecheck` |
 * | `tmux-control.ts` không quay lại | test | `test` |
 *
 * ⚠ Nói thẳng về hàng giữa: các khẳng định kiểu bên dưới là hằng số lúc chạy,
 * nên `expect(...).toBe(true)` của chúng ĐỎ KHÔNG BAO GIỜ được. Chúng chỉ có
 * tác dụng dưới `pnpm --filter web typecheck`. Ghi ra đây để không ai đọc màu
 * xanh của `pnpm --filter web test` mà tưởng ba hàng đều đã được gác — một ô
 * xanh không biết đỏ thì không chứng minh gì.
 *
 * ## Khi file này ĐỎ
 *
 * Đỏ = mặt tiếp xúc đa terminal đang quay lại. Đó có thể là điều ĐÚNG (người
 * dùng đổi ý), nhưng nếu vậy thì thứ phải sửa TRƯỚC là hợp đồng — §Y2/§Y4/§Y5
 * phải được thu hồi tường minh, chứ không phải file này bị sửa cho khớp mã.
 * ⛔ Đừng nới các khẳng định dưới đây để làm suite xanh lại.
 */

/** `true` khi `K` KHÔNG còn là khoá của props. Bật `false` ⇒ typecheck đỏ. */
type KeyRemoved<K extends string> = K extends keyof WorkspacePanelProps ? false : true;

/** Đối chứng dương cho `KeyRemoved`: một khoá BẮT BUỘC phải còn. */
type KeyPresent<K extends string> = K extends keyof WorkspacePanelProps ? true : false;

describe('§Y4 — thanh tab chỉ có Editor và Terminal, không có tab đóng được', () => {
  it('bài có editor ⇒ ĐÚNG hai mục, không có mục thứ ba', () => {
    expect(listWorkspaceTabs(true)).toEqual([EDITOR_TAB, TERMINAL_TAB]);
    expect(listWorkspaceTabs(true)).toHaveLength(2);
  });

  it('bài không có editor ⇒ đúng một mục, và mục đó là Terminal', () => {
    expect(listWorkspaceTabs(false)).toEqual([TERMINAL_TAB]);
  });

  it('id của mô hình CŨ bị từ chối — `terminal-1`, `terminal-2`, `terminal-3`', () => {
    // Mô hình cũ đánh số tab để ánh xạ sang tmux window. Nhận lại một id như
    // vậy là mở lại đúng khe hở §C6 mô tả: bảng tab và window thật lệch nhau
    // mà không ai báo.
    for (const stale of ['terminal-1', 'terminal-2', 'terminal-3']) {
      expect(isWorkspaceTab(stale), `id mô hình cũ "${stale}" KHÔNG được nhận lại`).toBe(false);
    }
  });

  it('đối chứng dương: hai id hợp lệ VẪN được nhận', () => {
    // Không có ca này thì một `isWorkspaceTab` luôn trả `false` cũng làm ca
    // trên xanh — tức ca trên có thể xanh vì hàm hỏng, không phải vì hàm đúng.
    expect(isWorkspaceTab(EDITOR_TAB)).toBe(true);
    expect(isWorkspaceTab(TERMINAL_TAB)).toBe(true);
  });

  it('kiểu `WorkspaceTabId` không rộng hơn hai giá trị (gác bởi typecheck)', () => {
    const unionUnchanged: WorkspaceTabId extends 'editor' | 'terminal' ? true : false = true;
    expect(unionUnchanged).toBe(true);
  });
});

describe('§Y4 — props không được mọc lại tay cầm của mô hình đa terminal', () => {
  it('đối chứng dương: `terminal` (số ít) VẪN là một khoá của props', () => {
    // Nếu import kiểu hỏng hoặc props suy ra `any`, mọi khẳng định "đã gỡ" bên
    // dưới sẽ đúng một cách rỗng tuếch. Hàng này làm nó không rỗng được.
    const terminalStillThere: KeyPresent<'terminal'> = true;
    expect(terminalStillThere).toBe(true);
  });

  it('`onCloseTerminal` / `onAddTerminal` / `split` / `onToggleSplit` / `terminals` đã gỡ', () => {
    const closeGone: KeyRemoved<'onCloseTerminal'> = true;
    const addGone: KeyRemoved<'onAddTerminal'> = true;
    const splitGone: KeyRemoved<'split'> = true;
    const toggleSplitGone: KeyRemoved<'onToggleSplit'> = true;
    const terminalsMapGone: KeyRemoved<'terminals'> = true;

    expect([closeGone, addGone, splitGone, toggleSplitGone, terminalsMapGone]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('§Y5 — `tmux-control` đã xoá và không được dựng lại', () => {
  /**
   * Vì sao gác bằng SỰ TỒN TẠI của file chứ không phải grep định danh: cụm
   * `onAddTerminal`/`onCloseTerminal` còn được NHẮC TÊN trong chú thích của
   * `use-workspace-tabs.ts` và `lab-client.tsx` (chúng giải thích vì sao đã gỡ).
   * Một lệnh grep định danh sẽ đỏ ngay từ lượt đầu vì trúng chú thích, rồi bị
   * nới ra cho tới lúc không gác gì nữa.
   */
  const SESSION_DIR = import.meta.dirname;

  it('không có file `tmux-control.ts` / `tmux-control.test.ts` trong thư mục này', () => {
    for (const name of ['tmux-control.ts', 'tmux-control.test.ts', 'tmux-control.tsx']) {
      expect(
        existsSync(path.join(SESSION_DIR, name)),
        `${name} đã quay lại — §Y5 nói không còn call-site nào cho nó. ` +
          'Nếu đa terminal thật sự được khôi phục thì thu hồi §Y2/§Y4/§Y5 trong ' +
          'hợp đồng TRƯỚC, đừng sửa phép kiểm này cho khớp mã.',
      ).toBe(false);
    }
  });

  it('đối chứng dương: phép kiểm nhìn ĐÚNG thư mục (file cạnh nó có thật)', () => {
    // Nếu `import.meta.dirname` trỏ sai chỗ thì ca trên xanh vì không thấy gì
    // cả — xanh vì mù, không phải vì sạch.
    expect(existsSync(path.join(SESSION_DIR, 'workspace-tabs.ts'))).toBe(true);
  });
});
