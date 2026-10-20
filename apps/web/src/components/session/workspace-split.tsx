'use client';

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { Pane, PaneGroup, PaneHandle, Segmented, cn, useDefaultLayout, useGroupRef } from '@devops-platform/ds';
import { resolveSplitShape } from './split-shape';

/**
 * Dưới mức này (bề rộng KHUNG CHỨA, không phải cửa sổ) thì xếp chồng.
 *
 * 1024 chứ không còn 900: trang bài học và lab là trang toàn màn, nên khung chứa rộng
 * gần bằng cửa sổ. Ở 900, một cửa sổ 1023px vẫn chia đôi và mỗi khoang chỉ còn ~510px.
 */
export const STACK_BELOW_PX = 1024;
/** Đã xếp chồng thì phải rộng tới mức này mới chia đôi lại (trễ 80px). */
export const UNSTACK_FROM_PX = 1104;
/** Dưới mức này hiện thêm công tắc "Bài | Cả hai | Máy" để phóng to một khoang. */
export const NARROW_BELOW_PX = 768;

/**
 * Bước quyết định có trễ (hysteresis). Không có khoảng trễ, một cửa sổ đứng đúng
 * ngưỡng (kéo mép, thanh cuộn hiện/ẩn) sẽ lật bố cục qua lại liên tục.
 *
 * `prev === null` (chưa đo) đi theo ngưỡng dưới.
 */
export function nextWideEnough(prev: boolean | null, widthPx: number): boolean {
  if (prev === false) return widthPx >= UNSTACK_FROM_PX;
  return widthPx >= STACK_BELOW_PX;
}

/** Khoang được phóng to trên màn hẹp; `both` = chia như thường. */
export type SplitFocus = 'read' | 'both' | 'work';

export interface WorkspaceSplitProps {
  /** Khoang đọc: bên trái khi rộng, bên trên khi hẹp. */
  readonly content: ReactNode;
  /** Khoang làm việc: bên phải khi rộng, bên dưới khi hẹp. */
  readonly side: ReactNode;
  readonly storageKey?: string;
  /** Tỉ lệ khoang đọc khi chia đôi ngang (0..1). */
  readonly defaultRatio?: number;
  /** Khoang phóng to trên màn hẹp. Có thì do trang điều khiển (vd. bấm Chạy thì sang Máy). */
  readonly focus?: SplitFocus;
  readonly onFocusChange?: (focus: SplitFocus) => void;
}

type Shape = 'side-by-side' | 'stacked';

const PANES = ['read', 'work'];

/**
 * Bố cục "nội dung cạnh khoang làm việc" của bài học và lab.
 *
 * ## Hai khoang KHÔNG BAO GIỜ bị gỡ khi đổi bề rộng
 *
 * Chỉ có MỘT cây (`PaneGroup` hai `Pane`), và hẹp hay rộng chỉ đổi hướng chia của nó:
 * rộng thì trái/phải, hẹp thì trên/dưới. Trên màn rất hẹp có thêm công tắc phóng to
 * một khoang; khoang kia thu về 0 nhưng vẫn mounted, terminal vẫn giữ kết nối. Đổi
 * hình dạng là đổi prop và gọi `setLayout`, không đổi cây.
 *
 * Tỉ lệ người học kéo được nhớ riêng cho từng hướng, đọc ngay lượt vẽ đầu
 * (`useDefaultLayout`) nên bố cục không nhảy sau khi tải.
 */
export function WorkspaceSplit({
  content,
  side,
  storageKey = 'dlp-workspace',
  defaultRatio = 0.4,
  focus: focusProp,
  onFocusChange,
}: WorkspaceSplitProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wideEnough, setWideEnough] = useState<boolean | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [focusState, setFocusState] = useState<SplitFocus>('both');
  const focus = focusProp ?? focusState;
  const setFocus = (next: SplitFocus): void => {
    setFocusState(next);
    onFocusChange?.(next);
  };

  useEffect(() => {
    const node = containerRef.current;
    if (node === null) return;
    const measure = (width: number): void => {
      if (width <= 0) return;
      setWideEnough((prev) => nextWideEnough(prev, width));
      setNarrow(width < NARROW_BELOW_PX);
    };
    measure(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) measure(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const shape: Shape = resolveSplitShape(wideEnough);
  // Phóng to chỉ có nghĩa trên màn hẹp; rộng hơn thì luôn chia như thường.
  const zoom: SplitFocus = narrow ? focus : 'both';
  const horizontal = shape === 'side-by-side';

  const groupRef = useGroupRef();
  const wide = useDefaultLayout({ id: `${storageKey}:h`, panelIds: PANES, onlySaveAfterUserInteractions: true });
  const tall = useDefaultLayout({ id: `${storageKey}:v`, panelIds: PANES, onlySaveAfterUserInteractions: true });
  const readPercent = Math.round(defaultRatio * 100);
  const wideLayout = wide.defaultLayout ?? { read: readPercent, work: 100 - readPercent };
  const tallLayout = tall.defaultLayout ?? { read: 42, work: 58 };

  // Đổi hình dạng hay đổi khoang phóng to thì đặt lại tỉ lệ. `defaultLayout` của nhóm
  // chỉ đọc lúc mount, nên lượt đổi về sau phải đi qua API mệnh lệnh.
  const last = useRef<string | null>(null);
  useEffect(() => {
    const group = groupRef.current;
    const token = `${shape}:${zoom}`;
    if (group === null || last.current === token) return;
    const first = last.current === null;
    last.current = token;
    if (zoom === 'read') group.setLayout({ read: 100, work: 0 });
    else if (zoom === 'work') group.setLayout({ read: 0, work: 100 });
    else if (!first) group.setLayout(shape === 'side-by-side' ? wideLayout : tallLayout);
    // `wideLayout`/`tallLayout` là giá trị đã lưu, chỉ cần đọc lúc đổi.
  }, [shape, zoom, groupRef]);

  return (
    <div ref={containerRef} data-split-shape={shape} className="flex h-full min-h-0 w-full flex-col">
      {narrow ? (
        <div className="flex shrink-0 justify-center border-b border-rule bg-paper px-3 py-1.5">
          <Segmented
            size="sm"
            label={t('session.mobile.switch')}
            value={focus}
            onValueChange={setFocus}
            options={[
              { value: 'read', label: t('session.mobile.view.read'), icon: 'book' },
              { value: 'both', label: t('session.mobile.view.both'), icon: 'columns' },
              { value: 'work', label: t('session.mobile.view.work'), icon: 'terminal' },
            ]}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <PaneGroup
          groupRef={groupRef}
          orientation={horizontal ? 'horizontal' : 'vertical'}
          defaultLayout={horizontal ? wideLayout : tallLayout}
          disabled={zoom !== 'both'}
          onLayoutChanged={(layout, meta) => {
            if (zoom !== 'both') return;
            if (shape === 'side-by-side') wide.onLayoutChanged(layout, meta);
            else tall.onLayoutChanged(layout, meta);
          }}
        >
          <Pane id="read" minSize="18%" collapsible collapsedSize={0} className="overflow-hidden">
            {content}
          </Pane>
          <PaneHandle
            orientation={horizontal ? 'horizontal' : 'vertical'}
            label={t('session.workspace.resize')}
            className={cn(zoom !== 'both' && 'pointer-events-none invisible')}
          />
          <Pane id="work" minSize="22%" collapsible collapsedSize={0} className="overflow-hidden">
            {side}
          </Pane>
        </PaneGroup>
      </div>
    </div>
  );
}
