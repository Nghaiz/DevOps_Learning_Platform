'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { parseCheckCriteria } from '@devops-platform/scenario/verify-prelude';
import { Icon, Stamp, cn } from '@devops-platform/ds';

/**
 * Kết quả một lượt chấm.
 *
 * ⛔ BA nhánh. `passed: false` (bài làm chưa đạt) và `error` (phiên hết hạn, gateway
 * hỏng, apiserver trục trặc) PHẢI hiện khác nhau: `checkStep`/`checkTask` cố ý ném lỗi
 * hệ thống thay vì gộp thành `passed: false`.
 *
 * Phân biệt bằng HÌNH khối chứ không chỉ màu: đạt/chưa đạt là con dấu kết quả + danh
 * sách tiêu chí; không chấm được là một băng khác hẳn, nói thẳng đây không phải bài
 * làm sai.
 *
 * ⚠ Chuỗi mở đầu của ba nhánh ("Đạt", "Chưa đạt (exit ", "Không chấm được") bị luồng
 * e2e bài học và lab neo bằng regex `^(...)`.
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
 * `running` trả `null` có chủ ý: nút chấm đã tự mang trạng thái chờ, và luồng e2e chờ
 * panel XUẤT HIỆN rồi mới đọc chữ.
 */
export function CheckResultPanel({ outcome, caption }: CheckResultPanelProps): ReactElement | null {
  if (outcome === null || outcome.kind === 'running') return null;

  if (outcome.kind === 'error') {
    return (
      <div role="alert" className="mt-4 flex items-start gap-3 border border-t-2 border-rule border-t-warn-mid bg-paper p-3.5 text-sm">
        <Icon name="unplug" size={18} className="mt-0.5 shrink-0 text-warn-ink" />
        <div className="min-w-0">
          <p className="font-medium text-ink">{t('session.task.state.infra')}</p>
          <p className="mt-1 text-ink-2">
            {t('session.task.infra-note')} {outcome.message}
          </p>
        </div>
      </div>
    );
  }

  const { criteria, notes } = parseCheckCriteria(outcome.output);
  const passed = outcome.passed;

  return (
    <div role="status" className="mt-4 flex flex-col gap-3 text-sm">
      {caption === undefined ? null : <p className="text-xs text-ink-3">{caption}</p>}
      <div>
        <Stamp tone={passed ? 'ok' : 'bad'}>
          {passed ? t('session.task.state.passed') : t('session.task.state.failed-with-exit', { code: outcome.exitCode })}
        </Stamp>
      </div>

      {criteria.length > 0 ? (
        <ul aria-label={t('session.task.criteria')} className="flex flex-col border-y border-rule">
          {criteria.map((criterion, index) => (
            <li key={`${String(index)}-${criterion.label}`} className="flex items-start gap-2.5 border-b border-rule py-2 last:border-b-0">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full',
                  criterion.ok ? 'bg-ok-tint text-ok-ink' : 'bg-bad-tint text-bad-ink',
                )}
              >
                <Icon name={criterion.ok ? 'check' : 'close'} size={12} strokeWidth={2.6} />
              </span>
              <span className="min-w-0 text-ink">
                {criterion.label}
                <span className="sr-only">, {criterion.ok ? t('session.task.criterion-ok') : t('session.task.criterion-fail')}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {notes === '' ? null : (
        /* Vùng cuộn vào được bằng bàn phím (axe `scrollable-region-focusable`). Không bẻ dòng: đây là output terminal. */
        <pre
          tabIndex={0}
          aria-label={t('session.task.result-title')}
          className="relative max-h-48 overflow-auto rounded-sm bg-[var(--code-bg)] px-3 py-2 font-mono text-xs text-[var(--code-ink)] outline-none focus-visible:outline-2 focus-visible:outline-focus"
        >
          {notes}
        </pre>
      )}
    </div>
  );
}
