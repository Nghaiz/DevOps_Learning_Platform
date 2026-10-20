'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CommandPalette, Kbd, type CommandGroupSpec } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { sectionsFor, userMenuItems, type Viewer } from './nav';

/**
 * Bảng lệnh (Ctrl K): nhảy thẳng tới bất kỳ trang nào bạn được thấy. Dữ liệu là
 * chính mô hình điều hướng, nên trang mới thêm vào `nav.ts` tự có mặt ở đây.
 */
export function buildCommandGroups(viewer: Viewer | null, go: (href: string) => void): CommandGroupSpec[] {
  const groups: CommandGroupSpec[] = sectionsFor(viewer).map((section) => ({
    heading: section.label,
    entries: [
      {
        id: section.hub,
        label: `${section.label}: ${t('shell.section.overview')}`,
        hint: section.lead,
        icon: section.icon,
        section: section.id,
        onSelect: () => go(section.hub),
      },
      ...section.items.map((entry) => ({
        id: entry.href,
        label: entry.label,
        hint: entry.description,
        icon: entry.icon,
        section: section.id,
        keywords: [section.label],
        onSelect: () => go(entry.href),
      })),
    ],
  }));
  if (viewer !== null) {
    groups.push({
      heading: t('shell.command.group.account'),
      entries: userMenuItems(viewer.role).map((entry) => ({
        id: entry.href,
        label: entry.label,
        icon: entry.icon,
        onSelect: () => go(entry.href),
      })),
    });
  }
  return groups;
}

export function CommandMenu({
  viewer,
  open,
  onOpenChange,
}: {
  readonly viewer: Viewer | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const groups = useMemo(
    () =>
      buildCommandGroups(viewer, (href) => {
        onOpenChange(false);
        router.push(href);
      }),
    [viewer, router, onOpenChange],
  );
  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      label={t('shell.command.label')}
      placeholder={t('shell.command.placeholder')}
      emptyText={t('shell.command.empty')}
      groups={groups}
      footer={
        <>
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            {t('shell.command.footer-move')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd>
            {t('shell.command.footer-open')}
          </span>
        </>
      }
    />
  );
}
