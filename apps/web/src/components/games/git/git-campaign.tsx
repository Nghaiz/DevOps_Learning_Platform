'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Button, Icon, Page } from '@devops-platform/ds';
import { GIT_LEVELS, type GitLevel } from '@devops-platform/games';
import { CampaignHeader, ChapterBlock, ChapterStrip, LevelDifficulty, LevelRow, type LevelStatus } from '../campaign/campaign-parts';
import { readGitProgress, type GitProgress } from './git-progress';

/**
 * Trang chọn màn của Phòng thí nghiệm Git: ba chương, mỗi chương một danh sách màn.
 * Bấm một dòng là VÀO màn luôn (bản cũ chỉ chọn rồi bắt bấm thêm một nút "Bắt đầu
 * nhiệm vụ" ở khung bên).
 *
 * Trang nằm trên nền của site (sáng/tối theo theme), không trong vũ trụ tối của màn
 * chơi: đây là một trang danh mục, màn chơi mới là "phòng lab".
 */

const CHAPTERS = [1, 2, 3] as const;

export function gitChapterName(chapter: 1 | 2 | 3): string {
  return t(`games.git.chapter.${chapter}.name`);
}

function levelHref(id: string): string {
  return `?level=${encodeURIComponent(id)}`;
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
  const isDone = (id: string): boolean => progress[id]?.completed === true;
  const done = GIT_LEVELS.filter((level) => isDone(level.id)).length;
  const next = GIT_LEVELS.find((level) => !isDone(level.id)) ?? null;

  const statusOf = (level: GitLevel): LevelStatus => {
    if (isDone(level.id)) return 'done';
    if (level.id === next?.id) return progress[level.id] === undefined ? 'next' : 'playing';
    return progress[level.id] === undefined ? 'new' : 'playing';
  };

  let order = 0;

  return (
    <>
      <CampaignHeader
        game="git"
        title={t('games.git.name')}
        lead={t('games.git.campaign.lead')}
        levels={total}
        chapters={CHAPTERS.length}
        done={done}
        allDone={t('games.git.campaign.all-done', { total })}
        cta={
          next === null ? null : (
            <Button
              size="lg"
              variant="primary"
              icon="play"
              onClick={() => {
                onPick(next.id);
              }}
            >
              {done === 0 && progress[next.id] === undefined
                ? t('games.git.campaign.start', { title: next.title })
                : t('games.git.campaign.continue', { title: next.title })}
            </Button>
          )
        }
        extra={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button variant="secondary" size="lg" icon="flask" onClick={onSandbox}>
              {t('games.git.campaign.sandbox')}
            </Button>
            <span className="max-w-[34ch] text-sm text-ink-2">{t('games.git.campaign.sandbox-sub')}</span>
          </span>
        }
      />

      <ChapterStrip
        chapters={CHAPTERS.map((chapter) => {
          const items = GIT_LEVELS.filter((level) => level.chapter === chapter);
          return {
            anchor: `git-chapter-${String(chapter)}`,
            label: gitChapterName(chapter),
            done: items.filter((level) => isDone(level.id)).length,
            total: items.length,
          };
        })}
      />

      <Page className="flex flex-col gap-12 py-10 md:py-12">
        {CHAPTERS.map((chapter) => {
          const items = GIT_LEVELS.filter((level) => level.chapter === chapter);
          const title = t('games.git.chapter.title', { n: chapter, name: gitChapterName(chapter) });
          return (
            <ChapterBlock
              key={chapter}
              anchor={`git-chapter-${String(chapter)}`}
              title={title}
              listLabel={title}
              blurb={t(`games.git.chapter.${chapter}.blurb`)}
              done={items.filter((level) => isDone(level.id)).length}
              total={items.length}
            >
              {items.map((level) => {
                order += 1;
                return (
                  <LevelRow
                    key={level.id}
                    index={order}
                    title={level.title}
                    href={levelHref(level.id)}
                    onPlay={() => {
                      onPick(level.id);
                    }}
                    status={statusOf(level)}
                    description={level.mission}
                    meta={
                      <>
                        <span className="inline-flex w-24 items-center gap-1.5 text-xs tabular-nums text-ink-3">
                          <Icon name="target" size={14} />
                          {t('games.git.campaign.objectives', { n: level.objectives.length })}
                        </span>
                        <span className="w-28">
                          <LevelDifficulty value={level.difficulty} />
                        </span>
                      </>
                    }
                  />
                );
              })}
            </ChapterBlock>
          );
        })}
      </Page>
    </>
  );
}
