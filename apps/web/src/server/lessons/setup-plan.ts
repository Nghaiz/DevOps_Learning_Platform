import { truncateUtf8 } from '../labs/output';

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

/** Thứ một bước setup để lại khi thoát non-zero. `output` là stdout+stderr đã gộp của gateway. */
export interface SetupStepFailure {
  readonly exitCode: number;
  readonly output: string;
}

export interface SetupStep {
  readonly kind: SetupStepKind;
  readonly script: string;
  /**
   * Câu người học đọc khi bước này thoát non-zero.
   *
   * Một câu RIÊNG cho mỗi bước, không phải một câu chung: "chuẩn bị môi trường
   * thất bại" không nói được là công cụ chưa bật, file chưa tới pod, hay script
   * của bài hỏng — ba nguyên nhân với ba việc phải làm khác nhau.
   *
   * ⛔ NHẬN CẢ `output`, không chỉ `exitCode` (P15 / 15.B). Bản trước chỉ dựng
   * câu từ mã thoát, nên script setup của lab k8s ghi
   * `Cum Kubernetes con khong san sang sau 90s` ra stderr — câu DUY NHẤT nói ra
   * nguyên nhân — trở thành mã chết: người học nhận đúng một dòng *"Script chuẩn
   * bị môi trường thất bại (exit 1). Hãy khởi động lại phiên."* và không phân
   * biệt được "cụm con chưa lên" (chờ thêm là được) với "script của bài hỏng"
   * (chờ vô ích). `runScriptInSession` đã trả `output` từ đầu; chỗ thiếu chỉ là
   * đường dẫn nó tới đây.
   */
  readonly failureMessage: (failure: SetupStepFailure) => string;
}

// ---------------------------------------------------------------- câu lỗi

/** Trần byte của đoạn nguyên nhân nhúng vào câu lỗi — một câu cho người đọc, không phải một lượt tải log. */
const SETUP_DETAIL_MAX_BYTES = 400;

/** Số dòng cuối giữ lại. Nguyên nhân nằm ở ĐUÔI: script thoát ngay sau dòng nó tự giải thích. */
const SETUP_DETAIL_MAX_LINES = 3;

/**
 * CSI (`ESC [ … @-~`) — màu của `kubectl`/`docker` lọt vào đây sẽ thành rác trong
 * chuỗi UI.
 *
 * CHỈ CSI, KHÔNG đuổi theo OSC/DCS: thứ sinh ra `output` ở đây luôn là lượt exec
 * không-TTY (`podexec/oneshot.go` đặt `TTY: false`), nên màu SGR là escape duy
 * nhất thực sự xuất hiện. Một nhánh OSC viết sai sẽ ăn cả phần văn bản SAU nó —
 * tức xoá đúng dòng cần đọc — tệ hơn hẳn việc để lọt một escape không ai gửi.
 *
 * `no-control-regex` tắt ở đúng một dòng: ESC (U+001B) LÀ thứ phải khớp ở đây.
 * Luật đó gác việc gõ nhầm một ký tự điều khiển vào một regex văn bản; viết lại
 * bằng `new RegExp(String.fromCharCode(27) + …)` chỉ che mắt luật chứ không đổi
 * hành vi, và làm mẫu khớp khó đọc hơn hẳn.
 */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Rút phần NGUYÊN NHÂN đọc được từ output thô của một bước setup hỏng.
 *
 * `null` = không còn gì để nói (output rỗng, hoặc chỉ có khoảng trắng) — caller
 * khi đó dùng câu dự phòng chứ không nhúng một chuỗi rỗng vào giữa câu.
 *
 * ## Về rủi ro "đưa stderr ra người dùng làm lộ nội bộ"
 *
 * Bảng rủi ro P15 xếp nó 2×3. Hình dạng thật của rủi ro đó hẹp hơn vẻ ngoài:
 * `output` ở đây là stdout+stderr của một script chạy TRONG pod của CHÍNH người
 * học, mà họ có shell root trong đó — không có đường dẫn nào ở đấy họ chưa xem
 * được bằng `ls`. Nội bộ của nền tảng (URL gateway, token, hostname trong cụm)
 * không bao giờ đi vào `output`: `validate.ts` cố ý KHÔNG nối `cause` vào
 * `message` đúng vì lý do đó, và nó vẫn không nối.
 *
 * Nên "lọc" ở đây là **cắt gọn + bỏ escape**, không phải một lớp kiểm duyệt giả:
 * giữ đuôi, bỏ dòng rỗng, bỏ ANSI, chặn trần byte. Dựng một bộ lọc bí ẩn cho một
 * thứ không rò sẽ chỉ xoá đúng dòng cần đọc vào ngày cần đọc nó.
 */
export function setupFailureDetail(output: string): string | null {
  const lines = output
    .replace(ANSI_ESCAPE, '')
    .split('\n')
    .map((line) => line.replace(/\r/g, '').trim())
    .filter((line) => line !== '');

  if (lines.length === 0) {
    return null;
  }

  const tail = lines.slice(-SETUP_DETAIL_MAX_LINES).join(' · ');
  return truncateUtf8(tail, SETUP_DETAIL_MAX_BYTES, '…');
}

/**
 * `<head> (exit N): <nguyên nhân>` — hoặc `<head> (exit N). <câu dự phòng>` khi
 * script hỏng mà không nói gì.
 *
 * Dấu phân cách KHÁC nhau có chủ ý: `:` giới thiệu một lời giải thích ĐẾN TỪ
 * script, `.` kết thúc một câu của chúng ta. Người đọc log phân biệt được ngay
 * "bài nói gì" với "bài không nói gì".
 */
function failureText(head: string, fallback: string): (failure: SetupStepFailure) => string {
  return (failure) => {
    const detail = setupFailureDetail(failure.output);
    const prefix = `${head} (exit ${String(failure.exitCode)})`;
    return detail === null ? `${prefix}. ${fallback}` : `${prefix}: ${detail}`;
  };
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
      failureMessage: failureText('Bật bộ công cụ của bài thất bại', 'Hãy khởi động lại phiên.'),
    });
  }

  if (input.assets !== null) {
    steps.push({
      kind: 'assets',
      script: input.assets,
      failureMessage: failureText('Đẩy file kèm bài học thất bại', 'Hãy khởi động lại phiên.'),
    });
  }

  if (input.background !== null) {
    steps.push({
      kind: 'background',
      script: input.background,
      failureMessage: failureText(
        'Script chuẩn bị môi trường thất bại',
        'Hãy khởi động lại phiên.',
      ),
    });
  }

  return steps;
}
