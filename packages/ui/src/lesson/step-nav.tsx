'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import { Check, ChevronLeft, ChevronRight, Circle, CircleDot } from 'lucide-react';
import { cn } from '../cn.ts';
import { Button } from '../button.tsx';
import { MOTION_FAST } from './motion.ts';

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
 * Dấu trạng thái của một mục bước — HÌNH trước, màu sau.
 *
 * Ba trạng thái phải phân biệt được cả khi màu bị bỏ đi (in đen trắng, mù màu
 * đỏ-lục, chế độ tương phản cao của hệ điều hành): dấu kiểm trong đĩa đặc = đã
 * đạt, chấm trong vòng = đang làm, vòng rỗng = chưa tới. Màu chỉ là lớp thứ
 * hai — đó là yêu cầu "bằng CẢ màu lẫn hình", và cũng là SC 1.4.1 (Use of
 * Color).
 *
 * `aria-hidden` trên mọi icon: tên khả truy cập của nút phải đúng bằng nhãn
 * bước, không lẫn thêm chữ nào. Trạng thái "đang làm" đã do `aria-current`
 * nói ra; "đã đạt" nói bằng chữ ở nhãn thanh tiến độ, không nhét vào tên nút.
 */
function StepMarker({ done, active }: { done: boolean; active: boolean }): ReactElement {
  if (done) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full',
          // Trên nền `--status-progress` (mục đang chọn) thì đĩa phải ĐẢO
          // màu: cặp `--status-done` cạnh `--status-progress` chưa từng được
          // đo, còn cặp đảo là 5.20:1 sáng / 7.32:1 tối. Ngoài mục đang chọn,
          // `--status-done-foreground` trên `--status-done` là 5.21 / 7.96.
          active
            ? 'bg-status-progress-foreground text-status-progress'
            : 'bg-status-done text-status-done-foreground',
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  const Icon = active ? CircleDot : Circle;
  return <Icon aria-hidden="true" className={cn('size-4 shrink-0', !active && 'opacity-60')} />;
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

  const activeRef = useRef<HTMLButtonElement>(null);

  /*
    Kéo mục đang chọn vào tầm nhìn. KHÔNG phải trang trí: hàng bước nằm trong
    `overflow-x-auto`, và một bài mười bước thì mục đang làm trôi ra ngoài
    khung ngay từ bước thứ năm — lúc đó "thấy ngay đang ở bước mấy" là sai sự
    thật, người học phải tự cuộn đi tìm.

    `block: nearest` + `inline: nearest` cuộn ĐÚNG mức tối thiểu, và quan trọng
    hơn: không kéo cả trang theo trục dọc (mặc định `center` sẽ làm thế, và nó
    giật cả khoang nội dung mỗi lần đổi bước).
  */
  useEffect(() => {
    const node = activeRef.current;
    if (node === null) {
      return;
    }
    try {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch {
      // jsdom KHÔNG cài `scrollIntoView` — nó ném "not a function". Một
      // component bố cục không được phép làm đỏ cả suite test vì một API chỉ
      // có nghĩa khi có bố cục thật.
    }
  }, [activeKey]);

  const goPrev = () => {
    if (canGoPrev) onSelect(items[activeIndex - 1]!.key);
  };
  const goNext = () => {
    if (canGoNext) onSelect(items[activeIndex + 1]!.key);
  };

  return (
    <nav
      aria-label="Các bước của bài học"
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 shadow-elevation-1"
    >
      {/*
        Icon `aria-hidden` bên trong nút: tên khả truy cập vẫn đúng bằng "Trước"
        / "Tiếp" — chuỗi mà cả `step-nav.test.tsx` lẫn
        `e2e/flows/lesson.flow.spec.ts` (name: Tiếp, exact: true) neo vào.
      */}
      <Button
        variant="ghost"
        className="h-8 shrink-0 px-2"
        iconLeft={<ChevronLeft aria-hidden="true" className="size-4" />}
        disabled={!canGoPrev}
        onClick={goPrev}
      >
        Trước
      </Button>

      <div className="flex flex-1 gap-1 overflow-x-auto">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              ref={isActive ? activeRef : null}
              type="button"
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onSelect(item.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium',
                'transition-colors duration-[var(--motion-fast)] ease-out',
                MOTION_FAST,
                /*
                 * `ring-current`, KHÔNG phải `ring-ring`. Bước đang chọn là
                 * `bg-status-progress`, cùng hue thương hiệu với `--ring` ⇒ đo
                 * được 1.05:1 sáng / 1.07:1 tối, tức vòng focus VÔ HÌNH. Đổi
                 * token nền không cứu được điều đó — nó chỉ đổi con số từ 1.00
                 * sang 1.05. Cách sửa của Button (`ring-offset`) không dùng được
                 * ở đây: hàng bước nằm trong `overflow-x-auto` ngay bên ngoài,
                 * nên một vòng đẩy thêm 2px ra ngoài sẽ bị CẮT ở mép cuộn.
                 *
                 * `currentColor` thì luôn là chữ của chính nút — status-
                 * progress-foreground khi đang chọn (5.20 sáng / 7.32 tối trên
                 * `--status-progress`), foreground khi đã đạt (17.24 / 14.80
                 * trên nền status-done 10%), status-locked khi chưa tới (5.44 /
                 * 6.71 trên `--card`). Cả ba đo bằng đúng công thức của
                 * `theme/tokens.contract.test.ts` (trộn alpha trong sRGB đã mã
                 * hoá gamma) và đều trên ngưỡng 3:1 của SC 1.4.11.
                 */
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current',
                /*
                 * `status-locked` cho bước CHƯA TỚI. Tên token nói "khoá" còn
                 * bước thì vẫn bấm được — đó là chủ ý của hợp đồng nền (nó đặt
                 * tên theo VỊ TRÍ trong tiến trình, không theo quyền truy cập).
                 * Ghi lại ở đây để lần sau không ai "sửa" thành `disabled`.
                 */
                isActive
                  ? 'border-transparent bg-status-progress text-status-progress-foreground shadow-elevation-1'
                  : item.done
                    ? 'border-status-done/40 bg-status-done/10 text-foreground hover:bg-status-done/20'
                    : 'border-transparent text-status-locked hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <StepMarker done={item.done} active={isActive} />
              {item.label}
            </button>
          );
        })}
      </div>

      {/*
        Vị trí trên tổng số. `aria-hidden` vì `aria-current="step"` đã nói điều
        này cho AT; con số ở đây là cho MẮT — câu trả lời cho "còn bao nhiêu
        nữa" mà không phải đếm từng viên bước.

        Ẩn hẳn khi `activeKey` không khớp mục nào (activeIndex bằng -1): in ra
        "0/5" là một con số SAI, và một con số sai tệ hơn không có số.
      */}
      {activeIndex >= 0 && (
        <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{activeIndex + 1}</span>/{items.length}
        </span>
      )}

      <Button
        variant="ghost"
        className="h-8 shrink-0 px-2"
        iconRight={<ChevronRight aria-hidden="true" className="size-4" />}
        disabled={!canGoNext}
        onClick={goNext}
      >
        Tiếp
      </Button>
    </nav>
  );
}
