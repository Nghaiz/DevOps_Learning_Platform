'use client';

import { useEffect, useRef, type ChangeEvent, type ReactElement } from 'react';
import { cn } from '@devops-platform/ui';
import { tokenizeYaml, type YamlTokenKind } from '../shared/yaml-highlight';
import { HIDDEN_SCROLL_BOTH } from './inspector-frame.tsx';

/**
 * Ô soạn YAML CÓ TÔ MÀU mà vẫn là một `<textarea>` thật.
 *
 * ## Vì sao chồng lớp, chứ không thay bằng một ô soạn thảo tô màu
 *
 * Bản trước là một `<textarea>` trần, và chú thích ở đó nêu ba lý do rất đúng để
 * không đổi sang một trình soạn thảo tô màu: nội dung phải chép ra nguyên vẹn,
 * trình đọc màn hình phải đọc tuần tự được, và không được để trình duyệt gạch đỏ
 * mọi khoá YAML.
 *
 * Cách này giữ NGUYÊN cả ba, vì nó không thay `<textarea>` đi đâu cả:
 *
 * - `<textarea>` vẫn là phần tử thật, vẫn nhận bàn phím, vẫn là thứ trình đọc
 *   màn hình thấy, vẫn `spellCheck={false}`. Chỉ chữ của nó trong suốt.
 * - Lớp màu là một `<pre aria-hidden>` nằm DƯỚI, không nhận chuột, không nằm
 *   trong cây trợ năng, không chép được — nên không có cách nào chép nhầm nó.
 *
 * Cái giá là hai lớp phải chồng KHÍT nhau. Ba điều kiện, và cả ba đều là lỗi
 * câm nếu sai:
 *
 * 1. **Cùng phông, cùng cỡ, cùng khoảng dòng, cùng padding.** Lệch một trong bốn
 *    thì màu trôi dần khỏi chữ, càng xuống dưới càng lệch.
 * 2. **Cùng luật ngắt dòng** (`whitespace-pre`, không bẻ). Một lớp bẻ dòng còn
 *    lớp kia không là lệch hẳn từ dòng bẻ trở đi.
 * 3. **Cùng vị trí cuộn.** `<textarea>` cuộn thì lớp màu phải cuộn theo cùng số
 *    pixel, trong cùng khung hình.
 *
 * ## Vì sao cuộn được đồng bộ trong `onScroll` chứ không bằng state
 *
 * Đưa `scrollTop` vào state React nghĩa là mỗi dòng cuộn phải đi qua một lượt
 * render — lớp màu tụt lại sau con trỏ một khung hình, và ở tốc độ cuộn bình
 * thường mắt thấy rõ nó trượt. Ghi thẳng vào DOM thì hai lớp đi cùng nhau.
 */

/**
 * Loại mẩu → lớp màu.
 *
 * Dùng token ngữ nghĩa của hệ thiết kế, KHÔNG dùng hex: `check-design-tokens.mjs`
 * chặn màu cứng, và quan trọng hơn — bảng này phải đổi theo theme sáng/tối cùng
 * với phần còn lại của bảng thông số.
 */
const TOKEN_CLASS: Readonly<Record<YamlTokenKind, string>> = {
  key: 'text-status-progress',
  string: 'text-success',
  number: 'text-warning',
  boolean: 'text-warning',
  null: 'text-muted-foreground',
  comment: 'text-muted-foreground italic',
  punctuation: 'text-muted-foreground',
  plain: 'text-foreground',
};

/**
 * Lớp bố cục dùng CHUNG cho cả hai tầng.
 *
 * Một hằng chứ không hai chuỗi giống nhau: điều kiện (1) và (2) ở trên chỉ đúng
 * chừng nào hai tầng đọc CÙNG một chuỗi lớp. Chép thành hai bản là mời một lần
 * sửa chỉ chạm một bản.
 */
const SHARED_BOX =
  'absolute inset-0 m-0 rounded-md p-2 font-mono text-xs leading-5 whitespace-pre border-0';

export interface YamlEditorProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly ariaLabel: string;
}

export function YamlEditor({ value, onChange, ariaLabel }: YamlEditorProps): ReactElement {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const paintRef = useRef<HTMLPreElement | null>(null);

  const syncScroll = (): void => {
    const area = areaRef.current;
    const paint = paintRef.current;
    if (area === null || paint === null) {
      return;
    }
    paint.scrollTop = area.scrollTop;
    paint.scrollLeft = area.scrollLeft;
  };

  /*
   * Đồng bộ lại sau khi NỘI DUNG đổi, không chỉ khi người dùng cuộn: gõ thêm
   * một dòng ở cuối làm `<textarea>` tự cuộn xuống mà không bắn `scroll`.
   */
  useEffect(syncScroll, [value]);

  const lines = tokenizeYaml(value);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-muted">
      <pre
        ref={paintRef}
        aria-hidden
        className={cn(SHARED_BOX, 'pointer-events-none overflow-hidden text-foreground')}
      >
        {lines.map((tokens, index) => (
          // Chỉ số dòng là khoá ổn định duy nhất ở đây — một dòng YAML không có
          // danh tính nào khác, và hai dòng giống hệt nhau là chuyện thường.
          // eslint-disable-next-line react/no-array-index-key
          <span key={index} className="block">
            {tokens.length === 0 ? (
              // Dòng rỗng vẫn phải chiếm đúng một dòng, nếu không mọi dòng dưới
              // nó lệch lên một hàng so với `<textarea>`.
              '\n'
            ) : (
              <>
                {tokens.map((token, position) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <span key={position} className={TOKEN_CLASS[token.kind]}>
                    {token.text}
                  </span>
                ))}
                {'\n'}
              </>
            )}
          </span>
        ))}
      </pre>

      <textarea
        ref={areaRef}
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-label={ariaLabel}
        className={cn(
          SHARED_BOX,
          'resize-none bg-transparent text-transparent caret-foreground',
          // Vùng chọn phải còn thấy được dù chữ trong suốt — nếu không, bôi đen
          // một đoạn trông như không có gì xảy ra.
          'selection:bg-primary/35 selection:text-transparent',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          HIDDEN_SCROLL_BOTH,
        )}
      />
    </div>
  );
}
