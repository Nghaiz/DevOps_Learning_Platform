'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devops-platform/ui';
import { TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import type { PredicateArgSpec } from './predicate-arg-types';
import { PROBE_VALUES } from './predicate-spec';
import { INCIDENT_KINDS, INCIDENT_LABELS, RESOURCE_KINDS } from './vocabulary';

/**
 * Một ô tham số của vị từ, vẽ theo kiểu mà `PREDICATE_SPECS` khai.
 *
 * Bốn kiểu có tập giá trị đóng (`resource-kind`, `incident-kind`, `probe`, và
 * hai kiểu gợi ý theo cụm) được vẽ bằng ô CHỌN chứ không phải ô gõ. Lý do giống
 * hệt lý do ô vị từ không cho gõ tay: một giá trị ngoài tập không làm gì đỏ cả —
 * `argKind` trả `null`, vị từ trả `false`, và mục tiêu đơn giản là không bao giờ
 * tích xanh.
 *
 * `namespace` và `node` thì vẫn là ô GÕ, chỉ kèm một dòng liệt kê thứ đang có
 * trong cụm. Cố ý không khoá cứng thành ô chọn: một bài hợp lệ có thể kiểm sự
 * VẮNG MẶT của thứ chưa khai (`resource-absent` trên một namespace người làm
 * phải tự tạo), và khoá cứng sẽ chặn đúng những mục tiêu đó.
 */
export function ObjectiveArgField(props: {
  readonly spec: PredicateArgSpec;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly issues: readonly FieldIssue[];
  readonly path: string;
  readonly namespaces: readonly string[];
  readonly nodes: readonly string[];
  readonly controlId: string;
}): ReactElement {
  const label = props.spec.required
    ? props.spec.label
    : t('problem.objective-arg-field-tuy-chon', { propsSpecLabel: String(props.spec.label) });
  const error = issueFor(props.issues, props.path);

  if (
    props.spec.type === 'resource-kind' ||
    props.spec.type === 'incident-kind' ||
    props.spec.type === 'probe'
  ) {
    const options =
      props.spec.type === 'resource-kind'
        ? RESOURCE_KINDS.map((kind) => ({ value: kind, label: kind }))
        : props.spec.type === 'incident-kind'
          ? INCIDENT_KINDS.map((kind) => ({ value: kind, label: INCIDENT_LABELS[kind] }))
          : PROBE_VALUES.map((probe) => ({
              value: probe,
              label:
                probe === 'readiness'
                  ? t('problem.objective-arg-field-readiness-san-sang-nhan-luu-luong')
                  : t('problem.objective-arg-field-liveness-con-song'),
            }));

    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={props.controlId}>{label}</Label>
        <Select
          value={props.value === '' ? 'khong' : props.value}
          onValueChange={(value) => {
            props.onChange(value === 'khong' ? '' : value);
          }}
        >
          <SelectTrigger id={props.controlId}>
            <SelectValue placeholder={t('problem.objective-arg-field-chon')} />
          </SelectTrigger>
          <SelectContent>
            {!props.spec.required && (
              <SelectItem value="khong">{t('problem.objective-arg-field-khong-dat')}</SelectItem>
            )}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error !== null && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  const suggestions =
    props.spec.type === 'namespace'
      ? props.namespaces
      : props.spec.type === 'node'
        ? props.nodes
        : [];

  return (
    <div className="flex flex-col gap-1">
      <TextField
        label={label}
        value={props.value}
        onChange={props.onChange}
        error={error}
        inputMode={props.spec.type === 'number' ? 'numeric' : undefined}
        {...(props.spec.type === 'selector'
          ? { placeholder: t('problem.objective-arg-field-app-web-tier-front') }
          : {})}
        {...(props.spec.type === 'selector'
          ? { hint: t('problem.objective-arg-field-dang-l-cua-kubectl-cap-k-v-ngan-bang-dau-phay') }
          : {})}
      />
      {suggestions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('problem.objective-arg-field-dang-co-trong-cum')}{' '}
          {suggestions.map((item) => item).join(', ')}
        </p>
      )}
    </div>
  );
}
