'use client';

import { useId, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import type { GameId } from '@devops-platform/games';
import { fieldPathProps } from '../../../components/author/studio';
import { topicLook } from '../../../lib/topic-look';
import { AUTHORABLE_GAMES, pluginViewFor } from './game-plugin-view';
import { cn, Icon, Notice } from '@devops-platform/ds';

/**
 * Bốn phím radio gốc dùng để dời lựa chọn. Cả bốn: trình duyệt cho đi theo cả
 * hai trục bất kể nhóm bày theo chiều nào, chặn hai mà quên hai là hở một nửa.
 */
const ARROW_KEYS: ReadonlySet<string> = new Set(['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft']);

/**
 * Ô chọn game: NHÓM RADIO GỐC cùng một `name`, không phải `<select>`.
 *
 * Radio gốc cùng `name` được trình duyệt cấp sẵn roving tabindex và điều hướng
 * bằng mũi tên, đúng khuôn radio group của WAI-ARIA, không cần dòng `tabIndex`
 * hay `onKeyDown` nào. Input ẩn bằng `sr-only` (KHÔNG `display:none`) để vẫn
 * nhận focus; khung `label` hiện vòng focus qua `has-[:focus-visible]`.
 *
 * Mỗi ô mang màu và biểu tượng chủ đề của game (`topicLook`). Màu không phải kênh duy
 * nhất: ô đang chọn có nền màu, viền đậm hơn và dấu tích.
 */
export function GameSelectField(props: {
  readonly gameId: GameId;
  readonly onChange: (next: GameId) => void;
  readonly canChange: boolean;
}): ReactElement {
  const hintId = useId();
  const view = pluginViewFor(props.gameId);
  return (
    <div className="flex flex-col gap-4">
      <fieldset aria-describedby={hintId} className="flex flex-col gap-3" {...fieldPathProps('gameId')}>
        {/* Nhãn hiện ở tiêu đề khối; `legend` vẫn đặt tên cho nhóm. */}
        <legend className="sr-only">{t('author.problem.game.label')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {AUTHORABLE_GAMES.map((game) => {
            const selected = props.gameId === game.gameId;
            const look = topicLook({ gameId: game.gameId });
            return (
              <label
                key={game.gameId}
                data-topic={look.topic}
                className={cn(
                  'group flex min-h-16 items-center gap-3 rounded-md border p-3 transition-[background-color,border-color,color] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                  selected ? 'border-tp-mid bg-tp-tint text-tp-ink' : 'border-rule-2 bg-paper text-ink',
                  props.canChange ? 'cursor-pointer' : 'cursor-not-allowed',
                  props.canChange && !selected && 'hover:border-rule-2 hover:bg-well',
                  !props.canChange && !selected && 'opacity-60',
                )}
              >
                {/*
                 * `aria-disabled` chứ KHÔNG `disabled`: `disabled` đẩy cả nhóm ra
                 * khỏi thứ tự Tab, và câu giải thích vì sao nó khoá (nối vào
                 * `fieldset` qua `aria-describedby`) không tới được người dùng bàn
                 * phím. Hai chốt chặn đi kèm vì `aria-disabled` không tự chặn gì:
                 * `onChange` trả sớm, và `onKeyDown` nuốt phím mũi tên. Thiếu vế
                 * sau thì lựa chọn nhảy một cái rồi bị React kéo ngược về.
                 */}
                <input
                  type="radio"
                  className="sr-only"
                  name={`${hintId}-game`}
                  value={game.gameId}
                  checked={selected}
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
                <span
                  aria-hidden="true"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-tp-solid text-on-solid transition-transform duration-150 group-hover:-translate-y-0.5"
                >
                  <Icon name={look.icon} size={20} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{game.label}</span>
                  <span className="font-mono text-xs opacity-75">{game.codePrefix}</span>
                </span>
                {selected && <Icon name="check" size={16} className="shrink-0 animate-enter" />}
              </label>
            );
          })}
        </div>
        <p id={hintId} className="text-sm text-ink-2">
          {props.canChange ? t('author.problem.game.hint') : t('author.problem.game.locked')}
        </p>
      </fieldset>
      {view === null && (
        <Notice tone="warn" title={t('author.problem.game.no-plugin-title')}>{t('author.problem.game.no-plugin-body')}</Notice>
      )}
    </div>
  );
}
