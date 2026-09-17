'use client';

import { useId, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import type { AuthorField } from '@devops-platform/games';
import {
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@devops-platform/ui';
import { TextAreaField, TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import { isJsonShaped, type SpecTextState } from './spec-text';

/**
 * Biểu mẫu trạng thái ban đầu DỰNG TỪ `authorFields` của plugin — §18.A.6.
 *
 * Đây là nửa còn lại của điều `core/problem-plugin.ts` chốt: `authorFields` là
 * mô tả form dạng DỮ LIỆU, không phải JSX, vì `packages/games` cấm React (một
 * barrel rò engine sang sáu route không liên quan đã xảy ra một lần rồi). Nên
 * chỗ dịch dữ liệu thành widget phải nằm ở tầng UI, và đây là nó.
 *
 * ## Sáu trên bảy nhánh có widget riêng. Nhánh thứ bảy thì chưa.
 *
 * `text`, `number`, `boolean`, `select`, `string-list`, `json` đều có ô nhập
 * đúng kiểu. `list` (danh sách lặp của một NHÓM trường con) hiện ra dưới dạng
 * một ô JSON thô kèm câu nói rõ rằng nó là ô JSON.
 *
 * Vì sao không giả vờ: một widget lặp-nhóm tử tế cần thêm, xoá, đổi thứ tự, và
 * phép kiểm chéo giữa các mục. Biểu mẫu K8s viết tay đã dựng đúng thứ đó cho
 * node và tài nguyên, và nó tốn hàng trăm dòng. Dựng một bản nửa vời ở đây sẽ
 * tệ hơn một ô JSON trung thực: người soạn tưởng mình có widget, rồi phát hiện
 * nó không đổi thứ tự được. Ô JSON thì không hứa gì nó không làm được.
 *
 * Hôm nay nhánh này CHƯA được dùng: K8s đi đường biểu mẫu viết tay, còn plugin
 * Git khai tám ô `json` và một ô `text`. Đã báo lead trong báo cáo lane.
 *
 * Không dựng `<main>` (hợp đồng C6bis): vỏ ứng dụng sở hữu landmark đó.
 */
export function PluginFields(props: {
  readonly fields: readonly AuthorField[];
  readonly value: SpecTextState;
  readonly onChange: (path: string, next: string) => void;
  readonly issues: readonly FieldIssue[];
}): ReactElement {
  if (props.fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('author.problem.spec.no-fields')}</p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {props.fields.map((field) => (
        <PluginField
          key={field.path}
          field={field}
          value={props.value[field.path] ?? ''}
          issues={props.issues}
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
  readonly onChange: (next: string) => void;
  readonly issues: readonly FieldIssue[];
}): ReactElement {
  const { field } = props;
  const error = issueFor(props.issues, field.path);

  if (field.kind === 'boolean') {
    return <BooleanField field={field} value={props.value} onChange={props.onChange} />;
  }

  if (field.kind === 'select') {
    return (
      <SelectField
        field={field}
        value={props.value}
        error={error}
        onChange={props.onChange}
      />
    );
  }

  if (field.kind === 'string-list') {
    return (
      <TextAreaField
        label={field.label}
        value={props.value}
        onChange={props.onChange}
        rows={4}
        mono
        error={error}
        // Câu gợi ý của plugin đứng trước, vì nó nói về NGHĨA của ô; quy ước
        // một-dòng-một-giá-trị là chuyện của widget và đứng sau.
        hint={`${field.help ?? ''} ${t('author.problem.spec.line-per-value')}`.trim()}
      />
    );
  }

  if (isJsonShaped(field)) {
    return (
      <TextAreaField
        label={field.label}
        value={props.value}
        onChange={props.onChange}
        rows={8}
        mono
        error={error}
        hint={
          field.kind === 'list'
            ? t('author.problem.spec.list-as-json')
            : (field.help ?? t('author.problem.spec.json-hint'))
        }
      />
    );
  }

  return (
    <TextField
      label={field.label}
      value={props.value}
      onChange={props.onChange}
      error={error}
      {...(field.kind === 'number' ? { inputMode: 'numeric' as const } : {})}
      {...(field.help === undefined ? {} : { hint: field.help })}
    />
  );
}

/**
 * `Switch` chứ không `Checkbox`: đây là một công tắc bật/tắt ngay, không phải
 * một mục được chọn trong nhiều mục. Cùng lựa chọn mà `classify-fields.tsx` đã
 * làm cho cờ giới hạn tài nguyên.
 *
 * `useId()` chứ không phải một chuỗi đặt tay từ `path`: hai plugin có thể dùng
 * chung một `path` (`name` chẳng hạn), và `id` trùng vừa làm nhãn trỏ nhầm ô
 * vừa là một vi phạm axe (`duplicate-id`).
 */
function BooleanField(props: {
  readonly field: Extract<AuthorField, { kind: 'boolean' }>;
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Switch
          id={id}
          checked={props.value === 'true'}
          {...(props.field.help === undefined ? {} : { 'aria-describedby': hintId })}
          onCheckedChange={(checked) => {
            props.onChange(checked ? 'true' : '');
          }}
        />
        <Label htmlFor={id}>{props.field.label}</Label>
      </div>
      {props.field.help !== undefined && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {props.field.help}
        </p>
      )}
    </div>
  );
}

/**
 * `multiple` thành một nhóm checkbox có `fieldset`/`legend`, không thành một
 * dropdown chọn nhiều. Dropdown đa chọn không có widget gốc trong HTML, và mọi
 * bản tự dựng đều phải tự lo bàn phím lẫn trình đọc màn hình. Nhóm checkbox thì
 * đi được bằng Tab từ đầu, và AC-8 đòi 0 vi phạm axe trên màn này.
 */
function SelectField(props: {
  readonly field: Extract<AuthorField, { kind: 'select' }>;
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const id = useId();
  const { field } = props;

  if (field.multiple) {
    const chosen = props.value === '' ? [] : props.value.split(',');
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">{field.label}</legend>
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
                      checked === true
                        ? [...chosen, option.value]
                        : chosen.filter((item) => item !== option.value);
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
          <p className="text-xs text-muted-foreground">{field.help}</p>
        )}
      </fieldset>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Select
        value={props.value}
        onValueChange={(next) => {
          props.onChange(next);
        }}
      >
        <SelectTrigger id={id} className="w-64">
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
      {field.help !== undefined && <p className="text-xs text-muted-foreground">{field.help}</p>}
      {props.error !== null && <p className="text-xs text-destructive">{props.error}</p>}
    </div>
  );
}
