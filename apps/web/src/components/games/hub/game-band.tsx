import type { ReactElement } from 'react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { Button, GameArt, Icon, ProgressLine, cn } from '@devops-platform/ds';
import { topicLook } from '../../../lib/topic-look';
import type { GameEntry } from '../../../app/games/games-catalog';
import { GAME_TOPIC_LABEL } from '../../../app/games/games-catalog';
import { LevelDifficulty } from '../campaign/campaign-parts';
import { CAMPAIGN_HREF, countCompleted, levelHref, nextLevelId, type GameFacts } from './game-facts';
import type { GameProgress } from './use-game-progress';

/**
 * Một dải giới thiệu một game trên `/games`: nửa tranh trên nền màu của game, nửa chữ.
 *
 * Mọi con số ở đây đều tính: số màn và số chương từ `GameFacts` (dữ liệu màn thật),
 * tiến độ từ kho của chính game. Dải độ khó là mức dễ nhất và khó nhất có trong game.
 */

function progressText(done: number, total: number): string {
  if (done === 0) return t('games.band.progress.none');
  if (done >= total) return t('games.band.progress.all', { total });
  return t('games.band.progress.some', { done, total });
}

interface Cta {
  readonly href: string;
  readonly label: string;
}

/**
 * Nút chính: "Chơi" vào thẳng màn đầu, "Chơi tiếp" vào màn đầu tiên chưa qua, qua hết
 * rồi thì "Chơi lại" về danh sách màn để người chơi tự chọn. Chưa đọc xong tiến độ
 * (lần render đầu) thì coi như chưa chơi: liên kết vẫn đúng, chỉ là nhãn có thể đổi từ
 * "Chơi" sang "Chơi tiếp" một nhịp sau.
 */
function ctaOf(facts: GameFacts, progress: GameProgress | null): Cta {
  const first = facts.levelIds[0] ?? null;
  if (progress === null || progress.touched.size === 0 || first === null) {
    return {
      href: first === null ? CAMPAIGN_HREF[facts.id] : levelHref(facts.id, first),
      label: t('games.band.cta.play'),
    };
  }
  const next = nextLevelId(facts.levelIds, progress.completed);
  return next === null
    ? { href: CAMPAIGN_HREF[facts.id], label: t('games.band.cta.replay') }
    : { href: levelHref(facts.id, next), label: t('games.band.cta.continue') };
}

export function GameBand({
  game,
  facts,
  progress,
  order,
}: {
  readonly game: GameEntry;
  readonly facts: GameFacts;
  readonly progress: GameProgress | null;
  /** Vị trí trong danh sách đang hiện: quyết định tranh nằm trái hay phải. */
  readonly order: number;
}): ReactElement {
  const total = facts.levelIds.length;
  const done = progress === null ? 0 : countCompleted(facts.levelIds, progress.completed);
  const cta = ctaOf(facts, progress);
  const flipped = order % 2 === 1;
  const look = topicLook({ gameId: game.gameId });

  return (
    <li data-game={game.id} data-topic={look.topic} className="group grid border-b border-rule lg:grid-cols-12">
      <div
        className={cn(
          'relative flex min-h-56 items-center justify-center overflow-hidden bg-tp-wash px-6 py-10 lg:col-span-5 lg:min-h-[22rem]',
          flipped && 'lg:order-2',
        )}
      >
        <GameArt
          kind={facts.id}
          width={340}
          className="h-auto w-full max-w-[22rem] transition-transform duration-500 ease-out group-hover:-translate-y-1.5 motion-reduce:transition-none"
        />
      </div>

      <div className="flex flex-col gap-6 px-1 py-9 sm:px-6 md:px-10 md:py-12 lg:col-span-7 lg:justify-center">
        <div className="flex flex-wrap items-center gap-2">
          {game.topics.map((topic) => (
            <span key={topic} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-tp-tint px-3 text-xs font-medium text-tp-ink">
              <Icon name={look.icon} size={14} />
              {GAME_TOPIC_LABEL[topic]}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] text-balance text-ink sm:text-4xl">{game.title}</h2>
          <p className="max-w-[60ch] text-md text-ink-2">{game.description}</p>
        </div>

        <dl className="grid gap-5 border-t border-rule pt-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <dt className="text-sm text-ink-3">{t('games.band.facts-label')}</dt>
            <dd className="text-sm font-medium text-ink">{t('games.band.facts', { levels: total, chapters: facts.chapters })}</dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="text-sm text-ink-3">{t('games.band.difficulty')}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <LevelDifficulty value={facts.easiest} />
              {facts.hardest === facts.easiest ? null : (
                <>
                  <Icon name="arrow-right" size={16} className="text-ink-3" />
                  <LevelDifficulty value={facts.hardest} />
                </>
              )}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2">
          <ProgressLine
            value={total === 0 ? 0 : done / total}
            tone="topic"
            size="md"
            label={t('games.band.progress.aria', { name: game.title })}
            className="max-w-md"
          />
          <p className="text-sm tabular-nums text-ink-2" aria-live="polite">
            {progress === null ? ' ' : progressText(done, total)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button asChild size="lg" variant="primary" iconRight="arrow-right">
            <Link href={cta.href} aria-label={`${cta.label}: ${game.title}`}>
              {cta.label}
            </Link>
          </Button>
          {game.href === null ? null : (
            <Button asChild variant="ghost" size="lg" icon="list">
              <Link href={game.href}>{t('games.band.cta.levels')}</Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
