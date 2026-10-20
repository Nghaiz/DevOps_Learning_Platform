'use client';

import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { BackLink, Page, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
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
 * ┌ đầu trang: liên kết quay lại, tiêu đề (h1), trạng thái, thao tác ─────────┐
 * │ notice: cảnh báo cấp trang                                               │
 * ├ thanh dính: tab chế độ (Soạn, Xem trước, …)          toolbar (Lưu, …)  ──┤
 * │ nội dung chế độ đang mở                        │ cột kiểm bên phải       │
 * └────────────────────────────────────────────────┴─────────────────────────┘
 * ```
 *
 * `toolbar` nằm trên thanh DÍNH, nên ô trạng thái lưu và nút Lưu luôn trong tầm mắt
 * khi người soạn cuộn một biểu mẫu dài; `actions` ở đầu trang dành cho việc ít dùng.
 * Không truyền `modes` thì không có hàng tab (trang tạo mới chỉ có một việc) và
 * `children` hiện thẳng, không bọc `StudioPanel`.
 *
 * Không có cột trái: luật của chủ dự án cấm cột trái điều hướng. Khi có `modes`,
 * `children` là các `StudioPanel`; mỗi panel là một `TabsContent`, nên tab nào cũng
 * trỏ vào một panel có thật (axe báo critical khi tab đang chọn trỏ vào hư không).
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
  // Liên kết quay lại trỏ về mục cha gần nhất có đường dẫn (danh sách bài, danh sách đề).
  const parent = [...props.crumbs].reverse().find((crumb) => crumb.href !== undefined);
  const body = (
    <div className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">{props.children}</div>
      <InspectorRail label={t('author.studio.rail.label')}>{props.rail}</InspectorRail>
    </div>
  );
  const bar = (tabs: ReactNode): ReactElement => (
    <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-canvas/95 py-2 backdrop-blur-sm">
      <div className="min-w-0 max-w-full">{tabs}</div>
      {props.toolbar === undefined ? null : <div className="flex flex-wrap items-center gap-2">{props.toolbar}</div>}
    </div>
  );

  return (
    <Page className="pb-16">
      <PageHeader
        title={props.title}
        {...(parent?.href === undefined
          ? {}
          : {
              back: (
                <BackLink asChild>
                  <Link href={parent.href}>{parent.label}</Link>
                </BackLink>
              ),
            })}
        {...(props.actions === undefined ? {} : { actions: props.actions })}
      >
        {props.status === undefined || props.status === null ? null : (
          <div className="flex flex-wrap items-center gap-2">{props.status}</div>
        )}
      </PageHeader>
      {hasNotice ? <div className="flex flex-col gap-3 pb-6">{props.notice}</div> : null}
      {modes.length === 0 ? (
        <>
          {props.toolbar === undefined ? null : bar(null)}
          {body}
        </>
      ) : (
        <Tabs
          value={props.mode ?? modes[0]?.value ?? ''}
          {...(props.onModeChange === undefined ? {} : { onValueChange: props.onModeChange })}
        >
          {bar(
            <TabsList aria-label={t('author.studio.modes.label')} className="max-w-full border-b-0">
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
    </Page>
  );
}

/** Nội dung của một chế độ. Bọc `TabsContent` để mọi trình soạn có cùng nhịp khoảng cách. */
export function StudioPanel(props: { readonly value: string; readonly children: ReactNode }): ReactElement {
  return (
    <TabsContent value={props.value} className="flex animate-enter flex-col gap-12">
      {props.children}
    </TabsContent>
  );
}
