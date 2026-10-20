import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, Page, SectionArt, cn, type IconName, type SectionArtKind } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import type { NavSectionDef } from '../shell/nav';

/**
 * Trang tổng quan của một mục: tiêu đề lớn với minh hoạ của mục, rồi "cửa vào" từng
 * tính năng con dạng hàng dài (không phải lưới thẻ), rồi các khối động của mục đó.
 */
export function HubHeader({
  title,
  lead,
  art,
  actions,
}: {
  readonly title: string;
  readonly lead: string;
  readonly art: SectionArtKind;
  readonly actions?: ReactNode;
}) {
  return (
    <div className="group grid items-center gap-8 pb-8 pt-10 sm:pt-12 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl">{title}</h1>
        <p className="max-w-[54ch] text-lg text-ink-2">{lead}</p>
        {actions === undefined ? null : <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
      <SectionArt kind={art} width={260} className="hidden md:block" />
    </div>
  );
}

export function Doors({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <ul aria-label={label} className="flex flex-col border-t border-rule">
      {children}
    </ul>
  );
}

export interface DoorProps {
  readonly href: string;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  /** Số đếm bên phải ("58" + "bài học"). `null` = chưa đếm được, hiện gạch ngang. */
  readonly stat?: { readonly value: number | null; readonly unit: string } | undefined;
  readonly note?: ReactNode;
  readonly section?: string;
}

/** Một cửa vào tính năng con. Cả hàng bấm được; rê vào thì biểu tượng nghiêng nhẹ. */
export function Door({ href, icon, title, description, stat, note, section }: DoorProps) {
  return (
    <li data-section={section} className="border-b border-rule">
      <Link
        href={href}
        className="group/door flex items-center gap-5 py-5 sm:gap-6"
      >
        <Icon
          name={icon}
          size={36}
          tint="acc"
          className="shrink-0 text-acc-ink transition-transform duration-300 ease-out group-hover/door:-rotate-6 group-hover/door:scale-105"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-xl font-semibold text-ink transition-colors group-hover/door:text-acc-ink">{title}</span>
          <span className="text-ink-2">{description}</span>
          {note === undefined ? null : <span className="mt-1 text-sm text-ink-3">{note}</span>}
        </span>
        {stat === undefined ? null : (
          <span className="hidden shrink-0 flex-col items-end sm:flex">
            <span className="font-display text-3xl font-semibold tabular-nums text-ink">{stat.value ?? '–'}</span>
            <span className="text-sm text-ink-3">{stat.unit}</span>
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * Cửa vào cho MỌI trang con của một mục, đọc thẳng từ `NAV_SECTIONS`: thêm một trang
 * con vào thanh mục con là nó tự có cửa ở đây, không phải sửa hai nơi.
 */
export function SectionDoors({
  section,
  stats = {},
  notes = {},
}: {
  readonly section: NavSectionDef;
  /** Theo `href` của trang con. Vắng = cửa đó không hiện số. */
  readonly stats?: Readonly<Record<string, NonNullable<DoorProps['stat']>>>;
  readonly notes?: Readonly<Record<string, ReactNode>>;
}) {
  return (
    <Doors label={t('hub.doors.label', { section: section.label })}>
      {section.items.map((entry) => (
        <Door
          key={entry.href}
          href={entry.href}
          icon={entry.icon}
          title={entry.label}
          description={entry.description}
          stat={stats[entry.href]}
          note={notes[entry.href]}
        />
      ))}
    </Doors>
  );
}

/** Khung trang tổng quan. */
export function HubPage({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <Page className={cn('flex flex-col gap-12 pb-8', className)}>{children}</Page>;
}
