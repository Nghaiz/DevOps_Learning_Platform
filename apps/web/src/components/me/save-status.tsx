import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { StatusDot, type StatusDotTone } from '@devops-platform/ui';
import type { SaveState } from './account-sections';

const VIEW: Readonly<
  Record<
    Exclude<SaveState, 'idle'>,
    { key: 'me.save.dirty' | 'me.save.saving' | 'me.save.saved' | 'me.save.failed'; tone: StatusDotTone }
  >
> = {
  dirty: { key: 'me.save.dirty', tone: 'warn' },
  saving: { key: 'me.save.saving', tone: 'live' },
  saved: { key: 'me.save.saved', tone: 'ok' },
  failed: { key: 'me.save.failed', tone: 'bad' },
};

/**
 * Nhãn trạng thái lưu của MỘT khối trên `/settings`, nằm ở cột nhãn của `Split`.
 *
 * Vùng `role="status"` luôn có mặt (kể cả lúc `idle`) để trình đọc màn hình nghe
 * được lúc chữ bên trong đổi; một vùng sống chỉ chèn vào DOM khi có chữ thì
 * thường không được đọc lần đầu.
 */
export function SaveStatus({ state }: { readonly state: SaveState }): ReactElement {
  const view = state === 'idle' ? null : VIEW[state];
  return (
    <p role="status" className="mt-3 min-h-6">
      {view !== null && (
        <span className="inline-flex animate-rise items-center gap-2 type-label text-foreground">
          <StatusDot tone={view.tone} />
          {t(view.key)}
        </span>
      )}
    </p>
  );
}
