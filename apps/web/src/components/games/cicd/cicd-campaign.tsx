'use client';

import { useEffect, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { Button, Page } from '@devops-platform/ds';
import { CD_LEVELS, CI_LEVELS, CICD_LEVELS, type CicdLevel } from '@devops-platform/games';
import { CampaignHeader, ChapterBlock, ChapterStrip, LevelDifficulty, LevelRow, type LevelStatus } from '../campaign/campaign-parts';
import { readCicdProgress, type CicdProgress } from './cicd-progress';

/**
 * Danh sách màn của Xưởng đường ống CI/CD: hai chương, số thứ tự đánh liên tục qua hai
 * chương (1…28), khớp với số trong id màn.
 *
 * ⚠ Không sắp lại, không nhóm lại theo độ khó. Thứ tự đó là thứ tự dạy: C06 ("cache là
 * bộ đệm") phải đến trước C07/C08 (khoá quá rộng / quá hẹp), và C09 ("một lượt xanh
 * không chứng minh gì") phải đến trước C10/C11 (chạy lại).
 *
 * Mỗi dòng là một LIÊN KẾT thật tới `/games/cicd/<id>`: màn chơi có đoạn con riêng
 * (19.D), nên mở tab mới, chép đường dẫn và nút Back đều đúng.
 */

export interface CicdCampaignProps {
  readonly onSandbox: () => void;
}

const CHAPTERS = [
  { anchor: 'cicd-chapter-ci', title: t('games.cicd.chapter.ci.title'), blurb: t('games.cicd.chapter.ci.blurb'), levels: CI_LEVELS, offset: 0 },
  {
    anchor: 'cicd-chapter-cd',
    title: t('games.cicd.chapter.cd.title'),
    blurb: t('games.cicd.chapter.cd.blurb'),
    levels: CD_LEVELS,
    offset: CI_LEVELS.length,
  },
] as const;

function statusOf(progress: CicdProgress, level: CicdLevel, nextId: string | null): LevelStatus {
  const entry = progress[level.id];
  if (entry?.completed === true) return 'done';
  if (level.id === nextId) return entry === undefined ? 'next' : 'playing';
  return entry === undefined ? 'new' : 'playing';
}

export function CicdCampaign({ onSandbox }: CicdCampaignProps): ReactElement {
  /* Đọc sau khi mount: máy chủ không có `localStorage`. */
  const [progress, setProgress] = useState<CicdProgress>({});
  useEffect(() => {
    setProgress(readCicdProgress());
  }, []);

  const total = CICD_LEVELS.length;
  const isDone = (id: string): boolean => progress[id]?.completed === true;
  const done = CICD_LEVELS.filter((level) => isDone(level.id)).length;
  const next = CICD_LEVELS.find((level) => !isDone(level.id)) ?? null;
  const nextId = next?.id ?? null;

  return (
    <>
      <CampaignHeader
        game="cicd"
        title={t('games.cicd.name')}
        lead={t('games.cicd.campaign.lead')}
        levels={total}
        chapters={CHAPTERS.length}
        done={done}
        allDone={t('games.cicd.campaign.all-done', { total })}
        cta={
          next === null ? null : (
            <Button asChild size="lg" variant="primary" icon="play">
              <Link href={`/games/cicd/${next.id}`}>
                {progress[next.id] === undefined && done === 0
                  ? t('games.cicd.campaign.start', { title: next.title })
                  : t('games.cicd.campaign.continue', { title: next.title })}
              </Link>
            </Button>
          )
        }
        extra={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button variant="secondary" size="lg" icon="flask" onClick={onSandbox}>
              {t('games.cicd.campaign.sandbox')}
            </Button>
            <span className="max-w-[34ch] text-sm text-ink-2">{t('games.cicd.campaign.sandbox-sub')}</span>
          </span>
        }
      />

      <ChapterStrip
        chapters={CHAPTERS.map((chapter) => ({
          anchor: chapter.anchor,
          label: chapter.title,
          done: chapter.levels.filter((level) => isDone(level.id)).length,
          total: chapter.levels.length,
        }))}
      />

      {/*
        `data-testid` để ô Playwright đếm đúng danh sách này: đếm theo chữ hiển thị sẽ
        bắt nhầm ngay khi một khối khác có số thứ tự. Bên trong chỉ có hai danh sách màn,
        không danh sách nào khác, nên số `listitem` đúng bằng số màn.
      */}
      <Page className="py-10 md:py-12">
        <div data-testid="cicd-level-list" className="flex flex-col gap-12">
          {CHAPTERS.map((chapter) => (
            <ChapterBlock
              key={chapter.anchor}
              anchor={chapter.anchor}
              title={chapter.title}
              listLabel={chapter.title}
              blurb={chapter.blurb}
              done={chapter.levels.filter((level) => isDone(level.id)).length}
              total={chapter.levels.length}
            >
              {chapter.levels.map((level, index) => {
                const editable = [...level.editable, ...(level.cd?.editable ?? [])];
                return (
                  <LevelRow
                    key={level.id}
                    index={chapter.offset + index + 1}
                    title={level.title}
                    href={`/games/cicd/${level.id}`}
                    status={statusOf(progress, level, nextId)}
                    description={level.mission}
                    meta={
                      <>
                        <span className="flex w-44 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-xs text-ink-3">
                          <span className="font-sans">{t('games.cicd.campaign.editable')}</span>
                          {editable.map((part) => (
                            <span key={part} className="text-ink-2">
                              {part}
                            </span>
                          ))}
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
          ))}
        </div>
      </Page>
    </>
  );
}
