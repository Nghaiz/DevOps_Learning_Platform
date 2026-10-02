'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Switch } from '@devops-platform/ui';
import { Field, issueFor } from '../../../components/author/field';
import { CheckTile, CheckTileGroup } from './check-tile';
import type { FieldIssue } from './cluster-form';
import type { ProblemFormState } from './problem-form';
import { RESOURCE_KINDS } from './vocabulary';

/**
 * Giới hạn loại tài nguyên người làm được tạo: cách kiểm soát nhịp của một bài.
 *
 * ⚠ `null` và `[]` là HAI ý khác nhau: "cho dùng mọi loại" và "không cho tạo gì
 * cả". Một mảng rỗng không phân biệt nổi, nên form giữ cờ riêng và nhóm ô chọn
 * chỉ hiện khi cờ bật.
 */
export function AllowedResourcesFields(props: {
  readonly form: ProblemFormState;
  readonly onChange: (patch: Partial<ProblemFormState>) => void;
  readonly issues: readonly FieldIssue[];
}): ReactElement {
  const { form } = props;
  return (
    <div className="flex flex-col gap-3">
      <Field
        label={t('problem.allowed-resources-fields-gioi-han-loai-tai-nguyen-nguoi-lam-duoc-tao')}
        hint={
          form.restrictResources
            ? undefined
            : t(
                'problem.allowed-resources-fields-cho-dung-moi-loai-khac-han-chon-nhung-de-trong-cai-do-nghia-la-khong-tao-du',
              )
        }
      >
        {({ id, describedBy }) => (
          <Switch
            id={id}
            aria-describedby={describedBy}
            checked={form.restrictResources}
            onCheckedChange={(checked) => {
              props.onChange({ restrictResources: checked });
            }}
          />
        )}
      </Field>
      {form.restrictResources && (
        <CheckTileGroup
          legend={t('author.problem.field.allowed-resources')}
          path="allowedResources"
          error={issueFor(props.issues, 'allowedResources')}
          dense
        >
          {RESOURCE_KINDS.map((kind) => (
            <CheckTile
              key={kind}
              label={kind}
              mono
              checked={form.allowedResources.includes(kind)}
              onToggle={(next) => {
                props.onChange({
                  allowedResources: next
                    ? [...form.allowedResources, kind]
                    : form.allowedResources.filter((value) => value !== kind),
                });
              }}
            />
          ))}
        </CheckTileGroup>
      )}
    </div>
  );
}
