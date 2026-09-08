'use client';

import { useCallback, useRef, type KeyboardEvent, type ReactElement } from 'react';
import type { ObjectView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { shortLabel } from './object-yaml';
import type { StatusToken } from './scene-tokens';

/**
 * Bảng tra tĩnh, KHÔNG phải chuỗi ghép.
 *
 * Tailwind quét mã nguồn bằng văn bản: `bg-${token}` sinh ra một class không bao
 * giờ có mặt trong CSS xuất ra, và triệu chứng là chấm trạng thái trong suốt —
 * không lỗi, không cảnh báo, chỉ là không có màu. Kiểu `Record<StatusToken, …>`
 * còn ép bảng này phải đầy đủ: lane B thêm một token mới ⇒ đỏ ở typecheck.
 */
const STATUS_DOT: Readonly<Record<StatusToken, string>> = {
  success: 'bg-success',
  destructive: 'bg-destructive',
  warning: 'bg-warning',
  'status-progress': 'bg-status-progress',
  'status-locked': 'bg-status-locked',
};

export interface ResourceListProps {
  readonly objects: readonly ObjectView[];
  readonly selectedUid: string | null;
  readonly onSelect: (uid: string) => void;
}

/**
 * Danh sách tài nguyên — **giao diện chính thức của game** (§4.4).
 *
 * Canvas 3D là hình minh hoạ cho đúng những gì bảng này đã nói bằng chữ. Người
 * dùng trình đọc màn hình, hay người vừa tắt hiệu ứng 3D, chơi hoàn toàn bằng
 * khoang này — nên mọi trạng thái phải đọc được ở đây, không chỉ nhìn thấy được
 * ở kia.
 *
 * `<button>` thật chứ không phải `<li onClick>`: cần Tab tới được, cần Enter và
 * Space cùng kích hoạt, cần vòng focus của trình duyệt. Ba thứ đó miễn phí với
 * một nút thật và phải dựng lại bằng tay (và thường dựng thiếu) với một div.
 */
export function ResourceList({ objects, selectedUid, onSelect }: ResourceListProps): ReactElement {
  const listRef = useRef<HTMLUListElement>(null);

  /**
   * Mũi tên là thứ CỘNG THÊM, không thay thế Tab.
   *
   * Danh sách này có thể dài 30 dòng và Tab qua từng dòng là một hình phạt. Mũi
   * tên đi nhanh hơn — nhưng mọi nút vẫn giữ `tabIndex` mặc định, nên đường Tab
   * không hề mất. Roving tabindex sẽ nhanh hơn nữa nhưng đổi lấy việc Tab không
   * còn vào được từng mục, và ô AC nói "mỗi item focus bằng Tab".
   *
   * Đọc DOM ở đây là an toàn: nó chạy trong một trình xử lý sự kiện bàn phím,
   * không phải trong vòng lặp render (§11.1.6).
   */
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLUListElement>): void => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) {
      return;
    }
    const list = listRef.current;
    if (list === null) {
      return;
    }
    const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>('button[data-resource]'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) {
      return;
    }
    event.preventDefault();
    const next =
      event.key === 'ArrowDown'
        ? Math.min(index + 1, buttons.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : buttons.length - 1;
    buttons[next]?.focus();
  }, []);

  if (objects.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        Cluster đang rỗng. Dùng thanh lệnh bên dưới để tạo tài nguyên đầu tiên.
      </p>
    );
  }

  return (
    <ul
      ref={listRef}
      role="list"
      aria-label="Danh sách tài nguyên"
      className="flex flex-col gap-0.5 p-1"
      onKeyDown={onKeyDown}
    >
      {objects.map((object) => {
        const selected = object.uid === selectedUid;
        return (
          <li key={object.uid}>
            <button
              type="button"
              data-resource={object.uid}
              /*
               * `aria-current` chứ không `aria-pressed`: nút này không phải một
               * công tắc hai trạng thái — nó chọn "mục đang xem" trong một tập.
               * `aria-pressed` sẽ được đọc thành "đã nhấn / chưa nhấn", nói sai
               * về thứ vừa xảy ra.
               */
              aria-current={selected ? true : undefined}
              onClick={() => onSelect(object.uid)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                'transition-colors duration-[var(--motion-fast)] ease-out',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[object.statusToken])} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortLabel(object)}</span>
              {/*
                `ariaLabel` do lane B viết bằng tiếng Việt và đã mang đầy đủ trạng
                thái ("pod web-2 lỗi CrashLoopBackOff"). Đặt nó vào một `sr-only`
                thay vì `aria-label` trên nút: `aria-label` sẽ THAY THẾ nội dung
                nhìn thấy được, nên tên tài nguyên biến mất khỏi thứ trình đọc màn
                hình đọc ra, và người dùng không còn tra chéo được với danh sách.
              */}
              <span className="sr-only">{object.ariaLabel}</span>
              {object.reason !== undefined ? (
                <span aria-hidden="true" className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {object.reason}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
