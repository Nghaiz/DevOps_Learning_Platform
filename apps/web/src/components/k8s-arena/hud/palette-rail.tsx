'use client';

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { TooltipProvider, cn } from '@devops-platform/ui';
import type { ObjectView, ResourceKind } from '@devops-platform/games';
import type { ArenaDispatch, PaletteEntry } from '../arena-contract.ts';
import { PALETTE_GROUP_LABELS } from '../arena-contract.ts';
import { PALETTE_ENTRIES, PALETTE_GROUP_ORDER, entryByHotkey } from './palette-entries.ts';
import { PaletteCell } from './palette-cell.tsx';
import { PaletteNameDialog } from './palette-name-dialog.tsx';
import { buildManifest } from './palette-manifest.ts';
import { isDialogOpen, isTypingTarget } from './overlay-manager-keys.ts';

export interface PaletteRailProps {
  readonly open: boolean;
  /** `Level.allowedResources` — loại ngoài danh sách này hiện mờ kèm lời giải thích. */
  readonly allowedResources: readonly ResourceKind[];
  /** Đọc object đang có, gọi lúc mở hộp đặt tên. Hàm chứ không phải mảng: engine đập nhịp nhiều lần mỗi giây. */
  readonly listObjects: () => readonly ObjectView[];
  readonly dispatch: ArenaDispatch;
  /** Tick hiện hành. Phiên chơi đóng dấu lại tick lúc nhận, nên giá trị hơi cũ vẫn vô hại. */
  readonly getTick: () => number;
}


interface Pending {
  readonly entry: PaletteEntry;
  /** Chụp MỘT LẦN lúc mở hộp thoại — tên trong cụm đổi mỗi tick, và đề xuất nhảy dưới tay người đang gõ là lỗi. */
  readonly takenNames: readonly string[];
}

/**
 * Bảng tạo tài nguyên bên trái.
 *
 * ⛔ Đây là thứ CHƯA TỪNG TỒN TẠI trong bản cũ, và sự vắng mặt của nó là một lỗi
 * chỉ ra được bằng chứng: gợi ý của level 1 viết *"Bảng tài nguyên bên trái cho
 * bạn tạo pod mà không cần gõ YAML"* (`levels/l01.ts:59`) trong khi bảng bên
 * trái cũ (`resource-rail.tsx:28`) chỉ LIỆT KÊ object đã có. Người chơi làm theo
 * gợi ý sẽ không tìm thấy gì.
 *
 * Ô bị chặn KHÔNG bị ẩn đi. Ẩn thì người học kết luận "game này không có
 * Deployment"; hiện mờ kèm câu giải thích thì họ đọc đúng thứ đang xảy ra —
 * *loại này có thật, bài này chưa mở nó*. Đó là khác biệt giữa một giới hạn dạy
 * học và một tính năng thiếu.
 */
export function PaletteRail({
  open,
  allowedResources,
  listObjects,
  dispatch,
  getTick,
}: PaletteRailProps): ReactElement | null {
  const [pending, setPending] = useState<Pending | null>(null);
  const allowed = useMemo(() => new Set(allowedResources), [allowedResources]);

  const start = useCallback(
    (entry: PaletteEntry): void => {
      const takenNames = listObjects()
        .filter((object) => object.kind === entry.kind)
        .map((object) => object.name);
      setPending({ entry, takenNames });
    },
    [listObjects],
  );

  /*
   * Phím số 1..9 nghe ở `window` chứ không ở chính thanh bên: người chơi đang
   * nhìn cảnh 3D và tay không ở trên bảng, nên phím tắt phải bắt được ở bất kỳ
   * đâu ngoài ô nhập. Bỏ qua khi đang gõ trong terminal hoặc trong hộp đặt tên
   * — ở đó số là dữ liệu, không phải lệnh.
   */
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target) || isDialogOpen()) {
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
        return;
      }
      const entry = entryByHotkey(digit);
      if (entry === null || !allowed.has(entry.kind)) {
        return;
      }
      event.preventDefault();
      start(entry);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, allowed, start]);

  if (!open) {
    return null;
  }

  const confirm = (name: string): void => {
    if (pending === null) {
      return;
    }
    dispatch({ tick: getTick(), kind: 'apply', yaml: buildManifest(pending.entry.kind, name) });
    setPending(null);
  };

  return (
    <TooltipProvider delayDuration={250}>
      <aside
        aria-label="Bảng tạo tài nguyên"
        className={cn(
          'pointer-events-auto absolute top-0 bottom-0 left-0 z-20 flex w-16 flex-col gap-3 overflow-y-auto',
          'border-r border-border bg-card/85 py-3 backdrop-blur-sm shadow-elevation-2',
        )}
      >
        {PALETTE_GROUP_ORDER.map((group) => (
          <section key={group} className="flex flex-col items-center gap-1">
            <h3 className="px-1 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
              {PALETTE_GROUP_LABELS[group]}
            </h3>
            {PALETTE_ENTRIES.filter((entry) => entry.group === group).map((entry) => (
              <PaletteCell
                key={entry.kind}
                entry={entry}
                enabled={allowed.has(entry.kind)}
                onPick={() => start(entry)}
              />
            ))}
          </section>
        ))}
      </aside>

      {/* Hộp thoại render qua Portal nên nó KHÔNG nằm trong `<aside>` về mặt bố cục — đặt ở đây chỉ để cùng vòng đời với thanh bên. */}
      <PaletteNameDialog
        entry={pending?.entry ?? null}
        takenNames={pending?.takenNames ?? []}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      />
    </TooltipProvider>
  );
}

