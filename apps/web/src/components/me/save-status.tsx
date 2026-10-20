import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Pill, type Tone } from '@devops-platform/ds';
import type { SaveState } from './account-sections';

const VIEW: Readonly<
  Record<
    Exclude<SaveState, 'idle'>,
    { key: 'me.save.dirty' | 'me.save.saving' | 'me.save.saved' | 'me.save.failed'; tone: Tone; live: boolean }
  >
> = {
  dirty: { key: 'me.save.dirty', tone: 'warn', live: false },
  saving: { key: 'me.save.saving', tone: 'info', live: true },
  saved: { key: 'me.save.saved', tone: 'ok', live: false },
  failed: { key: 'me.save.failed', tone: 'bad', live: false },
};

/**
 * Trạng thái lưu của MỘT khối trên `/settings`, đứng cạnh nút Lưu.
 *
 * Vùng `role="status"` luôn có mặt (kể cả lúc `idle`) để trình đọc màn hình nghe
 * được lúc chữ bên trong đổi; một vùng sống chỉ chèn vào DOM khi có chữ thì
 * thường không được đọc lần đầu.
 */
export function SaveStatus({ state }: { readonly state: SaveState }): ReactElement {
  const view = state === 'idle' ? null : VIEW[state];
  return (
    <span role="status" className="inline-flex min-h-6 items-center">
      {view === null ? null : (
        <Pill key={state} tone={view.tone} dot live={view.live} className="animate-fade">
          {t(view.key)}
        </Pill>
      )}
    </span>
  );
}
