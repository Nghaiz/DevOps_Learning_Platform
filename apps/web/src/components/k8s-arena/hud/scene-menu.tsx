'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { cn } from '@devops-platform/ui';
import type { ScreenPoint } from '../arena-contract.ts';
import { ContextMenuItem } from './context-menu-item.tsx';

/** Khoảng chừa tối thiểu tới mép khung nhìn khi menu phải lật. */
const EDGE_MARGIN = 8;

export interface SceneMenuAction {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly disabled?: boolean;
  readonly run: () => void;
}

export interface SceneMenuProps {
  /** `null` ⇒ menu không tồn tại trong DOM. */
  readonly anchor: ScreenPoint | null;
  readonly actions: readonly SceneMenuAction[];
  readonly onClose: () => void;
}

/**
 * Menu chuột phải khi bấm vào CHỖ TRỐNG của cảnh.
 *
 * Trước đây chuột phải trượt khỏi mọi vật thì `preventDefault` không chạy và menu
 * của TRÌNH DUYỆT bật lên giữa cảnh 3D — cộng với vùng bấm thủng lỗ chỗ của bản
 * cũ (`hit-proxy.tsx`), đó là phần lớn số lần người chơi bấm chuột phải. Nên
 * *"right click chưa có gì"* thật ra là *"right click hầu như luôn trượt"*.
 *
 * Tách khỏi `context-menu.tsx` chứ không nhồi thêm một nhánh `object === null`
 * vào đó: hai menu này có tập mục khác hẳn nhau (một cái thao tác trên MỘT tài
 * nguyên, một cái thao tác trên CẢ CẢNH), và gộp lại thì mỗi mục phải tự hỏi
 * "tôi có object không" — một câu hỏi mà sớm muộn có chỗ quên hỏi.
 *
 * `position: fixed` vì hợp đồng gửi lên TOẠ ĐỘ MÀN HÌNH; `absolute` trong một
 * khung không nằm ở gốc khung nhìn sẽ lệch đúng bằng offset của khung — sai
 * lệch nhỏ, luôn tồn tại, và rất khó nhìn ra vì menu vẫn "gần đúng".
 */
export function SceneMenu({ anchor, actions, onClose }: SceneMenuProps): ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<ScreenPoint | null>(null);

  useEffect(() => {
    const el = menuRef.current;
    if (el === null || anchor === null) {
      setPlaced(null);
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const next: ScreenPoint = {
      x:
        anchor.x + width > window.innerWidth - EDGE_MARGIN
          ? Math.max(EDGE_MARGIN, anchor.x - width)
          : anchor.x,
      y:
        anchor.y + height > window.innerHeight - EDGE_MARGIN
          ? Math.max(EDGE_MARGIN, anchor.y - height)
          : anchor.y,
    };
    // So trước khi ghi: `setState` vô điều kiện trong một effect đo đạc là một
    // vòng lặp vẽ vô tận, và nó biểu hiện thành treo tab chứ không thành lỗi.
    setPlaced((current) => (current?.x === next.x && current.y === next.y ? current : next));
  }, [anchor, actions]);

  useEffect(() => {
    if (anchor === null) {
      return;
    }
    // Nghe `pointerdown` chứ không `click`: bấm chuột PHẢI chỗ khác sẽ mở menu
    // mới, và `click` không bắn cho nút phải nên menu cũ nằm lại chồng lên nó.
    const onPointerDown = (event: PointerEvent): void => {
      const el = menuRef.current;
      if (el !== null && event.target instanceof Node && !el.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    if (anchor !== null) {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [anchor]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      const down = event.key === 'ArrowDown';
      if (!down && event.key !== 'ArrowUp') {
        return;
      }
      event.preventDefault();
      const items = [
        ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
      ];
      if (items.length === 0) {
        return;
      }
      const index = items.findIndex((item) => item === document.activeElement);
      // Chưa có mục nào nhận tiêu điểm: xuống ⇒ mục đầu, lên ⇒ mục cuối. Tính
      // bằng `index + step` ở trạng thái đó cho ra mục áp chót khi bấm lên —
      // đúng cú pháp modulo nhưng sai trực giác.
      const next =
        index === -1
          ? down
            ? 0
            : items.length - 1
          : (index + (down ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    },
    [onClose],
  );

  if (anchor === null) {
    return null;
  }
  const point = placed ?? anchor;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Hành động trên cảnh"
      onKeyDown={onKeyDown}
      style={{ left: point.x, top: point.y }}
      className={cn(
        'pointer-events-auto fixed z-50 min-w-52 overflow-hidden rounded-md border border-border',
        'bg-popover text-popover-foreground shadow-elevation-3',
        // Ẩn cho tới khi đo xong: một khung hình nằm sai chỗ rồi nhảy về đúng chỗ
        // đọc ra như giật hình, và ở góc màn hình thì nó tràn ra ngoài trước khi lật.
        placed === null ? 'invisible' : 'visible',
      )}
    >
      <p className="border-b border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        Cảnh
      </p>
      {actions.map((action) => (
        <ContextMenuItem
          key={action.id}
          label={action.label}
          hint={action.hint}
          disabled={action.disabled ?? false}
          onSelect={() => {
            action.run();
            onClose();
          }}
        />
      ))}
    </div>
  );
}
