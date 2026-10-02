'use client';

import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button, Chip, Input, LINE_CLASSES, LINE_CODE, cn } from '@devops-platform/ui';
import type { GameId } from '@devops-platform/games';
import { lineForTopic } from '../../../components/kit';
import { gameName } from './problem-game';

/**
 * Các khối lọc của `/problems`: bộ chọn game (từ vựng chủ đề), nhóm chip cho tập
 * ĐÓNG, và ô nhập tag cho phân loại TỰ DO. Tách khỏi `problems-toolbar.tsx` vì
 * thanh lọc đã đủ dài, và vì đây là component giao diện thuần.
 */

/**
 * Một hàng lọc kiểu Thuỵ Sĩ: nhãn mono bên trái, nội dung bên phải. Cột trái là
 * NHÃN, không phải điều hướng.
 *
 * `role="group"` + `aria-labelledby` chứ không phải `<div>` + một dòng chữ:
 * trình đọc màn hình đọc tên nhóm trước mỗi chip, nên người dùng nghe "Độ khó,
 * Dễ, nút bật tắt" thay vì một chuỗi chip rời không biết thuộc nhóm nào.
 */
export function FilterRow(props: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}): ReactElement {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="grid gap-3 border-t border-border py-4 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-6"
    >
      <div>
        <p id={labelId} className="type-label text-muted-foreground">
          {props.label}
        </p>
        {props.hint !== undefined && (
          <p className="mt-1 text-xs text-muted-foreground">{props.hint}</p>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{props.children}</div>
    </div>
  );
}

/**
 * Nhóm chip nhiều lựa chọn cho một tập ĐÓNG (độ khó, kết quả, chủ đề).
 *
 * `Chip` là nút bật tắt có `aria-pressed`, nên trạng thái đang chọn được đọc ra
 * chứ không chỉ nhìn thấy qua màu nền đảo.
 */
export function ChipGroup<T extends string>(props: {
  readonly label: string;
  readonly hint?: string;
  readonly options: readonly T[];
  readonly labels: Readonly<Record<T, string>>;
  readonly selected: readonly T[];
  readonly onToggle: (value: T) => void;
  /** Hình đặt trước chữ trong chip (glyph độ khó, biểu tượng kết quả). */
  readonly decorate?: (value: T) => ReactNode;
}): ReactElement {
  return (
    <FilterRow label={props.label} {...(props.hint !== undefined ? { hint: props.hint } : {})}>
      {props.options.map((option) => (
        <Chip
          key={option}
          selected={props.selected.includes(option)}
          onClick={() => {
            props.onToggle(option);
          }}
        >
          {props.decorate?.(option)}
          {props.labels[option]}
        </Chip>
      ))}
    </FilterRow>
  );
}

/**
 * Bộ chọn game: điều khiển phân đoạn lớn, mỗi ô mang màu tuyến của game.
 *
 * Một lựa chọn duy nhất, KHÁC các nhóm chip bên dưới: từ vựng chủ đề của các game
 * là các tập rời, nên "đang chọn" luôn là đúng một game. Nhãn của khối nói thẳng
 * nó làm gì (đổi chủ đề), vì nó KHÔNG lọc bài theo game: `ProblemFilter` chưa có
 * trường `gameId` (xem `problem-game.ts`). Một bộ chọn trông như bộ lọc cả trang
 * mà chỉ đổi được từ vựng là một điều khiển nói dối.
 */
export function GameSwitch(props: {
  readonly games: readonly GameId[];
  readonly value: GameId;
  readonly onChange: (value: GameId) => void;
}): ReactElement {
  return (
    <FilterRow label={t('problem.oj.filter.game')} hint={t('problem.oj.filter.game-hint')}>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:max-w-3xl">
        {props.games.map((gameId) => {
          const line = lineForTopic({ gameId });
          const active = props.value === gameId;
          const classes = line === 'ink' ? null : LINE_CLASSES[line];
          return (
            <button
              key={gameId}
              type="button"
              aria-pressed={active}
              onClick={() => {
                props.onChange(gameId);
              }}
              className={cn(
                'group flex h-14 items-center gap-3 border-2 px-4 text-left outline-none',
                'transition-[background-color,color,transform] duration-[var(--motion-fast)] ease-out motion-safe:active:translate-y-px',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                classes === null
                  ? active
                    ? 'border-ink bg-ink text-ink-foreground'
                    : 'border-ink bg-card text-foreground hover:bg-muted'
                  : active
                    ? cn(classes.border, classes.fill)
                    : cn(classes.border, 'bg-card text-foreground hover:bg-muted'),
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-flex h-7 min-w-10 items-center justify-center px-1.5 font-mono text-xs font-semibold tracking-wider',
                  active
                    ? 'bg-background/20'
                    : classes === null
                      ? 'bg-ink text-ink-foreground'
                      : classes.fill,
                )}
              >
                {line === 'ink' ? gameId.toUpperCase() : LINE_CODE[line]}
              </span>
              <span className="type-title">{gameName(gameId)}</span>
            </button>
          );
        })}
      </div>
    </FilterRow>
  );
}

/**
 * Ô lọc theo tag: tập MỞ, nên là ô nhập chứ không phải nhóm chip.
 *
 * Luật gộp ở đây là VÀ (bài phải có đủ mọi tag), cố ý khác luật HOẶC của chủ
 * đề; câu `hint` là cách người dùng biết được điều đó mà không phải đoán từ kết
 * quả trả về.
 *
 * `<form onSubmit>` chứ không bắt phím `Enter` bằng tay: form cho Enter hoạt động
 * sẵn, cho nút "Thêm tag" hoạt động bằng cả chuột lẫn bàn phím.
 */
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
        className="flex w-full max-w-sm gap-2"
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
          className="h-9"
          placeholder={t('problem.oj.filter.tag-placeholder')}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={draft.trim() === ''}
          iconLeft={<Plus aria-hidden className="size-4" />}
        >
          {t('problem.oj.filter.tag-add')}
        </Button>
      </form>
      {props.tags.map((tag) => (
        /*
          Nút bỏ tag mang `aria-label` riêng vì phần nhìn thấy được chỉ là tên tag
          và một dấu X: trình đọc màn hình phải nghe "Bỏ tag ingress", không phải
          "ingress, nút".
        */
        <button
          key={tag}
          type="button"
          aria-label={t('problem.oj.filter.tag-remove', { tag })}
          onClick={() => {
            props.onRemove(tag);
          }}
          className={cn(
            'inline-flex h-8 animate-rise items-center gap-1.5 border border-ink bg-ink px-3 font-mono text-xs text-ink-foreground outline-none',
            'transition-transform duration-[var(--motion-fast)] motion-safe:active:translate-y-px',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          #{tag}
          <X aria-hidden className="size-3.5" />
        </button>
      ))}
    </FilterRow>
  );
}
