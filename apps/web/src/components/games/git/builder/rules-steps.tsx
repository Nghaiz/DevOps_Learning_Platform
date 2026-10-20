'use client';

/**
 * Ba bước chỉ gồm ô chữ: luật chơi (tập lệnh, số lệnh chuẩn), lời giải mẫu, gợi ý.
 *
 * Phép chuyển giữa ô nhiều dòng và mảng của bản nháp nằm ở `draft-state.ts`,
 * không nội tuyến ở đây: với `allowedCommands`, ô TRẮNG phải ra `null` (mọi
 * lệnh) chứ không ra `[]` (cấm mọi lệnh), và cái bẫy đó cần một hàm có test.
 */

import type { ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import type { LevelDraft } from '@devops-platform/games';

import { LinesField, TextField } from './builder-fields';
import { BuilderStep } from './builder-step';
import {
  formatAllowedCommands,
  linesToList,
  listToLines,
  parseAllowedCommands,
  type DraftPatch,
} from './draft-state';

interface StepProps {
  readonly index: number;
  readonly draft: LevelDraft;
  readonly patch: DraftPatch;
}

export function RulesStep({ index, draft, patch }: StepProps): ReactElement {
  return (
    <BuilderStep index={index} id="builder-gioi-han-lenh" title={t('author.builder.step.rules')}>
      <LinesField
        id="builder-allowed"
        label={t('author.builder.label.allowed')}
        hint={t('author.builder.hint.allowed')}
        rows={3}
        mono
        value={draft.allowedCommands}
        parse={parseAllowedCommands}
        format={formatAllowedCommands}
        onChange={(allowedCommands) => {
          patch({ allowedCommands });
        }}
      />
      <div className="max-w-56">
        <TextField
          id="builder-par"
          type="number"
          min={0}
          label={t('author.builder.label.par')}
          hint={t('author.builder.hint.par')}
          value={String(draft.par)}
          onChange={(text) => {
            /*
             * `Number('')` ra `0`, không ra `NaN`, nên ô trống thành `par: 0` chứ
             * không thành một `NaN` lẻn vào JSON xuất ra. `NaN` qua
             * `JSON.stringify` thành `null`, và `looksLikeLevel` sẽ từ chối bản
             * xuất của chính ta lúc nhập lại: một vòng hỏng mà không ô nào bắt.
             */
            patch({ par: Number(text) });
          }}
        />
      </div>
    </BuilderStep>
  );
}

export function SolutionStep({ index, draft, patch }: StepProps): ReactElement {
  return (
    <BuilderStep index={index} id="builder-loi-giai" title={t('author.builder.step.solution')}>
      <LinesField
        id="builder-solution"
        label={t('author.builder.label.solution')}
        hint={t('author.builder.hint.solution')}
        rows={5}
        mono
        value={draft.solutionCommands}
        parse={linesToList}
        format={listToLines}
        onChange={(solutionCommands) => {
          patch({ solutionCommands });
        }}
      />
      <LinesField
        id="builder-alt-solution"
        label={t('author.builder.label.alt-solution')}
        hint={t('author.builder.hint.alt-solution')}
        rows={4}
        mono
        value={draft.altSolutionCommands}
        parse={linesToList}
        format={listToLines}
        onChange={(altSolutionCommands) => {
          patch({ altSolutionCommands });
        }}
      />
    </BuilderStep>
  );
}

export function HintsStep({ index, draft, patch }: StepProps): ReactElement {
  return (
    <BuilderStep index={index} id="builder-goi-y" title={t('author.builder.step.hints')}>
      <LinesField
        id="builder-hints"
        label={t('author.builder.label.hints')}
        hint={t('author.builder.hint.hints')}
        rows={4}
        value={draft.hints}
        parse={linesToList}
        format={listToLines}
        onChange={(hints) => {
          patch({ hints });
        }}
      />
    </BuilderStep>
  );
}
