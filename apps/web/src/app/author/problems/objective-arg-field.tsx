'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devops-platform/ui';
import { Field, TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import type { PredicateArgSpec } from './predicate-arg-types';
import { PROBE_VALUES } from './predicate-spec';
import { INCIDENT_KINDS, INCIDENT_LABELS, RESOURCE_KINDS } from './vocabulary';

/** Radix Select không nhận `value=""` cho một mục, nên "không đặt" mang một token riêng. */
const NONE = 'khong';

/**
 * Một ô tham số của vị từ K8s, vẽ theo kiểu `PREDICATE_SPECS` khai.
 *
 * Kiểu có tập giá trị đóng (`resource-kind`, `incident-kind`, `probe`) vẽ bằng ô
 * CHỌN: một giá trị ngoài tập không làm gì đỏ cả, `argKind` trả `null`, vị từ
 * trả `false`, và mục tiêu không bao giờ tích xanh.
 *
 * `namespace` và `node` vẫn là ô GÕ kèm dòng liệt kê thứ đang có trong cụm. Cố ý
 * không khoá thành ô chọn: một bài hợp lệ có thể kiểm sự VẮNG MẶT của thứ chưa
 * khai (`resource-absent` trên namespace người làm phải tự tạo).
 */
export function ObjectiveArgField(props: {
  readonly spec: PredicateArgSpec;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly issues: readonly FieldIssue[];
  readonly path: string;
  readonly namespaces: readonly string[];
  readonly nodes: readonly string[];
}): ReactElement {
  const label = props.spec.required
    ? t(props.spec.label)
    : t('problem.objective-arg-field-tuy-chon', { propsSpecLabel: t(props.spec.label) });
  const error = issueFor(props.issues, props.path);
  const options = closedOptions(props.spec);

  if (options !== null) {
    return (
      <Field label={label} error={error} path={props.path}>
        {({ id, describedBy, invalid }) => (
          <Select
            value={props.value === '' ? NONE : props.value}
            onValueChange={(value) => {
              props.onChange(value === NONE ? '' : value);
            }}
          >
            <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
              <SelectValue placeholder={t('problem.objective-arg-field-chon')} />
            </SelectTrigger>
            <SelectContent>
              {!props.spec.required && <SelectItem value={NONE}>{t('problem.objective-arg-field-khong-dat')}</SelectItem>}
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    );
  }

  const suggestions =
    props.spec.type === 'namespace' ? props.namespaces : props.spec.type === 'node' ? props.nodes : [];
  const isSelector = props.spec.type === 'selector';

  return (
    <TextField
      label={label}
      value={props.value}
      onChange={props.onChange}
      path={props.path}
      error={error}
      inputMode={props.spec.type === 'number' ? 'numeric' : undefined}
      placeholder={isSelector ? t('problem.objective-arg-field-app-web-tier-front') : undefined}
      hint={
        isSelector
          ? t('problem.objective-arg-field-dang-l-cua-kubectl-cap-k-v-ngan-bang-dau-phay')
          : suggestions.length > 0
            ? `${t('problem.objective-arg-field-dang-co-trong-cum')} ${suggestions.join(', ')}`
            : undefined
      }
    />
  );
}

function closedOptions(
  spec: PredicateArgSpec,
): readonly { readonly value: string; readonly label: string }[] | null {
  if (spec.type === 'resource-kind') return RESOURCE_KINDS.map((kind) => ({ value: kind, label: kind }));
  if (spec.type === 'incident-kind') {
    return INCIDENT_KINDS.map((kind) => ({ value: kind, label: INCIDENT_LABELS[kind] }));
  }
  if (spec.type === 'probe') {
    return PROBE_VALUES.map((probe) => ({
      value: probe,
      label:
        probe === 'readiness'
          ? t('problem.objective-arg-field-readiness-san-sang-nhan-luu-luong')
          : t('problem.objective-arg-field-liveness-con-song'),
    }));
  }
  return null;
}
