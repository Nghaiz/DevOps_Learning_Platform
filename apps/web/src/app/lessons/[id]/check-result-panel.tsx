'use client';

import type { ReactElement } from 'react';
import { CircleCheck, CircleX, Unplug } from 'lucide-react';
import { cn, SCROLL_REGION_FOCUS } from '@devops-platform/ui';

/**
 * Kết quả một lượt chấm.
 *
 * ⛔ BA nhánh, không phải hai. `passed: false` (bài làm chưa đạt) và `error`
 * (phiên hết hạn / gateway hỏng / apiserver trục trặc) PHẢI hiện khác nhau:
 * `lessons.checkStep` cố ý ném lỗi hệ thống thay vì gộp chúng thành
 * `passed: false`, và gộp lại ở tầng hiển thị sẽ vứt bỏ đúng sự phân biệt mà
 * tầng dưới đã giữ — người học bị bảo "chưa đạt" rồi đi sửa một bài vốn đã đúng.
 *
 * ## Vì sao "chưa đạt" nay là ĐỎ, và điều đó KHÔNG xoá sự phân biệt trên
 *
 * Bản trước tô "chưa đạt" bằng `--warning` (vàng) với lý lẽ "đó là kết quả
 * bình thường của một lượt chấm, không phải lỗi hệ thống". Lý lẽ đúng về NGỮ
 * NGHĨA nhưng sai về mục đích của màn hình: người học cần đọc ĐÚNG/SAI trong
 * một cái liếc, và vàng đứng cạnh xanh không đọc ra là "sai" — nó đọc ra là
 * "gần đúng".
 *
 * Sự phân biệt vì vậy chuyển từ MÀU sang HÌNH DẠNG KHỐI, thứ mạnh hơn:
 *   • Đạt / Chưa đạt  → cùng một THẺ KẾT QUẢ (viền trái dày, huy hiệu tròn,
 *     khối output) — hai kết quả của cùng một lượt chấm đã CHẠY.
 *   • Không chấm được → một BĂNG CẢNH BÁO khác hẳn về cấu trúc, có câu nói
 *     thẳng rằng đây không phải bài làm sai, kèm việc phải làm tiếp.
 * Hai thứ đó không nhầm được với nhau kể cả khi in đen trắng.
 *
 * ⚠ Chuỗi mở đầu của cả ba nhánh ("Đạt", "Chưa đạt (exit ", "Không chấm được")
 * bị `e2e/flows/lesson.flow.spec.ts` neo bằng regex `^(...)`. Đổi câu chữ ở
 * đây là làm đỏ luồng e2e — mà nó đỏ vì một lý do đúng: một trong ba nhánh đã
 * biến mất khỏi màn hình.
 */
export type CheckOutcome =
  | { kind: 'running' }
  | { kind: 'result'; passed: boolean; exitCode: number; output: string }
  | { kind: 'error'; message: string };


/**
 * `running` trả `null` — GIỮ NGUYÊN hành vi bản cũ, có chủ ý. Nút chấm đã tự
 * mang trạng thái chờ của nó, nên thêm một khối "đang chấm" ở đây là hai chỉ
 * báo cho cùng một việc; và `e2e/flows/lesson.flow.spec.ts` chờ panel XUẤT
 * HIỆN rồi mới đọc chuỗi, nên một panel hiện sớm ở trạng thái chờ sẽ làm nó
 * đọc trúng khung rỗng.
 */
export function CheckResultPanel({ outcome }: { outcome: CheckOutcome | null }): ReactElement | null {
  if (outcome === null || outcome.kind === 'running') {
    return null;
  }

  /*
   * Nhánh KHÔNG CHẤM ĐƯỢC — một BĂNG, không phải thẻ kết quả.
   *
   * Khác biệt là CẤU TRÚC chứ không phải màu: không viền trái dày, không huy
   * hiệu tròn, không khối output. Người học liếc một cái là thấy nó không cùng
   * họ với hai nhánh kia, kể cả khi in đen trắng hoặc khi không phân biệt được
   * đỏ với xanh. Câu thứ hai nói thẳng đây không phải bài làm sai, vì đó chính
   * là kết luận sai mà người ta sẽ tự rút ra.
   */
  if (outcome.kind === 'error') {
    return (
      <div
        role="alert"
        className="mt-3 flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground"
      >
        <Unplug aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="font-medium">Không chấm được</p>
          <p className="mt-1 text-muted-foreground">
            Đây là trục trặc của hệ thống, không phải bài làm của bạn chưa đạt. {outcome.message}
          </p>
        </div>
      </div>
    );
  }

  /*
   * Hai nhánh ĐÃ CHẠY dùng CHUNG một khung thẻ, chỉ đổi màu và hình huy hiệu.
   * "Chưa đạt" nay là `--destructive` chứ không phải `--warning` như bản cũ:
   * vàng đứng cạnh xanh không đọc ra "sai", nó đọc ra "gần đúng". Sự phân biệt
   * với nhánh lỗi ở trên đã do hình khối gánh, nên màu ở đây được tự do nói
   * đúng-sai cho thẳng.
   */
  const passed = outcome.passed;
  const Icon = passed ? CircleCheck : CircleX;

  return (
    <div
      role="status"
      className={cn(
        'mt-3 rounded-md border border-l-4 p-3 text-sm text-foreground',
        passed ? 'border-status-done/40 border-l-status-done bg-status-done/10' : 'border-destructive/40 border-l-destructive bg-destructive/10',
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <Icon
          aria-hidden
          className={cn('size-4 shrink-0', passed ? 'text-status-done' : 'text-destructive')}
        />
        {passed ? 'Đạt' : `Chưa đạt (exit ${String(outcome.exitCode)})`}
      </p>
      {outcome.output.trim() !== '' && (
        /*
         * `tabIndex` + tên: khối này cuộn được, và một vùng cuộn không vào được
         * bằng bàn phím là lỗi axe mức serious (`scrollable-region-focusable`)
         * — đúng lỗi vừa được vá ở nội dung bài học. `overflow-auto` chứ không
         * bẻ dòng: đây là văn bản terminal, bẻ một bảng `kubectl get` là làm nó
         * không đọc được nữa.
         */
        <pre
          tabIndex={0}
          aria-label="Kết quả lệnh chấm"
          className={cn(
            'mt-2 max-h-48 overflow-auto rounded bg-background/60 p-2 font-mono text-xs',
            SCROLL_REGION_FOCUS,
          )}
        >
          {outcome.output}
        </pre>
      )}
    </div>
  );
}
