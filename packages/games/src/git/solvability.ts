/**
 * Chạy một chuỗi lệnh trên một level rồi nói nó có đạt hết mục tiêu bắt buộc
 * không — §18.E.7.
 *
 * ## Đây là hàm ĐƯỢC TRÍCH RA, không phải hàm mới
 *
 * `levels.test.ts` đã có một hàm `judge()` làm đúng việc này, và nó là cỗ máy
 * của ô nghiệm thu **AC-8** (chạy `solutionCommands` của cả 32 level) và
 * **AC-9** (`altSolutionCommands`). Level Builder cần đúng phép đó cho level
 * người dùng vừa dựng, nên viết một bản thứ hai là tự tạo ra hai định nghĩa của
 * "level này qua được" — và chúng sẽ trôi khỏi nhau.
 *
 * Hệ quả có lợi, và nó là lý do chính chọn cách này: phép kiểm mà Builder chạy
 * cho level của bạn **là đúng phép kiểm** mà 32 level đang phát hành đi qua.
 * Không có một tiêu chuẩn cho hàng nhà và một tiêu chuẩn cho hàng khách.
 *
 * ## ⛔ Nó chứng minh "đường NÀY đi được", KHÔNG chứng minh "không có đường nào"
 *
 * `phase-18.md` §18.E.7 viết *"cảnh báo nếu trạng thái đích **không với tới
 * được** từ trạng thái đầu bằng tập lệnh cho phép"*. Câu đó mô tả một phép dò
 * toàn không gian lệnh, và phép đó không dựng được cho git: tên nhánh, message
 * commit và đường dẫn file đều là **tham số tự do**, nên không gian lệnh vô hạn
 * chứ không lớn. Mọi phép dò thật sẽ phải cắt ở đâu đó một cách tuỳ tiện, rồi
 * trả "không tìm thấy" — và "không tìm thấy" sẽ được đọc thành "không giải
 * được". Đúng hình dạng `rules/green-that-proves-nothing.md`: một ô gác không
 * bao giờ chứng minh được điều nó tự nhận.
 *
 * Nên phép ở đây hẹp hơn và TRUNG THỰC: người soạn phải tự khai một lời giải,
 * và ta chạy thật lời giải đó. Nhãn trên giao diện phải nói đúng chừng ấy —
 * *"lời giải mẫu có đạt hết mục tiêu không"*, không phải *"level này có giải
 * được không"*.
 *
 * Đổi lại, nó bắt được đúng cái bẫy hay gặp nhất khi dựng level bằng tay: đích
 * đặt ra từ một thế giới mà chuỗi lệnh khai không dẫn tới, vì người soạn đã
 * bấm vài nút trong sandbox rồi quên rằng lời giải phải tự đi lại quãng đó.
 */

import type { GitErrorCode, GitLevel } from './contract.ts';
import { runCommands } from './engine.ts';
import { evaluateObjectives, verdictOf } from './predicates.ts';
import { buildWorld } from './world-spec.ts';

/** Một lệnh trong chuỗi lời giải bị engine từ chối. */
export interface RejectedCommand {
  readonly command: string;
  readonly code: GitErrorCode;
  readonly message: string;
}

/** Một mục tiêu bắt buộc không đạt sau khi chạy hết chuỗi lệnh. */
export interface UnmetObjective {
  readonly id: string;
  readonly label: string;
}

export interface SolvabilityReport {
  /** Chuỗi lệnh đạt HẾT mục tiêu bắt buộc. */
  readonly accepted: boolean;
  readonly passedCount: number;
  readonly totalCount: number;
  readonly unmet: readonly UnmetObjective[];
  /**
   * Lệnh engine từ chối. Có thể KHÔNG rỗng mà vẫn `accepted: true` — một lời
   * giải gõ thừa một lệnh sai rồi gõ lại đúng vẫn tới đích. Đó là thông tin cho
   * người soạn, không phải điều kiện trượt.
   */
  readonly rejected: readonly RejectedCommand[];
  /**
   * Một dòng chẩn đoán đọc được, cho THÔNG BÁO TEST và log.
   *
   * ⚠ KHÔNG dùng chuỗi này làm chữ trên giao diện: nó ghép tiếng Việt thẳng
   * trong `packages/games` và không đi qua `packages/copy`. Giao diện đọc
   * `unmet` / `rejected` rồi tự dựng câu bằng `t()`.
   */
  readonly diagnosis: string;
}

/**
 * `seed` mặc định `1` — khớp mặc định của `createGitSession` (`engine.ts:99`).
 *
 * ⚠ Một seed khác ở đây nghĩa là phép kiểm chạy trên một thế giới đầu KHÁC thứ
 * người chơi sẽ thấy, và bài học đó đã phải trả giá một lần: hai plugin điền hai
 * hằng seed khác nhau làm mọi lượt nộp hợp lệ bị từ chối (xem
 * `git/problem-plugin.ts` § `GIT_UNSEEDED_REPLAY_SEED`).
 */
export function checkSolvable(
  level: GitLevel,
  commands: readonly string[],
  seed = 1,
): SolvabilityReport {
  const run = runCommands(level, commands, seed);
  // Cùng `seed` cho cây đích: `buildWorld` nuôi RNG của bot từ nó, nên một seed
  // khác dựng một cây đích khác và phép so trở thành vô nghĩa.
  const target = level.target === undefined ? null : buildWorld(level.target, seed);

  const results = evaluateObjectives(run.world, target, level.objectives);
  const verdict = verdictOf(results);

  const unmet: UnmetObjective[] = results
    .filter((r) => r.required && !r.met)
    .map((r) => ({ id: r.id, label: r.label }));

  const rejected: RejectedCommand[] = run.errors.map((e) => ({
    command: e.command,
    code: e.error.code,
    message: e.error.message,
  }));

  const diagnosis = [
    `level ${level.id}: ${String(verdict.passedCount)}/${String(verdict.totalCount)} mục tiêu bắt buộc`,
    unmet.length > 0 ? `  chưa đạt: ${unmet.map((o) => `${o.id} (${o.label})`).join(', ')}` : '',
    rejected.length > 0
      ? `  lệnh bị từ chối:\n${rejected.map((r) => `    "${r.command}" → [${r.code}] ${r.message}`).join('\n')}`
      : '',
  ]
    .filter((s) => s !== '')
    .join('\n');

  return {
    accepted: verdict.accepted,
    passedCount: verdict.passedCount,
    totalCount: verdict.totalCount,
    unmet,
    rejected,
    diagnosis,
  };
}
