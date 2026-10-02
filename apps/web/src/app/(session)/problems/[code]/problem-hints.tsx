'use client';

import type { CSSProperties, ReactElement } from 'react';
import { Lightbulb, Lock } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Alert, AlertDescription, Button, Num } from '@devops-platform/ui';
import type { ProblemHintTeaser } from '@devops-platform/games';

/**
 * Bảng gợi ý CÓ GIÁ, khác hẳn `hints` miễn phí của `Level`: level thì dạy, còn
 * bài tập thì chấm.
 *
 * Ba ràng buộc, đều đến từ hợp đồng:
 *
 * 1. **Mở từng cái.** Không có nút "mở hết": mỗi lần mở là một quyết định đánh
 *    đổi riêng.
 * 2. **Nói giá TRƯỚC khi bấm.** Số điểm trừ đứng ngay trên dòng và nằm trong
 *    nhãn nút, không nấp trong một hộp thoại hiện ra sau cú bấm đầu.
 * 3. **Mở rồi thì không đóng lại được về mặt tính điểm.** Máy chủ ghi lượt mở vào
 *    `problem_hint_reveals`; tải lại trang không xoá dấu vết và cũng không trừ
 *    thêm lần nữa.
 *
 * ⚠ Component KHÔNG giữ bản sao nội dung gợi ý. `revealed` và `text` đều do máy
 * chủ điền qua `byCode`; lượt ghi thất bại thì gợi ý không mở ra và người dùng
 * THẤY điều đó ngay.
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

  if (hints.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('problem.oj.hints.none')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[68ch] text-sm text-muted-foreground">
        {t('problem.oj.hints.cost')}
        {revealed.length > 0 &&
          ` ${t('problem.oj.hints.spent', { count: revealed.length, points: spent })}`}
      </p>

      {errorMessage !== null && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <ol aria-label={t('problem.oj.hints.list')} className="border-y border-border">
        {hints.map((hint, index) => (
          <li
            key={hint.id}
            className="stagger animate-rise border-b border-border py-4 last:border-b-0"
            style={{ '--i': index } as CSSProperties}
          >
            <div className="flex flex-wrap items-center gap-4">
              <span className="w-8 font-mono text-sm text-muted-foreground tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="type-title">{t('problem.oj.hints.ordinal', { n: index + 1 })}</span>
              <span className="ml-auto flex flex-wrap items-center gap-3">
                {hint.revealed ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {t('problem.oj.hints.revealed', { points: hint.penaltyPoints })}
                  </span>
                ) : hint.text !== null ? (
                  /*
                   * Đọc được mà CHƯA trả điểm: đường của tác giả và người duyệt
                   * (`toAuthorProblem`). Không vẽ nút mở: bấm nó sẽ trừ điểm thật
                   * của họ để đổi lấy một đoạn chữ đang hiện sẵn ngay dưới.
                   */
                  <span className="font-mono text-xs text-muted-foreground">
                    {t('problem.oj.hints.author')}
                  </span>
                ) : (
                  <>
                    <Num tone="destructive" className="text-lg">
                      {t('problem.oj.hints.price', { points: hint.penaltyPoints })}
                    </Num>
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
                      {t('problem.oj.hints.reveal', { points: hint.penaltyPoints })}
                    </Button>
                  </>
                )}
              </span>
            </div>
            {/*
              Gác bằng `text`, KHÔNG bằng `revealed`: `revealed` là câu "đã bị trừ
              điểm chưa". Tác giả có `text` với `revealed: false` và vẫn phải đọc
              được gợi ý mình vừa viết.
            */}
            {hint.text !== null ? (
              <p className="mt-3 ml-12 flex max-w-[64ch] animate-reveal-down gap-2 bg-signal/20 px-4 py-3 text-sm leading-relaxed text-foreground">
                <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
                {hint.text}
              </p>
            ) : (
              <p className="mt-2 ml-12 text-xs text-muted-foreground">{t('problem.oj.hints.locked')}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
