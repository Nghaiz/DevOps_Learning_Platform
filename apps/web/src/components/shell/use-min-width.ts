'use client';

import { useEffect, useState } from 'react';

/**
 * Khung nhìn có đạt `minWidthPx` không.
 *
 * Trả **`null` cho tới khi đo được** — đây là điểm quan trọng, không phải sự
 * cẩu thả: server không có `window`, nên bất kỳ giá trị boolean nào ở lần render
 * đầu cũng là một phỏng đoán, và phỏng đoán sai làm React báo hydration
 * mismatch trên đúng những màn hình ta muốn phục vụ tử tế nhất. `null` = "chưa
 * biết"; nơi gọi tự quyết định hiện gì trong khoảnh khắc đó (thường là khung
 * chờ, KHÔNG phải terminal).
 */
export function useMinWidth(minWidthPx: number): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(`(min-width: ${String(minWidthPx)}px)`);
    setMatches(mql.matches);
    const onChange = (): void => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [minWidthPx]);

  return matches;
}
