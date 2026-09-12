import { t } from '@devops-platform/copy';
/**
 * Đọc kết quả `shellcheck` mà KHÔNG gộp "chưa kiểm được" vào "sạch".
 *
 * Đây là chỗ `rules/green-that-proves-nothing.md` mô tả bằng đúng chữ:
 *
 * > "không có cảnh báo nào" và "không kiểm được" render giống hệt nhau nếu ta
 * > gộp chúng.
 *
 * Và trên cụm này nó KHÔNG phải giả thiết: image `apps/web` **không cài
 * shellcheck** (đã ghi trong `server/content/shellcheck.ts`), nên đường mặc định
 * khi chạy thật là `available: false`. Một UI vẽ điều đó thành dấu tích xanh sẽ
 * nói với mọi người soạn, mọi lần, rằng script của họ đã qua kiểm — trong khi
 * chưa có lượt kiểm nào diễn ra.
 *
 * Ba mức, và **ba** chứ không hai:
 *
 * | Mức | Nghĩa |
 * |---|---|
 * | `clean` | Đã chạy, không có gì để nói |
 * | `warn` | Đã chạy, có N phát hiện |
 * | `unknown` | KHÔNG chạy được — không biết gì cả |
 */

export interface ShellcheckFindingView {
  readonly line: number;
  readonly level: string;
  readonly code: string;
  readonly message: string;
}

export interface ShellcheckReportView {
  readonly available: boolean;
  readonly findings: readonly ShellcheckFindingView[];
  readonly unavailableReason: string | null;
}

export interface ScriptWarningView {
  readonly path: string;
  readonly report: ShellcheckReportView;
}

export type ScriptCheckTone = 'clean' | 'warn' | 'unknown';

export interface ScriptCheckLabel {
  readonly tone: ScriptCheckTone;
  readonly label: string;
  readonly detail: string | null;
}

export function describeScriptReport(report: ShellcheckReportView): ScriptCheckLabel {
  if (!report.available) {
    return {
      tone: 'unknown',
      label: t('author.script-warning-chua-kiem-duoc'),
      detail:
        report.unavailableReason === null
          ? t(
              'author.script-warning-khong-ro-ly-do-day-khong-phai-script-sach-chua-co-luot-kiem-nao-chay',
            )
          : t('author.script-warning-day-khong-phai-script-sach-chua-co-luot-kiem-nao-chay', {
              reportUnavailablereason: String(report.unavailableReason),
            }),
    };
  }
  if (report.findings.length === 0) {
    return { tone: 'clean', label: t('author.script-warning-khong-co-canh-bao'), detail: null };
  }
  return {
    tone: 'warn',
    label: t('author.script-warning-canh-bao', {
      reportFindingsLength: String(report.findings.length),
    }),
    detail: t('author.script-warning-canh-bao-khong-chan-xuat-ban-script-van-co-the-chay-dung'),
  };
}

/**
 * Tóm tắt cho CẢ bài.
 *
 * Luật quyết định: **một report không chạy được kéo cả tóm tắt xuống `unknown`.**
 * Ưu tiên `warn` trên `unknown` sẽ để lọt đúng ca nguy hiểm — vài script có cảnh
 * báo, phần còn lại chưa ai kiểm, và tóm tắt nói "có 3 cảnh báo" như thể đó là
 * toàn bộ sự thật.
 *
 * `scriptWarnings` từ server CHỈ chứa report có gì để nói (`validateForPublish`
 * bỏ qua report vừa chạy được vừa sạch), nên mảng rỗng nghĩa là "mọi script đã
 * qua" — nhưng chỉ khi có script để qua. Bài không có script nào cũng ra mảng
 * rỗng, và hai chuyện đó khác nhau: `scriptCount` vì thế là tham số bắt buộc.
 */
export interface ScriptSummary {
  readonly tone: ScriptCheckTone | 'none';
  readonly label: string;
}

export function summarizeScriptChecks(
  warnings: readonly ScriptWarningView[],
  scriptCount: number,
): ScriptSummary {
  if (scriptCount === 0) {
    return { tone: 'none', label: t('author.script-warning-bai-nay-khong-co-script-nao-de-kiem') };
  }
  const unknown = warnings.filter((warning) => !warning.report.available).length;
  if (unknown > 0) {
    return {
      tone: 'unknown',
      label: t('author.script-warning-script-chua-kiem-duoc-khong-ket-luan-la-sach', {
        unknown: String(unknown),
        scriptcount: String(scriptCount),
      }),
    };
  }
  if (warnings.length > 0) {
    const findings = warnings.reduce((sum, warning) => sum + warning.report.findings.length, 0);
    return {
      tone: 'warn',
      label: t('author.script-warning-canh-bao-tren-script', {
        findings: String(findings),
        warningsLength: String(warnings.length),
        scriptcount: String(scriptCount),
      }),
    };
  }
  return {
    tone: 'clean',
    label: t('author.script-warning-script-khong-co-canh-bao-nao', {
      scriptcount: String(scriptCount),
    }),
  };
}
