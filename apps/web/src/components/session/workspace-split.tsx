'use client';

import type { ReactElement, ReactNode } from 'react';
import { SplitPane } from '@devops-platform/ui';
// Import thẳng từng file — xem chú thích cùng vấn đề ở 'terminal-pane.tsx'.
import { TERMINAL_MIN_WIDTH_PX } from '../shell/breakpoints';
import { useMinWidth } from '../shell/use-min-width';
import { resolveSplitShape, resolveStackedBottom } from './split-shape';

/**
 * Bố cục "nội dung cạnh terminal" của trang bài học và trang lab — và cách nó
 * **hạ cấp** dưới `TERMINAL_MIN_WIDTH_PX` (13.B mục 8: "≤768px hạ cấp có chủ ý
 * — đọc nội dung được, terminal hiện cảnh báo thay vì vỡ").
 *
 * ## Vì sao đây là một component, không phải hai nhánh `?:` chép ở hai trang
 *
 * `lesson-client` và `lab-client` cùng cần đúng quyết định này, và bản chép thứ
 * hai là bản sẽ trôi. Hai trang chỉ khai *cái gì* nằm ở mỗi khoang; *khi nào*
 * gập lại là việc của file này.
 *
 * ## Vì sao gập chứ không chỉ đổi khoang phải thành cảnh báo
 *
 * `TerminalPane` đã tự đổi thành `NarrowScreenNotice` khi hẹp. Nếu chỉ có thế
 * thì ở 768px `SplitPane` vẫn chia đôi: nội dung bài học còn ~384px, tức phần
 * mà câu cảnh báo hứa là "vẫn đọc và học được bình thường" lại là phần bị bóp.
 * Nên khoang nội dung phải chiếm trọn bề rộng, và cảnh báo xuống dưới nó —
 * đúng như chính câu chữ của `NarrowScreenNotice` nói ("nội dung phía trên").
 *
 * ## `null` (chưa đo được bề rộng) đi theo nhánh RỘNG
 *
 * Mục tiêu chính là ≥1280px, nên nhánh rộng khớp phần lớn lượt mở: máy hẹp chịu
 * đúng một lần đổi bố cục sau frame đầu, máy rộng thì không bao giờ. Chọn ngược
 * lại là bắt mọi máy desktop nhìn bố cục nhảy một cái ở mỗi lần tải trang.
 */
export interface WorkspaceSplitProps {
  /** Khoang trái khi rộng; chiếm trọn bề rộng khi hẹp. */
  readonly content: ReactNode;
  /** Khoang phải khi rộng. Có thể là một `SplitPane` lồng (bố cục `ide`). */
  readonly side: ReactNode;
  /**
   * Thứ xếp DƯỚI nội dung khi hẹp. Bỏ trống ⇒ dùng `side`.
   *
   * Bố cục `ide` truyền riêng terminal vào đây: khoang editor (Theia trong
   * iframe) không có dạng hẹp nào dùng được, và nạp nguội nó ~20s trên một
   * khung 768px là bắt người dùng chờ một thứ họ không thao tác nổi.
   */
  readonly narrowSide?: ReactNode;
  readonly storageKey?: string;
  readonly defaultRatio?: number;
}

export function WorkspaceSplit({
  content,
  side,
  narrowSide,
  storageKey,
  defaultRatio,
}: WorkspaceSplitProps): ReactElement {
  /*
    16.D.2 — quyết định hình học ra hàm THUẦN (`workspace-split.ts`), giữ đúng
    ranh giới §4 của hợp đồng: file này chỉ VẼ kết quả.

    Đáng kể nhất là `resolveStackedBottom` chứ không phải `resolveSplitShape`:
    bản trước viết `narrowSide ?? side`, mà `??` nuốt mất một lựa chọn hợp lệ —
    `narrowSide={null}` nghĩa là "khi hẹp thì không hiện gì ở dưới", còn
    `undefined` mới là "chưa khai". `null` là một `ReactNode` hợp lệ nên
    TypeScript không kêu, và cái khác biệt ấy im lặng biến mất.
  */
  const wideEnough = useMinWidth(TERMINAL_MIN_WIDTH_PX);

  if (resolveSplitShape(wideEnough) === 'stacked') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
        {/* `shrink-0`: cảnh báo cao cố định, không bị nội dung dài đẩy khỏi
            khung — nó là thứ giải thích vì sao terminal không có mặt, nên nó
            phải nhìn thấy được mà không cần cuộn tới đáy bài. */}
        <div className="shrink-0 border-t border-border">
          {resolveStackedBottom(side, narrowSide)}
        </div>
      </div>
    );
  }

  // ⚠ Spread có điều kiện, không phải `storageKey={storageKey}`. `apps/web` bật
  // `exactOptionalPropertyTypes`, nên với `storageKey?: string` thì truyền
  // tường minh một `undefined` là LỖI KIỂU — "vắng mặt" và "có mặt với giá trị
  // undefined" là hai thứ khác nhau ở cờ đó. Đây là chỗ duy nhất trong bản vá
  // này mà `pnpm --filter web typecheck` bắt được còn `vitest` thì không.
  return (
    <SplitPane
      {...(storageKey === undefined ? {} : { storageKey })}
      {...(defaultRatio === undefined ? {} : { defaultRatio })}
      left={content}
      right={side}
    />
  );
}
