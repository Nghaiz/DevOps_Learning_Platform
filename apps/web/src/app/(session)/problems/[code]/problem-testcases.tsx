import type { CSSProperties, ReactElement } from 'react';
import { EyeOff } from 'lucide-react';
import { t } from '@devops-platform/copy';
import type { TestcaseTeaser } from '@devops-platform/games';

/**
 * Danh sách testcase của bài, phía người học (§18.B.4).
 *
 * ⛔ Component này KHÔNG che gì cả, và đó là chủ ý. Phép che đã xảy ra ở máy chủ
 * (`server/problems/testcases.ts`): `TestcaseTeaser` không có chỗ chứa
 * `check`/`args`, và `label` đã là `null` sẵn cho testcase ẩn chưa mở. Nếu một
 * ngày cần thêm một `if` ẩn hiện ở đây thì dữ liệu đã rò trước khi tới đây.
 *
 * Testcase ẩn VẪN hiện thành một dòng: người làm phải biết bài có bao nhiêu
 * testcase để hiểu `WA (4/5)` nghĩa là còn cách bao xa. Giấu cả sự tồn tại thì
 * mẫu số nói dối.
 */
export function ProblemTestcases({
  testcases,
}: {
  readonly testcases: readonly TestcaseTeaser[];
}): ReactElement {
  const hidden = testcases.filter((testcase) => !testcase.visible).length;

  if (testcases.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('problem.oj.tests.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground">{t('problem.oj.tests.count', { total: testcases.length })}</p>

      <ol aria-label={t('problem.oj.tests.list')} className="border-y border-border">
        {testcases.map((testcase, index) => (
          <li
            key={testcase.id}
            className="stagger flex animate-rise items-center gap-4 border-b border-border py-3 last:border-b-0"
            style={{ '--i': index } as CSSProperties}
          >
            <span aria-hidden className="w-8 font-mono text-sm text-muted-foreground tabular-nums">
              {String(index + 1).padStart(2, '0')}
            </span>
            {testcase.label === null ? (
              <>
                {/*
                  Nhãn `null` nghĩa là máy chủ CHƯA gửi tên xuống. Vẽ một câu nói ra
                  điều đó thay vì một ô trống: một dòng rỗng đọc như dữ liệu hỏng.
                */}
                <span className="flex-1 text-sm text-muted-foreground">
                  {t('problem.oj.tests.hidden-item')}
                </span>
                <span className="inline-flex h-6 items-center gap-1.5 bg-muted px-2 font-mono text-xs text-muted-foreground">
                  <EyeOff aria-hidden className="size-3.5" />
                  {t('problem.oj.tests.hidden-badge')}
                </span>
              </>
            ) : (
              <span className="flex-1 text-sm text-foreground">{testcase.label}</span>
            )}
          </li>
        ))}
      </ol>

      {hidden > 0 && (
        <p className="text-sm text-muted-foreground">{t('problem.oj.tests.hidden-note', { hidden })}</p>
      )}
    </div>
  );
}
