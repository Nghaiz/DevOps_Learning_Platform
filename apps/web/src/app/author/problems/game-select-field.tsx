'use client';

import { useId, type ReactElement } from 'react';
import { GitBranch, Boxes, Check } from 'lucide-react';
import { t } from '@devops-platform/copy';
import type { GameId } from '@devops-platform/games';
import { Alert, AlertDescription, AlertTitle } from '@devops-platform/ui';
import { AUTHORABLE_GAMES, pluginViewFor } from './game-plugin-view';

export function GameSelectField(props: {
  readonly gameId: GameId;
  readonly onChange: (next: GameId) => void;
  readonly canChange: boolean;
}): ReactElement {
  const hintId = useId();
  const view = pluginViewFor(props.gameId);
  return (
    <section className="practice-creator-game">
      <fieldset aria-describedby={hintId}>
        <legend>Game của bài tập</legend>
        <div className="practice-creator-options">
          {AUTHORABLE_GAMES.map((game) => {
            const Icon = game.gameId === 'git' ? GitBranch : Boxes;
            return (
              <label
                key={game.gameId}
                className={props.gameId === game.gameId ? 'is-selected' : ''}
              >
                <input
                  type="radio"
                  name={`${hintId}-game`}
                  value={game.gameId}
                  checked={props.gameId === game.gameId}
                  disabled={!props.canChange}
                  onChange={() => props.onChange(game.gameId)}
                />
                <Icon size={24} aria-hidden="true" />
                <span>
                  {game.label}
                  <small>{game.codePrefix}</small>
                </span>
                {props.gameId === game.gameId && <Check size={17} aria-hidden="true" />}
              </label>
            );
          })}
        </div>
        <p id={hintId}>
          {props.canChange
            ? 'Chọn game trước khi dựng môi trường.'
            : 'Game được cố định sau lần lưu đầu tiên.'}
        </p>
      </fieldset>
      {view === null && (
        <Alert>
          <AlertTitle>{t('author.problem.game.no-plugin-title')}</AlertTitle>
          <AlertDescription>{t('author.problem.game.no-plugin-body')}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
