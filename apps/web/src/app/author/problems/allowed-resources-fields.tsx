'use client';

import type { ReactElement } from 'react';
import { Checkbox, Label, Switch } from '@devops-platform/ui';
import type { ResourceKind } from '@devops-platform/games';
import { issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import type { ProblemFormState } from './problem-form';
import { RESOURCE_KINDS } from './vocabulary';

/**
 * Giới hạn loại tài nguyên người làm được tạo — cách kiểm soát nhịp của một bài.
 *
 * ⚠ `null` và `[]` là HAI ý khác nhau: "cho dùng mọi loại" và "không cho tạo gì
 * cả". Một mảng rỗng không phân biệt nổi, nên form giữ một cờ riêng và ô chọn
 * chỉ hiện khi cờ bật.
 */
export function AllowedResourcesFields(props: {
  readonly form: ProblemFormState;
  readonly onChange: (patch: Partial<ProblemFormState>) => void;
  readonly issues: readonly FieldIssue[];
}): ReactElement {
  return (
    <fieldset className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Switch
          id="problem-restrict"
          checked={props.form.restrictResources}
          onCheckedChange={(checked) => {
            props.onChange({ restrictResources: checked });
          }}
        />
        <Label htmlFor="problem-restrict">Giới hạn loại tài nguyên người làm được tạo</Label>
      </div>
      {!props.form.restrictResources ? (
        <p className="text-xs text-muted-foreground">
          Cho dùng mọi loại. Khác hẳn &quot;chọn nhưng để trống&quot; — cái đó nghĩa là không tạo được gì.
        </p>
      ) : (
        <>
          <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-3">
            {RESOURCE_KINDS.map((kind) => (
              <KindBox
                key={kind}
                kind={kind}
                checked={props.form.allowedResources.includes(kind)}
                onToggle={(next) => {
                  props.onChange({
                    allowedResources: next
                      ? [...props.form.allowedResources, kind]
                      : props.form.allowedResources.filter((value) => value !== kind),
                  });
                }}
              />
            ))}
          </div>
          {issueFor(props.issues, 'allowedResources') !== null && (
            <p className="text-xs text-destructive">{issueFor(props.issues, 'allowedResources')}</p>
          )}
        </>
      )}
    </fieldset>
  );
}

function KindBox(props: {
  readonly kind: ResourceKind;
  readonly checked: boolean;
  readonly onToggle: (next: boolean) => void;
}): ReactElement {
  const id = `allowed-${props.kind}`;
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={props.checked}
        onCheckedChange={(checked) => {
          props.onToggle(checked === true);
        }}
      />
      <Label htmlFor={id} className="font-mono text-xs">
        {props.kind}
      </Label>
    </div>
  );
}
