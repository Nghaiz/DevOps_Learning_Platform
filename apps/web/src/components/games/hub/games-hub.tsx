'use client';

import { useId, useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { renderCopy, t } from '@devops-platform/copy';
import {
  Button,
  Chip,
  Empty,
  EmptyArt,
  Icon,
  Input,
  Page,
  PageHeader,
  Pill,
  ProgressLine,
  Row,
  RowList,
  Section,
  TopicGlyph,
  type IconName,
} from '@devops-platform/ds';
import {
  GAMES,
  GAME_META,
  GAME_TOPICS,
  GAME_TOPIC_LABEL,
  describeGameCount,
  filterGames,
  type GameEntry,
  type GameMetaItem,
  type GameTopic,
} from '../../../app/games/games-catalog';
import { topicLook } from '../../../lib/topic-look';
import { normalizeSearchQuery } from '../../catalog/catalog-search';
import { useViewer } from '../../shell/viewer-context';
import { GameBand } from './game-band';
import { countCompleted, type GameFacts } from './game-facts';
import { useGameProgress } from './use-game-progress';

/**
 * Trang `/games`: ba game chơi được, mỗi game một dải, rồi game đang dựng, rồi lối
 * sang phần có chấm điểm.
 *
 * Không thẻ, không hàng ô số liệu: con số nằm trong câu và trong thước tiến độ. Game
 * chạy hoàn toàn trong trình duyệt, nên trang này cũng không gọi mạng: dữ liệu game là
 * hằng, tiến độ đọc từ `localStorage`.
 */

function matchesQuery(game: GameEntry, query: string): boolean {
  if (query === '') return true;
  const haystack = [game.title, game.description, ...game.topics.map((topic) => GAME_TOPIC_LABEL[topic])].join(' ');
  return normalizeSearchQuery(haystack).includes(query);
}

const META_ICON: Readonly<Record<GameMetaItem['icon'], IconName>> = { sandbox: 'bolt', login: 'unlock' };

const TOPIC_OF_FILTER: Readonly<Record<GameTopic, string>> = {
  kubernetes: 'kubernetes',
  cicd: 'cicd',
  network: 'networking',
  container: 'docker',
  git: 'git',
};

export function GamesHub({ facts }: { readonly facts: readonly GameFacts[] }): ReactElement {
  const viewer = useViewer();
  const progress = useGameProgress();
  const searchId = useId();
  const topicLabelId = useId();
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState<GameTopic | 'all'>('all');

  const query = normalizeSearchQuery(search);
  const filtering = topic !== 'all' || query !== '';
  const shown = useMemo(
    () => filterGames(GAMES, { topic, difficulty: 'all' }).filter((game) => matchesQuery(game, query)),
    [topic, query],
  );
  const playable = shown.filter((game) => game.href !== null);
  const upcoming = shown.filter((game) => game.href === null);
  const totalLevels = facts.reduce((sum, game) => sum + game.levelIds.length, 0);
  const doneLevels =
    progress === null ? 0 : facts.reduce((sum, game) => sum + countCompleted(game.levelIds, progress[game.id].completed), 0);
  const isAuthor = viewer?.role === 'author' || viewer?.role === 'admin';

  const clear = (): void => {
    setSearch('');
    setTopic('all');
  };

  return (
    <>
      <Page>
        <PageHeader size="lg" title={t('games.hub.title')} lead={t('games.hub.lead')}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="gamepad" size={18} tint="acc" className="text-acc-ink" />
                {t('games.hub.summary', { games: facts.length, levels: totalLevels })}
              </span>
              <ProgressLine
                value={totalLevels === 0 ? 0 : doneLevels / totalLevels}
                size="md"
                label={t('games.hub.progress.label')}
                caption={`${String(doneLevels)}${t('games.hub.progress.unit', { total: totalLevels })}`}
                className="w-full max-w-sm"
              />
            </div>
            <ul className="flex flex-wrap items-center gap-2">
              {GAME_META.map((item) => (
                <li key={item.icon}>
                  <Pill icon={META_ICON[item.icon]}>{item.label}</Pill>
                </li>
              ))}
              <li className="text-xs text-ink-3">{t('games.hub.saved-local')}</li>
            </ul>
          </div>
        </PageHeader>

        <div className="flex flex-col gap-4 border-y border-rule py-5 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-labelledby={topicLabelId} className="flex flex-wrap items-center gap-2">
            <span id={topicLabelId} className="mr-1 text-sm text-ink-3">
              {t('games.hub.filter.label')}
            </span>
            <Chip pressed={topic === 'all'} onPressedChange={() => setTopic('all')}>
              {t('games.hub.filter.all')}
            </Chip>
            {GAME_TOPICS.map((value) => (
              <Chip key={value} topic={TOPIC_OF_FILTER[value]} pressed={topic === value} onPressedChange={() => setTopic(value)}>
                {GAME_TOPIC_LABEL[value]}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="w-full sm:w-72">
              <label htmlFor={searchId} className="sr-only">
                {t('games.hub.search.label')}
              </label>
              <Input
                id={searchId}
                type="search"
                icon="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('games.hub.search.placeholder')}
              />
            </div>
            <p className="text-sm tabular-nums text-ink-3" aria-live="polite">
              {renderCopy(describeGameCount(shown.length, filtering))}
            </p>
            {filtering ? (
              <Button variant="ghost" size="sm" icon="close" onClick={clear}>
                {t('games.hub.clear')}
              </Button>
            ) : null}
          </div>
        </div>
      </Page>

      {shown.length === 0 ? (
        <Page className="py-12">
          <Empty
            title={t('games.hub.empty.title')}
            art={<EmptyArt kind="search" />}
            action={
              <Button variant="secondary" onClick={clear}>
                {t('games.hub.clear')}
              </Button>
            }
          >
            {t('games.hub.empty.body')}
          </Empty>
        </Page>
      ) : playable.length === 0 ? (
        <Page className="py-10">
          <p className="max-w-2xl text-md text-ink-2">
            {t('games.hub.none-playable', {
              topic: topic === 'all' ? t('games.hub.filter.all') : GAME_TOPIC_LABEL[topic],
            })}
          </p>
        </Page>
      ) : (
        <Page>
          <ol aria-label={t('games.hub.playable-label')} className="flex flex-col">
            {playable.map((game, order) => {
              const gameFacts = facts.find((entry) => entry.id === game.id);
              if (gameFacts === undefined) {
                throw new Error(`Game ${game.id} chơi được mà máy chủ không gửi dữ liệu màn của nó.`);
              }
              return (
                <GameBand
                  key={game.id}
                  game={game}
                  facts={gameFacts}
                  progress={progress === null ? null : progress[gameFacts.id]}
                  order={order}
                />
              );
            })}
          </ol>
        </Page>
      )}

      <Page className="flex flex-col gap-14 py-14">
        {upcoming.length > 0 ? (
          <Section title={t('games.soon.title')} description={t('games.soon.note')} icon="hourglass">
            <RowList label={t('games.soon.title')} className="border-t border-rule">
              {upcoming.map((game) => {
                const look = topicLook({ gameId: game.gameId });
                return (
                  <Row
                    key={game.id}
                    topic={look.topic}
                    leading={<TopicGlyph topic={look.topic} icon={look.icon} size={26} />}
                    title={game.title}
                    description={game.description}
                    meta={<span className="text-xs text-ink-3">{game.topics.map((item) => GAME_TOPIC_LABEL[item]).join(', ')}</span>}
                    trailing={<Pill icon="hourglass">{t('games.soon.badge')}</Pill>}
                  />
                );
              })}
            </RowList>
          </Section>
        ) : null}

        <div className={isAuthor ? 'grid gap-12 lg:grid-cols-2' : 'grid gap-12'}>
          <Section title={t('games.practice.title')} description={t('games.practice.note')} icon="problem">
            <RowList label={t('games.practice.title')} className="border-t border-rule">
              <LinkRow href="/problems" icon="problem" title={t('games.practice.problems.title')} sub={t('games.practice.problems.sub')} />
              <LinkRow href="/exams" icon="timer" title={t('games.practice.exams.title')} sub={t('games.practice.exams.sub')} />
            </RowList>
          </Section>
          {isAuthor ? (
            <Section title={t('games.studio.title')} description={t('games.studio.note')} icon="pen">
              <RowList label={t('games.studio.title')} className="border-t border-rule">
                <LinkRow href="/author/problems/new" icon="problem" title={t('games.studio.problem.title')} sub={t('games.studio.problem.sub')} />
                <LinkRow href="/games/git?mode=builder" icon="branch" title={t('games.studio.builder.title')} sub={t('games.studio.builder.sub')} />
                <LinkRow href="/author/new" icon="file-text" title={t('games.studio.lesson.title')} sub={t('games.studio.lesson.sub')} />
              </RowList>
            </Section>
          ) : null}
        </div>
      </Page>
    </>
  );
}

function LinkRow(props: { readonly href: string; readonly icon: IconName; readonly title: string; readonly sub: string }): ReactElement {
  return (
    <Row
      leading={
        <span className="grid size-9 place-items-center rounded-full bg-acc-tint text-acc-ink">
          <Icon name={props.icon} size={18} />
        </span>
      }
      title={props.title}
      link={<Link href={props.href}>{props.title}</Link>}
      description={props.sub}
      trailing={<Icon name="arrow-right" size={18} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />}
    />
  );
}
