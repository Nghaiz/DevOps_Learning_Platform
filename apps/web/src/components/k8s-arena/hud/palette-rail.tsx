'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { TooltipProvider, cn } from '@devops-platform/ui';
import type { ObjectView, ResourceKind } from '@devops-platform/games';
import type { ArenaDispatch, PaletteEntry } from '../arena-contract.ts';
import { PALETTE_GROUP_LABELS } from '../arena-contract.ts';
import { PALETTE_ENTRIES, PALETTE_GROUP_ORDER, entryByHotkey } from './palette-entries.ts';
import { PaletteCell } from './palette-cell.tsx';
import { PaletteNameDialog } from './palette-name-dialog.tsx';
import { buildManifest } from './palette-manifest.ts';
import { isDialogOpen, isTypingTarget } from './overlay-manager-keys.ts';
import { HUD_SCROLL_HIDDEN, HUD_TOP_OFFSET } from './top-bar.tsx';

export interface PaletteRailProps {
  readonly open: boolean;
  /**
   * `Level.allowedResources` — loại bài học đang xoay quanh.
   *
   * ⛔ KHÔNG phải danh sách cho phép. Mọi loại đều tạo được ở mọi bài; danh sách
   * này chỉ quyết định ô nào được ĐÁNH DẤU. Xem `PaletteEntry` trong hợp đồng.
   */
  readonly featuredResources: readonly ResourceKind[];
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
 * Bảng tạo tài nguyên bên trái. MỌI ô đều dùng được, ở MỌI bài.
 *
 * ⛔ Đây là thứ CHƯA TỪNG TỒN TẠI trong bản cũ, và sự vắng mặt của nó là một lỗi
 * chỉ ra được bằng chứng: gợi ý của level 1 viết *"Bảng tài nguyên bên trái cho
 * bạn tạo pod mà không cần gõ YAML"* (`levels/l01.ts:59`) trong khi bảng bên
 * trái cũ (`resource-rail.tsx:28`) chỉ LIỆT KÊ object đã có. Người chơi làm theo
 * gợi ý sẽ không tìm thấy gì.
 *
 * ⛔ KHÔNG có ô nào bị khoá. Bản trước làm mờ và chặn bấm những loại ngoài
 * `Level.allowedResources`; chủ dự án bác bỏ hẳn (2026-09-08): *"không được
 * phép chặn thao tác với các resource, bài nào cũng phải mở"*. `allowedResources`
 * giờ chỉ ĐÁNH DẤU loại mà bài học xoay quanh — một chỉ dẫn, không phải hàng rào.
 */
export function PaletteRail({
  open,
  featuredResources,
  listObjects,
  dispatch,
  getTick,
}: PaletteRailProps): ReactElement | null {
  const [pending, setPending] = useState<Pending | null>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const railRef = useRef<HTMLElement>(null);

  /*
   * Đo sau mỗi lần cuộn VÀ sau mỗi lần bố cục đổi. Không suy từ số ô: chiều cao
   * thật phụ thuộc khung nhìn và cỡ chữ của người dùng, nên chỉ phép đo mới biết
   * còn ô bên dưới hay không.
   */
  const syncFade = useCallback((): void => {
    const node = railRef.current;
    if (node !== null) {
      setHasMoreBelow(node.scrollTop + node.clientHeight < node.scrollHeight - 1);
    }
  }, []);

  useEffect(syncFade, [syncFade, featuredResources]);
  const featured = useMemo(() => new Set(featuredResources), [featuredResources]);

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
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target) ||
        isDialogOpen()
      ) {
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
        return;
      }
      const entry = entryByHotkey(digit);
      if (entry === null) {
        return;
      }
      // Không lọc theo `featuredResources`: phím tắt phải mở được ĐÚNG những ô
      // mà chuột mở được, nếu không bàn phím lại thành một hàng rào thứ hai.
      event.preventDefault();
      start(entry);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, start]);

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
      {/*
        Hai trục, hai luật KHÁC NHAU — và chỗ khác nhau đó mới là nội dung của
        `NO_VISIBLE_SCROLLBARS` (đính chính của chủ dự án 2026-09-08: *"ý tôi là
        cấm không cho xuất hiện cái thanh scroll dọc/ngang"* — thứ bị cấm là
        THANH TRƯỢT hiện ra, không phải khả năng cuộn).

        NGANG — `overflow-x-hidden`, và bố cục phải tự không tràn. Một cột hẹp bị
        tràn ngang nghĩa là có phần tử rộng hơn khung; ẩn thanh trượt ở đó chỉ
        giấu triệu chứng, còn nội dung vẫn bị cắt mất bên phải mà giờ không còn
        cách nào kéo tới. Đo được ở 1440×900: `scrollWidth` 87 = `clientWidth`
        87, tức không tràn — ô dùng `w-full` trong lưới thay vì một bề rộng cố
        định rộng hơn khung.

        DỌC — cuộn được, thanh trượt ẩn. `overflow-hidden` ở trục này là SAI dù
        26 ô vừa màn hình 900px: trên khung nhìn thấp hơn nó sẽ cắt mất mấy ô
        cuối trong im lặng, và người chơi không có đường nào tới được công cụ đó.
        Hai cột kéo chiều cao từ ~1040px xuống vừa màn hình thường, còn phần
        cuộn là lưới an toàn cho màn hình thấp.

        `top-12` phải bằng chiều cao thanh trên cùng — lý do và chỗ neo hằng số ở
        `HUD_TOP_OFFSET` trong `top-bar.tsx`. Đo được: mép trên bảng 48px, đúng
        bằng mép dưới thanh, nên ô "Pod" không còn bị che.
      */}
      <aside
        ref={railRef}
        onScroll={syncFade}
        aria-label="Bảng tạo tài nguyên"
        className={cn(
          'arena-palette pointer-events-auto absolute bottom-0 left-0 z-20 overflow-x-hidden overflow-y-auto',
          HUD_TOP_OFFSET,
          HUD_SCROLL_HIDDEN,
          'border-r border-border bg-card/85 px-1 py-1 shadow-elevation-2 backdrop-blur-sm',
        )}
      >
        <div className="grid grid-cols-2 gap-1">
          {PALETTE_GROUP_ORDER.map((group) => (
            <Fragment key={group}>
              <h3 className="arena-tool-group col-span-2 px-0.5 text-[8px] leading-none font-semibold tracking-wide text-muted-foreground uppercase">
                {PALETTE_GROUP_LABELS[group]}
              </h3>
              {PALETTE_ENTRIES.filter((entry) => entry.group === group).map((entry) => (
                <PaletteCell
                  key={entry.kind}
                  entry={entry}
                  featured={featured.has(entry.kind)}
                  onPick={() => start(entry)}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </aside>

      {/*
        Dải mờ ở mép dưới — tín hiệu DUY NHẤT còn lại rằng bên dưới còn ô, vì
        thanh trượt đã bị ẩn. Nằm ngoài `<aside>` và `pointer-events-none` để nó
        không chặn cú bấm vào ô nằm dưới nó, và không tự trở thành một phần của
        vùng cuộn (một lớp phủ nằm TRONG vùng cuộn sẽ trôi theo nội dung, tức
        biến mất đúng lúc cần nhất).
      */}
      {hasMoreBelow ? (
        <div
          aria-hidden
          className={cn(
            'arena-palette-fade pointer-events-none absolute bottom-0 left-0 z-20 h-6',
            'bg-gradient-to-t from-card to-transparent',
          )}
        />
      ) : null}

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
