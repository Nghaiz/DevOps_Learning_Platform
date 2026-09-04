import { spawn } from 'node:child_process';

/**
 * Chạy `shellcheck` trên script người soạn nhập, LÚC LƯU (P9 9.D task 13).
 *
 * ## Cảnh báo, KHÔNG chặn — và vì sao
 *
 * Task 13 nói thẳng: nội dung vendored upstream vốn không sạch, và cổng CI đã
 * chốt chỉ soi `dlp-*`. Chặn cứng ở đây sẽ làm người soạn không lưu nổi một bản
 * nháp đang viết dở, tức là ép họ viết script hoàn hảo ngay từ ký tự đầu tiên.
 * Nhưng "không chặn" chỉ chấp nhận được khi lời cảnh báo TỚI ĐƯỢC NGƯỜI SOẠN —
 * cùng đánh đổi đã ghi ở `unsupportedCapabilities` của `lessons/catalog.ts`, và
 * cùng điều kiện: nếu FE bỏ qua field này thì đánh đổi trở thành một lỗi im lặng.
 *
 * ## Bẫy đã trả giá (task 14)
 *
 * `execShell` của sandbox là **bash**, không phải `sh`. Một script dùng
 * `pipefail`/`[[ ]]`/mảng chạy đúng trong sandbox nhưng bị `shellcheck` mặc
 * định (`sh`) báo lỗi — và người soạn sẽ sửa cho hết cảnh báo, làm script tệ
 * đi. Nên `--shell=bash` là BẮT BUỘC ở đây, không phải một lựa chọn.
 *
 * ## Khi không có `shellcheck` trên máy
 *
 * Image `apps/web` không cài `shellcheck` (đã kiểm: `Dockerfile` không có).
 * Nên đường mặc định trên cụm là **không chạy được**, và câu trả lời phải nói
 * đúng điều đó thay vì trả về "0 cảnh báo".
 *
 * ⚠ Đây chính là chế độ hỏng mà `rules/green-that-proves-nothing.md` mô tả:
 * "không có cảnh báo nào" và "không kiểm được" render giống hệt nhau nếu ta
 * gộp chúng. Nên `available: false` là một giá trị riêng, và FE phải hiện nó
 * khác với "sạch".
 */

export interface ShellcheckFinding {
  readonly line: number;
  readonly level: string;
  readonly code: string;
  readonly message: string;
}

export interface ShellcheckReport {
  /** `false` = không chạy được (thiếu binary/timeout). KHÁC HẲN "sạch". */
  readonly available: boolean;
  readonly findings: readonly ShellcheckFinding[];
  /** Vì sao không chạy được. `null` khi `available`. */
  readonly unavailableReason: string | null;
}

const TIMEOUT_MS = 5_000;

/** Trần đầu vào — script dài bất thường là dấu hiệu dán nhầm cả một file, không phải một bước. */
const MAX_SCRIPT_BYTES = 64 * 1024;

interface ShellcheckJsonComment {
  readonly line?: unknown;
  readonly level?: unknown;
  readonly code?: unknown;
  readonly message?: unknown;
}

function parseFindings(stdout: string): readonly ShellcheckFinding[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ShellcheckFinding[] = [];
  for (const entry of raw as ShellcheckJsonComment[]) {
    out.push({
      line: typeof entry.line === 'number' ? entry.line : 0,
      level: typeof entry.level === 'string' ? entry.level : 'info',
      code: typeof entry.code === 'number' ? `SC${String(entry.code)}` : String(entry.code ?? ''),
      message: typeof entry.message === 'string' ? entry.message : '',
    });
  }
  return out;
}

export async function shellcheckScript(script: string): Promise<ShellcheckReport> {
  if (script.trim() === '') {
    return { available: true, findings: [], unavailableReason: null };
  }
  if (Buffer.byteLength(script, 'utf8') > MAX_SCRIPT_BYTES) {
    return {
      available: false,
      findings: [],
      unavailableReason: `script dài quá ${String(MAX_SCRIPT_BYTES)} byte — không kiểm`,
    };
  }

  return new Promise<ShellcheckReport>((resolve) => {
    let child;
    try {
      // `--shell=bash` — xem khối chú thích đầu file, task 14.
      // `-` đọc từ stdin: không ghi file tạm, nên không có đường dẫn nào để
      // một tên script người dùng nhập chạm tới.
      child = spawn('shellcheck', ['--shell=bash', '--format=json', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (cause) {
      resolve({
        available: false,
        findings: [],
        unavailableReason: cause instanceof Error ? cause.message : 'không chạy được shellcheck',
      });
      return;
    }

    let stdout = '';
    let settled = false;
    const finish = (report: ShellcheckReport): void => {
      if (!settled) {
        settled = true;
        resolve(report);
      }
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ available: false, findings: [], unavailableReason: 'shellcheck quá hạn' });
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    // stderr được đọc và BỎ: không đọc thì pipe đầy và tiến trình con treo.
    child.stderr.resume();

    child.on('error', (cause: Error) => {
      clearTimeout(timer);
      // ENOENT = image không có shellcheck. Đây là đường MẶC ĐỊNH trên cụm hiện
      // tại, không phải một sự cố — nhưng nó vẫn là "không kiểm được".
      finish({ available: false, findings: [], unavailableReason: cause.message });
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      // shellcheck: 0 = sạch, 1 = có phát hiện. Mã khác (2 = lỗi dùng sai) nghĩa
      // là ta không có kết quả để tin.
      if (code !== 0 && code !== 1) {
        finish({
          available: false,
          findings: [],
          unavailableReason: `shellcheck thoát mã ${String(code)}`,
        });
        return;
      }
      finish({ available: true, findings: parseFindings(stdout), unavailableReason: null });
    });

    child.stdin.on('error', () => {
      // EPIPE khi shellcheck chết trước lúc ghi xong — `close`/`error` đã lo.
    });
    child.stdin.end(script, 'utf8');
  });
}
