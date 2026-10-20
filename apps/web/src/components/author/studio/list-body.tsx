'use client';

import { useId, type ReactElement, type ReactNode } from 'react';
import { Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@devops-platform/ds';

export interface StudioFilter<V extends string> {
  readonly value: V;
  readonly label: string;
  /** Có khi dữ liệu cho phép đếm (danh sách nạp trọn). Không có thì không in số. */
  readonly count?: number;
}

/**
 * Thân chung của hai danh sách trong Xưởng soạn: hàng lọc trạng thái + ô tìm, rồi panel
 * chứa bảng.
 *
 * Cách LỌC của hai trang khác nhau (một bên nhận trọn danh sách, một bên phân trang),
 * nhưng người soạn thấy cùng một hàng điều khiển ở cùng một chỗ. Số đếm chỉ hiện khi
 * trang gọi đưa vào, vì một số đếm trên một trang của kết quả phân trang là con số sai.
 *
 * Danh sách nằm TRONG `TabsContent` mang `value={filter}`: panel đó luôn khớp tab đang
 * chọn nên luôn có mặt, và tab đang chọn không bao giờ trỏ vào hư không.
 */
export function StudioListBody<V extends string>(props: {
  readonly filterLabel: string;
  readonly filters: readonly StudioFilter<V>[];
  readonly filter: V;
  readonly onFilterChange: (value: V) => void;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly children: ReactNode;
}): ReactElement {
  const searchId = useId();
  const known = new Set<string>(props.filters.map((f) => f.value));

  return (
    <Tabs
      value={props.filter}
      onValueChange={(value) => {
        // Radix đưa về `string`. Chỉ nhận giá trị nằm trong bảng lọc của trang.
        if (known.has(value)) props.onFilterChange(value as V);
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <TabsList aria-label={props.filterLabel} className="max-w-full md:border-b-0">
          {props.filters.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value} {...(filter.count === undefined ? {} : { count: filter.count })}>
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="w-full pb-1 md:max-w-xs">
          <label htmlFor={searchId} className="sr-only">
            {props.searchLabel}
          </label>
          <Input
            id={searchId}
            type="search"
            icon="search"
            value={props.search}
            placeholder={props.searchPlaceholder}
            onChange={(event) => {
              props.onSearchChange(event.target.value);
            }}
          />
        </div>
      </div>
      <TabsContent value={props.filter} className="border-t border-rule pt-2">
        {props.children}
      </TabsContent>
    </Tabs>
  );
}
