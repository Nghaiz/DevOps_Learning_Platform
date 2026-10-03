'use client';

import { renderCopy, t } from '@devops-platform/copy';
import { useState, type CSSProperties, type ReactElement } from 'react';
import { BoxSelect, Eye, FileQuestion } from 'lucide-react';
import { ContentView, EmptyState, cn } from '@devops-platform/ui';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import type { PreviewPayload } from './draft-from-preview';
import { previewPhases, resolveContentAssetUrl } from './preview-phases';

/**
 * Xem trước bài, **qua đúng cây component người học thấy** (13.F task 21).
 *
 * `parseContentBlocks` rồi `ContentView` là chính hai thứ
 * `lessons/[id]/lesson-client.tsx` dùng. Đây không phải một tiện nghi: một bộ
 * render thứ hai cho trang soạn sẽ trôi khỏi bộ thứ nhất, và nó trôi theo hướng
 * tệ nhất: người soạn thấy bài của mình đẹp, người học thấy một thứ khác.
 *
 * Hàng chọn phần là các nút bật (`aria-pressed`), không phải tab: chúng chỉ đổi
 * phần đang xem trong cùng một khung, và trang đã có một hàng tab chế độ ở trên.
 */
export function PreviewPanel(props: {
  readonly contentId: string;
  readonly payload: PreviewPayload;
}): ReactElement {
  const phases = previewPhases(props.payload);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = phases.find((phase) => phase.key === activeKey) ?? phases[0] ?? null;

  if (props.payload.kind === 'playground') {
    return (
      <EmptyState
        className="animate-rise"
        glyph={<BoxSelect aria-hidden className="size-10" />}
        title={t('author.preview-panel-playground-khong-co-noi-dung-de-xem-truoc')}
        description={t(
          'author.preview-panel-nguoi-hoc-nhan-dung-mot-sandbox-trong-voi-tier-capability-va-thoi-han-da-kh',
        )}
      />
    );
  }

  if (active === null) {
    return (
      <EmptyState
        className="animate-rise"
        glyph={<FileQuestion aria-hidden className="size-10" />}
        title={t('author.preview-panel-chua-co-gi-de-xem-truoc')}
        description={
          props.payload.kind === 'lab'
            ? t('author.preview-panel-lab-chua-co-task-nao')
            : t('author.preview-panel-bai-hoc-chua-co-buoc-nao')
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-line-cicd-ink" />
        <span>
          {t(
            'author.preview-panel-day-la-chinh-khung-noi-dung-cua-trinh-hoc-nut-chay-tren-khoi-code-bi-vo-hie',
          )}
        </span>
      </p>

      {phases.length > 1 && (
        <div
          role="group"
          aria-label={t('author.preview-panel-chon-phan')}
          className="flex flex-wrap gap-px border border-border bg-border"
        >
          {phases.map((phase, index) => {
            const isActive = phase.key === active.key;
            return (
              <button
                key={phase.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setActiveKey(phase.key);
                }}
                style={{ '--i': index } as CSSProperties}
                className={cn(
                  'stagger flex min-h-10 min-w-0 flex-1 animate-rise items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  isActive ? 'bg-ink text-ink-foreground' : 'bg-background text-foreground hover:bg-muted',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'font-mono text-xs tabular-nums',
                    isActive ? 'text-line-cicd' : 'text-muted-foreground',
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="truncate">
                  {typeof phase.label === 'string' ? phase.label : renderCopy(phase.label)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Khoá theo phần đang xem: đổi phần là trang giấy mới trượt lên, không phải chữ nhảy tại chỗ. */}
      <div key={active.key} className="animate-rise border border-border bg-card px-5 py-6 md:px-8 md:py-8">
        <ContentView
          blocks={parseContentBlocks(active.markdown)}
          resolveAssetUrl={(relative) => resolveContentAssetUrl(props.contentId, relative)}
          onExec={NO_SANDBOX_IN_PREVIEW}
          execEnabled={false}
        />
      </div>
    </div>
  );
}

/**
 * Không bao giờ chạy: `execEnabled={false}` vô hiệu hoá nút trước khi tới đây.
 *
 * Tồn tại vì `ContentView` ẩn hẳn nút chạy khi `onExec === undefined`, và ẩn nút
 * làm bản xem trước khác bản người học thấy, đúng thứ task 21 cấm. Xem trước
 * không dựng sandbox, nên nút hiện nhưng bị vô hiệu hoá, như trình học lúc
 * người dùng chưa bắt đầu phiên.
 */
function NO_SANDBOX_IN_PREVIEW(): void {
  /* no-op */
}
