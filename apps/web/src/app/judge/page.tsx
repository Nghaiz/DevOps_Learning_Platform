import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Icon, Section, type IconName } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { readRequestSession } from '../../server/auth/config';
import { withReturnPath } from '../login/return-path';
import { readHubCounts } from '../../components/hub/hub-data.server';
import { HubHeader, HubPage, SectionDoors } from '../../components/hub/hub';
import { ClassExams } from '../../components/me/class-exams';
import { sectionById } from '../../components/shell/nav';
import { GAMES } from '../games/games-catalog';

export const metadata: Metadata = { title: t('shell.section.judge') };

/** Biểu tượng và màu chủ đề của từng game có đề chấm. */
const GAME_LOOK: Readonly<Record<string, { icon: IconName; topic: string }>> = {
  k8s: { icon: 'kube', topic: 'kubernetes' },
  git: { icon: 'branch', topic: 'git' },
  cicd: { icon: 'pipeline', topic: 'cicd' },
};

/**
 * `/judge`: tổng quan mục Luyện đề. Cửa vào kho đề và kỳ thi, lối vào đề của từng
 * game, rồi kỳ thi đang mở của lớp người xem.
 */
export default async function JudgeHubPage() {
  const session = await readRequestSession();
  if (session === null) {
    redirect(withReturnPath('/login', '/judge'));
  }

  const counts = await readHubCounts();
  const section = sectionById('judge');
  const playable = GAMES.filter((game) => game.href !== null && GAME_LOOK[game.id] !== undefined);

  return (
    <HubPage>
      <HubHeader
        title={section.label}
        lead={section.lead}
        art="judge"
        actions={
          <Button asChild variant="primary" icon="problem">
            <Link href="/problems">{t('hub.judge.start')}</Link>
          </Button>
        }
      />
      <SectionDoors section={section} stats={{ '/problems': { value: counts.problems, unit: t('hub.unit.problems') } }} />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
        <Section title={t('hub.judge.by-game')} description={t('hub.judge.by-game-description')} icon="gamepad">
          <ul className="flex flex-col">
            {playable.map((game) => {
              const look = GAME_LOOK[game.id];
              if (look === undefined) return null;
              return (
                <li key={game.id} data-topic={look.topic} className="border-b border-rule last:border-b-0">
                  <Link
                    href={`/problems?game=${encodeURIComponent(game.gameId)}`}
                    className="group/game flex items-center gap-4 py-3.5"
                  >
                    <Icon
                      name={look.icon}
                      size={30}
                      tint="topic"
                      className="shrink-0 text-tp-ink transition-transform duration-300 ease-out group-hover/game:rotate-6"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium text-ink transition-colors duration-150 group-hover/game:text-tp-ink">
                        {t('hub.judge.game-open', { game: game.title })}
                      </span>
                      <span className="line-clamp-2 text-sm text-ink-2">{game.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
        <ClassExams />
      </div>
    </HubPage>
  );
}
