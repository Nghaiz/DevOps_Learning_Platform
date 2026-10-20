'use client';

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { Button, Icon, Notice, Pill, SectionArt, type IconName } from '@devops-platform/ds';
import type { CapacityHint } from './capacity';

export type LaunchKind = 'lesson' | 'lab' | 'playground';

const BODY_KEY = {
  lesson: 'session.launch.body.lesson',
  lab: 'session.launch.body.lab',
  playground: 'session.launch.body.playground',
} as const;

export interface PracticeLaunchProps {
  readonly kind: LaunchKind;
  /** Nhãn nút: "Bắt đầu", hoặc "Làm lại" ở lab đã có lần thử. */
  readonly startLabel: string;
  readonly onStart: () => void;
  readonly starting: boolean;
  /** Hạng sandbox đã dịch ra chữ (Sysbox, gVisor, Kata). */
  readonly tierLabel?: string | null;
  readonly ttlMinutes?: number | null;
  /** Profile tài nguyên do máy chủ tính (`''`, `ide`, `k8s`, `k8s-multinode`). */
  readonly profile: string;
  readonly capacity: CapacityHint | null;
  /** Số máy KHÁC đang chạy của người này (bài khác, tab khác). */
  readonly otherMachines: number;
  /** Câu mô tả riêng của nội dung (sân chơi có, bài học thì đã có cả bài bên trái). */
  readonly description?: ReactNode;
}

/**
 * Giữa khoang làm việc khi máy chưa chạy: hình minh hoạ, máy sắp mở có gì, còn chỗ
 * không, và nút Bắt đầu DUY NHẤT của trang. Đặt ở đây chứ không ở thanh trên: đây là
 * chỗ mắt người học đang nhìn khi chưa có terminal.
 *
 * Nút đứng NGAY sau câu mô tả, trước danh sách "máy có gì", và minh hoạ ẩn dưới `md`: ở
 * điện thoại, chế độ "Cả hai" chỉ chừa cho khoang này chừng 400px, và thứ tự cũ (minh hoạ,
 * mô tả, danh sách, rồi mới tới nút) đẩy nút ra ngoài mép dưới (rà ảnh 2026-10-20).
 */
export function PracticeLaunch({
  kind,
  startLabel,
  onStart,
  starting,
  tierLabel,
  ttlMinutes,
  profile,
  capacity,
  otherMachines,
  description,
}: PracticeLaunchProps): ReactElement {
  const facts: { icon: IconName; text: string }[] = [];
  if (profile === 'ide') facts.push({ icon: 'editor', text: t('session.launch.fact.ide') });
  else if (profile === 'k8s' || profile === 'k8s-multinode') facts.push({ icon: 'kube', text: t('session.launch.fact.k8s') });
  else facts.push({ icon: 'terminal', text: t('session.launch.fact.plain') });
  if (ttlMinutes != null && ttlMinutes > 0) facts.push({ icon: 'hourglass', text: t('session.launch.fact.ttl', { minutes: ttlMinutes }) });
  if (tierLabel != null) facts.push({ icon: 'shield', text: t('session.launch.fact.tier', { tier: tierLabel }) });

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-6 md:py-10">
      <div className="flex w-full max-w-md flex-col items-start gap-5">
        <SectionArt kind="practice" width={170} className="-ml-2 max-md:hidden" />
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-semibold text-ink">{t('session.launch.title')}</h2>
          <p className="text-sm text-ink-2">{description ?? t(BODY_KEY[kind])}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" variant="primary" icon="play" onClick={onStart} loading={starting}>
            {startLabel}
          </Button>
          {capacity === null ? null : (
            <Pill
              tone={capacity.known ? (capacity.tone === 'full' ? 'bad' : capacity.tone === 'low' ? 'warn' : 'neutral') : 'neutral'}
              icon="server"
              title={capacity.detail}
            >
              {capacity.label}
            </Pill>
          )}
        </div>
        <ul className="flex w-full flex-col border-y border-rule">
          {facts.map((fact) => (
            <li key={fact.text} className="flex items-center gap-3 border-b border-rule py-2.5 text-sm text-ink-2 last:border-b-0">
              <Icon name={fact.icon} size={18} className="shrink-0 text-acc-mid" />
              {fact.text}
            </li>
          ))}
        </ul>
        {capacity !== null && capacity.known && capacity.warning !== null ? <Notice tone="warn">{capacity.warning}</Notice> : null}
        {otherMachines > 0 ? (
          <Notice
            tone="info"
            action={
              <Button asChild size="sm" variant="secondary">
                <Link href="/me">{t('session.launch.others-action')}</Link>
              </Button>
            }
          >
            {t('session.launch.others', { n: otherMachines })}
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
