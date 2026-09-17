'use client';

/**
 * Ô soạn YAML dưới dạng NGĂN KÉO mép trái (19.D.4.3).
 *
 * Trước 19.D nó là một nửa của lưới `lg:grid-cols-2`, tức nó chiếm nửa màn hình
 * **kể cả khi người chơi đang muốn nhìn đồ thị**. Giờ nó là một lớp phủ: mở ra
 * thì nằm đè lên sân, thu lại thì sân trống hoàn toàn (quyết định #3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THU LẠI = GỠ KHỎI DOM, KHÔNG PHẢI ĐẨY RA NGOÀI MÀN HÌNH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cách "trượt" quen thuộc là giữ ngăn kéo trong DOM rồi `translate-x-[-110%]`.
 * ⛔ Ở đây thì không: bên trong là một `<textarea>`, và một `<textarea>` nằm
 * ngoài khung nhìn **vẫn nhận Tab**. Người dùng bàn phím sẽ tab vào một ô soạn
 * họ không nhìn thấy, gõ, và không hiểu chữ đang đi đâu. Nên thu lại là gỡ hẳn,
 * và phần "trượt" là một lượt chuyển MỘT CHIỀU lúc mở.
 *
 * ⚠ `motion-reduce:transition-none` chứ không bỏ hẳn chuyển động: AC-D10 cấm
 * **chuyển động lặp vô hạn**, không cấm một lượt trượt vào rồi dừng. Nhưng người
 * đã khai `prefers-reduced-motion` thì không phải thương lượng.
 *
 * ⛔ Không dùng thuộc tính `hidden` để giấu: nó là luật của trình duyệt và THUA
 * bất kỳ class `display` nào của tác giả (`.flex` chẳng hạn) — phần tử vẫn hiện
 * và không gì báo. Lỗi này đã cắn dự án này một lần.
 */

import { useEffect, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { cn } from '@devops-platform/ui';

import { YamlEditor } from '../../shared/yaml-editor';
import { CicdHudPanel } from './cicd-hud-panel';

export interface CicdEditorDrawerProps {
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly yaml: string;
  readonly onYaml: (next: string) => void;
  readonly ariaLabel: string;
  readonly errorLines: ReadonlySet<number>;
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Thanh mẫu câu — đứng dưới ô soạn, trong cùng ngăn kéo. */
  readonly footer?: ReactNode;
}

export function CicdEditorDrawer({
  open,
  onOpen,
  onClose,
  yaml,
  onYaml,
  ariaLabel,
  errorLines,
  textareaRef,
  footer,
}: CicdEditorDrawerProps): ReactElement {
  /*
   * `false` ở khung hình đầu rồi `true` ngay sau đó — đó là toàn bộ cơ chế
   * trượt. Không có thư viện chuyển động nào trong repo này (`grep animate-in`
   * trả 0 dòng), và kéo một thư viện vào chỉ để trượt một lần là đổi ~40KB lấy
   * 200ms.
   */
  const [slid, setSlid] = useState(false);
  useEffect(() => {
    if (!open) {
      setSlid(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      setSlid(true);
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [open]);

  if (!open) {
    /*
     * Tay nắm mép trái. Không chỉ để đẹp: nó là đường MỞ LẠI đứng ngay chỗ ngăn
     * kéo vừa biến mất. Công tắc trên thanh trên cũng mở được, nhưng người vừa
     * bấm "đóng" ở góc này sẽ tìm nó ở đây trước.
     */
    return (
      <button
        type="button"
        onClick={onOpen}
        data-testid="cicd-editor-handle"
        className="pointer-events-auto absolute top-1/2 left-0 flex -translate-y-1/2 items-center gap-1 rounded-r-lg border border-l-0 border-border bg-card/95 px-2 py-4 text-xs font-semibold text-muted-foreground shadow-lg backdrop-blur-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <PanelLeftOpen className="size-4" aria-hidden="true" />
        Ô soạn
      </button>
    );
  }

  return (
    <CicdHudPanel
      title="Ô soạn workflow"
      onClose={onClose}
      testId="cicd-panel-editor"
      className={cn(
        'absolute inset-y-3 left-3 w-[min(30rem,42vw)] transition-transform duration-200 motion-reduce:transition-none',
        slid ? 'translate-x-0' : '-translate-x-[110%]',
      )}
      bodyClassName="flex flex-col gap-3 overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <YamlEditor
          value={yaml}
          onChange={onYaml}
          ariaLabel={ariaLabel}
          errorLines={errorLines}
          showLineNumbers
          textareaRef={textareaRef}
        />
      </div>
      {footer}
    </CicdHudPanel>
  );
}
