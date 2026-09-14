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
 * ĐỔI 2 dựng mô hình kiểu KillerCoda, nơi terminal có mặt ở CẢ HAI tab: cờ đó
 * đứng yên `true` mãi mãi, effect fit không bao giờ chạy lại, và thứ còn lại là
 * một đường dây trông vẫn nguyên mà không dẫn điện. Nên kênh này mang một CHUỖI
 * mô tả hình học (`workspaceLayoutToken`) thay vì một cờ.
 *
 * ⚠ LÝ DO ĐÓ ĐÃ CHẾT cùng SỬA ĐỔI 3 (2026-09-13), kết luận thì không. Hai tab
 * nay loại trừ nhau nên hàng terminal ẩn/hiện THẬT, và một cờ cũng sẽ đổi đúng
 * hai lần như chuỗi. Chuỗi ở lại vì hai lý do nhỏ hơn nhưng có thật: đọc log
 * hay devtools ra được TÊN của bố cục thay vì `true`/`false`, và nó giữ nguyên
 * kiểu `string` mà `WorkspaceLayoutProvider` cùng giá trị mặc định
 * `'standalone'` bên dưới đang dùng. Đổi sang boolean là sửa ba file để đổi lấy
 * đúng con số không.
 *
 * Thứ làm chuỗi đổi giá trị là một lượt chuyển tab, và từ SỬA ĐỔI 3 mỗi lượt
 * chuyển đều đi qua một trạng thái 0×0 thật (hàng vừa bị ẩn, hoặc hàng vừa hiện
 * mà bố cục chưa tính xong). Mọi lần chuỗi đổi là một lần phải fit lại.
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
 * Tách để thân effect khẳng định được thẳng bằng bảng vào/ra. Đây không phải
 * một hàm bọc lấy lệ — nó là TOÀN BỘ phần thân effect, nên test nó là test đúng
 * thứ chạy thật (thứ duy nhất còn ngoài tầm test là mảng deps, xem
 * `useFitOnLayoutChange`).
 *
 * ⚠ Lý do CŨ chép ở đây là "`apps/web` chạy env `node`, không jsdom thì không
 * render nổi hook để quan sát" — hết đúng từ 2026-09-08: `node` chỉ còn là mặc
 * định của gói, và file cần DOM tự bật jsdom + RTL bằng docblock
 * `// @vitest-environment jsdom` (xem `workspace-panel.dom.test.tsx`).
 *
 * ⚠ KHÔNG còn tham số `visible`, và lý do KHÔNG phải "terminal không bao giờ bị
 * ẩn" như bản trước của dòng này viết: từ SỬA ĐỔI 3 hàng terminal ẩn thật ở tab
 * Editor. Lý do thật là một lượt fit "thừa" vốn vô hại: `TerminalHandle.fit()`
 * của §C3 tự no-op khi terminal đã `dispose()` hoặc khi container còn 0×0
 * (`tryMeasure()` trong `terminal-core.ts` đo cái hộp TRƯỚC rồi `return` ngay
 * khi phép đo trả `null`). Chốt đó nằm ở tầng thấp nhất và đã đủ, nên ở đây
 * KHÔNG dựng thêm một chốt "chặn fit khi đang ẩn" thứ hai: tầng này là tầng
 * không đo được container (`p16-workspace.md` §1.7). Giữ lại một cờ chỉ để
 * trông giống bản cũ là giữ một nhánh chết.
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
