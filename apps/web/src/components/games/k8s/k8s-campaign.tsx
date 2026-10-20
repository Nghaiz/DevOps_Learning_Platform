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
 * Chọn màn ghi `?level=<id>` bằng `history.pushState`, không bằng `router.push`:
 * Next đồng bộ `useSearchParams` với lời gọi đó mà KHÔNG xin lại payload máy chủ,
 * nên lúc vào màn vẫn là 0 lời gọi backend. Đổi lại, nút Back của trình duyệt đưa
 * người chơi từ màn về đúng trang này, và trang `/games` dẫn thẳng được vào "màn tiếp".
 *
 * ## Khi đang chơi, game che kín vỏ trang
 *
 * Lúc chơi, `ArenaRoot` nằm trong một lớp `fixed inset-0 z-[45]` (`<LegacySkin overlay>`)
 * phủ lên thanh đầu trang, và cuộn của trang bị khoá để con lăn chuột chỉ điều khiển camera.
 *
 * ⛔ `z-[45]`, không cao hơn: trên thanh đầu trang (`z-40`) nhưng DƯỚI các portal
 * Radix (Dialog, Tooltip, Popover, Select đều `z-50`, gắn vào `body`). Bản đầu dùng
 * `z-[60]` nên hộp đặt tên của bảng tài nguyên mở ra NẰM DƯỚI lớp chơi: vô hình mà vẫn
 * giữ focus và chặn chuột, tức không tạo được tài nguyên nào.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { t } from '@devops-platform/copy';
import { Button, Icon, Page } from '@devops-platform/ds';
import { LEVELS, type Level } from '@devops-platform/games';
import type { ArenaModeContext } from '../../k8s-arena/arena-contract';
import { levelChips } from '../../k8s-arena/level-chips';
import { levelState, readProgress, type ProgressMap } from '../../k8s-arena/level-progress';
import type { HintReveal } from '../../../lib/use-hint-reveal';
import { CampaignHeader, ChapterBlock, ChapterStrip, LevelDifficulty, LevelRow, type LevelStatus } from '../campaign/campaign-parts';
import { LegacySkin } from '../legacy-skin';

const ArenaRoot = dynamic(() => import('../../k8s-arena/arena-root').then((module) => module.ArenaRoot), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid h-full place-items-center font-mono text-sm">
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

function groupByChapter(levels: readonly Level[]): readonly (readonly [number, readonly Level[]])[] {
  const map = new Map<number, Level[]>();
  for (const level of levels) {
    const bucket = map.get(level.chapter);
    if (bucket === undefined) map.set(level.chapter, [level]);
    else bucket.push(level);
  }
  return [...map.entries()].sort(([a], [b]) => a - b);
}

function findLevel(id: string | null): Level | null {
  if (id === null) return null;
  return LEVELS.find((level) => level.id === id) ?? null;
}

function levelHref(id: string): string {
  return `?level=${encodeURIComponent(id)}`;
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
   * `/games` dẫn vào "màn tiếp") thì không có gì phía sau để lùi về: thay URL tại chỗ.
   */
  const pushedRef = useRef(false);

  const play = useCallback((id: string) => {
    pushedRef.current = true;
    window.history.pushState(null, '', levelHref(id));
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
    <LegacySkin dark overlay>
      <div className="h-full" data-testid="k8s-playing-layer">
        <ArenaRoot key={level.id} level={level} mode={LEVEL_MODE} onExit={onExit} />
      </div>
    </LegacySkin>
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
  const isDone = (id: string): boolean => progress[id]?.completed === true;
  const done = LEVELS.filter((entry) => isDone(entry.id)).length;
  const next = LEVELS.find((entry) => !isDone(entry.id)) ?? null;

  const statusOf = (entry: Level): LevelStatus => {
    const state = levelState(progress, entry.id);
    if (state === 'done') return 'done';
    if (state === 'playing') return 'playing';
    return next?.id === entry.id ? 'next' : 'new';
  };

  let order = 0;

  return (
    <>
      {/* Danh sách màn vẫn mount dưới lớp chơi. Không `inert` thì Tab đi xuyên xuống các
          liên kết màn vô hình, và Enter trên một liên kết đó gọi `play()` khác: màn đang
          chơi bị remount, mất trạng thái. */}
      <div inert={playing}>
        <CampaignHeader
          game="k8s"
          title={t('games.k8s.name')}
          lead={t('games.k8s.campaign.lead')}
          levels={total}
          chapters={chapters.length}
          done={done}
          allDone={t('games.k8s.campaign.all-done', { total })}
          cta={
            next === null ? null : (
              <Button
                size="lg"
                variant="primary"
                icon="play"
                onClick={() => {
                  play(next.id);
                }}
              >
                {done === 0
                  ? t('games.k8s.campaign.start', { title: next.title })
                  : t('games.k8s.campaign.continue', { title: next.title })}
              </Button>
            )
          }
        />

        <ChapterStrip
          chapters={chapters.map(([chapter, items]) => ({
            anchor: `k8s-chapter-${String(chapter)}`,
            label: chapterName(chapter),
            done: items.filter((entry) => isDone(entry.id)).length,
            total: items.length,
          }))}
        />

        <Page className="flex flex-col gap-12 py-10 md:py-12">
          {chapters.map(([chapter, items]) => (
            <ChapterBlock
              key={chapter}
              anchor={`k8s-chapter-${String(chapter)}`}
              title={t('games.k8s.campaign.board', { n: String(chapter), name: chapterName(chapter) })}
              listLabel={t('games.k8s.campaign.board', { n: String(chapter), name: chapterName(chapter) })}
              blurb={chapterBlurb(chapter)}
              done={items.filter((entry) => isDone(entry.id)).length}
              total={items.length}
            >
              {items.map((entry) => {
                order += 1;
                const chips = levelChips(entry);
                return (
                  <LevelRow
                    key={entry.id}
                    index={order}
                    title={entry.title}
                    href={levelHref(entry.id)}
                    onPlay={() => {
                      play(entry.id);
                    }}
                    status={statusOf(entry)}
                    description={
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-3">
                        {chips.kinds.map((kind) => (
                          <span key={kind}>{kind}</span>
                        ))}
                        {chips.command === null ? null : (
                          <span className="inline-flex items-center gap-1 text-tp-ink" data-topic="kubernetes">
                            <Icon name="terminal" size={13} />
                            {chips.command}
                          </span>
                        )}
                      </span>
                    }
                    meta={
                      <>
                        <span className="inline-flex w-20 items-center gap-1.5 text-xs tabular-nums text-ink-3">
                          <Icon name="clock" size={14} />
                          {t('games.level.minutes', { n: chips.minutes })}
                        </span>
                        <span className="w-28">
                          <LevelDifficulty value={entry.difficulty} />
                        </span>
                      </>
                    }
                  />
                );
              })}
            </ChapterBlock>
          ))}
        </Page>
      </div>

      {level === null ? null : <PlayingLayer level={level} onExit={leave} />}
    </>
  );
}
