'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { ArrowLeft, FlaskConical, Play } from 'lucide-react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { GIT_LEVELS, type GitLevel } from '@devops-platform/games';
import { Button, Difficulty, Meter, TopicBadge, type LineMarkerState } from '@devops-platform/ui';
import { Board, BoardRow, PageContainer, PosterHeader, RouteLine, Split, type RouteStation } from '../../kit';
import { readGitProgress, type GitProgress } from './git-progress';

/**
 * Trang chọn màn của Phòng thí nghiệm Git: ba chương là ba đoạn tuyến, mỗi màn
 * là một ga. Bấm một dòng là VÀO màn luôn (bản cũ chỉ chọn rồi bắt bấm thêm một
 * nút "Bắt đầu nhiệm vụ" ở khung bên).
 *
 * Trang nằm trên nền của site (sáng/tối theo theme), không trong vũ trụ tối của
 * màn chơi: đây là một trang danh mục, màn chơi mới là "phòng lab".
 */

const DIFFICULTY_LABEL = {
  basic: t('common.difficulty.beginner'),
  intermediate: t('common.difficulty.intermediate'),
  advanced: t('common.difficulty.advanced'),
} as const;

const CHAPTERS = [1, 2, 3] as const;

export function gitChapterName(chapter: 1 | 2 | 3): string {
  return t(`games.git.chapter.${chapter}.name`);
}

function stateOf(
  progress: GitProgress,
  level: GitLevel,
  nextId: string | null,
): { readonly marker: LineMarkerState; readonly label: string; readonly isNext: boolean } {
  const entry = progress[level.id];
  if (entry?.completed === true) return { marker: 'done', label: t('games.state.done'), isNext: false };
  const isNext = level.id === nextId;
  return {
    marker: isNext ? 'current' : 'todo',
    label:
      entry !== undefined ? t('games.state.playing') : isNext ? t('games.state.next') : t('games.state.new'),
    isNext,
  };
}

export function GitCampaign({
  onPick,
  onSandbox,
}: {
  readonly onPick: (id: string) => void;
  readonly onSandbox: () => void;
}): ReactElement {
  /* Đọc sau khi mount: máy chủ không có `localStorage`. */
  const [progress, setProgress] = useState<GitProgress>({});
  useEffect(() => {
    setProgress(readGitProgress());
  }, []);

  const total = GIT_LEVELS.length;
  const done = GIT_LEVELS.filter((level) => progress[level.id]?.completed === true).length;
  const next = GIT_LEVELS.find((level) => progress[level.id]?.completed !== true) ?? null;
  const nextId = next?.id ?? null;

  const stations: RouteStation[] = CHAPTERS.map((chapter) => {
    const items = GIT_LEVELS.filter((level) => level.chapter === chapter);
    const chapterDone = items.filter((level) => progress[level.id]?.completed === true).length;
    return {
      id: `git-chapter-${String(chapter)}`,
      label: `0${String(chapter)} ${gitChapterName(chapter)}`,
      line: 'git',
      state:
        chapterDone === items.length ? 'done' : items.some((level) => level.id === nextId) ? 'current' : 'todo',
      href: `#git-chapter-${String(chapter)}`,
    };
  });

  let order = 0;

  return (
    <>
      <PosterHeader
        section="games"
        kicker={t('games.git.campaign.kicker', { levels: total, chapters: CHAPTERS.length })}
        title={t('games.git.name')}
        lead={t('games.git.campaign.lead')}
        switcher={false}
        aside={
          <div className="flex flex-col gap-4 border-2 border-current p-5 md:p-6">
            <div className="flex items-center gap-3">
              <TopicBadge line="git" />
              <p className="font-mono text-sm tabular-nums">{t('games.chapter.progress', { done, total })}</p>
            </div>
            <Meter
              value={done}
              max={total}
              segments={total}
              tone="git"
              label={t('games.band.progress.aria', { name: t('games.git.name') })}
            />
            {next === null ? (
              <p className="text-sm">{t('games.git.campaign.all-done', { total })}</p>
            ) : (
              <Button
                size="lg"
                variant="ink"
                className="h-auto min-h-12 justify-start py-3 text-left whitespace-normal"
                iconLeft={<Play aria-hidden="true" />}
                onClick={() => {
                  onPick(next.id);
                }}
              >
                {done === 0 && progress[next.id] === undefined
                  ? t('games.git.campaign.start', { title: next.title })
                  : t('games.git.campaign.continue', { title: next.title })}
              </Button>
            )}
          </div>
        }
      >
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button
            variant="outline"
            onClick={onSandbox}
            className="border-current"
            iconLeft={<FlaskConical aria-hidden="true" />}
          >
            {t('games.git.campaign.sandbox')}
          </Button>
          <p className="text-sm opacity-90">{t('games.git.campaign.sandbox-sub')}</p>
        </div>
        <Link
          href="/games"
          className="mt-5 inline-flex items-center gap-2 font-mono text-sm underline-offset-4 hover:underline"
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
            state === 'done' ? t('games.state.done') : state === 'current' ? t('games.state.next') : t('games.state.new')
          }
        />
      </PageContainer>

      <PageContainer className="pb-16">
        {CHAPTERS.map((chapter) => {
          const items = GIT_LEVELS.filter((level) => level.chapter === chapter);
          const chapterDone = items.filter((level) => progress[level.id]?.completed === true).length;
          return (
            <div key={chapter} id={`git-chapter-${String(chapter)}`} className="scroll-mt-24">
              <Split
                index={`0${String(chapter)}`}
                title={gitChapterName(chapter)}
                aside={
                  <>
                    <p>{t(`games.git.chapter.${chapter}.blurb`)}</p>
                    <p className="mt-3 font-mono tabular-nums">
                      {t('games.chapter.progress', { done: chapterDone, total: items.length })}
                    </p>
                  </>
                }
              >
                <Board label={t('games.git.chapter.title', { n: chapter, name: gitChapterName(chapter) })}>
                  {items.map((level) => {
                    order += 1;
                    const state = stateOf(progress, level, nextId);
                    return (
                      <BoardRow
                        key={level.id}
                        index={order}
                        order={order}
                        line="git"
                        lineState={state.marker}
                        title={level.title}
                        sub={level.mission}
                        meta={
                          <>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              {t('games.git.campaign.objectives', { n: level.objectives.length })}
                            </span>
                            <Difficulty level={level.difficulty} label={DIFFICULTY_LABEL[level.difficulty]} />
                          </>
                        }
                        state={
                          <span
                            className={
                              state.isNext
                                ? 'bg-signal px-2 py-1 type-label text-signal-foreground'
                                : 'px-2 py-1 type-label text-muted-foreground'
                            }
                          >
                            {state.label}
                          </span>
                        }
                        onClick={() => {
                          onPick(level.id);
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
    </>
  );
}
