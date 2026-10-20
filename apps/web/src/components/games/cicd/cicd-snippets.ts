import { t } from '@devops-platform/copy';

/**
 * Mẩu YAML chèn nhanh — 19.E.3.
 *
 * ## Vì sao KHÔNG lấy từ `level.teaching.cheatsheet`
 *
 * Hai bảng làm hai việc khác nhau. Cheatsheet là tài liệu YAML HOÀN CHỈNH để
 * đọc (có khoá cha, có thụt lề — `levels/cheatsheet.test.ts` bắt nó đọc được
 * bằng chính bộ đọc). Bảng dưới đây là MẨU để chèn vào giữa một tài liệu đang
 * soạn, nên nó không có khoá cha. Kéo cheatsheet vào đây sẽ chèn thêm một
 * `jobs:` thứ hai mỗi lần bấm.
 *
 * ## Chèn dưới dòng con trỏ
 *
 * `insertSnippetAt` chèn vào ĐẦU DÒNG kế tiếp dòng đang đứng, không chèn giữa
 * dòng: mẩu YAML mang thụt lề của riêng nó, và cắt ngang một dòng sẽ làm cả
 * hai nửa sai cấp. Không biết con trỏ ở đâu thì chèn vào cuối, đúng hành vi cũ.
 */

export interface CicdSnippet {
  readonly id: string;
  readonly label: string;
  /** Câu giải thích ngắn, hiện dưới nhãn — mẩu YAML một mình không dạy được gì. */
  readonly explain: string;
  readonly yaml: string;
}

/**
 * Bảng mẩu, dựng theo hạng máy chạy CÓ THẬT của màn.
 *
 * Hạng máy là một hằng của từng level (`c01` cấp `linux`, các màn sau cấp hạng
 * khác), nên một chuỗi cứng ở đây sẽ đúng ở đúng một màn và làm workflow KHÔNG
 * CHẠY ĐƯỢC ở mọi màn còn lại — với lỗi `unschedulable`, thứ trông như lỗi của
 * người chơi. Truyền vào từ `level.workload.runners` thay vì đoán.
 */
export function cicdSnippets(runnerClassIds: readonly string[]): readonly CicdSnippet[] {
  const may = runnerClassIds[0] ?? 'linux';
  return [
  {
    id: 'job',
    label: t('games.cicd.snippet.job'),
    explain: t('games.cicd.snippet.job-hint'),
      yaml: [
        '  build:',
        `    runs-on: ${may}`,
        '    steps:',
        `      - name: ${t('games.cicd.snippet.job-step')}`,
        '        run: make build',
      ].join('\n'),
  },
  {
    id: 'needs',
    label: t('games.cicd.snippet.needs'),
    explain: t('games.cicd.snippet.needs-hint'),
    yaml: ['    needs:', '      - clone'].join('\n'),
  },
  {
    id: 'runs-on',
    label: t('games.cicd.snippet.runs-on'),
    explain: t('games.cicd.snippet.runs-on-hint'),
    yaml: `    runs-on: ${may}`,
  },
  {
    id: 'step',
    label: t('games.cicd.snippet.step'),
    explain: t('games.cicd.snippet.step-hint'),
    yaml: [`      - name: ${t('games.cicd.snippet.step-name')}`, '        run: make test'].join('\n'),
  },
  {
    id: 'continue-on-error',
    label: t('games.cicd.snippet.continue'),
    explain: t('games.cicd.snippet.continue-hint'),
    yaml: '    continue-on-error: true',
  },
  {
    id: 'matrix',
    label: t('games.cicd.snippet.matrix'),
    explain: t('games.cicd.snippet.matrix-hint'),
      yaml: [
        '    strategy:',
        '      matrix:',
        '        os:',
        '          - linux',
        '          - macos',
      ].join('\n'),
    },
  ];
}

/**
 * Nối mẩu vào cuối văn bản, đảm bảo đúng MỘT dòng trống ngăn cách.
 *
 * Văn bản rỗng thì không thêm dòng trống dẫn đầu — một file YAML mở đầu bằng
 * dòng trống vẫn quét được, nhưng nó trông như một lỗi và người chơi sẽ đi sửa
 * nhầm chỗ.
 */
export function appendSnippet(current: string, snippet: string): string {
  const base = current.replace(/\s+$/u, '');
  return base.length === 0 ? snippet : `${base}\n${snippet}\n`;
}

export interface SnippetInsertion {
  readonly text: string;
  /** Vị trí con trỏ sau khi chèn: ngay cuối mẩu vừa chèn. */
  readonly cursor: number;
}

/**
 * Chèn mẩu vào đầu dòng NGAY SAU dòng chứa `cursor`.
 *
 * `cursor === null` ⇒ nối vào cuối (`appendSnippet`). Con trỏ ở dòng cuối không
 * có ký tự xuống dòng ⇒ cũng nối vào cuối, vì "dòng kế tiếp" chưa tồn tại.
 */
export function insertSnippetAt(current: string, cursor: number | null, snippet: string): SnippetInsertion {
  const cuoiDong =
    cursor === null ? -1 : current.indexOf('\n', Math.max(0, Math.min(cursor, current.length)));
  if (cuoiDong === -1) {
    const base = current.replace(/\s+$/u, '');
    return {
      text: appendSnippet(current, snippet),
      cursor: (base.length === 0 ? 0 : base.length + 1) + snippet.length,
    };
  }
  const truoc = current.slice(0, cuoiDong + 1);
  const sau = current.slice(cuoiDong + 1);
  return { text: `${truoc}${snippet}\n${sau}`, cursor: truoc.length + snippet.length };
}
