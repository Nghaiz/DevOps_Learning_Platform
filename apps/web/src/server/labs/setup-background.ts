import { setupFailureDetail, type SetupStep } from '../lessons/setup-plan';

/**
 * Setup của lab chạy NỀN, ngoài đường request (P15 / 15.C — hướng B).
 *
 * ## Vì sao hướng B, không phải hướng A
 *
 * `4a67043` cho `labs.startAttempt` chạy `lab.setup` — trước đó nó không bao giờ
 * chạy, nên mọi `verify.sh` chấm trên sandbox trắng. Bản sửa đúng, nhưng nó đặt
 * setup vào TRONG một request tRPC có trần thời gian (`gateway.execTimeout` 120s,
 * BFF 135s). Đo trên cụm thật 2026-09-09, lab `dlp-k8s-broken-deploy`:
 *
 *     load 1 phút      setup exec            kết quả
 *     2.0 – 5.2        17.1s · 23.7s · 26.1s  OK
 *     ~11 – 16         35.1s                  OK
 *     ~43              93.3s                  HỎNG (exit=1)
 *
 * Ngưỡng vỡ nằm trong khoảng load 16–43; ngoại suy thì chạm 120s quanh load
 * 55–60. Hướng A (nới `dlp-k8s-wait 90 → 105`) đẩy con số đó lên một chút và
 * ĐỂ NGUYÊN lớp lỗi: vẫn vỡ khi cụm đông. Objective 3 của chặng đòi lab k8s dùng
 * được ở mức tải cụm THẬT SỰ gặp, nên trần theo `execTimeout` phải biến mất chứ
 * không phải được nới.
 *
 * Hướng B: `startAttempt` PHÓNG script `background` chạy nền trong pod rồi trả
 * về ngay. Lượt exec còn lại chỉ ghi một file và `nohup` — hằng số, không phụ
 * thuộc cụm con lên nhanh hay chậm. Không còn đại lượng nào của setup nằm dưới
 * trần 120s.
 *
 * ## Cái giá, và nó được trả ở đâu
 *
 * Bỏ setup khỏi request nghĩa là **không còn ai đứng đó để nhận exit code**. Ba
 * chỗ phải bù:
 *
 * 1. `labs.setupStatus` — đọc sentinel, để UI hiện "đang chuẩn bị" và hiện
 *    NGUYÊN NHÂN khi hỏng.
 * 2. `labs.checkTask` — TỪ CHỐI chấm khi chưa xong. Thiếu vế này là quay lại
 *    đúng lỗi mà `4a67043` vừa sửa, dưới một hình dạng khác: chấm trên một cảnh
 *    dựng DỞ thay vì một cảnh TRẮNG.
 * 3. Sentinel phải mang cả mã thoát LẪN log, vì không lời gọi nào còn thấy chúng.
 *
 * ## Vì sao sentinel của NỀN TẢNG, không phải `/root/lab-k8s/.setup-done`
 *
 * Plan ô 11 chỉ đúng cờ của nội dung, và cờ đó có thật (`background.sh` ghi nó,
 * `foreground.sh` chờ nó). Nhưng `checkTask` KHÔNG biết đường dẫn ấy: nó khác
 * nhau theo từng bài (`/root/lab-k8s/…` vs `/root/lab-linux/…`), nên đọc nó từ
 * server đòi thêm một field vào lab schema — tức đổi contract nội dung, và bắt
 * mọi người soạn bài sau này phải khai đúng một đường dẫn để việc chấm hoạt động.
 *
 * Sentinel dưới đây do NỀN TẢNG ghi, quanh script của bài, nên nó đúng cho MỌI
 * lab mà không cần nội dung khai gì. Cờ của nội dung vẫn sống và vẫn là thứ
 * `foreground.sh` chờ — hai thứ cho hai người đọc khác nhau, không phải bản sao.
 */

/** Thư mục sentinel trong pod. `/root` vì nội dung đã ghi được ở đó (`/root/lab-k8s/…`). */
export const SETUP_SENTINEL_DIR = '/root/.dlp-setup';

/** Trần byte của log đọc về mỗi lượt probe — đủ để thấy nguyên nhân, không đủ để thành một lượt tải file. */
const SETUP_LOG_TAIL_BYTES = 4000;

const STATE_MARKER = 'DLP-SETUP-STATE';
const LOG_MARKER = 'DLP-SETUP-LOG';

// ---------------------------------------------------------------- phóng

/**
 * Bọc script `background` của bài thành một lượt phóng RỜI, trả về ngay.
 *
 * ## Ba chi tiết đều bắt buộc, không phải phòng xa
 *
 * 1. **Script đi qua base64.** Gateway đưa script vào pod qua STDIN của `bash`
 *    (`podexec/oneshot.go`), nên một heredoc ở đây sẽ đọc thân của nó từ CÙNG
 *    dòng stdin đó — chạy được, nhưng phụ thuộc vào thứ tự đọc của bash và vỡ
 *    lặng lẽ nếu script của bài tự chứa một heredoc (mà `background.sh` của
 *    `dlp-k8s-broken-deploy` chứa NĂM cái). base64 không có ký tự nào bash phải
 *    diễn giải, nên nó không có lớp trích dẫn nào để hỏng.
 *
 * 2. **`>/dev/null 2>&1 </dev/null` trên tiến trình nền.** `kubectl exec` kết
 *    thúc khi stream stdout ĐÓNG, không phải khi tiến trình cha thoát. Một con
 *    nền thừa hưởng stdout sẽ giữ stream mở và lượt exec treo đúng bằng thời
 *    gian setup — tức hướng B không làm gì cả, và triệu chứng giống y hệt bản cũ.
 *
 * 3. **`mv` chứ không phải ghi thẳng `rc`.** Một lượt probe rơi đúng lúc đang
 *    ghi sẽ đọc được file rỗng; `mv` cùng filesystem là atomic nên `rc` chỉ
 *    xuất hiện khi đã đủ nội dung. (`parseSetupProbe` vẫn coi `rc` không đọc
 *    được là HỎNG chứ không phải "xong" — hai lớp, vì đọc sai ở đây là chấm
 *    trên cảnh dựng dở.)
 *
 * `set -eu`, và KHÔNG `disown` — vì nó không thêm gì, KHÔNG vì nó hỏng.
 * (`content/labs/dlp-linux-triage/setup/background.sh` gọi `disown` ngay sau một
 * lượt `&` trong đúng bối cảnh bash-không-tương-tác này và nó chạy bình thường,
 * nên "disown sẽ lỗi no current job" là một khẳng định SAI — đừng viết lại nó.)
 * `setsid` đã tách hẳn process group, nên con nền không còn là job của shell này
 * để mà phải disown.
 */
export function buildBackgroundLaunchScript(script: string): string {
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  const d = SETUP_SENTINEL_DIR;
  const inner = [
    `bash ${d}/script > ${d}/log 2>&1`,
    `printf %s "$?" > ${d}/rc.part`,
    `mv ${d}/rc.part ${d}/rc`,
  ].join('; ');

  return [
    'set -eu',
    `mkdir -p ${d}`,
    // Dọn dấu của lượt trước: một phiên được dùng lại (hoặc một lượt phóng thứ
    // hai) không được để `rc` cũ làm probe báo "xong" cho script vừa bắt đầu.
    `rm -f ${d}/rc ${d}/rc.part ${d}/log ${d}/script`,
    `printf %s '${encoded}' | base64 -d > ${d}/script`,
    `nohup setsid bash -c '${inner}' </dev/null >/dev/null 2>&1 &`,
    '',
  ].join('\n');
}

/**
 * Đổi bước `background` của một kế hoạch setup thành bước PHÓNG; hai bước kia
 * giữ nguyên.
 *
 * ⛔ CHỈ `labs.startAttempt` dùng hàm này. `lessons.runSetup` PHẢI giữ setup đồng
 * bộ: nó trả cờ `ran` mà FE đọc để biết môi trường của phase đã dựng chưa, và
 * lesson có nhiều phase nên mỗi phase là một lượt setup riêng — "đã phóng" không
 * trả lời được câu hỏi đó. Lab cố ý không có phase (cả N task dùng CHUNG một lượt
 * setup), nên nó là nơi duy nhất mô hình nền chạy được. Đặt phép biến đổi ở đây
 * chứ không trong `setupScriptPlan` chính vì sự khác biệt đó — kế hoạch vẫn là
 * MỘT, cách thi hành mới là hai.
 *
 * Câu lỗi đổi theo: một lượt phóng thất bại KHÔNG phải "script của bài hỏng" (nó
 * chưa chạy dòng nào) mà là "không ghi/phóng được" — thiếu `setsid`, `/root`
 * không ghi được, pod chết giữa lượt exec. Giữ câu cũ ở đây sẽ gửi người học đi
 * đọc script của bài cho một sự cố nằm ngoài nó.
 */
export function launchedBackgroundStep(step: SetupStep): SetupStep {
  if (step.kind !== 'background') {
    return step;
  }
  return {
    kind: step.kind,
    script: buildBackgroundLaunchScript(step.script),
    failureMessage: (failure) => {
      const detail = setupFailureDetail(failure.output);
      const prefix = `Không phóng được script chuẩn bị môi trường (exit ${String(failure.exitCode)})`;
      return detail === null ? `${prefix}. Hãy khởi động lại phiên.` : `${prefix}: ${detail}`;
    },
  };
}

// ---------------------------------------------------------------- probe

/**
 * Script đọc sentinel. **LUÔN thoát 0** — mã thoát ở đây được giữ riêng cho lỗi
 * HẠ TẦNG (pod chết, apiserver trục trặc), đúng kỷ luật `validate.ts`: một lượt
 * probe không chạy được KHÔNG phải "setup hỏng", và trộn hai thứ đó lại sẽ báo
 * "môi trường không dựng được" cho một sự cố mạng.
 */
export const SETUP_PROBE_SCRIPT = [
  'set -u',
  `d=${SETUP_SENTINEL_DIR}`,
  `if [ ! -f "$d/script" ]; then echo '${STATE_MARKER} absent'; exit 0; fi`,
  `if [ ! -f "$d/rc" ]; then echo '${STATE_MARKER} running'; exit 0; fi`,
  `echo "${STATE_MARKER} done $(cat "$d/rc")"`,
  `echo '${LOG_MARKER}'`,
  `tail -c ${String(SETUP_LOG_TAIL_BYTES)} "$d/log" 2>/dev/null || true`,
  'exit 0',
  '',
].join('\n');

export type SetupState =
  /** Chưa có lượt phóng nào trong pod này. Lab không khai `background`, hoặc lần thử có trước P15. */
  | 'absent'
  /** Đã phóng, chưa có mã thoát. */
  | 'running'
  /** Mã thoát 0. */
  | 'ready'
  /** Mã thoát khác 0, hoặc một sentinel không đọc được. */
  | 'failed';

export interface SetupProbe {
  readonly state: SetupState;
  /** `null` trừ khi `state === 'failed'` VÀ đọc được mã thoát. */
  readonly exitCode: number | null;
  /** Đuôi log của script `background`, chưa cắt gọn cho người đọc. `null` khi không có. */
  readonly log: string | null;
}

/**
 * Đọc output của `SETUP_PROBE_SCRIPT`.
 *
 * ⛔ KHÔNG có đường nào trả `'ready'` khi không chắc. Một sentinel lạ (thiếu
 * dòng marker, `rc` rỗng, `rc` không phải số) về `'failed'`, không về `'ready'`
 * và cũng không về `'running'`:
 *
 * - về `'ready'` là cho `checkTask` chấm trên một cảnh dựng dở — đúng lớp lỗi
 *   `4a67043` vừa sửa;
 * - về `'running'` là một vòng chờ không bao giờ hết, và người học không đọc
 *   được gì ngoài "đang chuẩn bị" mãi mãi.
 *
 * `'failed'` thì người học đọc được một câu và bấm Bắt đầu lại được. Đó là
 * hướng sai-an-toàn duy nhất trong ba hướng.
 *
 * Nội dung của bài KHÔNG spoof được `state`: dòng marker do probe in TRƯỚC dấu
 * `LOG_MARKER`, và ta lấy lần khớp ĐẦU TIÊN.
 */
export function parseSetupProbe(output: string): SetupProbe {
  const separator = output.indexOf(`${LOG_MARKER}\n`);
  const head = separator === -1 ? output : output.slice(0, separator);
  const rawLog = separator === -1 ? null : output.slice(separator + LOG_MARKER.length + 1);
  const log = rawLog === null || rawLog.trim() === '' ? null : rawLog;

  const line = head.split('\n').find((l) => l.startsWith(`${STATE_MARKER} `));
  if (line === undefined) {
    return { state: 'failed', exitCode: null, log };
  }

  const rest = line.slice(STATE_MARKER.length + 1).trim();
  if (rest === 'absent') {
    return { state: 'absent', exitCode: null, log: null };
  }
  if (rest === 'running') {
    return { state: 'running', exitCode: null, log: null };
  }

  const match = /^done\s+(-?\d+)$/.exec(rest);
  if (match === null) {
    return { state: 'failed', exitCode: null, log };
  }
  const exitCode = Number(match[1]);
  return exitCode === 0
    ? { state: 'ready', exitCode: null, log: null }
    : { state: 'failed', exitCode, log };
}
