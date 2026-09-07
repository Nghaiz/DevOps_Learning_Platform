/**
 * Thứ tự các script chạy trong `lessons.runSetup`, dưới dạng DỮ LIỆU.
 *
 * ## Vì sao tách ra khỏi thân procedure
 *
 * Thứ tự này là điều kiện ĐÚNG-SAI, không phải một tối ưu — xem ba lý do ngay
 * dưới. Nhưng khi nó nằm dưới dạng ba khối `if` nối tiếp trong một tRPC
 * procedure cần orchestrator + Postgres + một phiên sandbox thật, thì nó KHÔNG
 * CÓ phép kiểm nào: ô AC "đúng thứ tự" chỉ còn là một câu trong report, và câu
 * đó vẫn xanh sau khi ai đó đảo hai khối.
 *
 * Đưa thứ tự thành một mảng do hàm thuần sinh ra là cách rẻ nhất để nó có một
 * phép kiểm thật. Vòng lặp thi hành ở `routers/lessons.ts` khi ấy không còn
 * quyết định gì cả.
 *
 * ## Thứ tự, và cái giá của từng vế nếu đảo
 *
 * 1. **công cụ** — `background` của bài được phép gõ `yq`/`rg` vừa bật. Chạy
 *    sau là để script bài gặp `command not found` ở một dòng mà người soạn đã
 *    kiểm là chạy được.
 * 2. **asset** — `loxilb` chạy `sudo /bin/bash ./start.sh` ngay dòng đầu
 *    `background`; file phải có mặt trước đó.
 * 3. **background** — thứ dựng môi trường của bài.
 */

/** Nhãn dùng cho phép kiểm và cho câu báo lỗi; KHÔNG phải thứ chạy trong pod. */
export type SetupStepKind = 'tools' | 'assets' | 'background';

export interface SetupStep {
  readonly kind: SetupStepKind;
  readonly script: string;
  /**
   * Câu người học đọc khi bước này thoát non-zero.
   *
   * Một câu RIÊNG cho mỗi bước, không phải một câu chung: "chuẩn bị môi trường
   * thất bại" không nói được là công cụ chưa bật, file chưa tới pod, hay script
   * của bài hỏng — ba nguyên nhân với ba việc phải làm khác nhau.
   */
  readonly failureMessage: (exitCode: number) => string;
}

export function setupScriptPlan(input: {
  /** `null` = bài không khai `toolset`, hoặc không phải phase đầu. */
  readonly tools: string | null;
  /** `null` = bài không có asset, hoặc không phải phase đẩy asset. */
  readonly assets: string | null;
  /** `null` = phase này không có script `background`. */
  readonly background: string | null;
}): readonly SetupStep[] {
  const steps: SetupStep[] = [];

  if (input.tools !== null) {
    steps.push({
      kind: 'tools',
      script: input.tools,
      failureMessage: (exitCode) =>
        `Bật bộ công cụ của bài thất bại (exit ${String(exitCode)}). Hãy khởi động lại phiên.`,
    });
  }

  if (input.assets !== null) {
    steps.push({
      kind: 'assets',
      script: input.assets,
      failureMessage: (exitCode) =>
        `Đẩy file kèm bài học thất bại (exit ${String(exitCode)}). Hãy khởi động lại phiên.`,
    });
  }

  if (input.background !== null) {
    steps.push({
      kind: 'background',
      script: input.background,
      failureMessage: (exitCode) =>
        `Script chuẩn bị môi trường thất bại (exit ${String(exitCode)}). Hãy khởi động lại phiên.`,
    });
  }

  return steps;
}
