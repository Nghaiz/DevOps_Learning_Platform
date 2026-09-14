'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Check, Copy, RotateCcw, Save } from 'lucide-react';
import { Button, cn } from '@devops-platform/ui';
import type { ObjectView } from '@devops-platform/games';
import type { ArenaEdit } from '../arena-contract.ts';
import { refOf } from './inspector-action-list.ts';
import { YamlEditor } from './yaml-editor.tsx';

/** Bao lâu nút giữ trạng thái "Đã chép" trước khi trở lại. */
const COPIED_MS = 2000;

export interface InspectorYamlTabProps {
  readonly object: ObjectView;
  /** YAML engine đang giữ. Đổi mỗi khi tài nguyên đổi thật sự. */
  readonly yaml: string;
  readonly onEdit: ArenaEdit;
}

/**
 * Tab YAML — ĐỌC ĐƯỢC VÀ SỬA ĐƯỢC.
 *
 * Bản trước chỉ hiện một khối `<pre>` kèm nút chép, nên `kubectl edit` — thao
 * tác trung tâm của gần như mọi bài từ chương 2 trở đi — chỉ làm được bằng cách
 * gõ lại cả manifest vào thanh lệnh. Chủ dự án báo thiếu *"edit resource khi
 * inspect nó"*.
 *
 * ## Ba luật của ô soạn thảo này
 *
 * 1. **Không ghi đè thứ người dùng đang gõ.** Engine đập nhịp nhiều lần mỗi
 *    giây và `yaml` được dựng lại theo từng nhịp. Đồng bộ vô điều kiện sẽ xoá
 *    từng ký tự ngay khi vừa gõ. Nên chỉ nạp lại khi người dùng CHƯA sửa gì
 *    (`dirty === false`), hoặc khi chuyển sang một tài nguyên khác.
 * 2. **Lỗi phải NÓI RA.** `dispatch` trả `void` và nuốt mất `ReduceResult.output`,
 *    nên một YAML sai cú pháp trước đây làm nút Lưu không có phản ứng nào cả.
 *    Đường `ArenaEdit` trả lại đúng câu engine nói và ta in nó ra ngay dưới ô.
 * 3. **`kind` và `metadata.name` không đổi được.** Engine từ chối, đúng như API
 *    server thật (`reducer.ts` → `editResource`), và câu từ chối đó hiện ra
 *    nguyên văn thay vì bị dịch lại thành một câu chung chung.
 */
export function InspectorYamlTab({ object, yaml, onEdit }: InspectorYamlTabProps): ReactElement {
  const [draft, setDraft] = useState(yaml);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * MỘT effect cho cả hai luật đồng bộ, và nó phải là một.
   *
   * - Đổi sang tài nguyên KHÁC ⇒ vứt bản nháp cũ vô điều kiện. Giữ lại là mời
   *   người dùng lưu manifest của pod A đè lên pod B; engine sẽ từ chối vì tên
   *   khác, nhưng đó là một cú lừa không cần thiết.
   * - CÙNG tài nguyên ⇒ chỉ bám theo engine khi người dùng CHƯA gõ gì. `yaml`
   *   được dựng lại theo từng nhịp engine, nên đồng bộ vô điều kiện sẽ xoá từng
   *   ký tự ngay khi vừa gõ.
   *
   * So uid qua ref thay vì tách làm hai effect: tách ra thì effect "đổi tài
   * nguyên" buộc phải đọc `yaml` mà không được khai nó là phụ thuộc — tức phải
   * tắt luật lint đi, và repo này không bật luật đó nên dòng tắt ấy chính là
   * một lỗi lint.
   */
  const shownUidRef = useRef(object.uid);
  useEffect(() => {
    if (shownUidRef.current !== object.uid) {
      shownUidRef.current = object.uid;
      setDraft(yaml);
      setDirty(false);
      setMessage(null);
      return;
    }
    if (!dirty) {
      setDraft(yaml);
    }
  }, [object.uid, yaml, dirty]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const copy = (): void => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(draft);
        setCopied(true);
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
      } catch {
        // Clipboard bị chính sách trình duyệt từ chối. Báo "đã chép" khi chưa
        // chép được là nói dối; ném ra thì làm sập cả bảng vì một tiện nghi.
        setCopied(false);
      }
    })();
  };

  const save = (): void => {
    const outcome = onEdit(refOf(object), draft);
    setMessage({
      text:
        outcome.output === ''
          ? outcome.accepted
            ? 'Đã lưu.'
            : 'Engine từ chối thay đổi này.'
          : outcome.output,
      ok: outcome.accepted,
    });
    if (outcome.accepted) {
      setDirty(false);
    }
  };

  const revert = (): void => {
    setDraft(yaml);
    setDirty(false);
    setMessage(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {dirty ? 'Đã sửa — chưa lưu' : 'Khớp với cụm'}
        </span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={copy}>
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {copied ? 'Đã chép' : 'Chép'}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={!dirty} onClick={revert}>
          <RotateCcw aria-hidden className="size-4" />
          Hoàn tác
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={!dirty} onClick={save}>
          <Save aria-hidden className="size-4" />
          Lưu
        </Button>
      </div>

      {/*
        Vẫn là một `<textarea>` THẬT, chỉ thêm một lớp màu nằm dưới nó — xem
        `yaml-editor.tsx`. Ba lý do của bản trước (chép nguyên vẹn, trình đọc màn
        hình đọc tuần tự, không gạch đỏ chính tả) được giữ nguyên vì phần tử soạn
        thảo không hề đổi; chỉ chữ của nó trong suốt và màu do lớp dưới vẽ.

        `whitespace-pre` + cuộn ngang: YAML là nội dung căn cột, và bẻ dòng phá
        đúng cái thẳng hàng làm nó đọc được (`NO_VISIBLE_SCROLLBARS` cấm THANH
        TRƯỢT hiện ra, không cấm khả năng cuộn).
      */}
      <YamlEditor
        value={draft}
        ariaLabel={`YAML của ${object.kind.toLowerCase()}/${object.name}`}
        onChange={(next) => {
          setDraft(next);
          setDirty(true);
          setMessage(null);
        }}
      />

      {message === null ? null : (
        <p
          // `alert` chứ không `status`: câu này là kết quả TRỰC TIẾP của một cú
          // bấm, và người dùng bàn phím phải nghe nó ngay chứ không đợi lượt đọc
          // tiếp theo.
          role="alert"
          className={cn(
            'rounded-md px-2 py-1.5 font-mono text-[11px] break-words',
            message.ok ? 'bg-muted text-muted-foreground' : 'bg-destructive/15 text-destructive',
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
