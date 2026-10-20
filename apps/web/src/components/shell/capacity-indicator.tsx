'use client';

import { Pill, Skeleton, Tip, type Tone } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { describeProfileCapacity, formatFetchedAt, type CapacityTone } from './capacity';
import { useCapacity } from './use-capacity';

const TONE: Record<CapacityTone, Tone> = { ok: 'ok', low: 'warn', full: 'bad' };

/** Số chỗ còn trống của cụm sandbox, trên thanh trên cùng (màn rộng). Chi tiết ở tooltip. */
export function CapacityIndicator() {
  const { data, error, loading } = useCapacity();

  if (data === null) {
    if (loading) return <Skeleton className="h-6 w-24 rounded-full" />;
    if (error === null) return null;
    return (
      <Tip content={t('shell.capacity.unread-body', { error })}>
        <button type="button" className="rounded-full">
          <Pill tone="neutral" dot>
            {t('shell.capacity.unread-badge')}
          </Pill>
        </button>
      </Tip>
    );
  }

  const reading = describeProfileCapacity(data);
  const at = formatFetchedAt(data.fetchedAt);
  if (reading === null) {
    return (
      <Tip
        content={
          <span className="flex flex-col gap-1">
            <span>{t('shell.capacity.unknown-body')}</span>
            {data.quotaError === '' ? null : <span className="opacity-80">{t('shell.capacity.quota-reason', { reason: data.quotaError })}</span>}
            {at === null ? null : <span className="opacity-80">{t('shell.capacity.read-at', { at })}</span>}
          </span>
        }
      >
        <button type="button" className="rounded-full">
          <Pill tone="neutral" dot>
            {t('shell.capacity.unknown-badge')}
          </Pill>
        </button>
      </Tip>
    );
  }

  return (
    <Tip
      content={
        <span className="flex flex-col gap-1">
          <span>{reading.detail}</span>
          {at === null ? null : <span className="opacity-80">{t('shell.capacity.read-at', { at })}</span>}
          {error === null ? null : <span className="opacity-80">{t('shell.capacity.stale', { error })}</span>}
        </span>
      }
    >
      <button type="button" className="rounded-full">
        <Pill tone={TONE[reading.tone]} dot live={reading.tone !== 'full'}>
          {reading.label}
        </Pill>
      </button>
    </Tip>
  );
}
