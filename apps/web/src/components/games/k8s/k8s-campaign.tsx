'use client';

/**
 * Trang chọn màn của Kubernetes Arena, NẰM NGOÀI canvas game.
 *
 * Chủ dự án: "trong canvas game k8s để nguyên". Nên file này không đụng gì bên
 * trong `components/k8s-arena/**`: nó chỉ đọc dữ liệu màn, đọc tiến độ bằng đúng
 * hàm game tự dùng (`level-progress.ts`), dựng `ArenaModeContext` giống hệt
 * `ArenaLevelEntry` của `arena-entry.tsx`, rồi mount `ArenaRoot`.
 *
 * ## Màn đang chơi nằm ở URL (`?level=`)
 *
 * Chọn màn ghi `?level=<id>` bằng `history.pushState`, không bằng
 * `router.push`: Next đồng bộ `useSearchParams` với lời gọi đó mà KHÔNG xin lại
 * payload máy chủ, nên lúc vào màn vẫn là 0 lời gọi backend. Đổi lại, nút Back
 * của trình duyệt đưa người chơi từ màn về đúng trang này, và trang `/games` dẫn
 * thẳng được vào "màn tiếp".
 *
 * ## Khi đang chơi, game che kín vỏ trang
 *
 * `/games/k8s` có thanh đầu trang của site (trang chọn màn là một trang thường).
 * Lúc chơi, `ArenaRoot` nằm trong một lớp `fixed inset-0 z-[45]` phủ lên thanh
 * đó, và cuộn của trang bị khoá để con lăn chuột chỉ điều khiển camera.
 *
 * ⛔ `z-[45]`, không cao hơn: trên thanh đầu trang (`z-40`) nhưng DƯỚI các portal
 * Radix của `packages/ui` (Dialog, Tooltip, Popover, Select đều `z-50`, gắn vào
 * `body`). Bản đầu dùng `z-[60]` nên hộp đặt tên của bảng tài nguyên mở ra NẰM DƯỚI
 * lớp chơi: vô hình mà vẫn giữ focus và chặn chuột, tức không tạo được tài nguyên nào.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Play, Terminal } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { LEVELS, type Level } from '@devops-platform/games';
import { Button, Difficulty, Meter, TopicBadge, type LineMarkerState } from '@devops-platform/ui';
import type { ArenaModeContext } from '../../k8s-arena/arena-contract';
import { levelChips } from '../../k8s-arena/level-chips';
import { levelState, readProgress, type LevelState, type ProgressMap } from '../../k8s-arena/level-progress';
import type { HintReveal } from '../../../lib/use-hint-reveal';
import { Board, BoardRow, PageContainer, PosterHeader, RouteLine, Split, type RouteStation } from '../../kit';

const ArenaRoot = dynamic(() => import('../../k8s-arena/arena-root').then((module) => module.ArenaRoot), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid h-full place-items-center bg-ink font-mono text-sm text-ink-foreground">
      {t('games.k8s.campaign.loading')}
    </div>
  ),
});

/** Cùng hằng như `arena-entry.tsx`: chế độ `level` không xin gợi ý từ máy chủ. */
const NO_HINT_REVEALS: ReadonlyMap<number, HintReveal> = new Map();

const LEVEL_MODE: ArenaModeContext = {
  mode: 'level',
  problemCode: null,
  codexAvailable: true,
  hintsCostPoints: false,
  problem: null,
  hintReveals: NO_HINT_REVEALS,
  onRevealHint: null,
};

const DIFFICULTY_LABEL = {
  basic: t('common.difficulty.beginner'),
  intermediate: t('common.difficulty.intermediate'),
  advanced: t('common.difficulty.advanced'),
} as const;

const STATE_LABEL: Readonly<Record<LevelState | 'next', string>> = {
  done: t('games.state.done'),
  playing: t('games.state.playing'),
  new: t('games.state.new'),
  next: t('games.state.next'),
};

/** Sáu chương có tên trong bản đồ chữ; chương lạ (dữ liệu mới) rơi về một nhãn chung. */
const KNOWN_CHAPTERS = [1, 2, 3, 4, 5, 6] as const;
type KnownChapter = (typeof KNOWN_CHAPTERS)[number];

function isKnownChapter(chapter: number): chapter is KnownChapter {
  return (KNOWN_CHAPTERS as readonly number[]).includes(chapter);
}

function chapterName(chapter: number): string {
  return isKnownChapter(chapter) ? t(`games.k8s.chapter.${chapter}.name`) : t('games.k8s.chapter.other');
}

function chapterBlurb(chapter: number): string | null {
  return isKnownChapter(chapter) ? t(`games.k8s.chapter.${chapter}.blurb`) : null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function groupByChapter(levels: readonly Level[]): readonly (readonly [number, readonly Level[]])[] {
  const map = new Map<number, Level[]>();
  for (const level of levels) {
    const bucket = map.get(level.chapter);
    if (bucket === undefined) map.set(level.chapter, [level]);
    else bucket.push(level);
  }
  return [...map.entries()].sort(([a], [b]) => a - b);
}

function markerState(state: LevelState, isNext: boolean): LineMarkerState {
  if (state === 'done') return 'done';
  return isNext ? 'current' : 'todo';
}

function findLevel(id: string | null): Level | null {
  if (id === null) return null;
  return LEVELS.find((level) => level.id === id) ?? null;
}

/** Màn đang chơi ở URL. Chỉ trang này đọc `?level=` của `/games/k8s`. */
function useLevelInUrl(): {
  readonly level: Level | null;
  readonly play: (id: string) => void;
  readonly leave: () => void;
} {
  const params = useSearchParams();
  const level = findLevel(params.get('level'));
  /*
   * Màn mở bằng nút trên trang này thì rời màn bằng `history.back()`, để lịch sử
   * không chồng hai bản trang chọn màn. Màn mở thẳng từ một liên kết (trang
   * `/games` dẫn vào "màn tiếp") thì không có gì phía sau để lùi về: thay URL tại
   * chỗ.
   */
  const pushedRef = useRef(false);

  const play = useCallback((id: string) => {
    pushedRef.current = true;
    window.history.pushState(null, '', `?level=${encodeURIComponent(id)}`);
  }, []);

  const leave = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  return { level, play, leave };
}

function PlayingLayer({ level, onExit }: { readonly level: Level; readonly onExit: () => void }): ReactElement {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[45] bg-ink" data-testid="k8s-playing-layer">
      <ArenaRoot key={level.id} level={level} mode={LEVEL_MODE} onExit={onExit} />
    </div>
  );
}

export function K8sCampaign(): ReactElement {
  const { level, play, leave } = useLevelInUrl();
  const chapters = useMemo(() => groupByChapter(LEVELS), []);

  /*
   * Tiến độ đọc lại mỗi lần quay về trang chọn màn: lượt vừa chơi xong đã ghi vào
   * `localStorage`, và trang phải thấy nó mà không cần tải lại. Đọc trong effect,
   * không trong lúc render: máy chủ không có `localStorage`.
   */
  const [progress, setProgress] = useState<ProgressMap>({});
  const playing = level !== null;
  useEffect(() => {
    if (!playing) setProgress(readProgress());
  }, [playing]);

  const total = LEVELS.length;
  const done = LEVELS.filter((entry) => progress[entry.id]?.completed === true).length;
  const next = LEVELS.find((entry) => progress[entry.id]?.completed !== true) ?? null;

  const stations: RouteStation[] = chapters.map(([chapter, items]) => {
    const chapterDone = items.filter((entry) => progress[entry.id]?.completed === true).length;
    const hasNext = next !== null && items.some((entry) => entry.id === next.id);
    return {
      id: `chapter-${String(chapter)}`,
      label: `${pad(chapter)} ${chapterName(chapter)}`,
      line: 'k8s',
      state: chapterDone === items.length ? 'done' : hasNext ? 'current' : 'todo',
      href: `#k8s-chapter-${String(chapter)}`,
    };
  });

  let order = 0;

  return (
    <>
      {/* Danh sách màn vẫn mount dưới lớp chơi. Không `inert` thì Tab đi xuyên xuống các
          nút màn vô hình, và Enter trên một nút đó gọi `play()` khác: màn đang chơi bị
          remount, mất trạng thái. */}
      <div inert={playing}>
      <PosterHeader
        section="games"
        kicker={t('games.k8s.campaign.kicker', { levels: total, chapters: chapters.length })}
        title={t('games.k8s.name')}
        lead={t('games.k8s.campaign.lead')}
        switcher={false}
        aside={
          <div className="flex flex-col gap-4 border-2 border-current p-5 md:p-6">
            <div className="flex items-center gap-3">
              <TopicBadge line="k8s" />
              <p className="font-mono text-sm tabular-nums">{t('games.chapter.progress', { done, total })}</p>
            </div>
            <Meter value={done} max={total} segments={total} tone="k8s" label={t('games.band.progress.aria', { name: t('games.k8s.name') })} />
            {next === null ? (
              <p className="text-sm">{t('games.k8s.campaign.all-done', { total })}</p>
            ) : (
              <Button
                size="lg"
                variant="ink"
                className="h-auto min-h-12 justify-start py-3 text-left whitespace-normal"
                iconLeft={<Play aria-hidden="true" />}
                onClick={() => {
                  play(next.id);
                }}
              >
                {done === 0
                  ? t('games.k8s.campaign.start', { title: next.title })
                  : t('games.k8s.campaign.continue', { title: next.title })}
              </Button>
            )}
          </div>
        }
      >
        <Link
          href="/games"
          className="mt-6 inline-flex items-center gap-2 font-mono text-sm underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('games.k8s.campaign.back')}
        </Link>
      </PosterHeader>

      <PageContainer className="pt-10 pb-4">
        <RouteLine
          stations={stations}
          label={t('games.k8s.campaign.chapters')}
          stateLabel={(state) =>
            state === 'done' ? STATE_LABEL.done : state === 'current' ? STATE_LABEL.next : STATE_LABEL.new
          }
        />
      </PageContainer>

      <PageContainer className="pb-16">
        {chapters.map(([chapter, items]) => {
          const chapterDone = items.filter((entry) => progress[entry.id]?.completed === true).length;
          const blurb = chapterBlurb(chapter);
          return (
            <div key={chapter} id={`k8s-chapter-${String(chapter)}`} className="scroll-mt-24">
              <Split
                index={pad(chapter)}
                title={chapterName(chapter)}
                aside={
                  <>
                    {blurb === null ? null : <p>{blurb}</p>}
                    <p className="mt-3 font-mono tabular-nums">
                      {t('games.chapter.progress', { done: chapterDone, total: items.length })}
                    </p>
                  </>
                }
              >
                <Board label={t('games.k8s.campaign.board', { n: pad(chapter), name: chapterName(chapter) })}>
                  {items.map((entry) => {
                    order += 1;
                    const state = levelState(progress, entry.id);
                    const isNext = next?.id === entry.id;
                    const chips = levelChips(entry);
                    return (
                      <BoardRow
                        key={entry.id}
                        index={order}
                        order={order}
                        line="k8s"
                        lineState={markerState(state, isNext)}
                        title={entry.title}
                        sub={
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                            {chips.kinds.map((kind) => (
                              <span key={kind}>{kind}</span>
                            ))}
                            {chips.command === null ? null : (
                              <span className="inline-flex items-center gap-1">
                                <Terminal className="size-3" aria-hidden="true" />
                                {chips.command}
                              </span>
                            )}
                          </span>
                        }
                        meta={
                          <>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              {t('games.level.minutes', { n: chips.minutes })}
                            </span>
                            <Difficulty level={entry.difficulty} label={DIFFICULTY_LABEL[entry.difficulty]} />
                          </>
                        }
                        state={
                          <span
                            className={
                              isNext
                                ? 'bg-signal px-2 py-1 type-label text-signal-foreground'
                                : 'px-2 py-1 type-label text-muted-foreground'
                            }
                          >
                            {isNext && state !== 'playing' ? STATE_LABEL.next : STATE_LABEL[state]}
                          </span>
                        }
                        onClick={() => {
                          play(entry.id);
                        }}
                      />
                    );
                  })}
                </Board>
              </Split>
            </div>
          );
        })}
      </PageContainer>
      </div>

      {level === null ? null : <PlayingLayer level={level} onExit={leave} />}
    </>
  );
}
