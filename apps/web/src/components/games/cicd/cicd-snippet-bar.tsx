'use client';

import { useMemo, type ReactElement, type RefObject } from 'react';
import { Button } from '@devops-platform/ui';

import { cicdSnippets, insertSnippetAt } from './cicd-snippets';

/**
 * Hàng nút chèn mẩu YAML — 19.E.3. Dùng chung cho màn chơi và bàn thử.
 *
 * ## Con trỏ, và vì sao đọc nó TRƯỚC khi bấm
 *
 * Bấm nút làm ô soạn mất focus, nhưng `<textarea>` vẫn giữ `selectionStart` của
 * lần cuối nó có focus — nên đọc vị trí ngay trong trình xử lý click là đọc đúng
 * chỗ người dùng vừa đứng, kể cả người dùng Tab từ ô soạn sang nút.
 *
 * Chưa từng đụng tới ô soạn thì con trỏ nằm CUỐI văn bản: đặc tả HTML đưa con
 * trỏ về cuối mỗi khi `value` của `<textarea>` được gán bằng mã, và React gán
 * đúng như vậy. Nên "chưa đụng tới" tự rơi về hành vi chèn cuối, không cần cờ.
 *
 * ## Focus trả về ô soạn
 *
 * Sau khi chèn, focus quay lại ô soạn với con trỏ đứng cuối mẩu vừa chèn. Không
 * có bước này thì người dùng bàn phím phải Tab ngược lại qua từng nút — AC-E đòi
 * soạn được hoàn toàn bằng bàn phím, và đó là chỗ nó gãy.
 */

export interface CicdSnippetBarProps {
  readonly runnerClassIds: readonly string[];
  readonly editorRef: RefObject<HTMLTextAreaElement | null>;
  readonly value: string;
  readonly onInsert: (next: string) => void;
}

export function CicdSnippetBar({ runnerClassIds, editorRef, value, onInsert }: CicdSnippetBarProps): ReactElement {
  const snippets = useMemo(() => cicdSnippets(runnerClassIds), [runnerClassIds]);

  const chen = (yaml: string): void => {
    const area = editorRef.current;
    const cursor = area === null ? null : area.selectionStart;
    const ket = insertSnippetAt(value, cursor, yaml);
    onInsert(ket.text);
    /*
     * Đợi một khung hình: `value` mới chỉ vào `<textarea>` sau khi React commit,
     * và đặt vùng chọn trên văn bản CŨ sẽ bị trình duyệt kẹp về độ dài cũ.
     */
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (el === null) return;
      el.focus();
      el.setSelectionRange(ket.cursor, ket.cursor);
    });
  };

  return (
    <div role="group" aria-label="Chèn nhanh" className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Chèn nhanh dưới dòng con trỏ
      </h3>
      <div className="flex flex-wrap gap-2">
        {snippets.map((snippet) => (
          <Button
            key={snippet.id}
            variant="outline"
            size="sm"
            title={snippet.explain}
            onClick={() => {
              chen(snippet.yaml);
            }}
          >
            {snippet.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Mẩu chèn xuống dòng ngay dưới chỗ con trỏ đang đứng; sửa tên job cho hợp màn.
      </p>
    </div>
  );
}
