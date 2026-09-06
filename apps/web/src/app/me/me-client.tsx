'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { Button } from '@devops-platform/ui';
import { ActiveSessions } from '../../components/me/active-sessions';
import { HistoryTabs } from '../../components/me/history-tabs';
import { LearningNow } from '../../components/me/learning-now';

/**
 * Trang "Của tôi" (13.E mục 17-19).
 *
 * ## ⛔ Không `<main>` ở đây — hợp đồng C6bis
 *
 * `components/shell/app-shell.tsx` dựng đúng MỘT `<main id="noi-dung">` bọc mọi
 * route. Trang tự dựng cái thứ hai là hai landmark lồng nhau: sai HTML, và axe
 * của 13.H đỏ `landmark-unique` — một ô AC của lane khác đỏ vì việc của lane
 * này. `landmark-contract.test.ts` quét tĩnh mã nguồn để chặn tái phát.
 *
 * ## Mọi con số tiến độ TÍNH LÚC ĐỌC (mục 19)
 *
 * P8/P10 cấm lưu field suy ra được, và mục 19 kéo luật đó sang FE: trang này
 * KHÔNG giữ state riêng cho bất kỳ con số nào rồi khẳng định từ bản sao đó. Mỗi
 * section đọc payload của lượt query hiện tại và đưa thẳng vào một hàm thuần
 * (`summarizePathProgress`, `summarizeLessonProgress`, `summarizeLabAttempt`,
 * `summarizeQuizAttempt`) — mỗi hàm có test riêng cho đúng những câu chữ nó
 * khẳng định, theo khuôn `summarizeProgress` mà nợ P2 để lại.
 *
 * ## Bố cục: bốn khối, mỗi khối một câu hỏi
 *
 * "tôi đang học gì" → `LearningNow` · "tôi đang chiếm mấy chỗ" → `ActiveSessions`
 * (kết thúc được từ đây) · "tôi đã làm gì" → `HistoryTabs`. Ba khối tách file vì
 * mỗi khối mang query + trạng thái riêng, và gộp lại thì file này vượt xa ngưỡng
 * 200 dòng của `code-conventions.md`.
 */
export function MeClient(): ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Của tôi</h1>
          <p className="text-sm text-muted-foreground">
            Lộ trình đang dở, phiên đang mở, và lịch sử học của bạn.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">Hồ sơ &amp; cài đặt</Link>
        </Button>
      </header>

      <LearningNow />
      <ActiveSessions />
      <HistoryTabs />
    </div>
  );
}
