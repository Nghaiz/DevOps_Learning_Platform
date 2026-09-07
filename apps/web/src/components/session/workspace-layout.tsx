'use client';

import { createContext, useContext, useEffect, type ReactElement, type ReactNode } from 'react';

/**
 * §Y1 — kênh báo "hình học khoang terminal vừa đổi", và hệ quả bắt buộc của nó
 * đối với xterm.
 *
 * ## File này thay cho `workspace-visibility.tsx`, và vì sao phải thay
 *
 * Bản trước mang một cờ boolean "vùng của bạn đang HIỆN hay đang ẩn", vì lúc
 * đó tab không hoạt bị ẩn bằng `hidden` và terminal có thể là cái bị ẩn. SỬA
 * ĐỔI 2 bỏ hẳn khả năng đó: terminal LUÔN hiện ở cả hai tab (§Y1), nên một cờ
 * hiện/ẩn sẽ đứng yên `true` mãi mãi và effect fit KHÔNG BAO GIỜ chạy lại —
 * một đường dây trông vẫn còn nguyên nhưng không còn dẫn điện.
 *
 * Thứ thật sự đổi bây giờ là **kích thước**: chuyển tab (terminal ~40% → 100%)
 * và kéo thanh chia ngang. Nên kênh này mang một CHUỖI mô tả hình học hiện tại
 * (`workspaceLayoutToken`), và mọi lần chuỗi đó đổi là một lần phải fit lại.
 *
 * ## Vì sao cần một context, không phải một prop
 *
 * `WorkspacePanelProps` (§Y4) không mang handle của terminal — panel chỉ nhận
 * `ReactNode`. Nên panel không thể tự gọi `fit()`; nó chỉ biết hình học. Context
 * là đường ngắn nhất để thông tin đó tới đúng component cầm handle
 * (`TerminalPane`) mà không phải nới hợp đồng §Y4 thêm một prop.
 *
 * ## Mặc định là một hằng, và đó là phần quan trọng
 *
 * `TerminalPane` còn được dùng NGOÀI panel: nhánh hẹp của `WorkspaceSplit`
 * (`narrowSide`), và bất kỳ trang nào dựng thẳng nó. Ở đó không có provider
 * nào, và giá trị mặc định `'standalone'` KHÔNG BAO GIỜ đổi — nên effect chạy
 * đúng một lần lúc mount và không sinh ra lượt fit thừa nào ở những trang ấy.
 */
const WorkspaceLayoutContext = createContext<string>('standalone');

export function WorkspaceLayoutProvider({
  layout,
  children,
}: {
  readonly layout: string;
  readonly children: ReactNode;
}): ReactElement {
  return <WorkspaceLayoutContext.Provider value={layout}>{children}</WorkspaceLayoutContext.Provider>;
}

/** `'standalone'` khi không nằm trong panel nào — xem lý lẽ ở đầu file. */
export function useWorkspaceLayout(): string {
  return useContext(WorkspaceLayoutContext);
}

/** Phần duy nhất của `TerminalHandle` (§C3) mà việc fit-sau-khi-đổi-cỡ cần tới. */
export interface FitCapableHandle {
  fit(): void;
}

/**
 * Hoãn `run` tới sau khi trình duyệt đã bố trí xong. Trả về hàm huỷ.
 *
 * ⚠ ĐÂY là điểm mấu chốt của cả tính năng, không phải một chi tiết tối ưu.
 * Effect của React chạy SAU khi DOM đã đổi nhưng TRƯỚC khi trình duyệt tính
 * xong bố cục cho khung hình đó. Gọi `fit()` ngay trong effect nghĩa là xterm
 * đo một phần tử mà chiều cao mới còn CHƯA được áp — `getBoundingClientRect()`
 * khi ấy vẫn trả kích thước cũ (hoặc 0×0 nếu vừa thôi `display:none`), và
 * `FitAddon` sẽ chốt một số cột/hàng sai. Người dùng thấy terminal hiện ra với
 * dòng bị gãy rồi mới tự sửa lại một nhịp sau.
 *
 * `requestAnimationFrame` đẩy lời gọi sang trước lượt vẽ kế tiếp, tức sau khi
 * bố cục đã được tính.
 */
export type FitScheduler = (run: () => void) => () => void;

export const animationFrameScheduler: FitScheduler = (run) => {
  const id = requestAnimationFrame(run);
  return () => {
    cancelAnimationFrame(id);
  };
};

/**
 * THÂN của effect fit-sau-khi-đổi-cỡ, tách ra thành hàm thuần.
 *
 * Tách vì `apps/web` chạy vitest ở env `node`: không jsdom thì không render nổi
 * hook để quan sát. Đây không phải một hàm bọc lấy lệ — nó là TOÀN BỘ phần thân
 * effect, nên test nó là test đúng thứ chạy thật (thứ duy nhất còn ngoài tầm
 * test là mảng deps, xem `useFitOnLayoutChange`).
 *
 * ⚠ KHÔNG còn tham số `visible`. Ở mô hình mới terminal không bao giờ bị ẩn, và
 * một lượt fit "thừa" cũng vô hại: `TerminalHandle.fit()` của §C3 tự no-op khi
 * terminal đã `dispose()` hoặc khi container còn 0×0 (xem `terminal-core.ts`).
 * Giữ lại một cờ luôn `true` chỉ để trông giống bản cũ là giữ một nhánh chết.
 *
 * Trả `undefined` khi không có gì để làm — đúng hình dạng mà `useEffect` chờ.
 */
export function runFitAfterLayout(
  handle: FitCapableHandle | null,
  schedule: FitScheduler = animationFrameScheduler,
): (() => void) | undefined {
  if (handle === null) {
    return undefined;
  }
  return schedule(() => {
    handle.fit();
  });
}

/**
 * Gọi `handle.fit()` mỗi khi hình học khoang terminal đổi.
 *
 * `layout` là chuỗi từ `workspaceLayoutToken` — nó đổi khi người dùng chuyển
 * tab hoặc kéo thanh chia, và CHỈ khi đó.
 *
 * `handle` cũng nằm trong deps: handle gắn với ĐÚNG một `Connection` (xem
 * `onReady` ở `packages/terminal/src/terminal-surface.tsx`), nên nối lại là một
 * handle MỚI. Nếu terminal nối lại sau khi bố cục đã đổi, effect phải chạy lại
 * — không thì bản vẽ mới giữ nguyên số cột mặc định của xterm.
 */
export function useFitOnLayoutChange(
  handle: FitCapableHandle | null,
  layout: string,
  schedule: FitScheduler = animationFrameScheduler,
): void {
  useEffect(() => runFitAfterLayout(handle, schedule), [handle, layout, schedule]);
}
