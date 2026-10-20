'use client';

/** E.3 (phần lõi), đề bài: mã, tiêu đề, nhiệm vụ, đề đầy đủ, chương, độ khó, bài đọc. */

import type { ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import {
  CUSTOM_LEVEL_ID_PREFIX,
  DIFFICULTIES,
  GIT_THEORY_IDS,
  type Difficulty,
  type LevelDraft,
} from '@devops-platform/games';

import { CHAPTERS, CHAPTER_TEXT, DIFFICULTY_TEXT } from './builder-copy';
import { AreaField, SelectField, TextField } from './builder-fields';
import { BuilderStep } from './builder-step';
import type { DraftPatch } from './draft-state';

const CHAPTER_OPTIONS = CHAPTERS.map((chapter) => ({
  value: String(chapter),
  label: t(CHAPTER_TEXT[chapter]),
}));

const DIFFICULTY_OPTIONS = DIFFICULTIES.map((name) => ({
  value: name,
  label: t(DIFFICULTY_TEXT[name]),
}));

const THEORY_OPTIONS = [
  { value: '', label: t('author.builder.option.no-theory') },
  ...GIT_THEORY_IDS.map((id) => ({ value: id, label: id })),
];

export interface BriefStepProps {
  readonly index: number;
  readonly draft: LevelDraft;
  readonly patch: DraftPatch;
}

export function BriefStep({ index, draft, patch }: BriefStepProps): ReactElement {
  return (
    <BuilderStep index={index} id="builder-de-bai" title={t('author.builder.step.brief')}>
      <div className="grid gap-4 @lg:grid-cols-2">
        <TextField
          id="builder-id"
          label={t('author.builder.label.id')}
          hint={t('author.builder.hint.id', { prefix: CUSTOM_LEVEL_ID_PREFIX })}
          mono
          value={draft.id}
          onChange={(id) => {
            patch({ id });
          }}
        />
        <TextField
          id="builder-title"
          label={t('author.builder.label.title')}
          value={draft.title}
          onChange={(title) => {
            patch({ title });
          }}
        />
      </div>
      <TextField
        id="builder-mission"
        label={t('author.builder.label.mission')}
        hint={t('author.builder.hint.mission')}
        value={draft.mission}
        onChange={(mission) => {
          patch({ mission });
        }}
      />
      <AreaField
        id="builder-brief"
        label={t('author.builder.label.brief')}
        hint={t('author.builder.hint.brief')}
        rows={4}
        value={draft.brief}
        onChange={(brief) => {
          patch({ brief });
        }}
      />
      <div className="grid gap-4 @lg:grid-cols-2">
        <SelectField
          id="builder-chapter"
          label={t('author.builder.label.chapter')}
          value={String(draft.chapter)}
          options={CHAPTER_OPTIONS}
          onChange={(value) => {
            patch({ chapter: Number(value) as LevelDraft['chapter'] });
          }}
        />
        <SelectField
          id="builder-difficulty"
          label={t('author.builder.label.difficulty')}
          value={draft.difficulty}
          options={DIFFICULTY_OPTIONS}
          onChange={(value) => {
            patch({ difficulty: value as Difficulty });
          }}
        />
      </div>
      <SelectField
        id="builder-theory"
        label={t('author.builder.label.theory')}
        hint={t('author.builder.hint.theory', { n: GIT_THEORY_IDS.length })}
        mono
        value={draft.theoryId ?? ''}
        options={THEORY_OPTIONS}
        onChange={(value) => {
          patch({ theoryId: value === '' ? null : value });
        }}
      />
    </BuilderStep>
  );
}
