'use client';

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { SplitPane } from '@devops-platform/ui';
import { resolveSplitShape } from './split-shape';

/**
 * Dưới mức này (bề rộng KHUNG CHỨA, không phải cửa sổ) thì xếp chồng.
 *
 * 1024 chứ không còn 900: trang bài học và lab giờ là trang toàn màn (không
 * sidebar), nên khung chứa rộng gần bằng cửa sổ. Ở 900, một cửa sổ 1023px vẫn
 * chia đôi và mỗi khoang chỉ còn ~510px (e2e responsive "1023px — xếp chồng").
 */
export const STACK_BELOW_PX = 1024;
/** Đã xếp chồng thì phải rộng tới mức này mới chia đôi lại (trễ 80px). */
export const UNSTACK_FROM_PX = 1104;

/**
 * Bước quyết định có trễ (hysteresis). Không có khoảng trễ, một cửa sổ đứng
 * đúng ngưỡng (kéo mép, thanh cuộn hiện/ẩn) sẽ lật bố cục qua lại liên tục.
 *
 * `prev === null` (chưa đo) đi theo ngưỡng dưới.
 */
export function nextWideEnough(prev: boolean | null, widthPx: number): boolean {
  if (prev === false) {
    return widthPx >= UNSTACK_FROM_PX;
  }
  return widthPx >= STACK_BELOW_PX;
}

export interface WorkspaceSplitProps {
  /** Khoang đọc: bên trái khi rộng, bên trên khi hẹp. */
  readonly content: ReactNode;
  /** Khoang làm việc: bên phải khi rộng, bên dưới khi hẹp. */
  readonly side: ReactNode;
  readonly storageKey?: string;
  /** Tỉ lệ khoang đọc khi chia đôi. */
  readonly defaultRatio?: number;
}

/**
 * Bố cục "nội dung cạnh khoang làm việc" của bài học và lab.
 *
 * ## H4: hai khoang KHÔNG BAO GIỜ bị gỡ khi đổi bề rộng
 *
 * Bản trước rẽ hai nhánh JSX theo `matchMedia(min-width: 1024px)`: qua ngưỡng
 * là React gỡ cả terminal lẫn IDE rồi dựng lại, tức đóng WebSocket và nạp nguội
 * Theia lần nữa. Nay chỉ có MỘT cây (`SplitPane`), và hẹp hay rộng chỉ đổi
 * hướng chia của nó: rộng thì trái/phải, hẹp thì trên/dưới.
 *
 * Quyết định theo bề rộng KHUNG CHỨA (ResizeObserver) chứ không theo cửa sổ:
 * thứ cần đủ chỗ là hai khoang, không phải viewport.
 */
export function WorkspaceSplit({ content, side, storageKey, defaultRatio }: WorkspaceSplitProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wideEnough, setWideEnough] = useState<boolean | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (node === null) {
      return;
    }
    const measure = (width: number): void => {
      if (width > 0) setWideEnough((prev) => nextWideEnough(prev, width));
    };
    measure(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) measure(width);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  const stacked = resolveSplitShape(wideEnough) === 'stacked';

  return (
    <div ref={containerRef} data-split-shape={stacked ? 'stacked' : 'side-by-side'} className="h-full min-h-0 w-full">
      <SplitPane
        orientation={stacked ? 'vertical' : 'horizontal'}
        {...(storageKey === undefined ? {} : { storageKey })}
        defaultRatio={stacked ? 0.45 : (defaultRatio ?? 0.42)}
        minRatio={stacked ? 0.15 : 0.25}
        maxRatio={stacked ? 0.85 : 0.7}
        separatorLabel={t('session.workspace.resize')}
        left={content}
        right={side}
      />
    </div>
  );
}
