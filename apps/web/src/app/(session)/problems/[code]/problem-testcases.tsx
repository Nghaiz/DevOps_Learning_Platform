import type { ReactElement } from 'react';
import { EyeOff } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Badge } from '@devops-platform/ui';
import type { TestcaseTeaser } from '@devops-platform/games';

/**
 * Danh sách testcase của bài — §18.B.4, phía người học.
 *
 * ⛔ Component này KHÔNG che gì cả, và đó là chủ ý. Phép che đã xảy ra ở máy chủ
 * (`server/problems/testcases.ts`): `TestcaseTeaser` không có chỗ nào chứa
 * `check`/`args`, và `label` đã là `null` sẵn cho testcase ẩn chưa mở. Nếu một
 * ngày ai đó thấy cần thêm một `if` ẩn-hiện ở đây thì dữ liệu đã rò trước khi
 * tới đây rồi, và cái `if` đó chỉ là hoạt cảnh.
 *
 * Testcase ẩn VẪN hiện thành một dòng, không bị bỏ khỏi danh sách. Đó là điều
 * kiện để mẫu số `n/m` của verdict trung thực: người làm phải biết bài có bao
 * nhiêu testcase để hiểu `WA (4/5)` nghĩa là còn cách bao xa. Giấu cả sự tồn
 * tại thì mẫu số nói dối.
 */
export function ProblemTestcases({
  testcases,
}: {
  readonly testcases: readonly TestcaseTeaser[];
}): ReactElement {
  const hidden = testcases.filter((testcase) => !testcase.visible).length;

  return (
    <section className="flex flex-col gap-3">
      {/*
        `<h2>` chứ không phải `<h3>`: bậc trên nó là `<h1>` của
        `ProblemOverview`, và một bậc nhảy cóc làm axe đỏ `heading-order`. Cổng
        a11y của repo chạy trên đúng trang này.
      */}
      <h2 className="text-lg font-semibold text-foreground">{t('catalog.problem.tests-title')}</h2>

      {testcases.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('catalog.problem.tests-empty')}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t('catalog.problem.tests-count', { total: testcases.length })}
          </p>

          <ol className="flex flex-col gap-2">
            {testcases.map((testcase, index) => (
              <li
                key={testcase.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <span
                  aria-hidden
                  className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground"
                >
                  {index + 1}
                </span>
                {testcase.label === null ? (
                  <>
                    {/*
                      Nhãn `null` nghĩa là máy chủ CHƯA gửi tên xuống. Vẽ một
                      câu nói ra điều đó thay vì một ô trống: một dòng rỗng đọc
                      như dữ liệu hỏng, và trình đọc màn hình thì không đọc gì cả.
                    */}
                    <span className="flex-1 text-sm italic text-muted-foreground">
                      {t('catalog.problem.tests-hidden-item')}
                    </span>
                    {/*
                      Biểu tượng có `aria-hidden` và chữ nằm trong Badge: nghĩa
                      "ẩn" không bao giờ chỉ do hình hay màu chuyển tải.
                    */}
                    <Badge variant="outline" icon={null}>
                      <EyeOff aria-hidden className="size-3" />
                      {t('catalog.problem.tests-hidden-badge')}
                    </Badge>
                  </>
                ) : (
                  <span className="flex-1 text-sm text-foreground">{testcase.label}</span>
                )}
              </li>
            ))}
          </ol>

          {hidden > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('catalog.problem.tests-hidden-note', { hidden })}{' '}
              {t('catalog.problem.tests-hidden-why')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
