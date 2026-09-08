'use client';

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
  PROBLEM_TOPICS,
  PROBLEM_TOPIC_LABELS,
  type ProblemDifficulty,
  type ProblemTopic,
} from '@devops-platform/games';
import { TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import type { ProblemFormState } from './problem-form';
import { DIFFICULTY_BADGE } from './problem-labels';
import { parseTags } from './text-tools';
import { AllowedResourcesFields } from './allowed-resources-fields';

/** Độ khó, chủ đề, tag, hạn giờ, và giới hạn loại tài nguyên. */
export function ClassifyFields(props: {
  readonly form: ProblemFormState;
  readonly onChange: (patch: Partial<ProblemFormState>) => void;
  readonly issues: readonly FieldIssue[];
}): ReactElement {
  const tags = parseTags(props.form.tagsText);

  return (
    <section className="flex flex-col gap-5">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">Phân loại</h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="problem-difficulty">Độ khó</Label>
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
          Bốn bậc, cố ý khác ba bậc của bài lab. Ranh giới Khó / Rất khó là thứ người làm dựa vào để chọn bài kế
          tiếp.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Chủ đề — chọn 1 đến 3</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PROBLEM_TOPICS.map((topic) => (
            <TopicBox
              key={topic}
              topic={topic}
              checked={props.form.topics.includes(topic)}
              // Khoá các ô CHƯA chọn khi đã đủ ba: chặn trước rẻ hơn là cho bấm
              // rồi mới báo lỗi ở cổng xuất bản.
              disabled={!props.form.topics.includes(topic) && props.form.topics.length >= 3}
              onToggle={(next) => {
                props.onChange({
                  topics: next
                    ? [...props.form.topics, topic]
                    : props.form.topics.filter((value) => value !== topic),
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
          label="Tag tự do"
          value={props.form.tagsText}
          onChange={(tagsText) => {
            props.onChange({ tagsText });
          }}
          placeholder="crashloop, chẩn đoán, image"
          hint="Ngăn bằng dấu phẩy. Tự chuẩn hoá về chữ thường không dấu và gạch nối khi lưu."
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
          <Label htmlFor="problem-time-limit">Đặt hạn giờ</Label>
        </div>
        {props.form.hasTimeLimit ? (
          <TextField
            label="Hạn giờ (giây)"
            value={props.form.timeLimitSec}
            onChange={(timeLimitSec) => {
              props.onChange({ timeLimitSec });
            }}
            inputMode="numeric"
            error={issueFor(props.issues, 'timeLimitSec')}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Không giới hạn giờ. Không phải bài nào cũng nên chạy đua — bài chẩn đoán cần thời gian để đọc.
          </p>
        )}
      </div>

      <TextField
        label="Số nước đi chuẩn (tuỳ chọn)"
        value={props.form.parMoves}
        onChange={(parMoves) => {
          props.onChange({ parMoves });
        }}
        inputMode="numeric"
        error={issueFor(props.issues, 'parMoves')}
        hint="Dùng để chấm sao. Để trống nghĩa là không chấm theo số nước đi."
      />

      <AllowedResourcesFields form={props.form} onChange={props.onChange} issues={props.issues} />
    </section>
  );
}

function TopicBox(props: {
  readonly topic: ProblemTopic;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: (next: boolean) => void;
}): ReactElement {
  const id = `topic-${props.topic}`;
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
        {PROBLEM_TOPIC_LABELS[props.topic]}
      </Label>
    </div>
  );
}
