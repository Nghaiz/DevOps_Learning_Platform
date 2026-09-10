'use client';

import type { ReactElement } from 'react';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@devops-platform/ui';
import { PREDICATE_NAMES, type PredicateName } from '@devops-platform/games';
import { TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import { ObjectiveArgField } from './objective-arg-field';
import { PREDICATE_SPECS, isPredicateName } from './predicate-spec';
import type { ObjectiveFormState } from './problem-form';

/**
 * Một mục tiêu: nhãn tiếng Việt + vị từ + tham số + cờ bắt buộc.
 *
 * ## Vị từ là ô CHỌN, và đó là cả lý do hệ OJ này khả thi
 *
 * Bản của k8sgames.com chấm bằng một `switch` 35 nhánh viết cứng, nên thêm bài
 * là sửa mã — họ không thể có trình soạn bài. Của ta tra theo tên trong bảng
 * `PREDICATES`, nên soạn bài bằng biểu mẫu là làm được.
 *
 * Điều kiện để nó thật sự làm được: tên vị từ phải LUÔN nằm trong bảng. Một ô gõ
 * tay phá đúng tính chất đó, và phá lặng lẽ — vị từ lạ không ném, `PREDICATES`
 * chỉ không tra ra gì, mục tiêu trả sai vĩnh viễn, và người phát hiện ra là
 * người học đầu tiên ngồi làm bài. Nên không có ô gõ tay ở đây, và
 * `problem-validate.ts` vẫn kiểm lại một lượt cho bài nhập từ JSON.
 */
export function ObjectiveFields(props: {
  readonly objective: ObjectiveFormState;
  readonly index: number;
  readonly issues: readonly FieldIssue[];
  readonly namespaces: readonly string[];
  readonly nodes: readonly string[];
  readonly onChange: (patch: Partial<ObjectiveFormState>) => void;
  readonly onRemove: () => void;
  readonly canRemove: boolean;
}): ReactElement {
  const base = `objectives.${String(props.index)}`;
  const check = props.objective.check;
  const spec = check !== '' && isPredicateName(check) ? PREDICATE_SPECS[check] : null;
  const requiredId = `objective-required-${props.objective.key}`;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium text-foreground">Mục tiêu {String(props.index + 1)}</h4>
        <Button type="button" variant="ghost" size="sm" disabled={!props.canRemove} onClick={props.onRemove}>
          Xoá
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Định danh"
          value={props.objective.id}
          onChange={(id) => {
            props.onChange({ id });
          }}
          error={issueFor(props.issues, `${base}.id`)}
          hint="Ổn định. Lịch sử nộp bài tham chiếu tới nó."
        />
        <TextField
          label="Nhãn tiếng Việt"
          value={props.objective.label}
          onChange={(label) => {
            props.onChange({ label });
          }}
          error={issueFor(props.issues, `${base}.label`)}
          placeholder="Deployment thanh-toan có đủ 3 replica sẵn sàng"
          hint="Nói người làm phải làm ĐƯỢC gì, không nói làm THẾ NÀO."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`objective-check-${props.objective.key}`}>Vị từ kiểm tra</Label>
        {/*
          Truyền `value` bằng cách RẢI có điều kiện chứ không truyền `undefined`:
          `exactOptionalPropertyTypes` của repo phân biệt "không khai prop" với
          "khai prop bằng undefined", và Radix chỉ nhận vế đầu. Truyền `''` thì
          Radix coi đó là một giá trị đã chọn và nuốt mất placeholder.
        */}
        <Select
          {...(check === '' ? {} : { value: check })}
          onValueChange={(value) => {
            props.onChange({ check: value as PredicateName });
          }}
        >
          <SelectTrigger id={`objective-check-${props.objective.key}`}>
            <SelectValue placeholder="Chọn một trong 32 vị từ…" />
          </SelectTrigger>
          <SelectContent>
            {PREDICATE_NAMES.map((predicate) => (
              <SelectItem key={predicate} value={predicate}>
                {PREDICATE_SPECS[predicate].label}: {predicate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {issueFor(props.issues, `${base}.check`) !== null && (
          <p className="text-xs text-destructive">{issueFor(props.issues, `${base}.check`)}</p>
        )}
      </div>

      {spec !== null && spec.args.length > 0 && (
        <div className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
          {spec.args.map((argSpec) => (
            <ObjectiveArgField
              key={argSpec.key}
              spec={argSpec}
              controlId={`arg-${props.objective.key}-${argSpec.key}`}
              path={`${base}.args.${argSpec.key}`}
              value={props.objective.args[argSpec.key] ?? ''}
              issues={props.issues}
              namespaces={props.namespaces}
              nodes={props.nodes}
              onChange={(value) => {
                props.onChange({ args: { ...props.objective.args, [argSpec.key]: value } });
              }}
            />
          ))}
        </div>
      )}

      {spec?.requireOneOf !== undefined && (
        <p className="text-xs text-muted-foreground">
          Phải điền ít nhất một trong:{' '}
          {spec.requireOneOf.map((key) => spec.args.find((arg) => arg.key === key)?.label ?? key).join(' hoặc ')}.
          Thiếu cả hai thì vị từ luôn trả sai, và bài không bao giờ qua được.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Switch
          id={requiredId}
          checked={props.objective.required}
          onCheckedChange={(required) => {
            props.onChange({ required });
          }}
        />
        <Label htmlFor={requiredId}>
          {props.objective.required ? 'Bắt buộc: không đạt thì không qua bài' : 'Thưởng: ăn điểm, không chặn'}
        </Label>
      </div>
    </div>
  );
}
