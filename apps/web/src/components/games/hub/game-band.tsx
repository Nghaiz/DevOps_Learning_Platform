import type { ReactElement } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import type { Difficulty as LevelDifficulty } from '@devops-platform/games';
import { Button, Difficulty, LINE_CLASSES, LINE_CODE, Meter, TopicBadge, cn, type LineId } from '@devops-platform/ui';
import { staggerStyle } from '../../kit';
import type { GameEntry } from '../../../app/games/games-catalog';
import { GAME_TOPIC_LABEL } from '../../../app/games/games-catalog';
import { GameArt } from './game-art';
import { CAMPAIGN_HREF, countCompleted, levelHref, nextLevelId, type GameFacts } from './game-facts';
import type { GameProgress } from './use-game-progress';

/**
 * Một dải giới thiệu một game trên `/games`: nửa tranh tô màu tuyến, nửa chữ.
 *
 * Mọi con số ở đây đều tính: số màn và số chương từ `GameFacts` (dữ liệu màn
 * thật), tiến độ từ kho của chính game. Không có nhãn "Từ cơ bản" dùng chung:
 * dải độ khó là mức dễ nhất và khó nhất có trong game đó.
 */

const DIFFICULTY_LABEL: Readonly<Record<LevelDifficulty, string>> = {
  basic: t('common.difficulty.beginner'),
  intermediate: t('common.difficulty.intermediate'),
  advanced: t('common.difficulty.advanced'),
};

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
 * Nút chính: "Chơi" vào thẳng màn đầu, "Chơi tiếp" vào màn đầu tiên chưa qua,
 * qua hết rồi thì "Chơi lại" về danh sách màn để người chơi tự chọn.
 * Chưa đọc xong tiến độ (lần render đầu) thì coi như chưa chơi: liên kết vẫn
 * đúng, chỉ là nhãn có thể đổi từ "Chơi" sang "Chơi tiếp" một nhịp sau.
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
  line,
  progress,
  number,
  order,
}: {
  readonly game: GameEntry;
  readonly facts: GameFacts;
  readonly line: LineId;
  readonly progress: GameProgress | null;
  /** Số hiệu tuyến cố định của game (01 K8s, 02 Git, 03 CI/CD), không đổi khi lọc. */
  readonly number: number;
  /** Vị trí trong danh sách đang hiện: quyết định tranh nằm trái hay phải và nhịp vào trang. */
  readonly order: number;
}): ReactElement {
  const total = facts.levelIds.length;
  const done = progress === null ? 0 : countCompleted(facts.levelIds, progress.completed);
  const cta = ctaOf(facts, progress);
  const flipped = order % 2 === 1;
  const topic = game.topics.map((item) => GAME_TOPIC_LABEL[item]).join(' / ');

  return (
    <li
      data-game={game.id}
      className="group stagger animate-rise grid border-b border-foreground lg:grid-cols-12"
      style={staggerStyle(order)}
    >
      <div
        className={cn(
          'relative isolate flex min-h-56 overflow-hidden lg:col-span-5 lg:min-h-[26rem]',
          LINE_CLASSES[line].fill,
          flipped && 'lg:order-2',
        )}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-hatch opacity-[0.14]" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-6 -left-1 -z-10 font-display text-[8rem] leading-none font-extrabold opacity-[0.16] select-none [font-stretch:125%] md:text-[11rem]"
        >
          {LINE_CODE[line]}
        </span>
        <GameArt
          game={facts.id}
          className="m-auto h-auto w-full max-w-[34rem] px-6 py-8 transition-transform duration-500 ease-out group-hover:-translate-y-1 motion-reduce:transition-none"
        />
      </div>

      <div className="flex flex-col gap-6 px-5 py-9 md:px-10 md:py-12 lg:col-span-7 lg:justify-center">
        <div className="flex flex-wrap items-center gap-3">
          <TopicBadge line={line} size="sm" />
          <p className="type-label text-muted-foreground">
            {t('games.band.kicker', { n: String(number).padStart(2, '0'), topic })}
          </p>
        </div>

        <div>
          <h2 className="type-display text-balance">{game.title}</h2>
          <p className="mt-4 max-w-2xl type-lead text-muted-foreground">{game.description}</p>
        </div>

        <dl className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <dt className="type-label text-muted-foreground">{t('games.band.facts-label')}</dt>
            <dd className="mt-2 font-medium">
              {t('games.band.facts', { levels: total, chapters: facts.chapters })}
            </dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">{t('games.band.difficulty')}</dt>
            <dd className="mt-2 flex flex-wrap items-center gap-2 font-medium">
              <Difficulty level={facts.easiest} showLabel label={DIFFICULTY_LABEL[facts.easiest]} />
              {facts.hardest === facts.easiest ? null : (
                <>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  <Difficulty level={facts.hardest} showLabel label={DIFFICULTY_LABEL[facts.hardest]} />
                </>
              )}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2">
          <Meter
            value={done}
            max={total}
            segments={Math.min(total, 36)}
            tone={line}
            label={t('games.band.progress.aria', { name: game.title })}
            className="h-2.5"
          />
          <p className="font-mono text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {progress === null ? ' ' : progressText(done, total)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button asChild size="lg">
            <Link href={cta.href} aria-label={`${cta.label}: ${game.title}`}>
              {cta.label}
              <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
            </Link>
          </Button>
          {game.href === null ? null : (
            <Button asChild variant="link">
              <Link href={game.href}>{t('games.band.cta.levels')}</Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
