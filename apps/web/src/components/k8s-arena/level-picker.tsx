'use client';

/**
 * Màn chọn level.
 *
 * Bản cũ KHÔNG có màn này: `/games/k8s` render thẳng vào một cụm rỗng và người
 * chơi không có đường nào thấy 36 level đang tồn tại. Đó là lý do màn này ra đời
 * chứ không phải để trang trí.
 *
 * Mỗi thẻ chỉ hiện `mission` (một câu, ≤ 20 từ) chứ không hiện `brief`. Toàn bộ
 * điểm của đợt viết lại nội dung là người chơi không phải đọc một khối chữ trước
 * khi chọn — nếu màn chọn lại dán `brief` vào thì công đó đổ sông.
 */

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import type { Level } from '@devops-platform/games';
import { Badge } from '@devops-platform/ui';

export interface LevelPickerProps {
  readonly levels: readonly Level[];
  readonly onPick: (levelId: string) => void;
}

const CHAPTER_LABELS: Readonly<Record<number, string>> = {
  1: 'Nền tảng',
  2: 'Khối lượng công việc',
  3: 'Mạng',
  4: 'Cấu hình và lưu trữ',
  5: 'Vận hành thật',
  6: 'Sự cố',
};

const DIFFICULTY_VARIANT = {
  basic: 'difficulty-basic',
  intermediate: 'difficulty-intermediate',
  advanced: 'difficulty-advanced',
} as const;

const DIFFICULTY_LABEL = {
  basic: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
} as const;

export function LevelPicker({ levels, onPick }: LevelPickerProps): ReactElement {
  const chapters = useMemo(() => groupByChapter(levels), [levels]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Kubernetes Arena</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {levels.length} màn, từ pod đầu tiên tới cụm chạy thật. Chọn một màn để bắt đầu.
        </p>
      </header>

      {chapters.map(([chapter, items]) => (
        <section key={chapter} className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chương {chapter} · {CHAPTER_LABELS[chapter] ?? 'Khác'}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((level) => (
              <li key={level.id}>
                <button
                  type="button"
                  onClick={() => onPick(level.id)}
                  className="h-full w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{level.title}</span>
                    <Badge variant={DIFFICULTY_VARIANT[level.difficulty]}>
                      {DIFFICULTY_LABEL[level.difficulty]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{level.mission}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupByChapter(levels: readonly Level[]): readonly (readonly [number, readonly Level[]])[] {
  const map = new Map<number, Level[]>();
  for (const level of levels) {
    const bucket = map.get(level.chapter);
    if (bucket === undefined) {
      map.set(level.chapter, [level]);
    } else {
      bucket.push(level);
    }
  }
  return [...map.entries()].sort(([a], [b]) => a - b);
}
