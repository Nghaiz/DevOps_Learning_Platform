'use client';

import { useId, type ReactElement } from 'react';
import { GitBranch, Boxes, Check } from 'lucide-react';
import { t } from '@devops-platform/copy';
import type { GameId } from '@devops-platform/games';
import { Alert, AlertDescription, AlertTitle } from '@devops-platform/ui';
import { AUTHORABLE_GAMES, pluginViewFor } from './game-plugin-view';

/**
 * Bốn phím mà radio gốc dùng để dời lựa chọn trong một nhóm. Cả bốn, không phải
 * hai: trình duyệt cho đi cả theo trục dọc lẫn trục ngang bất kể nhóm được bày
 * theo chiều nào, nên chặn `ArrowDown`/`ArrowUp` mà quên hai phím kia là để hở
 * đúng một nửa.
 */
const ARROW_KEYS: ReadonlySet<string> = new Set([
  'ArrowDown',
  'ArrowUp',
  'ArrowRight',
  'ArrowLeft',
]);

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
        <legend>{t('author.problem.game.label')}</legend>
        <div className="practice-creator-options">
          {AUTHORABLE_GAMES.map((game) => {
            const Icon = game.gameId === 'git' ? GitBranch : Boxes;
            return (
              <label
                key={game.gameId}
                className={props.gameId === game.gameId ? 'is-selected' : ''}
              >
                {/*
                 * `aria-disabled` chứ KHÔNG `disabled`, và đây là cùng một
                 * quyết định `components/shell/mode-toggle.tsx` đã chốt cho nút
                 * "sắp có": `disabled` làm phần tử BIẾN MẤT khỏi thứ tự Tab,
                 * nên câu giải thích vì sao nó khoá không tới được người dùng
                 * bàn phím. Ở đây câu đó là `author.problem.game.locked`, nối
                 * vào `<fieldset>` qua `aria-describedby` — mà `<fieldset>`
                 * không nhận focus, nên với `disabled` thì cả nhóm lẫn lời giải
                 * thích cùng biến mất một lượt.
                 *
                 * Hai chốt chặn đi kèm, vì `aria-disabled` không tự chặn gì:
                 * `onChange` trả về sớm, và `onKeyDown` nuốt phím mũi tên. Thiếu
                 * vế thứ hai thì radio gốc vẫn tự dời lựa chọn theo mũi tên rồi
                 * bị React kéo ngược lại ở lượt render sau — người dùng thấy
                 * lựa chọn nhảy một cái rồi bật về, không kèm lời giải thích nào.
                 */}
                <input
                  type="radio"
                  name={`${hintId}-game`}
                  value={game.gameId}
                  checked={props.gameId === game.gameId}
                  aria-disabled={props.canChange ? undefined : true}
                  onChange={() => {
                    if (!props.canChange) return;
                    props.onChange(game.gameId);
                  }}
                  onKeyDown={(event) => {
                    if (props.canChange) return;
                    if (ARROW_KEYS.has(event.key)) event.preventDefault();
                  }}
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
          {props.canChange ? t('author.problem.game.hint') : t('author.problem.game.locked')}
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
