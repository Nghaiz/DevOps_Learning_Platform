'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Button, Icon, Notice, cn } from '@devops-platform/ds';
import type { ProblemHintTeaser } from '@devops-platform/games';

/**
 * Bảng gợi ý CÓ GIÁ, khác hẳn `hints` miễn phí của `Level`: level thì dạy, còn
 * bài tập thì chấm.
 *
 * Ba ràng buộc, đều đến từ hợp đồng:
 *
 * 1. **Mở từng cái.** Không có nút "mở hết": mỗi lần mở là một quyết định đánh
 *    đổi riêng.
 * 2. **Nói số điểm trừ TRƯỚC khi bấm.** Con số nằm trong nhãn nút, không nấp trong
 *    một hộp thoại hiện ra sau cú bấm đầu.
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
    return <p className="text-sm text-ink-3">{t('problem.oj.hints.none')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[68ch] text-sm text-ink-2">
        {t('problem.oj.hints.cost')}
        {revealed.length > 0 ? ` ${t('problem.oj.hints.spent', { count: revealed.length, points: spent })}` : null}
      </p>

      {errorMessage === null ? null : (
        <Notice tone="bad" role="alert">
          {errorMessage}
        </Notice>
      )}

      <ol aria-label={t('problem.oj.hints.list')} className="flex flex-col border-y border-rule">
        {hints.map((hint, index) => {
          const open = hint.text !== null;
          return (
            <li key={hint.id} className="flex flex-col gap-3 border-b border-rule py-4 last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Icon
                  name={open ? 'lightbulb' : 'lock'}
                  size={20}
                  className={cn('shrink-0', open ? 'text-warn-ink' : 'text-ink-3')}
                />
                <span className="font-display text-md font-semibold text-ink">
                  {t('problem.oj.hints.ordinal', { n: index + 1 })}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-3">
                  {hint.revealed ? (
                    <span className="text-xs text-ink-3">{t('problem.oj.hints.revealed', { points: hint.penaltyPoints })}</span>
                  ) : open ? (
                    /*
                     * Đọc được mà CHƯA trả điểm: đường của tác giả và người duyệt
                     * (`toAuthorProblem`). Không vẽ nút mở: bấm nó sẽ trừ điểm thật
                     * của họ để đổi lấy một đoạn chữ đang hiện sẵn ngay dưới.
                     */
                    <span className="text-xs text-ink-3">{t('problem.oj.hints.author')}</span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="unlock"
                      loading={pendingHintId === hint.id}
                      disabled={pendingHintId !== null}
                      onClick={() => {
                        onReveal(hint.id);
                      }}
                    >
                      {t('problem.oj.hints.reveal', { points: hint.penaltyPoints })}
                    </Button>
                  )}
                </span>
              </div>
              {/*
                Gác bằng `text`, KHÔNG bằng `revealed`: `revealed` là câu "đã bị trừ
                điểm chưa". Tác giả có `text` với `revealed: false` và vẫn phải đọc
                được gợi ý mình vừa viết.
              */}
              {open ? (
                <p className="max-w-[64ch] animate-enter rounded-md bg-warn-wash px-4 py-3 text-sm leading-relaxed text-ink">
                  {hint.text}
                </p>
              ) : (
                <p className="text-xs text-ink-3">{t('problem.oj.hints.locked')}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
