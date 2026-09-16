'use client';

import { useEffect, useRef, type ChangeEvent, type ReactElement } from 'react';
import { cn } from '@devops-platform/ui';
import { tokenizeYaml, type YamlTokenKind } from './yaml-highlight';

/**
 * Ô soạn YAML CÓ TÔ MÀU mà vẫn là một `<textarea>` thật.
 *
 * ## Vì sao nằm ở `components/games/shared/` chứ không trong một game
 *
 * Ra đời trong bảng thông số của game Kubernetes (`k8s-arena/hud/`). Game CI/CD
 * cần đúng ô này (19.E.1) và chuyển sang đây ngày 2026-09-16 thay vì chép một
 * bản thứ hai: kỹ thuật chồng lớp bên dưới có BA bất biến căn lề mà sai cái nào
 * cũng hỏng câm (xem ngay dưới), nên hai bản sẽ trôi khỏi nhau mà không ô nào
 * đỏ — đúng lý lẽ đã đưa `core/yaml.ts` ra khỏi game k8s.
 *
 * File này KHÔNG được biết game nào: không import từ `k8s-arena/`, `git/`,
 * `cicd/`; không tên tài nguyên, không tên nhà cung cấp CI.
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

/**
 * Chép từ `k8s-arena/hud/inspector-frame.tsx` lúc chuyển nhà, KHÔNG import
 * ngược: một file ở `games/shared/` mà kéo một file của game k8s là dựng lại
 * đúng cái ràng buộc vừa gỡ. Đây là một chuỗi lớp Tailwind, không phải logic —
 * hai bản không trôi khỏi nhau được theo cách bất biến căn lề ở trên có thể.
 */
const HIDDEN_SCROLL_BOTH = 'overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export interface YamlEditorProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly ariaLabel: string;
  /**
   * Số dòng **1-based** đang có lỗi — tô nền đỏ nhạt cả dòng (19.E.2).
   *
   * ⚠ Đây là lớp thứ HAI, không phải lớp duy nhất. Nền màu một mình không kể
   * được lỗi cho người không phân biệt màu, cho trình đọc màn hình, hay cho
   * người đang phóng to: tầng gọi PHẢI kèm một danh sách chẩn đoán đọc được
   * (`role="alert"`) nói ra dòng, cột và việc phải sửa. Ô này chỉ giúp mắt tìm
   * nhanh dòng đó sau khi đã đọc câu lỗi.
   *
   * Vắng ⇒ không tô gì, và ô soạn cư xử y như bản của game k8s.
   */
  readonly errorLines?: ReadonlySet<number>;
  /** Hiện máng số dòng bên trái. Tắt mặc định để bảng k8s giữ nguyên hình dạng. */
  readonly showLineNumbers?: boolean;
}

export function YamlEditor({
  value,
  onChange,
  ariaLabel,
  errorLines,
  showLineNumbers = false,
}: YamlEditorProps): ReactElement {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const paintRef = useRef<HTMLPreElement | null>(null);

  const gutterRef = useRef<HTMLPreElement | null>(null);

  const syncScroll = (): void => {
    const area = areaRef.current;
    const paint = paintRef.current;
    if (area === null || paint === null) {
      return;
    }
    paint.scrollTop = area.scrollTop;
    paint.scrollLeft = area.scrollLeft;
    /*
     * Máng số dòng là tầng thứ BA phải đi cùng, và chỉ theo chiều dọc — nó
     * không cuộn ngang, nếu không số dòng sẽ trôi ra khỏi khung khi người chơi
     * cuộn sang phải để đọc một dòng dài.
     */
    const gutter = gutterRef.current;
    if (gutter !== null) {
      gutter.scrollTop = area.scrollTop;
    }
  };

  /*
   * Đồng bộ lại sau khi NỘI DUNG đổi, không chỉ khi người dùng cuộn: gõ thêm
   * một dòng ở cuối làm `<textarea>` tự cuộn xuống mà không bắn `scroll`.
   */
  useEffect(syncScroll, [value]);

  const lines = tokenizeYaml(value);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-md bg-muted">
      {showLineNumbers ? (
        <pre
          ref={gutterRef}
          aria-hidden
          /*
           * `py-2` và `leading-5` phải khớp `SHARED_BOX`, cùng lý do bất biến
           * (1) ở đầu file: lệch một trong hai thì số dòng trôi dần khỏi dòng
           * mà nó đang đánh số, càng xuống dưới càng lệch.
           *
           * Số dòng lấy từ CHÍNH mảng đã tách của lớp màu, không tách lại bằng
           * `value.split('\n')` — hai phép tách sẽ bất đồng ý ở dòng cuối cùng
           * không có ký tự xuống dòng, và lệch đó vô hình cho tới khi nó xảy ra.
           */
          className="m-0 shrink-0 overflow-hidden border-r border-border px-2 py-2 text-right font-mono text-xs leading-5 text-muted-foreground select-none"
        >
          {lines.map((_, index) => (
            <span
              key={index}
              className={cn('block', errorLines?.has(index + 1) === true && 'font-bold text-destructive')}
            >
              {index + 1}
              {'\n'}
            </span>
          ))}
        </pre>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <pre
          ref={paintRef}
          aria-hidden
          className={cn(SHARED_BOX, 'pointer-events-none overflow-hidden text-foreground')}
        >
          {lines.map((tokens, index) => (
            // Chỉ số dòng là khoá ổn định duy nhất ở đây — một dòng YAML không có
            // danh tính nào khác, và hai dòng giống hệt nhau là chuyện thường.
            <span
              key={index}
              className={cn('block', errorLines?.has(index + 1) === true && 'bg-destructive/15')}
            >
              {tokens.length === 0 ? (
                // Dòng rỗng vẫn phải chiếm đúng một dòng, nếu không mọi dòng dưới
                // nó lệch lên một hàng so với `<textarea>`.
                '\n'
              ) : (
                <>
                  {tokens.map((token, position) => (
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
    </div>
  );
}
