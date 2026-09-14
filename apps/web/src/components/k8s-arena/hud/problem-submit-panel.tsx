'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Button } from '@devops-platform/ui';
import { ProblemVerdict } from '../../../app/(session)/problems/[code]/problem-verdict';
import type { ProblemSubmitState } from '../use-problem-submit';

/**
 * Bảng nộp bài của chế độ bài tập — chỗ duy nhất trong ứng dụng hiện verdict
 * máy chủ trả về.
 *
 * ⛔ Dùng LẠI `ProblemVerdict`, không vẽ bản thứ hai. Component đó đã ép hai
 * bất biến bằng kiểu — `CE` không in phân số, và nhãn verdict nằm TRONG chữ chứ
 * không phải trong màu nền — và một bản sao ở đây sẽ đánh rơi cả hai mà không
 * có gì đỏ.
 *
 * ⛔ KHÔNG suy verdict từ `engine.status.phase`. Thắng màn nghĩa là đủ mục tiêu
 * BẮT BUỘC; verdict đếm theo MỌI testcase. Hai số lệch nhau ở bài có mục tiêu
 * thưởng, nên vẽ `AC` từ pha thắng là nói với người chơi rằng họ đã giải xong
 * trong khi máy chủ chấm `WA`.
 *
 * ⚠ `pointer-events-auto` là bắt buộc — vỏ ngoài của `ArenaOverlays` đặt
 * `pointer-events-none`, nên không bật lại thì nút "Nộp bài" bấm không được và
 * không có gì cho thấy vì sao.
 */
export function ProblemSubmitPanel({ state }: { readonly state: ProblemSubmitState }): ReactElement {
  return (
    <section
      aria-label={t('catalog.problem.submit-region')}
      /*
       * `aria-live` trên chính vùng này, không phải một vùng thông báo riêng:
       * nội dung đổi TẠI CHỖ (chờ → verdict, hoặc chờ → lỗi), và người dùng
       * trình đọc màn hình vừa bấm "Nộp bài" đang đợi đúng câu trả lời đó.
       */
      aria-live="polite"
      className="pointer-events-auto absolute bottom-4 right-4 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur"
    >
      {state.phase === 'pending' ? (
        <p className="text-sm text-muted-foreground">{t('catalog.problem.submit-pending')}</p>
      ) : null}

      {state.phase === 'error' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-destructive">
            {t('catalog.problem.submit-failed')}
          </p>
          {/*
            Câu của máy chủ, nguyên văn. Thay nó bằng một câu chung là lấy đi
            thứ duy nhất nói được chuyện gì đã xảy ra.
          */}
          <p className="text-sm text-muted-foreground">{state.errorMessage}</p>
          <p className="text-xs text-muted-foreground">{t('catalog.problem.submit-kept')}</p>
          <Button size="sm" variant="outline" onClick={state.submit}>
            {t('common.action.retry')}
          </Button>
        </div>
      ) : null}

      {state.phase === 'done' && state.view !== null ? <ProblemVerdict view={state.view} /> : null}

      {state.phase === 'idle' ? (
        <Button size="sm" onClick={state.submit}>
          {t('catalog.problem.submit-action')}
        </Button>
      ) : null}
    </section>
  );
}
