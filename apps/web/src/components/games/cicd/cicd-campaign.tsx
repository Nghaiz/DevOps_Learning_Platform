'use client';

import { useEffect, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { FlaskConical, Play } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { CD_LEVELS, CI_LEVELS, CICD_LEVELS, type CicdLevel } from '@devops-platform/games';
import { Button, Difficulty, Meter, TopicBadge, type LineMarkerState } from '@devops-platform/ui';
import { Board, BoardRow, PageContainer, PosterHeader, Split } from '../../kit';
import { readCicdProgress, type CicdProgress } from './cicd-progress';

/**
 * Danh sách màn của Xưởng đường ống CI/CD: một bảng tuyến, hai chương.
 *
 * Số thứ tự đánh liên tục qua hai chương (01…28), khớp với số trong id màn.
 *
 * ⚠ Không sắp lại, không nhóm lại theo độ khó. Thứ tự đó là thứ tự dạy: C06
 * ("cache là bộ đệm") phải đến trước C07/C08 (khoá quá rộng / quá hẹp), và C09
 * ("một lượt xanh không chứng minh gì") phải đến trước C10/C11 (chạy lại).
 *
 * Mỗi dòng là một LIÊN KẾT thật tới `/games/cicd/<id>`: màn chơi có đoạn con
 * riêng (19.D), nên mở tab mới, chép đường dẫn và nút Back đều đúng.
 */

const DIFFICULTY_LABEL = {
  basic: t('common.difficulty.beginner'),
  intermediate: t('common.difficulty.intermediate'),
  advanced: t('common.difficulty.advanced'),
} as const;

export interface CicdCampaignProps {
  readonly onSandbox: () => void;
}

function stateOf(
  progress: CicdProgress,
  level: CicdLevel,
  nextId: string | null,
): { readonly marker: LineMarkerState; readonly label: string; readonly isNext: boolean } {
  const entry = progress[level.id];
  if (entry?.completed === true) return { marker: 'done', label: t('games.state.done'), isNext: false };
  if (level.id === nextId) {
    return {
      marker: 'current',
      label: entry === undefined ? t('games.state.next') : t('games.state.playing'),
      isNext: true,
    };
  }
  return {
    marker: 'todo',
    label: entry === undefined ? t('games.state.new') : t('games.state.playing'),
    isNext: false,
  };
}

function Chapter({
  code,
  title,
  blurb,
  levels,
  offset,
  progress,
  nextId,
}: {
  readonly code: 'CI' | 'CD';
  readonly title: string;
  readonly blurb: string;
  readonly levels: readonly CicdLevel[];
  readonly offset: number;
  readonly progress: CicdProgress;
  readonly nextId: string | null;
}): ReactElement {
  const done = levels.filter((level) => progress[level.id]?.completed === true).length;
  return (
    <Split
      index={code}
      title={title}
      aside={
        <>
          <p>{blurb}</p>
          <p className="mt-3 font-mono tabular-nums">
            {t('games.chapter.progress', { done, total: levels.length })}
          </p>
        </>
      }
    >
      <Board label={title}>
        {levels.map((level, index) => {
          const state = stateOf(progress, level, nextId);
          const editable = [...level.editable, ...(level.cd?.editable ?? [])];
          return (
            <BoardRow
              key={level.id}
              href={`/games/cicd/${level.id}`}
              index={offset + index + 1}
              order={index}
              line="cicd"
              lineState={state.marker}
              title={level.title}
              sub={level.mission}
              meta={
                <>
                  <span className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted-foreground">
                    <span className="type-label">{t('games.cicd.campaign.editable')}</span>
                    {editable.map((part) => (
                      <span key={part}>{part}</span>
                    ))}
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
            />
          );
        })}
      </Board>
    </Split>
  );
}

export function CicdCampaign({ onSandbox }: CicdCampaignProps): ReactElement {
  /* Đọc sau khi mount: máy chủ không có `localStorage`. */
  const [progress, setProgress] = useState<CicdProgress>({});
  useEffect(() => {
    setProgress(readCicdProgress());
  }, []);

  const total = CICD_LEVELS.length;
  const done = CICD_LEVELS.filter((level) => progress[level.id]?.completed === true).length;
  const next = CICD_LEVELS.find((level) => progress[level.id]?.completed !== true) ?? null;

  return (
    <>
      <PosterHeader
        section="games"
        kicker={t('games.cicd.campaign.kicker', { levels: total, chapters: 2 })}
        title={t('games.cicd.name')}
        lead={t('games.cicd.campaign.lead')}
        switcher={false}
        aside={
          <div className="flex flex-col gap-4 border-2 border-current p-5 md:p-6">
            <div className="flex items-center gap-3">
              <TopicBadge line="cicd" />
              <p className="font-mono text-sm tabular-nums">{t('games.chapter.progress', { done, total })}</p>
            </div>
            <Meter
              value={done}
              max={total}
              segments={total}
              tone="cicd"
              label={t('games.band.progress.aria', { name: t('games.cicd.name') })}
            />
            {next === null ? (
              <p className="text-sm">{t('games.cicd.campaign.all-done', { total })}</p>
            ) : (
              <Button asChild size="lg" variant="ink" className="h-auto min-h-12 justify-start py-3 text-left whitespace-normal">
                <Link href={`/games/cicd/${next.id}`}>
                  <Play aria-hidden="true" />
                  {progress[next.id] === undefined && done === 0
                    ? t('games.cicd.campaign.start', { title: next.title })
                    : t('games.cicd.campaign.continue', { title: next.title })}
                </Link>
              </Button>
            )}
          </div>
        }
      >
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant="outline"
            onClick={onSandbox}
            className="border-current"
            iconLeft={<FlaskConical aria-hidden="true" />}
          >
            {t('games.cicd.campaign.sandbox')}
          </Button>
          <p className="text-sm opacity-90">{t('games.cicd.campaign.sandbox-sub')}</p>
        </div>
      </PosterHeader>

      {/*
        `data-testid` để ô Playwright đếm đúng danh sách này: đếm theo chữ hiển
        thị (`01`, `02`, …) sẽ bắt nhầm ngay khi một khối khác có số thứ tự. Bên
        trong chỉ có hai bảng màn, không danh sách nào khác, nên số `listitem`
        đúng bằng số màn.
      */}
      <PageContainer className="pt-4 pb-16">
        <div data-testid="cicd-level-list">
          <Chapter
            code="CI"
            title={t('games.cicd.chapter.ci.title')}
            blurb={t('games.cicd.chapter.ci.blurb')}
            levels={CI_LEVELS}
            offset={0}
            progress={progress}
            nextId={next?.id ?? null}
          />
          <Chapter
            code="CD"
            title={t('games.cicd.chapter.cd.title')}
            blurb={t('games.cicd.chapter.cd.blurb')}
            levels={CD_LEVELS}
            offset={CI_LEVELS.length}
            progress={progress}
            nextId={next?.id ?? null}
          />
        </div>
      </PageContainer>
    </>
  );
}
