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
 * ┌ ToolHeader: đường dẫn · tiêu đề (h1) · ô trạng thái · nút hành động ──────┐
 * │ notice: cảnh báo cấp trang, lỗi của nút ở đầu trang                       │
 * ├ hàng tab chế độ (Soạn · Xem trước · Tệp · Xuất bản …), dính dưới header ──┤
 * │ nội dung chế độ đang mở                        │ cột kiểm bên phải       │
 * └────────────────────────────────────────────────┴─────────────────────────┘
 * ```
 *
 * Không có cột trái: luật của chủ dự án cấm cột trái điều hướng, và chế độ đã
 * nằm trên hàng tab. `children` là các `StudioPanel`; mỗi panel là một
 * `TabsContent`, nên tab nào cũng trỏ vào một panel có thật (Radix đặt
 * `aria-controls` lên mọi tab, và axe báo critical khi tab đang chọn trỏ vào hư
 * không: lỗi `/author` đã dính ngày 2026-09-07).
 *
 * ⛔ Không dựng `<main>`: vỏ ứng dụng sở hữu landmark đó.
 */
export function StudioEditorFrame(props: {
  readonly crumbs: readonly StudioCrumb[];
  readonly title: string;
  readonly status?: ReactNode;
  readonly actions?: ReactNode;
  readonly notice?: ReactNode;
  readonly modes: readonly StudioMode[];
  readonly mode: string;
  readonly onModeChange: (mode: string) => void;
  readonly rail: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col">
      <ToolHeader
        crumbs={props.crumbs}
        title={props.title}
        status={props.status}
        actions={props.actions}
      />
      <PageContainer>
        {props.notice !== undefined && props.notice !== null && props.notice !== false && (
          <div className="flex flex-col gap-3 pt-6">{props.notice}</div>
        )}
        <Tabs value={props.mode} onValueChange={props.onModeChange}>
          <div className="sticky top-16 z-10 -mx-1 border-b border-border bg-background px-1 py-3">
            <TabsList
              aria-label={t('author.studio.modes.label')}
              className="max-w-full justify-start overflow-x-auto"
            >
              {props.modes.map((mode) => (
                <TabsTrigger key={mode.value} value={mode.value}>
                  {mode.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0">{props.children}</div>
            <InspectorRail label={t('author.studio.rail.label')}>{props.rail}</InspectorRail>
          </div>
        </Tabs>
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
