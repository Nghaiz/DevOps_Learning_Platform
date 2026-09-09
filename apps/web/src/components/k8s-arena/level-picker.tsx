'use client';

/**
 * Màn chọn level — một TUYẾN ĐƯỜNG, không phải một lưới thẻ.
 *
 * Bản cũ KHÔNG có màn này: `/games/k8s` render thẳng vào một cụm rỗng và người
 * chơi không có đường nào thấy 36 level đang tồn tại. Đó là lý do màn này ra đời.
 *
 * ## Vì sao không còn là lưới thẻ
 *
 * Chỉ đạo của chủ dự án: *"không trình bày dưới dạng thẻ như này"*. Và lưới thẻ
 * sai với chính nội dung: 36 màn này là một CHUỖI có thứ tự — màn 13 nhắc lại
 * đúng cái bẫy màn 12 vừa dạy, màn 30 đòi người chơi phân biệt hai lỗi mà 13 và
 * 28 dạy riêng lẻ. Một lưới ba cột nói rằng chúng ngang hàng và chọn cái nào
 * cũng được; một tuyến dọc có đánh số nói đúng thứ tự có thật.
 *
 * ## Vì sao chip, không phải câu mô tả
 *
 * *"các dòng mô tả đi kèm đề bài cũng thừa thãi, thay bằng cái gì đó khác đi"*.
 * Xem `level-chips.ts` — mọi chip đều dẫn xuất từ chính `Level`, không có bảng
 * viết tay nào để lệch.
 *
 * ## Ba trạng thái, phân biệt bằng HAI kênh
 *
 * Xong / đang làm / chưa mở đều có màu RIÊNG và hình dạng RIÊNG (dấu tích, vòng
 * tròn nửa, số thứ tự). Chỉ đổi màu là ba trạng thái mà người mù màu đọc thành
 * một — và đây đúng là thứ chủ dự án hỏi: *"cần phải có sự khác biệt giữa những
 * bài đã hoàn thiện hoặc chưa làm"*.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Check, Clock, Play, Terminal } from 'lucide-react';
import type { Level } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { levelChips } from './level-chips';
import { readProgress, type ProgressMap } from './level-progress';
import { RESOURCE_ICON } from './hud/resource-icon';
import { RESOURCE_COLOR } from './shared/resource-identity';

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

/** Một câu cho mỗi chương — nói chương này dạy NĂNG LỰC gì, không kể lại nội dung. */
const CHAPTER_BLURB: Readonly<Record<number, string>> = {
  1: 'Tạo, đọc trạng thái, và đọc log. Ba việc bạn sẽ làm mỗi ngày.',
  2: 'Giao việc cho controller, rồi cứu chúng khi rollout hỏng.',
  3: 'Service, Ingress, DNS — và ba kiểu "gọi mà không ai trả lời".',
  4: 'Tách cấu hình và bí mật ra khỏi image, gắn ổ đĩa bền.',
  5: 'Scheduler, hạn mức, và lý do một pod mãi không được xếp lịch.',
  6: 'Probe, NetworkPolicy, RBAC, HPA — chẩn đoán trên cụm gần thật.',
};

const DIFFICULTY_LABEL = {
  basic: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
} as const;

const DIFFICULTY_DOTS = { basic: 1, intermediate: 2, advanced: 3 } as const;

export function LevelPicker({ levels, onPick }: LevelPickerProps): ReactElement {
  const chapters = useMemo(() => groupByChapter(levels), [levels]);

  /*
   * Tiến độ đọc trong `useEffect`, không đọc lúc render.
   *
   * `localStorage` không tồn tại khi Next dựng HTML trên máy chủ, và đọc nó
   * trong thân component sẽ làm lần render đầu ở máy khách khác lần render trên
   * máy chủ — một lỗi hydrate. Bắt đầu bằng "chưa biết gì" rồi điền vào sau là
   * đường duy nhất đúng ở đây.
   */
  const [progress, setProgress] = useState<ProgressMap>({});
  useEffect(() => {
    setProgress(readProgress());
  }, []);

  const done = levels.filter((level) => progress[level.id]?.completed === true).length;
  const next = levels.find((level) => progress[level.id]?.completed !== true) ?? null;

  return (
    /*
     * `dark arena-root`: màn chọn màn phải cùng tông với chính arena.
     *
     * Trước đây nó thừa hưởng theme SÁNG của nền tảng học, nên người chơi bấm
     * một màn và bị ném từ một trang trắng vào một cụm 3D nền đen — một cú chớp
     * chói mắt ngay giữa hai màn hình thuộc cùng một trò chơi. `arena.css` đã
     * khai một lớp bề mặt riêng cho arena với chú thích "phần còn lại của nền
     * tảng giữ nguyên theme của nó"; màn chọn màn thuộc về arena, không thuộc
     * về phần còn lại đó.
     */
    <div className="dark arena-root min-h-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <header className="mb-8">
          <p className="font-mono text-xs font-semibold tracking-[0.2em] text-status-progress">
            KUBERNETES ARENA
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Cụm hỏng. Bạn là người trực.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {levels.length} tình huống có thật, dựng lại trong trình duyệt. Gõ `kubectl` thật, nhìn
            cụm phản ứng thật, và tự tìm ra chỗ hỏng.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <ProgressRing done={done} total={levels.length} />
            {next === null ? (
              <p className="text-sm text-success">Bạn đã qua hết {levels.length} màn.</p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onPick(next.id);
                }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg bg-status-progress/15 px-4 py-2',
                  'text-sm font-medium text-status-progress ring-1 ring-status-progress/40',
                  'transition-colors hover:bg-status-progress/25',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                )}
              >
                <Play aria-hidden className="size-4" />
                {done === 0 ? 'Bắt đầu' : 'Tiếp tục'}: {next.title}
              </button>
            )}
          </div>
        </header>

        {chapters.map(([chapter, items], chapterIndex) => {
          const chapterDone = items.filter((l) => progress[l.id]?.completed === true).length;
          return (
            <section key={chapter} className="mb-10">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-sm font-semibold text-foreground">
                  <span className="font-mono text-muted-foreground">
                    {String(chapter).padStart(2, '0')}
                  </span>{' '}
                  {CHAPTER_LABELS[chapter] ?? 'Khác'}
                </h2>
                <span
                  className={cn(
                    'font-mono text-xs',
                    chapterDone === items.length ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  {chapterDone}/{items.length}
                </span>
                <p className="w-full text-xs text-muted-foreground">
                  {CHAPTER_BLURB[chapter] ?? ''}
                </p>
              </div>

              <ol className="relative">
                {/*
                Trục dọc nối các màn — thứ làm nó đọc ra là một TUYẾN chứ không
                phải một danh sách rời. Dừng trước mục cuối để đường không thò ra.
              */}
                <span
                  aria-hidden
                  className="absolute top-6 bottom-6 left-[1.125rem] w-px bg-border"
                />
                {items.map((level, index) => (
                  <LevelRow
                    key={level.id}
                    level={level}
                    order={levelOrder(chapters, chapterIndex, index)}
                    state={
                      progress[level.id]?.completed === true
                        ? 'done'
                        : progress[level.id] === undefined
                          ? 'new'
                          : 'playing'
                    }
                    onPick={onPick}
                  />
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Số thứ tự CHUNG toàn game, không phải số trong chương. */
function levelOrder(
  chapters: readonly (readonly [number, readonly Level[]])[],
  chapterIndex: number,
  index: number,
): number {
  let before = 0;
  for (let i = 0; i < chapterIndex; i += 1) {
    before += chapters[i]?.[1].length ?? 0;
  }
  return before + index + 1;
}

type RowState = 'done' | 'playing' | 'new';

function LevelRow({
  level,
  order,
  state,
  onPick,
}: {
  readonly level: Level;
  readonly order: number;
  readonly state: RowState;
  readonly onPick: (levelId: string) => void;
}): ReactElement {
  const chips = levelChips(level);

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onPick(level.id);
        }}
        className={cn(
          'group relative flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left',
          'transition-colors hover:bg-accent/40',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        )}
      >
        <Marker order={order} state={state} />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={cn(
                'text-sm font-medium',
                state === 'done' ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {level.title}
            </span>
            {state === 'playing' ? (
              <span className="rounded-full bg-warning/15 px-1.5 py-px font-mono text-[10px] text-warning">
                dở dang
              </span>
            ) : null}
          </span>

          {/* Chip THAY dòng mô tả — xem `level-chips.ts`. */}
          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {chips.kinds.map((kind) => (
              <KindChip key={kind} kind={kind} />
            ))}
            {chips.command === null ? null : (
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <Terminal aria-hidden className="size-3" />
                {chips.command}
              </span>
            )}
            <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Clock aria-hidden className="size-3" />~{chips.minutes} phút
            </span>
            <Difficulty level={level.difficulty} />
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Dấu đầu dòng: vừa là số thứ tự, vừa là trạng thái.
 *
 * Ba trạng thái ba HÌNH DẠNG (dấu tích / vòng có chấm / số trần), không chỉ ba
 * màu — xem khối tài liệu đầu file.
 */
function Marker({
  order,
  state,
}: {
  readonly order: number;
  readonly state: RowState;
}): ReactElement {
  return (
    <span
      aria-hidden
      className={cn(
        'relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
        'font-mono text-[11px] font-semibold ring-4 ring-background transition-colors',
        state === 'done' && 'bg-success/20 text-success',
        state === 'playing' && 'bg-warning/20 text-warning',
        state === 'new' && 'bg-muted text-muted-foreground group-hover:bg-accent',
      )}
    >
      {state === 'done' ? (
        <Check className="size-4" />
      ) : state === 'playing' ? (
        <span className="size-2 rounded-full bg-warning" />
      ) : (
        String(order).padStart(2, '0')
      )}
    </span>
  );
}

function KindChip({ kind }: { readonly kind: string }): ReactElement {
  const Icon = RESOURCE_ICON[kind as keyof typeof RESOURCE_ICON];
  const color = RESOURCE_COLOR[kind as keyof typeof RESOURCE_COLOR];
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      {Icon === undefined ? null : (
        <Icon
          aria-hidden
          className="size-3.5"
          style={color === undefined ? undefined : { color }}
        />
      )}
      {kind}
    </span>
  );
}

function Difficulty({ level }: { readonly level: keyof typeof DIFFICULTY_LABEL }): ReactElement {
  const filled = DIFFICULTY_DOTS[level];
  return (
    <span className="flex items-center gap-1" title={DIFFICULTY_LABEL[level]}>
      <span className="sr-only">{DIFFICULTY_LABEL[level]}</span>
      {[1, 2, 3].map((position) => (
        <span
          key={position}
          aria-hidden
          className={cn(
            'size-1.5 rounded-full',
            position <= filled ? 'bg-muted-foreground' : 'bg-border',
          )}
        />
      ))}
    </span>
  );
}

/** Vòng tiến độ tổng. SVG vì nó phải nét ở mọi mật độ điểm ảnh. */
function ProgressRing({
  done,
  total,
}: {
  readonly done: number;
  readonly total: number;
}): ReactElement {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const ratio = total === 0 ? 0 : done / total;
  return (
    <span className="flex items-center gap-3">
      <svg width={52} height={52} viewBox="0 0 52 52" aria-hidden className="-rotate-90">
        <circle cx={26} cy={26} r={radius} fill="none" stroke="var(--border)" strokeWidth={4} />
        <circle
          cx={26}
          cy={26}
          r={radius}
          fill="none"
          stroke={ratio === 1 ? 'var(--success)' : 'var(--status-progress)'}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-lg font-semibold text-foreground">
          {done}
          <span className="text-sm text-muted-foreground">/{total}</span>
        </span>
        <span className="text-xs text-muted-foreground">màn đã qua</span>
      </span>
    </span>
  );
}

function groupByChapter(
  levels: readonly Level[],
): readonly (readonly [number, readonly Level[]])[] {
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
