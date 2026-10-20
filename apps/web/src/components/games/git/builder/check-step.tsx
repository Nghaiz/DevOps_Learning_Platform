'use client';

/**
 * Kiểm bản nháp: danh sách lỗi của `levelDraftIssues`, rồi E.7 (kiểm lời giải mẫu).
 *
 * ## Hai lời hứa của bước này
 *
 *  1. **Danh sách lỗi là `levelDraftIssues`, không phải một bộ kiểm thứ hai.**
 *     Viết lại phép kiểm ở tầng giao diện là dựng hai định nghĩa của "bản nháp
 *     đã xong", và chúng sẽ lệch nhau. Bước này chỉ dịch mã lỗi sang câu.
 *  2. **Nút E.7 nói đúng phạm vi của nó.** `checkSolvable` chạy chuỗi lời giải
 *     người soạn tự khai và hỏi nó có đạt hết mục tiêu bắt buộc không. Nó KHÔNG
 *     trả lời "level này có giải được không": câu đó cần duyệt một không gian
 *     lệnh vô hạn. Câu phạm vi nằm NGAY TRƯỚC nút, không nằm dưới kết quả: một
 *     câu đặt sau kết quả là câu người ta đọc sau khi đã tin vào kết quả. Ô gác:
 *     `builder-promises.test.ts`.
 */

import { useState, type CSSProperties, type ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import type { DraftIssue, SolvabilityReport } from '@devops-platform/games';

import { ISSUE_TEXT } from './builder-copy';
import { BuilderStep } from './builder-step';
import { Button, Icon } from '@devops-platform/ds';

function DraftIssueList({ issues }: { readonly issues: readonly DraftIssue[] }): ReactElement {
  if (issues.length === 0) {
    return (
      <p
        className="flex animate-enter items-center gap-2 text-sm text-ok-ink"
        data-testid="git-builder-issues"
      >
        <Icon name="success" size={16} className="shrink-0" />
        {t('author.builder.issues.ready')}
      </p>
    );
  }
  return (
    <div data-testid="git-builder-issues" className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-bad-ink">{t('author.builder.issues.title')}</h3>
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {issues.map((issue, index) => (
          <li
            key={`${issue.field}:${issue.code}:${issue.detail ?? ''}:${String(index)}`}
            className="flex animate-enter gap-2.5 py-2 text-sm leading-relaxed text-ink"
            style={{ '--i': index } as CSSProperties}
          >
            <span aria-hidden className="mt-2 size-2 shrink-0 bg-bad-solid" />
            <span>
              {t(ISSUE_TEXT[issue.code])}
              {/*
                `detail` là thứ người soạn tự gõ (mã mục tiêu, tên vị từ, tên lệnh),
                nên nó KHÔNG đi qua `packages/copy`. In nó trong thẻ `code` cạnh câu.
              */}
              {issue.detail !== undefined && (
                <>
                  {' '}
                  <code className="bg-well px-1 font-mono text-xs">{issue.detail}</code>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SolvabilityReportView({ report }: { readonly report: SolvabilityReport }): ReactElement {
  const counts = { passed: report.passedCount, total: report.totalCount };
  return (
    <div className="flex animate-enter flex-col gap-3" data-testid="git-builder-check-report">
      <p
        role="status"
        className={
          report.accepted
            ? 'flex items-center gap-2 text-sm font-semibold text-ok-ink'
            : 'flex items-center gap-2 text-sm font-semibold text-bad-ink'
        }
      >
        {report.accepted ? (
          <Icon name="success" size={16} className="shrink-0" />
        ) : (
          <Icon name="close" size={16} className="shrink-0" />
        )}
        {report.accepted
          ? t('author.builder.check.pass', counts)
          : t('author.builder.check.fail', counts)}
      </p>
      {report.unmet.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-ink">{t('author.builder.check.unmet')}</p>
          <ul className="flex flex-col gap-1">
            {report.unmet.map((objective) => (
              <li key={objective.id} className="text-sm text-bad-ink">
                <code className="bg-well px-1 font-mono text-xs">{objective.id}</code>{' '}
                {objective.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.rejected.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs leading-relaxed text-ink-2">
            {t('author.builder.check.rejected')}
          </p>
          <ul className="flex flex-col gap-1 bg-well p-2">
            {report.rejected.map((rejected, index) => (
              <li
                key={`${rejected.command}:${String(index)}`}
                className="font-mono text-xs break-words text-warn-ink"
              >
                {rejected.command} → [{rejected.code}] {rejected.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export interface CheckStepProps {
  readonly index: number;
  readonly issues: readonly DraftIssue[];
  readonly report: SolvabilityReport | null;
  /** `true` khi bản nháp chưa thành level (`draftToLevel` trả `null`). */
  readonly blocked: boolean;
  readonly onRun: () => void;
}

export function CheckStep({ index, issues, report, blocked, onRun }: CheckStepProps): ReactElement {
  // Khoá báo cáo theo số lượt chạy: bấm kiểm lại một bản nháp không đổi vẫn
  // phát lại hiệu ứng, nên người soạn thấy phép kiểm đã chạy lại thật.
  const [runs, setRuns] = useState(0);
  return (
    <BuilderStep index={index} id="builder-kiem" title={t('author.builder.step.check')}>
      <DraftIssueList issues={issues} />
      <div data-testid="git-builder-check" className="flex flex-col gap-3 bg-well p-4">
        <p className="text-sm leading-relaxed text-ink">{t('author.builder.check.scope')}</p>
        <div>
          <Button
            size="sm"
            variant="ink"
            icon="play"
            disabled={blocked}
            onClick={() => {
              onRun();
              setRuns((n) => n + 1);
            }}
            data-testid="git-builder-run-check"
          >
            {t('author.builder.check.run')}
          </Button>
        </div>
        {blocked && (
          <p className="text-xs leading-relaxed text-ink-2">
            {t('author.builder.check.blocked')}
          </p>
        )}
        {report !== null && <SolvabilityReportView key={runs} report={report} />}
      </div>
    </BuilderStep>
  );
}
