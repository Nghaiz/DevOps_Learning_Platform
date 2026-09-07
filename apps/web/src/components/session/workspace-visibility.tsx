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

import { createContext, useContext, useEffect, type ReactElement, type ReactNode } from 'react';

/**
 * C5 — kênh báo "vùng của bạn đang HIỆN hay đang ẩn", và hệ quả bắt buộc của nó
 * đối với xterm.
 *
 * ## Vì sao cần một context, không phải một prop
 *
 * `WorkspacePanelProps` (C5) không mang handle của terminal — panel chỉ nhận
 * `ReactNode`. Nên panel không thể tự gọi `fit()`; nó chỉ biết vùng nào đang
 * hiện. Context là đường ngắn nhất để thông tin đó tới đúng component cầm
 * handle (`TerminalPane`) mà không phải nới hợp đồng C5 thêm một prop — và
 * §C0 nói rõ: thấy hợp đồng thiếu thì BÁO, không tự đổi.
 *
 * ## Mặc định là `true`, và đó là phần quan trọng
 *
 * `TerminalPane` còn được dùng NGOÀI panel: nhánh hẹp của `WorkspaceSplit`
 * (`narrowSide`), trang lab, trang playground. Ở đó không có provider nào, và
 * nếu mặc định là `false` thì terminal ở những trang ấy sẽ không bao giờ được
 * fit lại — một lỗi im lặng ở ba trang không liên quan gì tới tính năng này.
 */
const WorkspaceRegionVisibleContext = createContext<boolean>(true);

export function WorkspaceRegionVisibleProvider({
  visible,
  children,
}: {
  readonly visible: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <WorkspaceRegionVisibleContext.Provider value={visible}>
      {children}
    </WorkspaceRegionVisibleContext.Provider>
  );
}

/** `true` khi không nằm trong panel nào — xem lý lẽ ở đầu file. */
export function useWorkspaceRegionVisible(): boolean {
  return useContext(WorkspaceRegionVisibleContext);
}

/** Phần duy nhất của `TerminalHandle` (C3) mà việc fit-khi-hiện cần tới. */
export interface FitCapableHandle {
  fit(): void;
}

/**
 * Hoãn `run` tới sau khi trình duyệt đã bố trí xong. Trả về hàm huỷ.
 *
 * ⚠ ĐÂY là điểm mấu chốt của cả tính năng, không phải một chi tiết tối ưu.
 * Effect của React chạy SAU khi DOM đã đổi nhưng TRƯỚC khi trình duyệt tính
 * xong bố cục cho khung hình đó. Gọi `fit()` ngay trong effect nghĩa là xterm
 * đo một phần tử vừa mới thôi `display:none` — `getBoundingClientRect()` khi
 * ấy có thể vẫn là 0×0, và `FitAddon` sẽ chốt một số cột sai. Người dùng thấy
 * terminal hiện ra với dòng bị gãy rồi mới tự sửa lại một nhịp sau.
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
 * THÂN của effect fit-khi-hiện, tách ra thành hàm thuần.
 *
 * Tách vì `apps/web` chạy vitest ở env `node`: không jsdom thì không render nổi
 * hook để quan sát. Đây không phải một hàm bọc lấy lệ — nó là TOÀN BỘ phần thân
 * effect, nên test nó là test đúng thứ chạy thật (thứ duy nhất còn ngoài tầm
 * test là mảng deps, xem `useFitOnReveal`).
 *
 * Trả `undefined` khi không có gì để làm — đúng hình dạng mà `useEffect` chờ.
 */
export function runFitOnReveal(
  visible: boolean,
  handle: FitCapableHandle | null,
  schedule: FitScheduler = animationFrameScheduler,
): (() => void) | undefined {
  // Ẩn thì KHÔNG fit: xterm đo được 0×0 trên phần tử `display:none`, và một
  // `fit()` ở trạng thái đó ghi đè số cột đang đúng bằng số cột tối thiểu.
  if (!visible || handle === null) {
    return undefined;
  }
  return schedule(() => {
    handle.fit();
  });
}

/**
 * Gọi `handle.fit()` mỗi khi vùng chứa chuyển từ ẩn sang hiện.
 *
 * `handle` nằm trong deps chứ không chỉ `visible`: handle gắn với ĐÚNG một
 * `Connection` (xem `onReady` ở `packages/terminal/src/terminal-surface.tsx`),
 * nên nối lại là một handle MỚI. Nếu terminal nối lại trong lúc đang hiện,
 * effect phải chạy lại — không thì bản vẽ mới giữ nguyên số cột đo lúc ẩn.
 */
export function useFitOnReveal(
  handle: FitCapableHandle | null,
  visible: boolean,
  schedule: FitScheduler = animationFrameScheduler,
): void {
  useEffect(() => runFitOnReveal(visible, handle, schedule), [visible, handle, schedule]);
}
