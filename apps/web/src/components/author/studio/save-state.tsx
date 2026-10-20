'use client';

import type { ReactElement } from 'react';
import { Pill, type IconName, type Tone } from '@devops-platform/ds';
import { t, type StaticTextKey } from '@devops-platform/copy';
import type { SaveStatus } from './save-status';

const SAVE_KEYS: Readonly<Record<SaveStatus, StaticTextKey>> = {
  new: 'author.studio.save.new',
  saved: 'author.studio.save.saved',
  unsaved: 'author.studio.save.unsaved',
  saving: 'author.studio.save.saving',
  error: 'author.studio.save.error',
};

const TONE: Readonly<Record<SaveStatus, Tone>> = {
  new: 'neutral',
  saved: 'ok',
  unsaved: 'warn',
  saving: 'info',
  error: 'bad',
};

const ICON: Readonly<Record<SaveStatus, IconName>> = {
  new: 'circle',
  saved: 'check',
  unsaved: 'edit',
  saving: 'save',
  error: 'warning',
};

/**
 * Ô "Đã lưu / Chưa lưu / Đang lưu" ở đầu trình soạn.
 *
 * `role="status"` để trình đọc màn hình đọc lại khi nó đổi, không cần ai chuyển focus.
 * Chữ luôn đi kèm biểu tượng, nên màu không phải kênh duy nhất mang nghĩa.
 */
export function SaveState({ status }: { readonly status: SaveStatus }): ReactElement {
  return (
    <Pill
      role="status"
      data-save-status={status}
      tone={TONE[status]}
      icon={ICON[status]}
      className={status === 'saving' ? 'animate-breathe' : undefined}
    >
      {t(SAVE_KEYS[status])}
    </Pill>
  );
}
