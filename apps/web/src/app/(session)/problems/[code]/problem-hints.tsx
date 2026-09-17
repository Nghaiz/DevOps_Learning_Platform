'use client';

import type { ReactElement } from 'react';
import { Lock, Lightbulb } from 'lucide-react';
import { t } from '@devops-platform/copy';
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
      <h2 className="text-lg font-semibold text-foreground">{t('catalog.problem.hints-title')}</h2>

      {hints.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('catalog.problem.hints-none')}</p>
      ) : (
        <>
          {/*
            Hai câu, hai khoá: câu thứ hai chỉ có nghĩa khi đã mở ít nhất một
            gợi ý, và gộp chúng thành một khoá sẽ buộc bản đồ chứa một câu nói
            "bạn đã mở 0 gợi ý". Dấu cách nối là dấu nối, không phải chữ.
          */}
          <p className="text-sm text-muted-foreground">
            {t('catalog.problem.hints-cost')}
            {revealed.length > 0 &&
              ` ${t('catalog.problem.hints-spent', { count: revealed.length, points: spent })}`}
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
                  <span className="text-sm font-medium text-foreground">
                    {t('catalog.problem.hint-ordinal', { n: index + 1 })}
                  </span>
                  {hint.revealed ? (
                    <span className="text-xs text-muted-foreground">
                      {t('catalog.problem.hint-revealed', { points: hint.penaltyPoints })}
                    </span>
                  ) : hint.text !== null ? (
                    /*
                     * Đọc được mà CHƯA trả điểm — đường của tác giả và người
                     * duyệt (`toAuthorProblem`). Không vẽ nút mở: bấm nó sẽ ghi
                     * một dòng `problem_hint_reveals` và trừ điểm thật của họ để
                     * đổi lấy một đoạn chữ đang hiện sẵn ngay dưới.
                     */
                    <span className="text-xs text-muted-foreground">
                      {t('catalog.problem.hint-author-preview')}
                    </span>
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
                      {t('catalog.problem.hint-reveal', { points: hint.penaltyPoints })}
                    </Button>
                  )}
                </div>
                {/*
                  Gác bằng `text`, KHÔNG bằng `revealed`: hai trường trả lời hai
                  câu hỏi khác nhau (`core/problem.ts` § `ProblemHintTeaser`), và
                  `revealed` là câu "đã bị trừ điểm chưa". Tác giả có `text` với
                  `revealed: false` và vẫn phải đọc được gợi ý mình vừa viết.
                */}
                {hint.text !== null && (
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
