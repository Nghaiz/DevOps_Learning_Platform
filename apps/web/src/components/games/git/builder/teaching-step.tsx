'use client';

/**
 * Soạn `teaching`, và NÓI RA rằng màn chơi Git hôm nay chưa hiện nó.
 *
 * Đo 2026-09-15: không chỗ nào trong `apps/web` đọc `GitLevel.teaching`; lời gọi
 * duy nhất tới `.teaching` là của arena k8s, trên kiểu level của nó. Trường này
 * vẫn đáng soạn vì nó đi theo tệp level xuất ra và `GitTeaching` đòi nó, nhưng
 * để người soạn viết một bài dẫn 250 từ mà không nói trước rằng chưa ai thấy nó
 * là lấy công của họ đổi lấy một ô trống. Câu đó nằm TRÊN MÀN (câu dẫn của bước,
 * testid `git-builder-teaching-note`), cùng lý lẽ với hai giới hạn ở khối đầu.
 */

import type { ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import type { GitTeaching } from '@devops-platform/games';

import { AreaField, LinesField, TextField } from './builder-fields';
import { BuilderStep } from './builder-step';
import { linesToList, listToLines } from './draft-state';
import { useRowKeys } from './row-keys';
import { Button } from '@devops-platform/ds';

/**
 * Một mục tra nhanh của `teaching.cheatsheet`.
 *
 * Suy ra từ `GitTeaching` chứ không khai lại: `GitCheatSheetEntry` không nằm
 * trong barrel `packages/games`. Một `interface` chép tay ở đây sẽ trùng hình
 * dạng hôm nay và lệch vào ngày ai đó thêm trường.
 */
type CheatSheetEntry = GitTeaching['cheatsheet'][number];

export interface TeachingStepProps {
  readonly index: number;
  readonly teaching: GitTeaching;
  readonly onChange: (next: GitTeaching) => void;
}

export function TeachingStep({ index, teaching, onChange }: TeachingStepProps): ReactElement {
  const rows = useRowKeys(teaching.cheatsheet.length);

  const replaceEntry = (at: number, next: CheatSheetEntry): void => {
    onChange({
      ...teaching,
      cheatsheet: teaching.cheatsheet.map((entry, i) => (i === at ? next : entry)),
    });
  };

  return (
    <BuilderStep
      index={index}
      id="builder-day-hoc"
      title={t('author.builder.step.teaching')}
      lead={t('author.builder.lead.teaching')}
      leadTestId="git-builder-teaching-note"
    >
      <AreaField
        id="builder-primer"
        label={t('author.builder.label.primer')}
        hint={t('author.builder.hint.primer')}
        rows={4}
        value={teaching.primer}
        onChange={(primer) => {
          onChange({ ...teaching, primer });
        }}
      />
      <LinesField
        id="builder-takeaways"
        label={t('author.builder.label.takeaways')}
        hint={t('author.builder.hint.takeaways')}
        rows={3}
        value={teaching.takeaways}
        parse={linesToList}
        format={listToLines}
        onChange={(takeaways) => {
          onChange({ ...teaching, takeaways });
        }}
      />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium text-ink-3">{t('author.builder.cheat.title')}</h3>
        {teaching.cheatsheet.length === 0 ? (
          <p className="text-sm text-ink-2">{t('author.builder.cheat.empty')}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {teaching.cheatsheet.map((entry, at) => {
              const rowKey = rows.keys[at] ?? String(at);
              const prefix = `builder-cheat-${rowKey}`;
              const n = at + 1;
              return (
                <li key={rowKey} className="animate-enter">
                  <fieldset className="min-w-0 border border-rule bg-paper p-4">
                    <legend className="text-xs font-medium text-ink-3 float-left mb-3 w-full text-tp-ink">
                      {t('author.builder.cheat.legend', { n })}
                    </legend>
                    <div className="clear-left flex flex-col gap-4">
                      <TextField
                        id={`${prefix}-command`}
                        label={t('author.builder.cheat.command')}
                        mono
                        value={entry.command}
                        onChange={(command) => {
                          replaceEntry(at, { ...entry, command });
                        }}
                      />
                      <TextField
                        id={`${prefix}-explain`}
                        label={t('author.builder.cheat.explain')}
                        value={entry.explain}
                        onChange={(explain) => {
                          replaceEntry(at, { ...entry, explain });
                        }}
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="danger"
                          icon="trash"
                          onClick={() => {
                            rows.remove(at);
                            onChange({
                              ...teaching,
                              cheatsheet: teaching.cheatsheet.filter((_, i) => i !== at),
                            });
                          }}
                        >
                          {t('author.builder.cheat.remove', { n })}
                        </Button>
                      </div>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
        )}
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            onClick={() => {
              rows.append();
              onChange({
                ...teaching,
                cheatsheet: [...teaching.cheatsheet, { command: '', explain: '' }],
              });
            }}
          >
            {t('author.builder.cheat.add')}
          </Button>
        </div>
      </div>
    </BuilderStep>
  );
}
