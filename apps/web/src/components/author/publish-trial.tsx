'use client';

import type { CSSProperties, ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, cn } from '@devops-platform/ui';
import { renderCopy, t } from '@devops-platform/copy';
import type { PublishPhase } from './publish-machine';
import {
  TRIAL_STATUS_KEYS,
  mergeTrialOutcome,
  parsePublishFailure,
  type TrialStepPlan,
  type TrialStepResult,
  type TrialStepStatus,
} from './trial-plan';

/**
 * Bảng các script lượt xuất bản sẽ chạy, theo đúng thứ tự, và kết quả từng dòng
 * khi có. Máy chủ không phát tiến độ từng bước, nên trong lúc chạy mọi dòng còn ở
 * "đang chờ" và câu dẫn nói thẳng điều đó thay vì giả một thanh tiến độ.
 */
export function TrialReport(props: {
  readonly phase: PublishPhase;
  readonly plan: readonly TrialStepPlan[];
  readonly publishError: string | null;
}): ReactElement {
  if (props.plan.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          'author.publish-panel-bai-nay-khong-co-script-nao-luot-chay-thu-cua-no-la-chinh-viec-sandbox-dung',
        )}
      </p>
    );
  }

  const pending = props.plan.map((plan) => ({ plan, status: 'pending' as TrialStepStatus }));

  if (props.phase.kind === 'idle' || props.phase.kind === 'archived') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t('author.publish-panel-chua-chay-lan-nao-day-la-nhung-gi-luot-xuat-ban-se-chay-dung-thu-tu')}
        </p>
        <TrialTable rows={pending} />
      </div>
    );
  }

  if (props.phase.kind === 'running' || props.phase.kind === 'submitting') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t('author.publish-panel-dang-chay-may-chu-khong-phat-tien-do-tung-buoc-nen-moi-dong-duoi-day-con-o')}
        </p>
        <TrialTable rows={pending} />
      </div>
    );
  }

  const failure = props.phase.kind === 'failed' ? parsePublishFailure(props.phase.error) : null;
  const merged =
    props.phase.kind === 'passed'
      ? mergeTrialOutcome(props.plan, null)
      : failure === null
        ? null
        : mergeTrialOutcome(props.plan, failure);

  if (merged === null) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('author.publish-panel-khong-khop-duoc-loi-voi-buoc-nao-cua-bai')}</AlertTitle>
        <AlertDescription>
          <p>
            {t('author.publish-panel-noi-dung-bai-co-the-da-doi-sau-luot-xuat-ban-do-day-la-nguyen-van-loi-may-c')}
          </p>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs">
            {props.publishError ?? (props.phase.kind === 'failed' ? props.phase.error : '')}
          </pre>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TrialTable rows={merged} />
      {failure !== null && failure.kind === 'step' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">
            {t('author.publish-panel-output-cua')} <code className="font-mono">{failure.label}</code>{' '}
            {t('author.publish-panel-exit')} {failure.exitCode})
          </p>
          <pre className="max-h-60 overflow-auto bg-ink p-3 font-mono text-xs text-ink-foreground">
            {failure.output}
          </pre>
        </div>
      )}
      {failure !== null && failure.kind !== 'step' && (
        <Alert variant="destructive">
          <AlertTitle>{t('author.publish-panel-truot-truoc-khi-chay-duoc-buoc-nao')}</AlertTitle>
          <AlertDescription>
            <pre className="whitespace-pre-wrap font-mono text-xs">{failure.message}</pre>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** Ô trạng thái của từng dòng: màu đi kèm chữ, không bao giờ là kênh duy nhất. */
const STATUS_TONE: Readonly<Record<TrialStepStatus, string>> = {
  passed: 'bg-success text-success-foreground',
  ran: 'bg-muted text-foreground',
  failed: 'bg-destructive text-destructive-foreground',
  skipped: 'border border-border text-muted-foreground',
  pending: 'border border-border text-muted-foreground',
};

function TrialTable(props: { readonly rows: readonly TrialStepResult[] }): ReactElement {
  return (
    <ol className="flex flex-col border-t border-border">
      {props.rows.map((row, index) => (
        <li
          key={row.plan.label}
          className="stagger flex animate-rise flex-wrap items-center gap-3 border-b border-border py-3"
          style={{ '--i': index } as CSSProperties}
        >
          <span className="w-8 font-mono text-xs text-muted-foreground tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className={cn('inline-flex h-6 items-center px-2 font-mono text-xs', STATUS_TONE[row.status])}>
            {renderCopy(TRIAL_STATUS_KEYS[row.status])}
          </span>
          <span className="min-w-0 flex-1 text-sm text-foreground">{renderCopy(row.plan.description)}</span>
          <code className="font-mono text-xs text-muted-foreground">{row.plan.label}</code>
        </li>
      ))}
    </ol>
  );
}
