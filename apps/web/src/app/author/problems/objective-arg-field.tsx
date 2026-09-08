'use client';

import type { ReactElement } from 'react';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devops-platform/ui';
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
  const label = props.spec.required ? props.spec.label : `${props.spec.label} (tuỳ chọn)`;
  const error = issueFor(props.issues, props.path);

  if (props.spec.type === 'resource-kind' || props.spec.type === 'incident-kind' || props.spec.type === 'probe') {
    const options =
      props.spec.type === 'resource-kind'
        ? RESOURCE_KINDS.map((kind) => ({ value: kind, label: kind }))
        : props.spec.type === 'incident-kind'
          ? INCIDENT_KINDS.map((kind) => ({ value: kind, label: INCIDENT_LABELS[kind] }))
          : PROBE_VALUES.map((probe) => ({
              value: probe,
              label: probe === 'readiness' ? 'readiness — sẵn sàng nhận lưu lượng' : 'liveness — còn sống',
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
            <SelectValue placeholder="Chọn…" />
          </SelectTrigger>
          <SelectContent>
            {!props.spec.required && <SelectItem value="khong">Không đặt</SelectItem>}
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
    props.spec.type === 'namespace' ? props.namespaces : props.spec.type === 'node' ? props.nodes : [];

  return (
    <div className="flex flex-col gap-1">
      <TextField
        label={label}
        value={props.value}
        onChange={props.onChange}
        error={error}
        inputMode={props.spec.type === 'number' ? 'numeric' : undefined}
        {...(props.spec.type === 'selector' ? { placeholder: 'app=web,tier=front' } : {})}
        {...(props.spec.type === 'selector'
          ? { hint: 'Dạng -l của kubectl: cặp k=v ngăn bằng dấu phẩy.' }
          : {})}
      />
      {suggestions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Đang có trong cụm: {suggestions.map((item) => item).join(', ')}
        </p>
      )}
    </div>
  );
}
