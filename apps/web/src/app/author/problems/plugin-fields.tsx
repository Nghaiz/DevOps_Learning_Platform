'use client';

import { useId, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import type { AuthorField } from '@devops-platform/games';
import { Checkbox, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@devops-platform/ui';
import { Field, TextAreaField, TextField, issueFor } from '../../../components/author/field';
import { fieldPathProps } from '../../../components/author/studio';
import type { FieldIssue } from './cluster-form';
import { isJsonShaped, type SpecTextState } from './spec-text';

/**
 * Biểu mẫu trạng thái ban đầu DỰNG TỪ `authorFields` của plugin (§18.A.6).
 *
 * `authorFields` là mô tả form dạng DỮ LIỆU, không phải JSX, vì `packages/games`
 * cấm React. Chỗ dịch dữ liệu thành widget phải nằm ở tầng UI, và đây là nó.
 *
 * Sáu trên bảy kiểu có widget đúng kiểu. `list` (danh sách lặp một NHÓM trường
 * con) hiện thành ô JSON thô kèm câu nói rõ nó là ô JSON: một widget lặp-nhóm nửa
 * vời (không đổi thứ tự được) tệ hơn một ô JSON trung thực.
 *
 * Mọi ô mang `path` = `field.path`, nên lỗi của plugin trong bảng kiểm nhảy được
 * về đúng ô, và câu lỗi nối vào ô qua `aria-describedby`.
 */
export function PluginFields(props: {
  readonly fields: readonly AuthorField[];
  readonly value: SpecTextState;
  readonly onChange: (path: string, next: string) => void;
  readonly issues: readonly FieldIssue[];
}): ReactElement {
  if (props.fields.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('author.problem.spec.no-fields')}</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {props.fields.map((field) => (
        <PluginField
          key={field.path}
          field={field}
          value={props.value[field.path] ?? ''}
          error={issueFor(props.issues, field.path)}
          onChange={(next) => {
            props.onChange(field.path, next);
          }}
        />
      ))}
    </div>
  );
}

function PluginField(props: {
  readonly field: AuthorField;
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const { field, error } = props;
  const hint = field.help;

  if (field.kind === 'boolean') {
    return (
      <Field label={field.label} hint={hint} error={error} path={field.path}>
        {({ id, describedBy }) => (
          <Switch
            id={id}
            aria-describedby={describedBy}
            checked={props.value === 'true'}
            onCheckedChange={(checked) => {
              props.onChange(checked ? 'true' : '');
            }}
          />
        )}
      </Field>
    );
  }

  if (field.kind === 'select') {
    return field.multiple ? (
      <MultiSelectField field={field} value={props.value} error={error} onChange={props.onChange} />
    ) : (
      <Field label={field.label} hint={hint} error={error} path={field.path}>
        {({ id, describedBy, invalid }) => (
          <Select value={props.value} onValueChange={props.onChange}>
            <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} className="sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
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

  if (field.kind === 'string-list') {
    return (
      <TextAreaField
        label={field.label}
        value={props.value}
        onChange={props.onChange}
        path={field.path}
        rows={4}
        mono
        error={error}
        // Câu của plugin đứng trước vì nó nói về NGHĨA của ô; quy ước một dòng
        // một giá trị là chuyện của widget và đứng sau.
        hint={`${hint ?? ''} ${t('author.problem.spec.line-per-value')}`.trim()}
      />
    );
  }

  if (isJsonShaped(field)) {
    return (
      <TextAreaField
        label={field.label}
        value={props.value}
        onChange={props.onChange}
        path={field.path}
        rows={8}
        mono
        error={error}
        hint={field.kind === 'list' ? t('author.problem.spec.list-as-json') : (hint ?? t('author.problem.spec.json-hint'))}
      />
    );
  }

  return (
    <TextField
      label={field.label}
      value={props.value}
      onChange={props.onChange}
      path={field.path}
      error={error}
      hint={hint}
      inputMode={field.kind === 'number' ? 'numeric' : undefined}
    />
  );
}

/**
 * `multiple` thành nhóm checkbox trong `fieldset`/`legend`, không thành dropdown
 * chọn nhiều: HTML không có widget gốc cho thứ đó, còn nhóm checkbox thì đi được
 * bằng Tab từ đầu và đọc đúng bằng trình đọc màn hình.
 */
function MultiSelectField(props: {
  readonly field: Extract<AuthorField, { kind: 'select' }>;
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const id = useId();
  const { field } = props;
  const chosen = props.value === '' ? [] : props.value.split(',');
  const describedBy =
    [field.help === undefined ? null : `${id}-hint`, props.error === null ? null : `${id}-error`]
      .filter((x) => x !== null)
      .join(' ') || undefined;

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={describedBy} {...fieldPathProps(field.path)}>
      <legend className="mb-1.5 text-[13px] font-semibold text-foreground">{field.label}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {field.options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <div key={option.value} className="flex items-center gap-2">
              <Checkbox
                id={optionId}
                checked={chosen.includes(option.value)}
                onCheckedChange={(checked) => {
                  const next =
                    checked === true ? [...chosen, option.value] : chosen.filter((item) => item !== option.value);
                  props.onChange(next.join(','));
                }}
              />
              <Label htmlFor={optionId} className="text-sm font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
      {field.help !== undefined && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {field.help}
        </p>
      )}
      {props.error !== null && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {props.error}
        </p>
      )}
    </fieldset>
  );
}
