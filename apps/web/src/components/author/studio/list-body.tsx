'use client';

import { useId, type ReactElement, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@devops-platform/ui';

export interface StudioFilter<V extends string> {
  readonly value: V;
  readonly label: string;
  /** Có khi dữ liệu cho phép đếm (danh sách nạp trọn). Không có thì không in số. */
  readonly count?: number;
}

/**
 * Thân chung của hai danh sách trong Xưởng soạn: hàng lọc trạng thái + ô tìm,
 * rồi panel chứa bảng.
 *
 * Hai trang trước đây mỗi trang một kiểu: `/author` lọc ở client có đếm,
 * `/author/problems` lọc ở máy chủ không đếm. Cách LỌC vẫn khác (một bên nhận
 * trọn danh sách, một bên phân trang), nhưng người soạn giờ thấy cùng một hàng
 * điều khiển ở cùng một chỗ. Số đếm chỉ hiện khi trang gọi đưa vào, vì một số
 * đếm trên một trang của kết quả phân trang là một con số sai.
 *
 * Danh sách nằm TRONG `TabsContent` mang `value={filter}`: panel đó luôn khớp tab
 * đang chọn nên luôn có mặt, và tab đang chọn không bao giờ trỏ vào hư không.
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
      <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <TabsList aria-label={props.filterLabel} className="max-w-full justify-start overflow-x-auto">
          {props.filters.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value} className="gap-2">
              {filter.label}
              {filter.count !== undefined && (
                <span className="font-mono text-xs tabular-nums opacity-80">{filter.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="relative w-full md:max-w-xs">
          <label htmlFor={searchId} className="sr-only">
            {props.searchLabel}
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            value={props.search}
            placeholder={props.searchPlaceholder}
            className="pl-9"
            onChange={(event) => {
              props.onSearchChange(event.target.value);
            }}
          />
        </div>
      </div>
      <TabsContent value={props.filter} className="pt-2 focus-visible:outline-none">
        {props.children}
      </TabsContent>
    </Tabs>
  );
}
