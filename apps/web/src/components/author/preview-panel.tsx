'use client';

import { renderCopy, t } from '@devops-platform/copy';
import { useState, type ReactElement } from 'react';
import { ContentView } from '@devops-platform/ds/content';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import type { PreviewPayload } from './draft-from-preview';
import { previewPhases, resolveContentAssetUrl } from './preview-phases';
import { cn, Empty, EmptyArt, Icon } from '@devops-platform/ds';
import { contentLabels } from '../session/practice-labels';

const LABELS = contentLabels();

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
      <Empty className="animate-enter" art={<EmptyArt kind="nothing" />} title={t('author.preview-panel-playground-khong-co-noi-dung-de-xem-truoc')}>{t(
          'author.preview-panel-nguoi-hoc-nhan-dung-mot-sandbox-trong-voi-tier-capability-va-thoi-han-da-kh',
        )}</Empty>
    );
  }

  if (active === null) {
    return (
      <Empty className="animate-enter" art={<EmptyArt kind="search" />} title={t('author.preview-panel-chua-co-gi-de-xem-truoc')}>{
          props.payload.kind === 'lab'
            ? t('author.preview-panel-lab-chua-co-task-nao')
            : t('author.preview-panel-bai-hoc-chua-co-buoc-nao')
        }</Empty>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 text-sm text-ink-2">
        <Icon name="eye" size={16} className="mt-0.5 shrink-0 text-acc-ink" />
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
          className="flex flex-wrap gap-1.5"
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
                className={cn(
                  'flex min-h-9 min-w-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-left text-sm outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-focus',
                  isActive ? 'border-acc-mid bg-acc-tint text-acc-ink' : 'border-rule-2 bg-paper text-ink-2 hover:border-control hover:text-ink',
                )}
              >
                <span aria-hidden className="text-xs tabular-nums opacity-70">
                  {index + 1}
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
      <div key={active.key} className="animate-enter rounded-lg border border-rule bg-paper px-5 py-6 md:px-8 md:py-8">
        <ContentView
          labels={LABELS}
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
