'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import {
  Badge,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@devops-platform/ui';
import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_DIFFICULTY_LABELS,
  type ProblemDifficulty,
  type ProblemTopicOption,
} from '@devops-platform/games';
import { TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import type { ProblemFormState } from './problem-form';
import { DIFFICULTY_BADGE } from './problem-labels';
import { parseTags } from './text-tools';
import { AllowedResourcesFields } from './allowed-resources-fields';

/**
 * Độ khó, chủ đề, tag, hạn giờ, và giới hạn loại tài nguyên.
 *
 * ## `topics` là THAM SỐ, không phải một hằng import
 *
 * Bản trước đọc thẳng `PROBLEM_TOPICS` của K8s, nên mọi bài của mọi game sẽ
 * chọn chủ đề trong một danh sách nói về Pod. `core/problem.ts` đã chuyển tập
 * đóng xuống từng plugin đúng vì chuyện đó; component này nhận tập đã tra sẵn
 * từ `pluginViewFor(gameId)` và không tự biết game nào đang mở.
 */
export function ClassifyFields(props: {
  readonly form: ProblemFormState;
  readonly onChange: (patch: Partial<ProblemFormState>) => void;
  readonly issues: readonly FieldIssue[];
  /** Tập chủ đề ĐÓNG của game đang chọn. Rỗng khi game chưa có plugin. */
  readonly topics: readonly ProblemTopicOption[];
}): ReactElement {
  const tags = parseTags(props.form.tagsText);

  return (
    <section className="flex flex-col gap-5">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
        {t('problem.classify-fields-phan-loai')}
      </h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="problem-difficulty">{t('problem.classify-fields-do-kho')}</Label>
        <div className="flex items-center gap-3">
          <Select
            value={props.form.difficulty}
            onValueChange={(value) => {
              props.onChange({ difficulty: value as ProblemDifficulty });
            }}
          >
            <SelectTrigger id="problem-difficulty" className="w-56">
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
          <Badge variant={DIFFICULTY_BADGE[props.form.difficulty]}>
            {PROBLEM_DIFFICULTY_LABELS[props.form.difficulty]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'problem.classify-fields-bon-bac-co-y-khac-ba-bac-cua-bai-lab-ranh-gioi-kho-rat-kho-la-thu-nguoi-lam',
          )}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          {t('problem.classify-fields-chu-de-chon-1-den-3')}
        </legend>
        {props.topics.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('author.problem.game.no-topics')}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {props.topics.map((option) => (
            <TopicBox
              key={option.id}
              option={option}
              checked={props.form.topics.includes(option.id)}
              // Khoá các ô CHƯA chọn khi đã đủ ba: chặn trước rẻ hơn là cho bấm
              // rồi mới báo lỗi ở cổng xuất bản.
              disabled={!props.form.topics.includes(option.id) && props.form.topics.length >= 3}
              onToggle={(next) => {
                props.onChange({
                  topics: next
                    ? [...props.form.topics, option.id]
                    : props.form.topics.filter((value) => value !== option.id),
                });
              }}
            />
          ))}
        </div>
        {issueFor(props.issues, 'topics') !== null && (
          <p className="text-xs text-destructive">{issueFor(props.issues, 'topics')}</p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <TextField
          label={t('problem.classify-fields-tag-tu-do')}
          value={props.form.tagsText}
          onChange={(tagsText) => {
            props.onChange({ tagsText });
          }}
          placeholder={t('problem.classify-fields-crashloop-chan-doan-image')}
          hint={t(
            'problem.classify-fields-ngan-bang-dau-phay-tu-chuan-hoa-ve-chu-thuong-khong-dau-va-gach-noi-khi-luu',
          )}
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Switch
            id="problem-time-limit"
            checked={props.form.hasTimeLimit}
            onCheckedChange={(checked) => {
              props.onChange({ hasTimeLimit: checked });
            }}
          />
          <Label htmlFor="problem-time-limit">{t('problem.classify-fields-dat-han-gio')}</Label>
        </div>
        {props.form.hasTimeLimit ? (
          <TextField
            label={t('problem.classify-fields-han-gio-giay')}
            value={props.form.timeLimitSec}
            onChange={(timeLimitSec) => {
              props.onChange({ timeLimitSec });
            }}
            inputMode="numeric"
            error={issueFor(props.issues, 'timeLimitSec')}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {t(
              'problem.classify-fields-khong-gioi-han-gio-khong-phai-bai-nao-cung-nen-chay-dua-bai-chan-doan-can-t',
            )}
          </p>
        )}
      </div>

      <TextField
        label={t('problem.classify-fields-so-nuoc-di-chuan-tuy-chon')}
        value={props.form.parMoves}
        onChange={(parMoves) => {
          props.onChange({ parMoves });
        }}
        inputMode="numeric"
        error={issueFor(props.issues, 'parMoves')}
        hint={t(
          'problem.classify-fields-dung-de-cham-sao-de-trong-nghia-la-khong-cham-theo-so-nuoc-di',
        )}
      />

      <AllowedResourcesFields form={props.form} onChange={props.onChange} issues={props.issues} />
    </section>
  );
}

function TopicBox(props: {
  readonly option: ProblemTopicOption;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: (next: boolean) => void;
}): ReactElement {
  const id = `topic-${props.option.id}`;
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={(checked) => {
          props.onToggle(checked === true);
        }}
      />
      <Label htmlFor={id} className={props.disabled ? 'text-muted-foreground' : undefined}>
        {props.option.label}
      </Label>
    </div>
  );
}
