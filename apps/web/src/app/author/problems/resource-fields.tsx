'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devops-platform/ui';
import type { IncidentKind, ResourceKind } from '@devops-platform/games';
import { TextAreaField, TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue, ResourceFormState } from './cluster-form';
import { INCIDENT_KINDS, INCIDENT_LABELS, RESOURCE_KINDS, isClusterScoped } from './vocabulary';

/**
 * Một tài nguyên trong cụm ban đầu, kèm ô gieo sự cố.
 *
 * ## Gieo sự cố là cách một bài "hỏng sẵn"
 *
 * Không có nó, người soạn phải tả tay từng trạng thái pod trong `spec` để dựng
 * một cụm đang lỗi — vừa dài vừa dễ tả ra một trạng thái mà engine không bao giờ
 * sinh được. Chọn một trong 32 loại thì engine tự dựng đúng cặp (triệu chứng →
 * nguyên nhân) mà nó biết cách gỡ.
 */
export function ResourceFields(props: {
  readonly resource: ResourceFormState;
  readonly index: number;
  readonly issues: readonly FieldIssue[];
  readonly onChange: (patch: Partial<ResourceFormState>) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const base = `resources.${String(props.index)}`;
  const clusterScoped = isClusterScoped(props.resource.kind);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium text-foreground">
          {props.resource.kind}
          {props.resource.name === '' ? '' : ` / ${props.resource.name}`}
        </h4>
        <Button type="button" variant="ghost" size="sm" onClick={props.onRemove}>
          {t('common.action.delete')}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`kind-${props.resource.key}`}>{t('problem.resource-fields-loai')}</Label>
          <Select
            value={props.resource.kind}
            onValueChange={(value) => {
              props.onChange({ kind: value as ResourceKind });
            }}
          >
            <SelectTrigger id={`kind-${props.resource.key}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOURCE_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {kind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TextField
          label={t('problem.predicate-arg-types-ten')}
          value={props.resource.name}
          onChange={(name) => {
            props.onChange({ name });
          }}
          error={issueFor(props.issues, `${base}.name`)}
        />
      </div>

      {clusterScoped ? (
        <p className="text-xs text-muted-foreground">
          <code className="font-mono">{props.resource.kind}</code>{' '}
          {t(
            'problem.resource-fields-co-pham-vi-cluster-nen-khong-thuoc-namespace-nao-o-namespace-bi-bo-qua',
          )}
        </p>
      ) : (
        <TextField
          label={t('problem.cluster-fields-namespace')}
          value={props.resource.namespace}
          onChange={(namespace) => {
            props.onChange({ namespace });
          }}
          error={issueFor(props.issues, `${base}.namespace`)}
          hint={t('problem.resource-fields-phai-la-mot-trong-cac-namespace-da-khai-o-tren')}
        />
      )}

      <TextAreaField
        label={t('problem.resource-fields-phan-than-json')}
        value={props.resource.specJson}
        onChange={(specJson) => {
          props.onChange({ specJson });
        }}
        rows={6}
        mono
        error={issueFor(props.issues, `${base}.spec`)}
        hint={t(
          'problem.resource-fields-hinh-dang-tuy-loai-tai-nguyen-engine-chi-doc-nhung-field-no-can-va-bo-qua-p',
        )}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`incident-${props.resource.key}`}>
          {t('problem.resource-fields-gieo-san-su-co-tuy-chon')}
        </Label>
        <Select
          value={props.resource.seededIncident === '' ? 'khong' : props.resource.seededIncident}
          onValueChange={(value) => {
            // Radix Select không nhận `value=""` cho một item, nên "không gieo"
            // phải mang một token riêng thay vì chuỗi rỗng.
            props.onChange({ seededIncident: value === 'khong' ? '' : (value as IncidentKind) });
          }}
        >
          <SelectTrigger id={`incident-${props.resource.key}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="khong">{t('problem.resource-fields-khong-gieo-su-co')}</SelectItem>
            {INCIDENT_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {INCIDENT_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
