'use client';

import type { ReactElement } from 'react';
import { Check, CircleCheck, CircleX, Unplug, X } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { parseCheckCriteria } from '@devops-platform/scenario/verify-prelude';
import { cn, SCROLL_REGION_FOCUS } from '@devops-platform/ui';

/**
 * Kết quả một lượt chấm.
 *
 * ⛔ BA nhánh. `passed: false` (bài làm chưa đạt) và `error` (phiên hết hạn,
 * gateway hỏng, apiserver trục trặc) PHẢI hiện khác nhau: `checkStep`/`checkTask`
 * cố ý ném lỗi hệ thống thay vì gộp thành `passed: false`.
 *
 * Phân biệt bằng HÌNH khối chứ không chỉ màu: đạt/chưa đạt là một THẺ kết quả
 * (dải tiêu đề đặc + danh sách tiêu chí), không chấm được là một BĂNG khác hẳn
 * có câu nói thẳng đây không phải bài làm sai.
 *
 * ⚠ Chuỗi mở đầu của ba nhánh ("Đạt", "Chưa đạt (exit ", "Không chấm được") bị
 * luồng e2e bài học và lab neo bằng regex `^(...)`.
 */
export type CheckOutcome =
  | { kind: 'running' }
  | { kind: 'result'; passed: boolean; exitCode: number; output: string }
  | { kind: 'error'; message: string };

export interface CheckResultPanelProps {
  readonly outcome: CheckOutcome | null;
  /** Dòng nhỏ phía trên, vd. "Lần chấm gần nhất" khi đây là kết quả đã lưu. */
  readonly caption?: string;
}

/**
 * `running` trả `null` có chủ ý: nút chấm đã tự mang trạng thái chờ, và luồng
 * e2e chờ panel XUẤT HIỆN rồi mới đọc chữ.
 */
export function CheckResultPanel({ outcome, caption }: CheckResultPanelProps): ReactElement | null {
  if (outcome === null || outcome.kind === 'running') {
    return null;
  }

  if (outcome.kind === 'error') {
    return (
      <div role="alert" className="mt-4 flex items-start gap-3 border border-warning/50 bg-warning/10 p-3 text-sm">
        <Unplug aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{t('session.task.state.infra')}</p>
          <p className="mt-1 text-muted-foreground">
            {t('session.task.infra-note')} {outcome.message}
          </p>
        </div>
      </div>
    );
  }

  const { criteria, notes } = parseCheckCriteria(outcome.output);
  const passed = outcome.passed;
  const Icon = passed ? CircleCheck : CircleX;

  return (
    <div role="status" className="mt-4 border border-border bg-card text-sm animate-rise">
      {caption !== undefined && (
        <p className="border-b border-border px-3 py-1.5 type-label text-muted-foreground">{caption}</p>
      )}
      <p
        className={cn(
          'flex items-center gap-2 px-3 py-2 font-semibold text-foreground',
          passed ? 'bg-success/15' : 'bg-destructive/12',
        )}
      >
        <Icon aria-hidden="true" className={cn('size-4 shrink-0', passed ? 'text-success' : 'text-destructive')} />
        {passed ? t('session.task.state.passed') : t('session.task.state.failed-with-exit', { code: outcome.exitCode })}
      </p>

      {criteria.length > 0 && (
        <ul aria-label={t('session.task.criteria')} className="divide-y divide-border">
          {criteria.map((criterion, index) => (
            <li key={`${String(index)}-${criterion.label}`} className="flex items-start gap-2.5 px-3 py-2">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center',
                  criterion.ok ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground',
                )}
              >
                {criterion.ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 text-foreground">
                {criterion.label}
                <span className="sr-only">
                  , {criterion.ok ? t('session.task.criterion-ok') : t('session.task.criterion-fail')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {notes !== '' && (
        /* Vùng cuộn vào được bằng bàn phím (axe `scrollable-region-focusable`). Không bẻ dòng: đây là output terminal. */
        <pre
          tabIndex={0}
          aria-label={t('session.task.result-title')}
          className={cn(
            'max-h-48 overflow-auto border-t border-border bg-muted px-3 py-2 font-mono text-xs text-muted-foreground',
            SCROLL_REGION_FOCUS,
          )}
        >
          {notes}
        </pre>
      )}
    </div>
  );
}
