import type { ReactElement } from 'react';
import { Button } from './button.tsx';

export interface CursorPagerProps {
  /** `false` = đã ở trang cuối (server không còn `nextCursor`) — nút Tiếp disable, KHÔNG ẩn (người dùng cần thấy đã hết). */
  readonly hasNext: boolean;
  readonly onNext: () => void;
  /** Phân trang cursor không có "trang trước" thật — "Về đầu" quay lại cursor rỗng thay vì đi lùi một trang. */
  readonly onReset: () => void;
  readonly page: number;
  readonly loading?: boolean;
}

/**
 * Phân trang kiểu CURSOR (D9 — `phase-13-exec.md` §1) — CHỈ đi tới, không có
 * khái niệm "trang trước" (cursor server không lưu offset lùi). "Về đầu" là
 * nút DUY NHẤT quay lại đầu danh sách; không có "Trước".
 */
export function CursorPager(props: CursorPagerProps): ReactElement {
  const { hasNext, onNext, onReset, page, loading = false } = props;

  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" onClick={onReset} disabled={loading || page <= 1}>
        Về đầu
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        Trang {page}
      </span>
      <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNext} loading={loading}>
        Tiếp
      </Button>
    </div>
  );
}
