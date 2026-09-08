'use client';

import type { ReactElement } from 'react';
import { Lock, Lightbulb } from 'lucide-react';
import { Alert, AlertDescription, Button } from '@devops-platform/ui';
import type { ProblemHintTeaser } from '@devops-platform/games';

/**
 * Bảng gợi ý CÓ GIÁ — khác hẳn `hints` miễn phí của `Level`, vì level thì dạy
 * còn bài tập thì chấm.
 *
 * Ba ràng buộc, tất cả đều đến từ hợp đồng:
 *
 * 1. **Mở từng cái.** Không có nút "mở hết" — mỗi lần mở là một quyết định
 *    đánh đổi riêng, gộp lại thành một nút là lấy mất quyền quyết định đó.
 * 2. **Nói giá TRƯỚC khi bấm.** Số điểm trừ nằm ngay trên nhãn nút, không nấp
 *    trong một hộp thoại xác nhận hiện ra sau cú bấm đầu.
 * 3. **Mở rồi thì không đóng lại được về mặt tính điểm.** Máy chủ ghi lượt mở
 *    vào `problem_hint_reveals`, nên tải lại trang KHÔNG xoá dấu vết — và cũng
 *    không trừ thêm lần nữa khi mở lại (khoá chính gộp ba cột).
 *
 * ⚠ Component này KHÔNG giữ bản sao nội dung gợi ý. `revealed` và `text` đều do
 * máy chủ điền qua `byCode`; nếu lượt ghi thất bại thì gợi ý không mở ra và
 * người dùng THẤY điều đó ngay. Giữ một bản sao phía client sẽ che đúng lỗi đó
 * cho tới lần F5 kế tiếp, tức đẩy nó tới lúc khó lần ra nhất.
 */
export function ProblemHints(props: {
  readonly hints: readonly ProblemHintTeaser[];
  readonly onReveal: (hintId: string) => void;
  /** Id gợi ý đang chờ máy chủ trả lời. `null` = không có lượt nào đang chạy. */
  readonly pendingHintId: string | null;
  readonly errorMessage: string | null;
}): ReactElement {
  const { hints, onReveal, pendingHintId, errorMessage } = props;
  // TÍNH tại chỗ dùng, không giữ thành state: hai con số này suy hoàn toàn từ
  // danh sách gợi ý, và một bản sao sẽ lệch ngay lần mở tiếp theo.
  const revealed = hints.filter((hint) => hint.revealed);
  const spent = revealed.reduce((total, hint) => total + hint.penaltyPoints, 0);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">Gợi ý</h2>

      {hints.length === 0 ? (
        <p className="text-sm text-muted-foreground">Bài này không có gợi ý — đề đã nói đủ.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Mở một gợi ý là trừ điểm của lượt làm bài, và không hoàn lại được.
            {revealed.length > 0 && ` Bạn đã mở ${revealed.length} gợi ý, tổng trừ ${spent} điểm.`}
          </p>

          {errorMessage !== null && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <ol className="flex flex-col gap-3">
            {hints.map((hint, index) => (
              <li key={hint.id} className="rounded-lg border border-border bg-card p-4 shadow-elevation-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">Gợi ý {index + 1}</span>
                  {hint.revealed ? (
                    <span className="text-xs text-muted-foreground">Đã mở · trừ {hint.penaltyPoints} điểm</span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={pendingHintId === hint.id}
                      disabled={pendingHintId !== null}
                      iconLeft={<Lock aria-hidden className="size-4" />}
                      onClick={() => {
                        onReveal(hint.id);
                      }}
                    >
                      Mở gợi ý — trừ {hint.penaltyPoints} điểm
                    </Button>
                  )}
                </div>
                {hint.revealed && hint.text !== null && (
                  <p className="mt-3 flex gap-2 text-sm leading-relaxed text-foreground">
                    <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {hint.text}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
