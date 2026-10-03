'use client';

/**
 * Khoá React ỔN ĐỊNH cho một danh sách dòng không có id riêng.
 *
 * ## Vì sao không dùng chỉ số, và cũng không dùng `objective.id`
 *
 * Khoá theo chỉ số làm React tái dùng nhầm DOM khi xoá một dòng ở giữa: con
 * trỏ và vùng đang chọn của dòng bị xoá nhảy sang dòng kế tiếp. Khoá theo
 * `objective.id` còn tệ hơn: người soạn SỬA được trường đó, nên mỗi phím gõ đổi
 * khoá, dòng bị dựng lại, và ô nhập mất focus sau từng ký tự.
 *
 * Khoá ở đây là một chuỗi sinh ra lúc dòng xuất hiện và đi theo dòng đó tới lúc
 * nó bị xoá. Nó KHÔNG vào bản nháp: `GitObjective` đi thẳng vào JSON xuất ra,
 * và một trường chỉ để vẽ giao diện nằm trong tệp level là rác.
 *
 * Khi độ dài danh sách đổi từ BÊN NGOÀI (nhập một level khác), hook cắt bớt
 * hoặc thêm khoá ở cuối. Đó là đủ: mọi ô trong dòng là ô điều khiển, vẽ lại từ
 * dữ liệu, nên khoá chỉ quyết định DOM nào được giữ, không quyết định nội dung.
 */

import { useCallback, useState } from 'react';

let lastRowKey = 0;

function newRowKey(): string {
  lastRowKey += 1;
  return `r${String(lastRowKey)}`;
}

function fit(keys: readonly string[], count: number): readonly string[] {
  if (keys.length === count) return keys;
  if (keys.length > count) return keys.slice(0, count);
  return [...keys, ...Array.from({ length: count - keys.length }, newRowKey)];
}

export interface RowKeys {
  readonly keys: readonly string[];
  /** Gọi CÙNG lúc với lượt thêm dòng vào cuối danh sách. */
  readonly append: () => void;
  /** Gọi CÙNG lúc với lượt xoá dòng `index`. */
  readonly remove: (index: number) => void;
}

export function useRowKeys(count: number): RowKeys {
  const [keys, setKeys] = useState<readonly string[]>(() => fit([], count));

  // Mẫu "chỉnh state ngay trong lúc render" của React: lệch độ dài thì sửa
  // ngay, React vẽ lại trước khi commit nên không có khung hình nào lệch.
  const fitted = fit(keys, count);
  if (fitted !== keys) setKeys(fitted);

  const append = useCallback(() => {
    const key = newRowKey();
    setKeys((current) => [...current, key]);
  }, []);

  const remove = useCallback((index: number) => {
    setKeys((current) => current.filter((_, i) => i !== index));
  }, []);

  return { keys: fitted, append, remove };
}
