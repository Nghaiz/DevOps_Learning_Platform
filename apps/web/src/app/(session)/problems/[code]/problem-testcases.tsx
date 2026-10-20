import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Icon, Pill } from '@devops-platform/ds';
import type { TestcaseTeaser } from '@devops-platform/games';

/**
 * Danh sách testcase của bài, phía người học.
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
export function ProblemTestcases({ testcases }: { readonly testcases: readonly TestcaseTeaser[] }): ReactElement {
  const hidden = testcases.filter((testcase) => !testcase.visible).length;

  if (testcases.length === 0) {
    return <p className="text-sm text-ink-3">{t('problem.oj.tests.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">{t('problem.oj.tests.count', { total: testcases.length })}</p>

      <ol aria-label={t('problem.oj.tests.list')} className="flex flex-col border-y border-rule">
        {testcases.map((testcase, index) => (
          <li key={testcase.id} className="flex items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-well-2 text-xs font-medium tabular-nums text-ink-2"
            >
              {index + 1}
            </span>
            {testcase.label === null ? (
              <>
                {/*
                  Nhãn `null` nghĩa là máy chủ CHƯA gửi tên xuống. Vẽ một câu nói ra
                  điều đó thay vì một ô trống: một dòng rỗng đọc như dữ liệu hỏng.
                */}
                <span className="flex-1 text-sm text-ink-3">{t('problem.oj.tests.hidden-item')}</span>
                <Pill icon="eye-off">{t('problem.oj.tests.hidden-badge')}</Pill>
              </>
            ) : (
              <span className="flex flex-1 items-center gap-2 text-sm text-ink">
                <Icon name="target" size={15} className="shrink-0 text-tp-ink" />
                {testcase.label}
              </span>
            )}
          </li>
        ))}
      </ol>

      {hidden > 0 ? <p className="text-sm text-ink-3">{t('problem.oj.tests.hidden-note', { hidden })}</p> : null}
    </div>
  );
}
