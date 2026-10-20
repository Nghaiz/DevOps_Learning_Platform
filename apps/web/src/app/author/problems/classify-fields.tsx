'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_DIFFICULTY_LABELS,
  type ProblemDifficulty,
  type ProblemTopicOption,
} from '@devops-platform/games';
import { Field, TextField, issueFor } from '../../../components/author/field';
import { AllowedResourcesFields } from './allowed-resources-fields';
import { CheckTile, CheckTileGroup } from './check-tile';
import type { FieldIssue } from './cluster-form';
import type { ProblemFormState } from './problem-form';
import { parseTags } from './text-tools';
import { ProblemDifficultyMark } from '../../(session)/problems/problem-badges';
import { Pill, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@devops-platform/ds';

/** Trần số chủ đề của một bài; cổng xuất bản kiểm cùng con số. */
const MAX_TOPICS = 3;

/**
 * Độ khó, chủ đề, tag, hạn giờ, số nước đi chuẩn, cờ seed, giới hạn tài nguyên.
 *
 * `topics` là THAM SỐ: tập đóng của game đang chọn, tra sẵn từ `pluginViewFor`.
 * Đọc thẳng `PROBLEM_TOPICS` của K8s thì bài Git chọn chủ đề trong danh sách Pod.
 */
export function ClassifyFields(props: {
  readonly form: ProblemFormState;
  readonly onChange: (patch: Partial<ProblemFormState>) => void;
  readonly issues: readonly FieldIssue[];
  readonly topics: readonly ProblemTopicOption[];
  readonly canSeed: boolean;
}): ReactElement {
  const { form } = props;
  const tags = parseTags(form.tagsText);

  return (
    <div className="flex flex-col gap-7">
      <Field
        label={t('problem.classify-fields-do-kho')}
        path="difficulty"
        hint={t('problem.classify-fields-bon-bac-co-y-khac-ba-bac-cua-bai-lab-ranh-gioi-kho-rat-kho-la-thu-nguoi-lam')}
      >
        {({ id, describedBy }) => (
          <div className="flex flex-wrap items-center gap-4">
            <Select
              value={form.difficulty}
              onValueChange={(value) => {
                props.onChange({ difficulty: value as ProblemDifficulty });
              }}
            >
              <SelectTrigger id={id} aria-describedby={describedBy} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROBLEM_DIFFICULTIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PROBLEM_DIFFICULTY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ProblemDifficultyMark value={form.difficulty} className="text-ink" />
          </div>
        )}
      </Field>

      <CheckTileGroup
        legend={t('problem.classify-fields-chu-de-chon-1-den-3')}
        path="topics"
        error={issueFor(props.issues, 'topics')}
        empty={props.topics.length === 0 ? t('author.problem.game.no-topics') : undefined}
      >
        {props.topics.map((option) => {
          const checked = form.topics.includes(option.id);
          return (
            <CheckTile
              key={option.id}
              label={option.label}
              checked={checked}
              // Khoá ô CHƯA chọn khi đã đủ: chặn trước rẻ hơn báo lỗi ở cổng xuất bản.
              disabled={!checked && form.topics.length >= MAX_TOPICS}
              onToggle={(next) => {
                props.onChange({
                  topics: next ? [...form.topics, option.id] : form.topics.filter((value) => value !== option.id),
                });
              }}
            />
          );
        })}
      </CheckTileGroup>

      <div className="flex flex-col gap-2">
        <TextField
          label={t('problem.classify-fields-tag-tu-do')}
          value={form.tagsText}
          path="tags"
          onChange={(tagsText) => {
            props.onChange({ tagsText });
          }}
          placeholder={t('problem.classify-fields-crashloop-chan-doan-image')}
          hint={t('problem.classify-fields-ngan-bang-dau-phay-tu-chuan-hoa-ve-chu-thuong-khong-dau-va-gach-noi-khi-luu')}
        />
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tag} className="animate-enter">
                <Pill tone="neutral" className="font-mono">
                  {tag}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label={t('problem.classify-fields-dat-han-gio')}>
            {({ id }) => (
              <Switch
                id={id}
                checked={form.hasTimeLimit}
                onCheckedChange={(checked) => {
                  props.onChange({ hasTimeLimit: checked });
                }}
              />
            )}
          </Field>
          {form.hasTimeLimit ? (
            <TextField
              label={t('problem.classify-fields-han-gio-giay')}
              value={form.timeLimitSec}
              path="timeLimitSec"
              onChange={(timeLimitSec) => {
                props.onChange({ timeLimitSec });
              }}
              inputMode="numeric"
              error={issueFor(props.issues, 'timeLimitSec')}
            />
          ) : (
            <p className="text-xs text-ink-2">
              {t('problem.classify-fields-khong-gioi-han-gio-khong-phai-bai-nao-cung-nen-chay-dua-bai-chan-doan-can-t')}
            </p>
          )}
        </div>
        <TextField
          label={t('problem.classify-fields-so-nuoc-di-chuan-tuy-chon')}
          value={form.parMoves}
          path="parMoves"
          onChange={(parMoves) => {
            props.onChange({ parMoves });
          }}
          inputMode="numeric"
          error={issueFor(props.issues, 'parMoves')}
          hint={t('problem.classify-fields-dung-de-cham-sao-de-trong-nghia-la-khong-cham-theo-so-nuoc-di')}
        />
      </div>

      {/*
        §18.D.6: cờ `seedable`, và câu giải thích nói ĐÚNG SỰ THẬT HÔM NAY. Không
        plugin nào khai `seedSpec`, nên một công tắc bật được là lời hứa chưa ai
        thực hiện: bài vào kỳ thi `per-student` sẽ phát CÙNG một đề cho mọi sinh
        viên, im lặng. Vô hiệu hoá kèm lý do thay vì ẩn hẳn; biên ghi cũng từ chối.
      */}
      <Field
        label={t('author.problem.seedable.label')}
        path="seedable"
        hint={props.canSeed ? t('author.problem.seedable.available') : t('author.problem.seedable.unavailable')}
      >
        {({ id, describedBy }) => (
          <Switch
            id={id}
            aria-describedby={describedBy}
            checked={form.seedable}
            disabled={!props.canSeed}
            onCheckedChange={(checked) => {
              props.onChange({ seedable: checked });
            }}
          />
        )}
      </Field>

      <AllowedResourcesFields form={form} onChange={props.onChange} issues={props.issues} />
    </div>
  );
}
