'use client';

import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { cn } from '../cn.ts';
import { Button } from '../button.tsx';
import { LINE_CLASSES, type LineId } from '../lines.ts';
import { MOTION_FAST } from './motion.ts';

export interface StepNavItem {
  readonly key: string; // 'intro' | 'step0' | 'step1' | … | 'finish'
  readonly label: string;
  readonly done: boolean;
}

/** Câu chữ do trang truyền vào (gói `ui` không phụ thuộc `copy`). */
export interface StepNavLabels {
  /** Tên của danh sách bước. */
  readonly list: string;
  readonly prev: string;
  readonly next: string;
  /** Trạng thái đọc cho trình đọc màn hình, đi sau tên bước. */
  readonly done: string;
  readonly current: string;
  readonly todo: string;
}

export interface StepNavProps {
  readonly items: readonly StepNavItem[];
  readonly activeKey: string;
  readonly onSelect: (key: string) => void;
  readonly labels: StepNavLabels;
  /** Màu tuyến của chủ đề. Vắng ⇒ đường ray màu chữ. */
  readonly line?: LineId;
  /** Thân của bước đang mở, treo ngay dưới ga của nó trên tuyến. */
  readonly children?: ReactNode;
}

type StationState = 'done' | 'current' | 'todo';

function stationState(item: StepNavItem, active: boolean): StationState {
  if (active) return 'current';
  return item.done ? 'done' : 'todo';
}

/**
 * Ga trên tuyến: ô vuông 20px nằm trên đường ray 4px.
 *
 * Ba trạng thái khác nhau ở HÌNH, không chỉ ở màu: đã đạt = ô đặc có dấu tích,
 * đang làm = ô vàng tín hiệu viền mực, chưa làm = ô rỗng. In đen trắng vẫn đọc ra.
 */
function Station({ state, line }: { readonly state: StationState; readonly line: LineId | undefined }) {
  const rail = line === undefined ? 'bg-foreground' : LINE_CLASSES[line].bg;
  return (
    <span
      aria-hidden="true"
      data-station={state}
      className={cn(
        'relative z-10 grid size-5 shrink-0 place-items-center border-[3px]',
        state === 'done' && [rail, 'border-transparent text-background'],
        state === 'current' && 'animate-pulse-station border-foreground bg-signal text-signal-foreground',
        state === 'todo' && [
          'bg-card',
          line === undefined ? 'border-foreground' : LINE_CLASSES[line].border,
        ],
      )}
    >
      {state === 'done' && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

/**
 * Các bước của bài học, vẽ thành một TUYẾN DỌC.
 *
 * Bước đang mở bung thân của nó ngay dưới ga (nội dung + nút kiểm tra), các
 * bước khác co lại thành một dòng. Nhờ vậy danh sách bước không chiếm một dải
 * riêng phía trên nội dung: trước đây đó là một hàng "viên thuốc" cuộn ngang,
 * và ở bài mười bước thì bước đang làm trôi ra ngoài khung.
 *
 * Tên khả truy cập của nút "Trước"/"Tiếp" bằng đúng chữ trong `labels`: luồng
 * e2e bài học neo vào `name: 'Tiếp', exact: true`.
 */
export function StepNav(props: StepNavProps): ReactElement {
  const { items, activeKey, onSelect, labels, line, children } = props;
  const activeIndex = items.findIndex((item) => item.key === activeKey);
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < items.length - 1;
  const domId = useId();
  const activeRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);

  // Đổi bước thì đưa ga đang mở về tầm nhìn. Không chạy ở lượt mount đầu: mở
  // trang mà bị cuộn đi là cuộn khỏi chỗ người học đang đọc.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    try {
      activeRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch {
      // jsdom không có scrollIntoView.
    }
  }, [activeKey]);

  const rail = line === undefined ? 'bg-foreground' : LINE_CLASSES[line].bg;
  const stateLabel: Record<StationState, string> = {
    done: labels.done,
    current: labels.current,
    todo: labels.todo,
  };

  return (
    <ol aria-label={labels.list} className="relative">
      {items.map((item, index) => {
        const isActive = index === activeIndex;
        const state = stationState(item, isActive);
        const isLast = index === items.length - 1;
        const buttonId = `${domId}-${item.key}`;
        return (
          <li key={item.key} className="relative flex gap-4">
            {/* Cột đường ray: ga + đoạn ray nối xuống ga kế. */}
            <span className="relative flex w-5 shrink-0 flex-col items-center pt-2.5">
              <Station state={state} line={line} />
              {!isLast && <span aria-hidden="true" className={cn('w-1 flex-1', rail)} />}
            </span>

            <div className="min-w-0 flex-1 pb-2">
              <button
                ref={isActive ? activeRef : null}
                id={buttonId}
                type="button"
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onSelect(item.key)}
                className={cn(
                  'group flex min-h-10 w-full scroll-mt-4 items-baseline gap-3 py-2 text-left',
                  'transition-colors outline-none',
                  MOTION_FAST,
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                )}
              >
                <span aria-hidden="true" className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1',
                    isActive
                      ? 'type-title text-foreground'
                      : 'text-sm font-medium text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  {item.label}
                  <span className="sr-only">, {stateLabel[state]}</span>
                </span>
                {state === 'done' && !isActive && (
                  <span aria-hidden="true" className="shrink-0 type-label text-success">
                    {labels.done}
                  </span>
                )}
              </button>

              {isActive && (
                <section aria-labelledby={buttonId} className="animate-rise pt-2 pb-6">
                  {children}
                  <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<ArrowLeft aria-hidden="true" className="size-4" />}
                      disabled={!canGoPrev}
                      onClick={() => {
                        const prev = items[activeIndex - 1];
                        if (prev !== undefined) onSelect(prev.key);
                      }}
                    >
                      {labels.prev}
                    </Button>
                    <span aria-hidden="true" className="font-mono text-xs text-muted-foreground tabular-nums">
                      <span className="text-foreground">{activeIndex + 1}</span>/{items.length}
                    </span>
                    <Button
                      variant="ink"
                      size="sm"
                      iconRight={<ArrowRight aria-hidden="true" className="size-4" />}
                      disabled={!canGoNext}
                      onClick={() => {
                        const next = items[activeIndex + 1];
                        if (next !== undefined) onSelect(next.key);
                      }}
                    >
                      {labels.next}
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
