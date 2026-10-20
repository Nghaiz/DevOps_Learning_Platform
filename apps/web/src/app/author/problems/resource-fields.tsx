'use client';

import type { ReactElement } from 'react';
import { Trash2 } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devops-platform/ui';
import type { IncidentKind, ResourceKind } from '@devops-platform/games';
import { Field, TextAreaField, TextField, issueFor } from '../../../components/author/field';
import type { TopicLine } from '../../../components/kit';
import type { FieldIssue, ResourceFormState } from './cluster-form';
import { ItemBlock } from './item-block';
import { INCIDENT_KINDS, INCIDENT_LABELS, RESOURCE_KINDS, isClusterScoped } from './vocabulary';

/** Radix Select không nhận `value=""` cho một mục, nên "không gieo" mang một token riêng. */
const NO_INCIDENT = 'khong';

/**
 * Một tài nguyên trong cụm ban đầu, kèm ô gieo sự cố.
 *
 * Gieo sự cố là cách một bài "hỏng sẵn". Không có nó, người soạn phải tả tay
 * từng trạng thái pod để dựng một cụm đang lỗi, vừa dài vừa dễ tả ra một trạng
 * thái engine không bao giờ sinh được. Chọn một loại sự cố thì engine tự dựng
 * đúng cặp (triệu chứng, nguyên nhân) mà nó biết cách gỡ.
 */
export function ResourceFields(props: {
  readonly resource: ResourceFormState;
  readonly index: number;
  readonly line: TopicLine;
  readonly issues: readonly FieldIssue[];
  readonly onChange: (patch: Partial<ResourceFormState>) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const base = `resources.${String(props.index)}`;
  const { resource } = props;
  const clusterScoped = isClusterScoped(resource.kind);

  return (
    <ItemBlock
      index={props.index}
      line={props.line}
      path={base}
      title={resource.name === '' ? resource.kind : `${resource.kind} / ${resource.name}`}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconLeft={<Trash2 aria-hidden className="size-4" />}
          onClick={props.onRemove}
        >
          {t('common.action.delete')}
        </Button>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('problem.resource-fields-loai')}>
          {({ id }) => (
            <Select
              value={resource.kind}
              onValueChange={(value) => {
                props.onChange({ kind: value as ResourceKind });
              }}
            >
              <SelectTrigger id={id} className="font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind} className="font-mono">
                    {kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <TextField
          label={t('problem.predicate-arg-types-ten')}
          value={resource.name}
          path={`${base}.name`}
          onChange={(name) => {
            props.onChange({ name });
          }}
          error={issueFor(props.issues, `${base}.name`)}
        />
      </div>

      {clusterScoped ? (
        <p className="text-sm text-muted-foreground">
          <code className="font-mono text-foreground">{resource.kind}</code>{' '}
          {t('problem.resource-fields-co-pham-vi-cluster-nen-khong-thuoc-namespace-nao-o-namespace-bi-bo-qua')}
        </p>
      ) : (
        <TextField
          label={t('problem.cluster-fields-namespace')}
          value={resource.namespace}
          path={`${base}.namespace`}
          onChange={(namespace) => {
            props.onChange({ namespace });
          }}
          error={issueFor(props.issues, `${base}.namespace`)}
          hint={t('problem.resource-fields-phai-la-mot-trong-cac-namespace-da-khai-o-tren')}
        />
      )}

      <TextAreaField
        label={t('problem.resource-fields-phan-than-json')}
        value={resource.specJson}
        path={`${base}.spec`}
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

      <Field label={t('problem.resource-fields-gieo-san-su-co-tuy-chon')}>
        {({ id }) => (
          <Select
            value={resource.seededIncident === '' ? NO_INCIDENT : resource.seededIncident}
            onValueChange={(value) => {
              props.onChange({ seededIncident: value === NO_INCIDENT ? '' : (value as IncidentKind) });
            }}
          >
            <SelectTrigger id={id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_INCIDENT}>{t('problem.resource-fields-khong-gieo-su-co')}</SelectItem>
              {INCIDENT_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {INCIDENT_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </ItemBlock>
  );
}
