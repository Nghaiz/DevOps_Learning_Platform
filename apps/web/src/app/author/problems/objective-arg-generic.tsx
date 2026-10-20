'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import type { ProblemArgSpec } from '@devops-platform/games';
import { Field, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@devops-platform/ds';

/** Hai giá trị `argBoolean` đọc. Là GIÁ TRỊ của engine, không phải chữ cho người đọc. */
const BOOLEAN_VALUES = ['true', 'false'] as const;

/**
 * Ô tham số vị từ cho game KHÁC K8s (P20).
 *
 * Component riêng chứ không nới `ObjectiveArgField`: ô K8s dựng bộ chọn có gợi ý
 * gắn chặt với dữ liệu cụm, ở đây không có gợi ý nào để đưa ra. Tên tham số là
 * định danh của engine (`ref`, `seconds`, `onBadRelease`) và nó không dịch, nên
 * nhãn hiện đúng cái tên ấy: người soạn tra tài liệu bằng chính nó.
 *
 * ⚠ `boolean` là ô CHỌN ba trạng thái, không phải công tắc: "bỏ trống" có nghĩa
 * riêng (engine đọc `argBoolean(...) ?? true`), mà công tắc thì không nói được.
 *
 * `lines`: mỗi dòng một phần tử. Câu đó nằm ở `placeholder` VÀ ở dòng gợi ý dưới
 * ô, vì placeholder biến mất ngay khi người soạn gõ chữ đầu tiên.
 */
export function ObjectiveArgGeneric(props: {
  readonly spec: ProblemArgSpec;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly issues: readonly FieldIssue[];
  readonly path: string;
}): ReactElement {
  const { spec } = props;
  const label = spec.optional ? t('problem.objective-arg-field-tuy-chon', { propsSpecLabel: spec.name }) : spec.name;
  const choices = spec.oneOf ?? (spec.kind === 'boolean' ? BOOLEAN_VALUES : null);
  const isLines = choices === null && spec.kind === 'lines';

  return (
    <Field
      label={label}
      path={props.path}
      error={issueFor(props.issues, props.path)}
      hint={isLines ? t('problem.objective-arg-generic-moi-dong-mot-phan-tu') : undefined}
    >
      {({ id, describedBy, invalid }) =>
        choices !== null ? (
          <Select {...(props.value === '' ? {} : { value: props.value })} onValueChange={props.onChange}>
            <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
              <SelectValue
                placeholder={
                  spec.oneOf === undefined
                    ? t('problem.objective-arg-generic-de-mac-dinh')
                    : t('problem.objective-arg-generic-chon-mot-gia-tri')
                }
              />
            </SelectTrigger>
            <SelectContent>
              {choices.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : isLines ? (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            rows={4}
            className="font-mono text-xs"
            value={props.value}
            placeholder={t('problem.objective-arg-generic-moi-dong-mot-phan-tu')}
            onChange={(event) => {
              props.onChange(event.target.value);
            }}
          />
        ) : (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            inputMode={spec.kind === 'number' ? 'numeric' : 'text'}
            value={props.value}
            onChange={(event) => {
              props.onChange(event.target.value);
            }}
          />
        )
      }
    </Field>
  );
}
