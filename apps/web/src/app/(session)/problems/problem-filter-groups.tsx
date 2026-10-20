'use client';

import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { Button, Chip, Icon, Input, cn } from '@devops-platform/ds';
import type { GameId } from '@devops-platform/games';
import { topicLook } from '../../../lib/topic-look';
import { ALL_GAMES, gameName, type ProblemGameChoice } from './problem-game';

/**
 * Các khối nhỏ của thanh lọc bài tập: một hàng nhãn + lựa chọn, chọn game, nhóm chip
 * nhiều lựa chọn, và ô thêm tag.
 */
export function FilterRow(props: { readonly label: string; readonly hint?: string; readonly children: ReactNode }): ReactElement {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <div className="w-28 shrink-0 pt-1.5">
        <p id={labelId} className="text-sm text-ink-3">
          {props.label}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{props.children}</div>
        {props.hint === undefined ? null : <p className="text-xs text-ink-3">{props.hint}</p>}
      </div>
    </div>
  );
}

/**
 * Nhóm chip bật tắt. Bốn chiều lọc của kho đề đều là NHIỀU lựa chọn (chủ đề gộp bằng
 * HOẶC, tag gộp bằng VÀ), nên đây không phải một hàng tab một-lựa-chọn.
 */
export function ChipGroup<T extends string>(props: {
  readonly label: string;
  readonly hint?: string;
  readonly options: readonly T[];
  readonly labels: Readonly<Record<T, string>>;
  readonly selected: readonly T[];
  readonly onToggle: (value: T) => void;
  /** Hình đặt trước chữ trong chip (vạch độ khó, biểu tượng kết quả). */
  readonly decorate?: (value: T) => ReactNode;
}): ReactElement {
  return (
    <FilterRow label={props.label} {...(props.hint !== undefined ? { hint: props.hint } : {})}>
      {props.options.map((option) => (
        <Chip key={option} pressed={props.selected.includes(option)} onPressedChange={() => props.onToggle(option)}>
          {props.decorate?.(option)}
          {props.labels[option]}
        </Chip>
      ))}
    </FilterRow>
  );
}

/**
 * Chọn game: "Tất cả" rồi từng game, mỗi game mang màu và biểu tượng chủ đề của nó.
 * Một lựa chọn duy nhất (radio), vì chủ đề hiện bên dưới đổi theo game đang chọn.
 */
export function GameSwitch(props: {
  readonly games: readonly GameId[];
  readonly value: ProblemGameChoice;
  readonly onChange: (value: ProblemGameChoice) => void;
}): ReactElement {
  const options: readonly ProblemGameChoice[] = [ALL_GAMES, ...props.games];
  return (
    <div role="radiogroup" aria-label={t('problem.oj.filter.game')} className="-mx-1 flex flex-wrap gap-2 px-1">
      {options.map((choice) => {
        const active = props.value === choice;
        const look = choice === ALL_GAMES ? null : topicLook({ gameId: choice });
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={active}
            data-topic={look?.topic}
            onClick={() => props.onChange(choice)}
            className={cn(
              'group/game inline-flex h-11 items-center gap-2.5 rounded-md border px-4 text-sm font-medium outline-none',
              'transition-[background-color,border-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-focus',
              look === null
                ? active
                  ? 'border-acc-mid bg-acc-tint text-acc-ink'
                  : 'border-rule-2 bg-paper text-ink-2 hover:border-control hover:text-ink'
                : active
                  ? 'border-tp-mid bg-tp-tint text-tp-ink'
                  : 'border-rule-2 bg-paper text-ink-2 hover:border-tp-mid hover:text-ink',
            )}
          >
            <Icon
              name={look?.icon ?? 'layers'}
              size={20}
              tint={look === null ? 'acc' : 'topic'}
              className={cn('transition-transform duration-200 group-hover/game:-rotate-6', look === null ? 'text-acc-ink' : 'text-tp-ink')}
            />
            {choice === ALL_GAMES ? t('problem.oj.game.all') : gameName(choice)}
          </button>
        );
      })}
    </div>
  );
}

export function TagFilter(props: {
  readonly tags: readonly string[];
  readonly onAdd: (raw: string) => void;
  readonly onRemove: (tag: string) => void;
}): ReactElement {
  const inputId = useId();
  const [draft, setDraft] = useState('');

  return (
    <FilterRow label={t('problem.oj.filter.tag')} hint={t('problem.oj.filter.tag-hint')}>
      <form
        className="flex w-full max-w-xs gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          props.onAdd(draft);
          setDraft('');
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t('problem.oj.filter.tag')}
        </label>
        <Input
          id={inputId}
          value={draft}
          icon="hash"
          inputSize="sm"
          placeholder={t('problem.oj.filter.tag-placeholder')}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" variant="secondary" size="sm" icon="plus" disabled={draft.trim() === ''}>
          {t('problem.oj.filter.tag-add')}
        </Button>
      </form>
      {props.tags.map((tag) => (
        /*
          Nút bỏ tag mang `aria-label` riêng vì phần nhìn thấy được chỉ là tên tag và
          một dấu X: trình đọc màn hình phải nghe "Bỏ tag ingress", không phải "ingress, nút".
        */
        <button
          key={tag}
          type="button"
          aria-label={t('problem.oj.filter.tag-remove', { tag })}
          onClick={() => props.onRemove(tag)}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-acc-tint pl-3 pr-2 font-mono text-xs text-acc-ink outline-none transition-colors hover:bg-acc-soft focus-visible:outline-2 focus-visible:outline-focus animate-fade"
        >
          #{tag}
          <Icon name="close" size={14} />
        </button>
      ))}
    </FilterRow>
  );
}
