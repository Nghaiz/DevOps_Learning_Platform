import type { ReactElement } from 'react';
import { cn } from '../cn.ts';
import { Button } from '../button.tsx';

export interface StepNavItem {
  readonly key: string; // 'intro' | 'step0' | 'step1' | … | 'finish'
  readonly label: string;
  readonly done: boolean;
}

export interface StepNavProps {
  readonly items: readonly StepNavItem[];
  readonly activeKey: string;
  readonly onSelect: (key: string) => void;
}

/**
 * Hàng điều hướng các giai đoạn của bài học. Nút Trước/Tiếp KHÔNG nhận
 * `canPrev`/`canNext` từ props — tự suy ra từ vị trí của `activeKey` trong
 * `items`, vì để caller truyền một cặp cờ không khớp với `activeKey` thật
 * (ví dụ Tiếp vẫn bật dù đã ở mục cuối) là một lớp bug hoàn toàn có thể tránh
 * bằng cách không cho phép trạng thái đó tồn tại.
 */
export function StepNav(props: StepNavProps): ReactElement {
  const { items, activeKey, onSelect } = props;
  const activeIndex = items.findIndex((item) => item.key === activeKey);

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < items.length - 1;

  const goPrev = () => {
    if (canGoPrev) onSelect(items[activeIndex - 1]!.key);
  };
  const goNext = () => {
    if (canGoNext) onSelect(items[activeIndex + 1]!.key);
  };

  return (
    <nav className="flex items-center gap-2 border-b border-border bg-background px-2 py-1.5">
      <Button variant="ghost" className="h-8 shrink-0 px-2" disabled={!canGoPrev} onClick={goPrev}>
        Trước
      </Button>
      <div className="flex flex-1 gap-1 overflow-x-auto">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              type="button"
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onSelect(item.key)}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {item.done && (
                // aria-hidden để icon không lẫn vào tên hỗ trợ tiếp cận của nút
                // (accessible name) — nút vẫn chỉ được gọi tên bằng nhãn text.
                <span aria-hidden="true" className="text-success">
                  ✓
                </span>
              )}
              {item.label}
            </button>
          );
        })}
      </div>
      <Button variant="ghost" className="h-8 shrink-0 px-2" disabled={!canGoNext} onClick={goNext}>
        Tiếp
      </Button>
    </nav>
  );
}
