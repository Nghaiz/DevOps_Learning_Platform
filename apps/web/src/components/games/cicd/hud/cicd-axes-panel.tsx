'use client';

/**
 * Bảng ba trục — lớp phủ góc, **thường trực** (19.D.4.7).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA SỐ HIỆN CÙNG LÚC. ĐÂY LÀ HỢP ĐỒNG 19.E.4, KHÔNG PHẢI MỘT LỰA CHỌN BỐ CỤC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ Không tab, không nút "xem thêm", không accordion. Cả điểm của ba trục là
 * chúng **đánh đổi lẫn nhau**: rút lead time bằng cách thêm máy thì runner-phút
 * tăng, và người chơi chỉ học được điều đó khi thấy cả ba con số nhúc nhích
 * TRONG CÙNG MỘT CÁI LIẾC. Giấu một trục sau một cú bấm là dạy đúng bài học
 * ngược — `contract.ts` §6 nói thẳng điều này, và ô e2e đo nó bằng
 * `CICD_SCENE_TESTIDS.axesPanel`.
 *
 * Chưa chạy lượt nào thì ba ô vẫn có mặt với dấu gạch: chỗ đứng của ba con số
 * là một phần của bài học, và một bảng mọc ra sau lượt chạy đầu tiên làm bố cục
 * nhảy đúng lúc người chơi đang nhìn kết quả.
 *
 * ⛔ Ba số 0 KHÔNG được dùng thay cho "chưa có". `cicd-run.ts` tách bốn nhánh
 * lỗi ra khỏi `scored` đúng vì `0 giây / 0 runner-phút` đọc ra thành "cực nhanh,
 * chẳng tốn gì" — một lời nói dối ngay lúc người chơi cần biết đồ thị của họ
 * hỏng.
 */

import type { ReactElement } from 'react';
import { cn } from '@devops-platform/ui';

import { CICD_SCENE_TESTIDS } from '../scene-props';
import { formatNumber, formatPercent, formatSeconds, type CicdRunOutcome } from '../cicd-run';

export interface CicdAxesPanelProps {
  readonly outcome: CicdRunOutcome | null;
  readonly className?: string;
}

interface AxisCell {
  readonly mark: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string;
}

/** Câu một dòng nói vì sao chưa có số, theo ĐÚNG nhánh outcome. */
function statusLine(outcome: CicdRunOutcome | null): string | null {
  if (outcome === null) return 'Chưa chạy lượt nào.';
  switch (outcome.kind) {
    case 'scored':
      return null;
    case 'parse-error':
      return 'YAML chưa quét được — chưa có gì để chấm.';
    case 'empty':
      return 'Chưa có job nào để chạy.';
    case 'shape-error':
      return 'Job không khớp màn — chưa chấm.';
    case 'engine-error':
      return 'Đồ thị không chạy được — chưa có lượt nào để chiếu ra ba trục.';
    case 'cd-error':
      return 'Chính sách CD không hợp lệ.';
  }
}

export function CicdAxesPanel({ outcome, className }: CicdAxesPanelProps): ReactElement {
  const scored = outcome !== null && outcome.kind === 'scored' ? outcome : null;
  const note = statusLine(outcome);

  const cells: readonly AxisCell[] = [
    {
      mark: '①',
      label: 'Lead time',
      value: scored === null ? '—' : formatSeconds(scored.axes.leadTimeSeconds),
      unit: 'p50 một commit',
    },
    {
      mark: '②',
      label: 'Thông lượng',
      value: scored === null ? '—' : formatNumber(scored.axes.throughputPerHour),
      unit: 'commit mỗi giờ',
    },
    {
      mark: '③',
      label: 'Runner-phút',
      value: scored === null ? '—' : formatNumber(scored.axes.runnerMinutes),
      unit: 'mỗi lượt mô phỏng',
    },
  ];

  return (
    <section
      data-testid={CICD_SCENE_TESTIDS.axesPanel}
      aria-label="Ba trục điểm"
      className={cn(
        'pointer-events-auto rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-stretch gap-x-4 gap-y-2">
        {cells.map((cell) => (
          <div key={cell.mark} className="flex min-w-24 flex-col">
            <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {cell.mark} {cell.label}
            </span>
            <span className="font-mono text-base leading-tight font-semibold text-foreground">
              {cell.value}
            </span>
            <span className="text-[0.65rem] text-muted-foreground">{cell.unit}</span>
          </div>
        ))}
      </div>

      {/*
       * Tỷ lệ xanh đứng TÁCH khỏi ba trục, không thành ô thứ tư: nó là ngưỡng
       * đạt/trượt (`CicdThresholds.minGreenRate`), không phải một đại lượng để
       * tối ưu. Gộp vào là mời người chơi đánh đổi độ tin cậy lấy tốc độ.
       */}
      {scored === null ? (
        <p className="mt-1 text-[0.65rem] text-muted-foreground">{note}</p>
      ) : (
        <p className="mt-1 text-[0.65rem] text-muted-foreground">
          Tỷ lệ lượt xanh: {formatPercent(scored.axes.greenRate)}
        </p>
      )}
    </section>
  );
}
