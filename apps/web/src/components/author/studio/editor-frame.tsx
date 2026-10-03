'use client';

import type { ReactElement, ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { PageContainer, ToolHeader } from '../../kit';
import { InspectorRail } from './inspector';

export interface StudioCrumb {
  readonly href?: string;
  readonly label: string;
}

export interface StudioMode {
  readonly value: string;
  /** Tên tab. Là tên truy cập của tab, nên e2e và test DOM tìm tab theo đúng chuỗi này. */
  readonly label: string;
}

/**
 * Khung chung của MỌI trình soạn trong Xưởng soạn: bài học/lab/sân chơi và đề bài.
 *
 * ```
 * ┌ ToolHeader: đường dẫn · tiêu đề (h1) · status · actions ──────────────────┐
 * │ notice: cảnh báo cấp trang                                               │
 * ├ thanh dính: tab chế độ (Soạn · Xem trước · …)        toolbar (Lưu, …)  ──┤
 * │ nội dung chế độ đang mở                        │ cột kiểm bên phải       │
 * └────────────────────────────────────────────────┴─────────────────────────┘
 * ```
 *
 * `toolbar` nằm trên thanh DÍNH, nên ô trạng thái lưu và nút Lưu luôn trong tầm
 * mắt khi người soạn cuộn một biểu mẫu dài; `actions` ở đầu trang dành cho việc
 * ít dùng. Không truyền `modes` thì không có hàng tab (trang tạo mới chỉ có một
 * việc) và `children` hiện thẳng, không bọc `StudioPanel`.
 *
 * Không có cột trái: luật của chủ dự án cấm cột trái điều hướng. Khi có `modes`,
 * `children` là các `StudioPanel`; mỗi panel là một `TabsContent`, nên tab nào
 * cũng trỏ vào một panel có thật (axe báo critical khi tab đang chọn trỏ vào hư
 * không: lỗi `/author` đã dính ngày 2026-09-07).
 *
 * ⛔ Không dựng `<main>`: vỏ ứng dụng sở hữu landmark đó.
 */
export function StudioEditorFrame(props: {
  readonly crumbs: readonly StudioCrumb[];
  readonly title: string;
  readonly status?: ReactNode;
  readonly actions?: ReactNode;
  readonly toolbar?: ReactNode;
  readonly notice?: ReactNode;
  readonly modes?: readonly StudioMode[];
  readonly mode?: string;
  readonly onModeChange?: (mode: string) => void;
  readonly rail: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const hasNotice = props.notice !== undefined && props.notice !== null && props.notice !== false;
  const modes = props.modes ?? [];
  const body = (
    <div className="grid gap-10 py-8 [--split-sticky-top:9.5rem] lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">{props.children}</div>
      <InspectorRail label={t('author.studio.rail.label')}>{props.rail}</InspectorRail>
    </div>
  );
  const bar = (tabs: ReactNode): ReactElement => (
    <div className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-1 py-3">
      <div className="min-w-0 max-w-full">{tabs}</div>
      {props.toolbar !== undefined && (
        <div className="flex flex-wrap items-center gap-2">{props.toolbar}</div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col">
      <ToolHeader crumbs={props.crumbs} title={props.title} status={props.status} actions={props.actions} />
      <PageContainer>
        {hasNotice && <div className="flex flex-col gap-3 pt-6">{props.notice}</div>}
        {modes.length === 0 ? (
          <>
            {props.toolbar !== undefined && bar(null)}
            {body}
          </>
        ) : (
          <Tabs
            value={props.mode ?? modes[0]?.value ?? ''}
            {...(props.onModeChange === undefined ? {} : { onValueChange: props.onModeChange })}
          >
            {bar(
              <TabsList
                aria-label={t('author.studio.modes.label')}
                className="max-w-full justify-start overflow-x-auto"
              >
                {modes.map((mode) => (
                  <TabsTrigger key={mode.value} value={mode.value}>
                    {mode.label}
                  </TabsTrigger>
                ))}
              </TabsList>,
            )}
            {body}
          </Tabs>
        )}
      </PageContainer>
    </div>
  );
}

/** Nội dung của một chế độ. Bọc `TabsContent` để mọi trình soạn có cùng nhịp khoảng cách. */
export function StudioPanel(props: {
  readonly value: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <TabsContent
      value={props.value}
      className="flex animate-rise flex-col gap-12 focus-visible:outline-none"
    >
      {props.children}
    </TabsContent>
  );
}
