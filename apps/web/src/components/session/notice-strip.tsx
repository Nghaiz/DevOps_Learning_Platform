'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';

export interface PracticeNotice {
  /** Khoá ổn định: một thông báo đã ẩn không quay lại khi trang render lại. */
  readonly id: string;
  readonly tone: 'warning' | 'destructive';
  readonly text: ReactNode;
  /** Một việc làm được (vd. nút Thử lại). */
  readonly action?: ReactNode;
}

/**
 * MỘT dải thông báo cho màn thực hành, thay cho tối đa năm băng `Alert` chồng
 * nhau của bản trước (năng lực thiếu, lỗi mở phiên, shell không áp được, setup
 * hỏng, lỗi đọc lần thử). Năm băng đó có lúc cùng hiện và ăn ~200px khỏi terminal.
 *
 * Dải hiện thông báo NẶNG nhất trước, gập phần còn lại sau một nút đếm, và mỗi
 * thông báo ẩn được. Không có thông báo nào ⇒ không vẽ gì.
 */
export function NoticeStrip({ notices }: { readonly notices: readonly PracticeNotice[] }): ReactElement | null {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const visible = notices
    .filter((notice) => !dismissed.has(notice.id))
    .slice()
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'destructive' ? -1 : 1));
  if (visible.length === 0) {
    return null;
  }

  const shown = expanded ? visible : visible.slice(0, 1);
  const hiddenCount = visible.length - shown.length;

  return (
    <section aria-label={t('session.notice.region')} className="shrink-0 border-b border-border bg-card">
      <ul>
        {shown.map((notice) => {
          const Icon = notice.tone === 'destructive' ? OctagonAlert : TriangleAlert;
          return (
            <li
              key={notice.id}
              className="flex items-start gap-3 border-b border-border px-4 py-2 text-sm text-foreground last:border-b-0"
            >
              <Icon
                aria-hidden="true"
                className={cn('mt-0.5 size-4 shrink-0', notice.tone === 'destructive' ? 'text-destructive' : 'text-warning')}
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <div className="min-w-0">{notice.text}</div>
                {notice.action}
              </div>
              <button
                type="button"
                onClick={() => setDismissed((prev) => new Set(prev).add(notice.id))}
                className="grid size-7 shrink-0 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X aria-hidden="true" className="size-4" />
                <span className="sr-only">{t('session.notice.dismiss')}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {(hiddenCount > 0 || expanded) && visible.length > 1 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex h-7 w-full items-center gap-1.5 border-t border-border px-4 font-mono text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {expanded ? <ChevronUp aria-hidden="true" className="size-3.5" /> : <ChevronDown aria-hidden="true" className="size-3.5" />}
          {expanded ? t('session.notice.less') : t('session.notice.more', { count: hiddenCount })}
        </button>
      )}
    </section>
  );
}
