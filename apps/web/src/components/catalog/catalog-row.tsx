import type { ReactElement } from 'react';
import { Check, Lock, Trophy } from 'lucide-react';
import type { ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { t } from '@devops-platform/copy';
import { Difficulty } from '@devops-platform/ui';
import { lineForTopic, type TopicLine } from '../kit';
import { DIFFICULTY_LEVEL, difficultyLabel, progressStatusLabel } from './catalog-labels';

/**
 * Mảnh dùng chung cho một dòng của bảng danh mục. Không có `BoardRow` riêng ở
 * đây: dòng là của kit, file này chỉ nối dữ liệu miền vào các khe của nó.
 */

/** Tuyến màu của một mục nội dung: chủ đề khai trong nội dung thắng, rồi tag, rồi id. */
export function contentLine(item: {
  readonly id: string;
  readonly topic?: string | null | undefined;
  readonly capabilities?: readonly string[];
}): TopicLine {
  return lineForTopic({ topic: item.topic ?? null, tags: item.capabilities ?? [], id: item.id });
}

/** Độ khó: thanh bốn vạch + chữ. Không màu, màu dành cho chủ đề. */
export function RowDifficulty({ level }: { readonly level: ScenarioDifficulty }): ReactElement {
  return <Difficulty level={DIFFICULTY_LEVEL[level]} showLabel label={difficultyLabel(level)} />;
}

/**
 * Trạng thái học của một bài. "Chưa bắt đầu" không in gì: đó là trạng thái của
 * hầu hết các dòng, và in nó ra là lặp một chữ trên cả bảng. Trạng thái lạ in
 * GIÁ TRỊ THÔ, để một giá trị mới từ máy chủ không biến mất trong im lặng.
 */
export function ProgressState({ status }: { readonly status: string }): ReactElement | null {
  if (status === 'not-started') {
    return null;
  }
  const label = progressStatusLabel(status) ?? status;
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 type-label text-success">
        <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
        {label}
      </span>
    );
  }
  if (status === 'in-progress') {
    return <span className="bg-signal px-1.5 py-0.5 type-label text-signal-foreground">{label}</span>;
  }
  return <span className="type-label text-muted-foreground">{label}</span>;
}

/** Cờ "Có xếp hạng" của lab. */
export function LeaderboardFlag(): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 type-label text-muted-foreground">
      <Trophy aria-hidden="true" className="size-3.5" />
      {t('catalog.flag.leaderboard')}
    </span>
  );
}

/** Cờ "Học tuần tự" của lộ trình. */
export function SequentialFlag(): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 type-label text-muted-foreground">
      <Lock aria-hidden="true" className="size-3.5" />
      {t('catalog.flag.sequential')}
    </span>
  );
}
