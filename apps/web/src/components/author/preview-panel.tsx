'use client';

import { t } from '@devops-platform/copy';
import { useState, type ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, Button, ContentView } from '@devops-platform/ui';
import { parseContentBlocks } from '@devops-platform/scenario/content-blocks';
import type { PreviewPayload } from './draft-from-preview';
import { previewPhases, resolveContentAssetUrl } from './preview-phases';

/**
 * Xem trước bài — **qua đúng cây component người học thấy** (13.F task 21).
 *
 * `parseContentBlocks` rồi `ContentView` là chính hai thứ
 * `lessons/[id]/lesson-client.tsx` dùng. Đây không phải một tiện nghi: một bộ
 * render thứ hai cho trang soạn sẽ trôi khỏi bộ thứ nhất, và nó trôi theo hướng
 * tệ nhất — người soạn thấy bài của mình đẹp, người học thấy một thứ khác.
 *
 * ## Khác biệt DUY NHẤT so với trình học, và nó được nói ra
 *
 * `execEnabled={false}`: nút chạy trên khối code vẫn hiện nhưng bị vô hiệu hoá —
 * đúng trạng thái trình học ở khi `terminal === null`. Xem trước không dựng
 * sandbox, nên không có gì để gửi lệnh tới. Truyền `onExec` là bắt buộc để nút
 * hiện ra: `undefined` sẽ ẩn hẳn nút, và người soạn mất đường kiểm tra xem khối
 * code của mình có được nhận là lệnh chạy được hay không.
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
      <Alert>
        <AlertTitle>
          {t('author.preview-panel-playground-khong-co-noi-dung-de-xem-truoc')}
        </AlertTitle>
        <AlertDescription>
          {t(
            'author.preview-panel-nguoi-hoc-nhan-dung-mot-sandbox-trong-voi-tier-capability-va-thoi-han-da-kh',
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (active === null) {
    return (
      <Alert variant="warning">
        <AlertTitle>{t('author.preview-panel-chua-co-gi-de-xem-truoc')}</AlertTitle>
        <AlertDescription>
          {t('author.preview-panel-bai-nay-chua-co')}{' '}
          {props.payload.kind === 'lab'
            ? t('author.step-task-noun')
            : t('author.preview-panel-buoc')}{' '}
          {t(
            'author.preview-panel-nao-hoac-nguon-noi-dung-chua-nhan-ban-nhap-them-noi-dung-o-tab-soan-roi-qua',
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          {t(
            'author.preview-panel-day-la-chinh-khung-noi-dung-cua-trinh-hoc-nut-chay-tren-khoi-code-bi-vo-hie',
          )}
        </AlertDescription>
      </Alert>

      {phases.length > 1 && (
        <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-border pb-2">
          {phases.map((phase) => (
            <Button
              key={phase.key}
              size="sm"
              variant={phase.key === active.key ? 'secondary' : 'ghost'}
              aria-current={phase.key === active.key ? 'true' : undefined}
              onClick={() => {
                setActiveKey(phase.key);
              }}
            >
              {phase.label}
            </Button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-5">
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
 * làm bản xem trước khác bản người học thấy — đúng thứ task 21 cấm.
 */
function NO_SANDBOX_IN_PREVIEW(): void {
  /* no-op */
}
