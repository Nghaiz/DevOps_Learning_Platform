'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  GameId,
  ProblemDifficulty,
  ProblemOrderKey,
  ProblemTopic,
  ProblemViewerStatus,
} from '@devops-platform/games';
import { FIRST_PAGE, currentCursor, pageNumber, pushCursor, type CursorStack } from '../../../lib/cursor-stack';
import {
  hasActiveFilter,
  normalizeTag,
  parseProblemQuery,
  toSearchParams,
  type ProblemQuery,
} from './problem-query';

export interface ProblemControls {
  readonly query: ProblemQuery;
  readonly cursor: string | undefined;
  readonly page: number;
  readonly hasActiveFilter: boolean;
  readonly setGame: (value: GameId) => void;
  readonly toggleDifficulty: (value: ProblemDifficulty) => void;
  readonly toggleTopic: (value: ProblemTopic) => void;
  readonly toggleViewerStatus: (value: ProblemViewerStatus) => void;
  readonly addTag: (raw: string) => void;
  readonly removeTag: (tag: string) => void;
  readonly setSearch: (raw: string) => void;
  readonly setOrderBy: (value: ProblemOrderKey) => void;
  readonly setDirection: (value: 'asc' | 'desc') => void;
  readonly clearFilters: () => void;
  readonly goNext: (nextCursor: string | null) => void;
  readonly goFirst: () => void;
}

/** Bật/tắt một giá trị trong danh sách lọc. Danh sách rỗng tự biến mất khỏi URL lúc mã hoá. */
function toggleIn<T extends string>(current: readonly T[] | undefined, value: T): readonly T[] {
  const list = current ?? [];
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * Trạng thái của `/problems`: bộ lọc + thứ tự nằm trong URL, con trỏ nằm trong
 * bộ nhớ. Lý do cho cả hai nửa nằm ở đầu `problem-query.ts`.
 *
 * ⛔ Đổi BẤT KỲ chiều lọc hay thứ tự nào đều phải trả con trỏ về đầu. Con trỏ
 * keyset là một điểm neo TRONG một tập kết quả đã sắp; giữ nó qua một lần đổi
 * bộ lọc vẫn cho một trang hợp lệ (`WHERE code > cursor AND difficulty = …`)
 * nhưng đó là trang giữa của tập MỚI, hiện dưới nhãn "Trang 1". Ở đây việc
 * reset là TỰ ĐỘNG chứ không phải nhớ gọi ở từng hàm: mỗi lần chuỗi truy vấn
 * đổi, ngăn xếp bị dựng lại — nên một chiều lọc thêm sau này không thể quên
 * reset.
 *
 * Khác `/labs` một điểm có chủ ý: ở đó đổi thứ tự KHÔNG reset vì việc sắp diễn
 * ra hoàn toàn ở client trên đúng trang đang có. Ở đây thứ tự do MÁY CHỦ làm
 * (nó là một nửa của khoá keyset), nên đổi thứ tự là đổi tập trang — phải reset.
 */
export function useProblemControls(): ProblemControls {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const query = useMemo(() => parseProblemQuery(new URLSearchParams(search)), [search]);

  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const [anchoredTo, setAnchoredTo] = useState(search);
  if (anchoredTo !== search) {
    // Điều chỉnh state ngay trong lượt render (mẫu chính thức của React cho
    // state suy ra từ props) thay vì `useEffect`: một effect sẽ để lượt render
    // đầu tiên sau khi đổi bộ lọc chạy với con trỏ CŨ, tức một lượt gọi mạng
    // thừa và sai trước khi effect kịp sửa.
    setAnchoredTo(search);
    setStack(FIRST_PAGE);
  }

  const write = useCallback(
    (next: ProblemQuery, mode: 'push' | 'replace'): void => {
      const params = toSearchParams(next).toString();
      const href = params === '' ? pathname : `${pathname}?${params}`;
      // `scroll: false` — đổi một ô lọc không phải là điều hướng sang trang
      // khác; nhảy về đầu trang làm mất chỗ người dùng đang nhìn trong bảng.
      router[mode](href, { scroll: false });
    },
    [pathname, router],
  );

  const patch = useCallback(
    (filter: ProblemQuery['filter'], mode: 'push' | 'replace' = 'push'): void => {
      write({ ...query, filter }, mode);
    },
    [query, write],
  );

  return {
    query,
    cursor: currentCursor(stack),
    page: pageNumber(stack),
    hasActiveFilter: hasActiveFilter(query.filter),

    /*
      Đổi game XOÁ LUÔN chủ đề đang chọn, và đó là việc cố ý chứ không phải dọn
      dẹp thừa.

      Không xoá thì `parseProblemQuery` vẫn lọc bỏ chúng lúc đọc lại (chúng
      không thuộc từ vựng game mới), nên kết quả nhìn thấy giống hệt — nhưng nó
      đến từ một tác dụng phụ của phép PHÂN TÍCH URL. Xoá tường minh ở đây làm
      hai việc mà tác dụng phụ kia không làm: URL ghi ra không bao giờ chứa một
      chủ đề sẽ bị vứt ở lượt đọc kế tiếp, và người sửa sau đọc được rằng "đổi
      từ vựng thì bỏ lựa chọn cũ" là một luật, không phải một sự tình cờ.

      Các chiều lọc khác (độ khó, tag, trạng thái, ô tìm) GIỮ NGUYÊN: chúng
      không phụ thuộc game, và lấy đi một thứ người dùng không xin bỏ là chuyện
      `clearFilters` đã cố tránh với `orderBy`.
    */
    setGame: useCallback(
      (value: GameId) => {
        if (value === query.game) {
          return;
        }
        const { topics: _dropped, ...rest } = query.filter;
        write({ ...query, game: value, filter: rest }, 'push');
      },
      [query, write],
    ),
    toggleDifficulty: useCallback(
      (value: ProblemDifficulty) => patch({ ...query.filter, difficulty: toggleIn(query.filter.difficulty, value) }),
      [patch, query.filter],
    ),
    toggleTopic: useCallback(
      (value: ProblemTopic) => patch({ ...query.filter, topics: toggleIn(query.filter.topics, value) }),
      [patch, query.filter],
    ),
    toggleViewerStatus: useCallback(
      (value: ProblemViewerStatus) =>
        patch({ ...query.filter, viewerStatus: toggleIn(query.filter.viewerStatus, value) }),
      [patch, query.filter],
    ),
    addTag: useCallback(
      (raw: string) => {
        const tag = normalizeTag(raw);
        const current = query.filter.tags ?? [];
        if (tag === '' || current.includes(tag)) {
          return;
        }
        patch({ ...query.filter, tags: [...current, tag] });
      },
      [patch, query.filter],
    ),
    removeTag: useCallback(
      (tag: string) => patch({ ...query.filter, tags: (query.filter.tags ?? []).filter((item) => item !== tag) }),
      [patch, query.filter],
    ),
    setSearch: useCallback(
      (raw: string) => {
        const next = raw.trim();
        if (next === (query.filter.query ?? '')) {
          return;
        }
        patch({ ...query.filter, query: next });
      },
      [patch, query.filter],
    ),
    setOrderBy: useCallback((value: ProblemOrderKey) => write({ ...query, orderBy: value }, 'push'), [query, write]),
    setDirection: useCallback(
      (value: 'asc' | 'desc') => write({ ...query, direction: value }, 'push'),
      [query, write],
    ),
    // Xoá bộ lọc GIỮ nguyên thứ tự đang chọn: thứ tự không phải một điều kiện
    // lọc, và ép người dùng chọn lại nó là lấy đi một thứ họ không xin bỏ.
    clearFilters: useCallback(() => write({ ...query, filter: {} }, 'push'), [query, write]),

    goNext: useCallback((nextCursor: string | null) => setStack((prev) => pushCursor(prev, nextCursor)), []),
    goFirst: useCallback(() => setStack(FIRST_PAGE), []),
  };
}
