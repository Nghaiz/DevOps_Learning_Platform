'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import type { ObjectView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import type { ArenaDispatch, ScreenPoint } from '../arena-contract.ts';
import { ContextMenuItem } from './context-menu-item.tsx';
import { availableActions, buildAction } from './inspector-action-list.ts';
import { objectLabel } from './inspector-types.ts';

/** Khoảng chừa tối thiểu tới mép khung nhìn khi menu phải lật. */
const EDGE_MARGIN = 8;

/**
 * Replica mặc định cho lệnh co giãn phát từ menu chuột phải.
 *
 * Menu không có ô nhập, nên `scale` ở đây bị loại khỏi danh sách (xem
 * `MENU_ACTIONS` bên dưới) và hằng số này chỉ tồn tại để `buildAction` có một
 * đối số hợp lệ. Đưa một con số đoán vào cụm thì tệ hơn nhiều so với bắt người
 * dùng mở bảng thông số ra gõ.
 */
const UNUSED_REPLICAS = 1;

export interface ArenaContextMenuProps {
  /** `null` ⇒ menu không tồn tại trong DOM. */
  readonly object: ObjectView | null;
  /** Toạ độ MÀN HÌNH do scene gửi lên (`ArenaSceneProps.onContextMenu`). */
  readonly anchor: ScreenPoint | null;
  readonly tick: number;
  readonly dispatch: ArenaDispatch;
  readonly onClose: () => void;
  /** Mở bảng thông số cho object này. Camera KHÔNG di chuyển. */
  readonly onInspect: (uid: string) => void;
  /** Bay camera tới object này rồi chọn nó. */
  readonly onFocus: (uid: string) => void;
}

/**
 * Menu chuột phải trên một object trong cảnh 3D.
 *
 * `position: fixed` chứ không `absolute`: hợp đồng nói `onContextMenu` gửi lên
 * TOẠ ĐỘ MÀN HÌNH, và toạ độ màn hình chỉ khớp với `fixed`. Đặt `absolute` trong
 * một khung không nằm ở gốc khung nhìn sẽ làm menu lệch đúng bằng offset của
 * khung — sai lệch nhỏ, luôn tồn tại, và rất khó nhìn ra vì menu vẫn "gần đúng".
 */
export function ArenaContextMenu({
  object,
  anchor,
  tick,
  dispatch,
  onClose,
  onInspect,
  onFocus,
}: ArenaContextMenuProps): ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<ScreenPoint | null>(null);

  // Lật khi gần mép. Phải ĐO mới biết, vì kích thước menu phụ thuộc số mục, mà
  // số mục phụ thuộc loại tài nguyên — không đoán trước được.
  //
  // `useEffect` chứ không `useLayoutEffect`: `useLayoutEffect` không chạy khi
  // render trên máy chủ và React cảnh báo mỗi lần component đi qua SSR. Khung
  // hình chưa đo xong không hề nhấp nháy, vì menu mang class `invisible` cho tới
  // khi `placed` có giá trị.
  useEffect(() => {
    const el = menuRef.current;
    if (el === null || anchor === null) {
      setPlaced(null);
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const overflowRight = anchor.x + width > window.innerWidth - EDGE_MARGIN;
    const overflowBottom = anchor.y + height > window.innerHeight - EDGE_MARGIN;
    const next: ScreenPoint = {
      x: overflowRight ? Math.max(EDGE_MARGIN, anchor.x - width) : anchor.x,
      y: overflowBottom ? Math.max(EDGE_MARGIN, anchor.y - height) : anchor.y,
    };
    // So sánh trước khi ghi: `setState` vô điều kiện trong `useLayoutEffect` là
    // một vòng lặp vẽ vô tận, và nó biểu hiện thành treo tab chứ không thành lỗi.
    setPlaced((current) => (current?.x === next.x && current.y === next.y ? current : next));
  }, [anchor, object?.uid]);

  // Đóng khi bấm ra ngoài. Nghe `pointerdown` chứ không `click`: người dùng bấm
  // chuột phải chỗ khác sẽ mở menu mới, và `click` không bắn cho nút phải nên
  // menu cũ sẽ nằm lại chồng lên menu mới.
  useEffect(() => {
    if (object === null) {
      return;
    }
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
  }, [object?.uid, onClose]);

  // Đưa tiêu điểm vào mục đầu để người dùng bàn phím đi tiếp được ngay.
  useEffect(() => {
    if (object !== null) {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [object?.uid, anchor]);

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
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
      if (items.length === 0) {
        return;
      }
      const index = items.findIndex((item) => item === document.activeElement);
      // Chưa có mục nào nhận tiêu điểm: xuống ⇒ mục đầu, lên ⇒ mục cuối. Tính
      // bằng `index + step` ở trạng thái đó cho ra mục áp chót khi bấm lên —
      // đúng cú pháp modulo nhưng sai trực giác.
      const next =
        index === -1
          ? (down ? 0 : items.length - 1)
          : // Vòng lại hai đầu — WAI-ARIA APG cho menu. Kẹt ở mục cuối làm
            // người dùng tưởng bàn phím hỏng.
            (index + (down ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    },
    [onClose],
  );

  if (object === null || anchor === null) {
    return null;
  }

  // `scale` cần một con số; menu không có chỗ nhập nên nó thuộc về bảng thông số.
  const items = availableActions(object).filter((action) => action.id !== 'scale');
  const point = placed ?? anchor;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Hành động cho ${objectLabel(object)}`}
      onKeyDown={onKeyDown}
      style={{ left: point.x, top: point.y }}
      className={cn(
        'pointer-events-auto fixed z-50 min-w-44 overflow-hidden rounded-md border border-border',
        'bg-popover text-popover-foreground shadow-elevation-3',
        // Ẩn cho tới khi đo xong: một khung hình nằm sai chỗ rồi nhảy về đúng chỗ
        // đọc ra như giật hình, và ở góc màn hình thì nó tràn ra ngoài trước khi lật.
        placed === null ? 'invisible' : 'visible',
      )}
    >
      <p className="truncate border-b border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        {objectLabel(object)}
      </p>
      <ContextMenuItem
        label="Xem thông số"
        hint="Mở bảng bên phải với trạng thái, YAML (sửa được), sự kiện và mô tả."
        onSelect={() => {
          onInspect(object.uid);
          onClose();
        }}
      />
      <ContextMenuItem
        label="Bay tới đây"
        hint="Đưa camera tới sát tài nguyên này. Bấm chọn thường KHÔNG làm camera di chuyển."
        onSelect={() => {
          onFocus(object.uid);
          onClose();
        }}
      />
      {items.map((action) => (
        <ContextMenuItem
          key={action.id}
          label={action.label}
          hint={action.hint}
          danger={action.danger}
          onSelect={() => {
            const built = buildAction(action.id, object, tick, UNUSED_REPLICAS);
            if (built !== null) {
              dispatch(built);
            }
            onClose();
          }}
        />
      ))}
    </div>
  );
}
