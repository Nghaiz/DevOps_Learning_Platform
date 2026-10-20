'use client';

/**
 * Bốn nhóm ô chỉ có nghĩa với BÀI TẬP, không với level: chủ đề, tag, điểm trừ
 * của gợi ý, và mục tiêu nào hiện trước khi nộp. Không ô nào ở đây vào tệp
 * level xuất ra. State sống ở `save-problem-panel.tsx`; file này chỉ vẽ.
 */

import type { ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import type { GitObjective } from '@devops-platform/games';

import { CheckField, TextField } from './builder-fields';
import { Chip, Input, Label } from '@devops-platform/ds';

/** Trần của `problemBodyShape.topics`. Chip thứ tư khoá luôn, không đợi Zod nói. */
export const MAX_TOPICS = 3;

const GROUP = 'flex min-w-0 flex-col gap-3 border-t border-rule pt-4';
const LEGEND = 'float-left mb-1 w-full text-sm leading-snug font-semibold text-ink';

export function TopicPicker({
  options,
  selected,
  onToggle,
}: {
  readonly options: readonly (readonly [string, string])[];
  readonly selected: readonly string[];
  readonly onToggle: (id: string) => void;
}): ReactElement {
  return (
    <fieldset className={GROUP}>
      <legend className={LEGEND}>{t('author.builder.save.topics')}</legend>
      <div className="clear-left flex flex-wrap gap-2">
        {options.map(([id, label]) => {
          const isSelected = selected.includes(id);
          return (
            <Chip key={id} pressed={isSelected} disabled={!isSelected && selected.length >= MAX_TOPICS} onPressedChange={() => {
                onToggle(id);
              }}>
              {label}
            </Chip>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TagField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  return (
    <div className={GROUP}>
      <TextField
        id="builder-tags"
        label={t('author.builder.save.tags')}
        hint={t('author.builder.save.tags-hint')}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

/**
 * Điểm trừ theo CHỈ SỐ gợi ý, không theo id: `GitLevel.hints` là mảng chuỗi trần
 * và không có id nào để bám. Khoá dòng theo chỉ số ở đây vì vậy là ĐÚNG mô hình
 * dữ liệu, không phải chỗ quên sửa. Hệ quả nằm ở chú thích của state trong panel.
 */
export function PenaltyLedger({
  hints,
  penalties,
  onChange,
}: {
  readonly hints: readonly string[];
  readonly penalties: Readonly<Record<number, number>>;
  readonly onChange: (index: number, value: number) => void;
}): ReactElement | null {
  if (hints.length === 0) return null;
  return (
    <fieldset className={GROUP}>
      <legend className={LEGEND}>{t('author.builder.save.penalties')}</legend>
      <p className="clear-left text-xs leading-relaxed text-ink-2">
        {t('author.builder.save.penalties-hint')}
      </p>
      <ol className="flex flex-col divide-y divide-rule border-y border-rule">
        {hints.map((hint, index) => (
          <li key={`penalty-${String(index)}`} className="flex items-center gap-3 py-2">
            <span
              aria-hidden
              className="w-6 shrink-0 font-mono text-xs text-ink-2 tabular-nums"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <Label
              htmlFor={`builder-penalty-${String(index)}`}
              className="min-w-0 flex-1 truncate font-normal"
            >
              {hint}
            </Label>
            <Input
              id={`builder-penalty-${String(index)}`}
              type="number"
              min={0}
              max={1000}
              step={1}
              value={penalties[index] ?? 0}
              onChange={(e) => {
                onChange(index, Number(e.target.value));
              }}
              className="w-24 font-mono tabular-nums"
            />
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

export function VisibilityList({
  objectives,
  hidden,
  onChange,
}: {
  readonly objectives: readonly GitObjective[];
  readonly hidden: ReadonlySet<string>;
  readonly onChange: (id: string, visible: boolean) => void;
}): ReactElement {
  return (
    <fieldset className={GROUP}>
      <legend className={LEGEND}>{t('author.builder.save.visible')}</legend>
      <p className="clear-left text-xs leading-relaxed text-ink-2">
        {t('author.builder.save.visible-hint')}
      </p>
      {objectives.length === 0 ? (
        <p className="text-sm text-ink-2">{t('author.builder.save.visible-empty')}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {objectives.map((objective) => (
            <CheckField
              key={objective.id}
              id={`builder-visible-${objective.id}`}
              label={objective.label === '' ? objective.id : objective.label}
              checked={!hidden.has(objective.id)}
              onChange={(visible) => {
                onChange(objective.id, visible);
              }}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}
