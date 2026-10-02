/**
 * Prelude của verify script + bộ tách dòng tiêu chí.
 *
 * Hợp đồng: `plans/labs-rebuild/contracts.md` §C1. Thuần chuỗi, không import
 * Node built-in nào — FE được phép import qua subpath `./verify-prelude`.
 *
 * ## Vì sao server ghép prelude chứ không để mỗi script tự định nghĩa
 *
 * Lab kiểu KodeKloud chấm nhiều tiêu chí trong một task và phải báo tiêu chí
 * nào trượt. Để mỗi `verify.sh` tự viết hàm `pass`/`fail` là chép cùng năm dòng
 * vào hàng trăm file, và bản chép nào quên `exit 1` ở cuối sẽ ĐỖ GIẢ: in đủ dấu
 * ✗ rồi thoát 0 vì lệnh cuối là `printf`. Trap EXIT dưới đây đóng đúng lỗ đó ở
 * một chỗ: đã có `fail` thì exit code không thể là 0.
 *
 * Trap KHÔNG đổi một exit ≠ 0 có chủ đích, và không làm gì khi script không gọi
 * `fail` — nên verify cũ (chỉ dùng exit code) và verify Killercoda nhập về chạy
 * y như trước. Script tự đặt `trap … EXIT` của riêng nó thì trap đó thay trap
 * này; khi ấy nó tự chịu trách nhiệm về exit code, đúng như trước khi có prelude.
 */

export const VERIFY_PRELUDE = [
  '# --- dlp verify prelude v1 ---',
  '__dlp_fail_count=0',
  "pass() { printf '✓ %s\\n' \"$*\"; }",
  "fail() { printf '✗ %s\\n' \"$*\"; __dlp_fail_count=$((__dlp_fail_count + 1)); }",
  'check() { local __label=$1; shift; if "$@" >/dev/null 2>&1; then pass "$__label"; else fail "$__label"; fi; }',
  "trap '__dlp_rc=$?; if [ \"$__dlp_fail_count\" -gt 0 ] && [ \"$__dlp_rc\" -eq 0 ]; then exit 1; fi' EXIT",
  '# --- end dlp verify prelude ---',
  '',
].join('\n');

/**
 * Ghép prelude vào trước script.
 *
 * Dòng shebang của script (nếu có) bị bỏ: nó không còn ở dòng đầu nên vốn đã
 * chỉ là một comment, và để lại một `#!/bin/bash` giữa file làm người đọc log
 * tưởng có hai script. Script được chạy bằng `GATEWAY_EXEC_SHELL` (bash) đọc từ
 * STDIN, không qua shebang (docs/scenario-format.md §4.0).
 */
export function withVerifyPrelude(script: string): string {
  const body = script.replace(/\r\n?/g, '\n').replace(/^#![^\n]*\n/, '');
  return VERIFY_PRELUDE + body;
}

export interface CheckCriterion {
  readonly ok: boolean;
  readonly label: string;
}

export interface ParsedCheckOutput {
  readonly criteria: CheckCriterion[];
  /** Mọi dòng không phải tiêu chí, giữ nguyên thứ tự, đã cắt dòng trống ở hai đầu. */
  readonly notes: string;
}

const PASS_MARK = '✓ ';
const FAIL_MARK = '✗ ';

/**
 * Tách output của một lượt chấm thành tiêu chí + ghi chú.
 *
 * Chỉ dòng BẮT ĐẦU bằng dấu + dấu cách mới là tiêu chí. Một dấu ✓ giữa câu
 * (`đã xong ✓`) là văn xuôi của tác giả, không phải phán quyết — đoán nó là
 * tiêu chí sẽ vẽ một dòng xanh mà không lệnh nào kiểm.
 *
 * Nhãn rỗng sau dấu bị bỏ qua thay vì vẽ một dòng trống có dấu tích: tiêu chí
 * không có tên thì người học không biết mình đạt cái gì.
 */
export function parseCheckCriteria(output: string): ParsedCheckOutput {
  const criteria: CheckCriterion[] = [];
  const notes: string[] = [];
  for (const raw of output.replace(/\r\n?/g, '\n').split('\n')) {
    const isPass = raw.startsWith(PASS_MARK);
    const isFail = raw.startsWith(FAIL_MARK);
    if (isPass || isFail) {
      const label = raw.slice(PASS_MARK.length).trim();
      if (label !== '') {
        criteria.push({ ok: isPass, label });
      }
      continue;
    }
    notes.push(raw);
  }
  return { criteria, notes: notes.join('\n').trim() };
}
