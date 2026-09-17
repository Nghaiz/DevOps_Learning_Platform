import type { Testcase, TestcaseTeaser } from '@devops-platform/games';

/**
 * Biên đọc testcase — §18.B.4.
 *
 * ⛔ ĐÂY LÀ CHỐT CHẶN THẬT, không phải một lớp trang trí trên giao diện. Đọc
 * `core/problem.ts` § `TestcaseTeaser` trước khi sửa file này.
 *
 * ## Vì sao nguồn là cột `objectives`
 *
 * Quyết định **#20** của thiết kế nói thẳng: *"Objective = testcase."* Bảng
 * `problems` hôm nay có cột `objectives jsonb` và KHÔNG có cột `testcases` —
 * xem § "Món nợ đã ghi tên" ở cuối file. Nên nguồn của `Testcase[]` là chính
 * cột đó, đọc qua một phép phân tích ở biên thay vì tin vào chú thích
 * `$type<Objective[]>()` của Drizzle (một lời khai lúc biên dịch; Drizzle không
 * kiểm gì lúc chạy).
 *
 * ## `required` KHÔNG ánh xạ sang `visible`
 *
 * Hai trường này gần nhau về hình dạng và ngược nhau về nghĩa:
 *
 * | | `Objective.required` | `Testcase.visible` |
 * |---|---|---|
 * | Trả lời | không đạt thì có chặn không | người làm có được XEM trước khi nộp không |
 * | Ai đọc | bộ chấm | tầng gửi dữ liệu xuống trình duyệt |
 *
 * `core/problem.ts` bỏ `required` một cách tường minh (*"một testcase thì luôn
 * chặn — đó là nghĩa của `AC`"*). Ánh xạ `required: false` thành `visible: false`
 * sẽ biến một mục tiêu thưởng cũ thành một testcase ẩn, tức đổi nghĩa dữ liệu
 * đang có mà không ai ra lệnh.
 *
 * ## Mặc định `visible: true` cho dòng cũ, và vì sao đó KHÔNG phải bịa
 *
 * Mọi dòng `objectives` viết trước 18.B đều đã được gửi NGUYÊN VĂN xuống trình
 * duyệt (`k8s/problem.ts` § `ProblemForSolver` nói rõ *"`objectives` thì KHÔNG
 * che"*). Nên `true` giữ đúng hành vi hôm nay, từng bit. `false` là năng lực
 * MỚI và phải được ghi tường minh — §18.D.2 (lane soạn bài) là chỗ ghi nó.
 */

/** Một phần tử `objectives`/`testcases` như nó thật sự nằm trong jsonb. */
interface RawTestcaseLike {
  readonly id?: unknown;
  readonly label?: unknown;
  readonly check?: unknown;
  readonly args?: unknown;
  readonly visible?: unknown;
}

/**
 * Cột jsonb → `Testcase[]` của hợp đồng.
 *
 * Nhận `readonly unknown[]` chứ không nhận `Objective[]`: dữ liệu tới từ một
 * cột jsonb, và kiểu TypeScript của cột là một lời khai chứ không phải một phép
 * kiểm. Nhận kiểu hẹp ở đây là tự hứa với mình rằng DB không bao giờ chứa gì
 * khác — mà chính lane §18.D.2 sắp ghi thêm `visible` vào đó.
 *
 * Phần tử hỏng (thiếu `id` hoặc `check`) bị BỎ, không ném: một bài soạn dở
 * không được làm sập cả trang danh sách của mọi người. Cổng xuất bản
 * (`publish-gate.ts`) mới là chỗ từ chối hình dạng đó, và nó chạy trước khi bài
 * tới được người học.
 */
export function problemTestcases(raw: readonly unknown[]): readonly Testcase[] {
  const out: Testcase[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const row = item as RawTestcaseLike;
    if (typeof row.id !== 'string' || typeof row.check !== 'string') {
      continue;
    }
    out.push({
      id: row.id,
      label: typeof row.label === 'string' ? row.label : row.id,
      check: row.check,
      // `args` giữ nguyên khi là object; mọi thứ khác thành `undefined`. Một
      // mảng hay một chuỗi lọt vào đây sẽ làm vị từ đọc tham số ra rác.
      ...(typeof row.args === 'object' && row.args !== null && !Array.isArray(row.args)
        ? { args: row.args as Readonly<Record<string, unknown>> }
        : {}),
      // Xem khối đầu file: chỉ một `false` TƯỜNG MINH mới làm testcase ẩn.
      visible: row.visible !== false,
    });
  }
  return out;
}

/**
 * `Testcase[]` → `TestcaseTeaser[]` — phép che của §18.B.4, chạy TRÊN MÁY CHỦ.
 *
 * ⛔ Hàm này là lý do `check`/`args` không tới được trình duyệt. Nó dựng object
 * mới với đúng ba trường thay vì `{ ...testcase, label: … }`, và khác biệt đó
 * là toàn bộ vấn đề: một phép rải sẽ mang theo mọi trường tương lai ai đó thêm
 * vào `Testcase`, im lặng, và không ô test nào biết tên trường mới để mà đỏ.
 *
 * `afterSubmit` phải tới từ MÁY CHỦ (đã có lượt nộp nào của chính người này
 * chưa), không bao giờ từ input của client — cùng luật `ProblemHintTeaser`:
 * *"Máy chủ quyết, không phải client."* Nhận cờ này từ client là hỏi kẻ tấn
 * công xem họ đã nộp bài chưa.
 *
 * Phần tử KHÔNG bị bỏ khỏi mảng khi ẩn, và đó là điều kiện để `n/m` trung thực:
 * người làm phải biết bài có bao nhiêu testcase để hiểu `WA (4/5)` nghĩa là còn
 * cách bao xa. Giấu cả sự tồn tại thì mẫu số nói dối.
 */
export function toTestcaseTeasers(
  testcases: readonly Testcase[],
  afterSubmit: boolean,
): readonly TestcaseTeaser[] {
  return testcases.map((testcase) => ({
    id: testcase.id,
    // Testcase hiện: luôn cho xem nhãn (nhãn là ĐỀ BÀI). Testcase ẩn: chỉ sau
    // khi đã nộp — `null` chứ không phải chuỗi rỗng, vì hợp đồng khai
    // `label: string | null` và một nhãn rỗng là dữ liệu hỏng, khác hẳn "chưa
    // được xem".
    label: testcase.visible || afterSubmit ? testcase.label : null,
    visible: testcase.visible,
  }));
}

/**
 * Đường của NGƯỜI SOẠN: nhãn hiện hết, `check`/`args` vẫn KHÔNG đi qua đây.
 *
 * Tách thành hàm có tên thay vì truyền `afterSubmit: true`, cùng lý lẽ mà
 * `get.ts` đã ghi cho cặp `toSolverProblem`/`toAuthorProblem`: nhánh che và
 * nhánh không che là hai quyết định bảo mật, và một tham số boolean là chỗ lần
 * "đơn giản hoá" sau sẽ gộp nhầm.
 *
 * Người soạn cần `check`/`args` thì đi `problems.forEdit` — đường đó trả
 * `Problem` đầy đủ và có cổng chủ sở hữu riêng.
 */
export function toAuthorTestcaseTeasers(
  testcases: readonly Testcase[],
): readonly TestcaseTeaser[] {
  return toTestcaseTeasers(testcases, true);
}

/**
 * ── MÓN NỢ ĐÃ GHI TÊN, đừng để nó chìm ──
 *
 * Bảng `problems` chưa có cột `testcases`, và `problem_submissions` chưa có
 * `passed text[]` + `total integer`. Hệ quả đo được, không phải phỏng đoán:
 *
 * 1. `visible` hôm nay KHÔNG ghi được từ trang soạn bài — §18.D.2 là việc đó.
 *    Cho tới lúc ấy mọi testcase đọc ra đều `visible: true`, nên phép che ở đây
 *    đúng nhưng chưa có gì để che. Ô test `testcases.test.ts` vì vậy dựng dữ
 *    liệu ẩn trực tiếp, không đợi trang soạn.
 * 2. Lịch sử nộp bài KHÔNG hiện được `WA (4/5)`: `passed`/`total` không được
 *    lưu. `core/problem.ts` § `Submission` nói rõ vì sao hai trường đó phải là
 *    SỰ THẬT LỊCH SỬ chốt tại thời điểm nộp — suy lại từ bài hôm nay sẽ đọc
 *    `WA (4/5)` của hôm qua thành `WA (4/7)` sau khi tác giả thêm hai case.
 *
 * Cả hai đều nằm ở `apps/web/src/server/db/schema.ts`, file lane này KHÔNG sở
 * hữu. Đã báo lead.
 */
