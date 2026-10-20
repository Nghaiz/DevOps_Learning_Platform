'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { Icon, IconButton, cn } from '@devops-platform/ds';

export interface PracticeNotice {
  /** Khoá ổn định: một thông báo đã ẩn không quay lại khi trang render lại. */
  readonly id: string;
  readonly tone: 'warning' | 'destructive' | 'info';
  readonly text: ReactNode;
  /** Một việc làm được (vd. nút Thử lại). */
  readonly action?: ReactNode;
}

const TONE_ORDER: Record<PracticeNotice['tone'], number> = { destructive: 0, warning: 1, info: 2 };

/**
 * MỘT dải thông báo cho khu thực hành, thay cho nhiều băng chồng nhau (năng lực thiếu,
 * lỗi mở máy, shell không áp được, setup hỏng, lỗi đọc lần thử). Hiện thông báo nặng
 * nhất, gập phần còn lại sau một nút đếm, và mỗi thông báo ẩn được. Không có thông
 * báo nào thì không vẽ gì.
 */
export function NoticeStrip({ notices }: { readonly notices: readonly PracticeNotice[] }): ReactElement | null {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const visible = notices
    .filter((notice) => !dismissed.has(notice.id))
    .slice()
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  if (visible.length === 0) return null;

  const shown = expanded ? visible : visible.slice(0, 1);
  const hiddenCount = visible.length - shown.length;

  return (
    <section aria-label={t('session.notice.region')} className="shrink-0 border-b border-rule bg-paper">
      <ul>
        {shown.map((notice) => (
          <li
            key={notice.id}
            className={cn(
              'flex items-start gap-3 border-b border-rule px-3 py-2 text-sm last:border-b-0 sm:px-4',
              notice.tone === 'destructive' ? 'bg-bad-wash' : notice.tone === 'warning' ? 'bg-warn-wash' : 'bg-info-wash',
            )}
          >
            <Icon
              name={notice.tone === 'destructive' ? 'danger' : notice.tone === 'warning' ? 'warning' : 'info'}
              size={18}
              className={cn(
                'mt-px shrink-0',
                notice.tone === 'destructive' ? 'text-bad-ink' : notice.tone === 'warning' ? 'text-warn-ink' : 'text-info-ink',
              )}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-ink">
              <div className="min-w-0">{notice.text}</div>
              {notice.action}
            </div>
            <IconButton
              icon="close"
              size="icon-sm"
              label={t('session.notice.dismiss')}
              onClick={() => setDismissed((prev) => new Set(prev).add(notice.id))}
              className="-my-1 shrink-0"
            />
          </li>
        ))}
      </ul>
      {(hiddenCount > 0 || expanded) && visible.length > 1 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex h-7 w-full items-center gap-1.5 border-t border-rule px-4 text-xs text-ink-3 outline-none focus-visible:outline-solid hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
        >
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
          {expanded ? t('session.notice.less') : t('session.notice.more', { count: hiddenCount })}
        </button>
      ) : null}
    </section>
  );
}
