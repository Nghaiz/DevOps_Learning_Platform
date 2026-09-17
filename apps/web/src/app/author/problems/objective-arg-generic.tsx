'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@devops-platform/ui';
import type { ProblemArgSpec } from '@devops-platform/games';

import { issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';

/**
 * Ô nhập tham số vị từ cho game KHÁC K8s — P20.
 *
 * ## Vì sao một component riêng, không nới `ObjectiveArgField`
 *
 * Ô của K8s dựng những bộ chọn có gợi ý gắn chặt với dữ liệu K8s: danh sách
 * namespace và node của chính bài đang soạn, bảng `ResourceKind`, bảng
 * `IncidentKind`, hai loại probe. Nhồi thêm hai kiểu mới (`boolean`, `lines`) và
 * một nhánh "không có gợi ý nào" vào đó sẽ biến nó thành một `switch` bảy nhánh
 * mà năm nhánh vô nghĩa với game đang soạn.
 *
 * Ở đây thì ngược lại: KHÔNG có gợi ý nào để đưa ra. Tên tham số là định danh
 * của engine (`ref`, `seconds`, `onBadRelease`) và nó không dịch, nên nhãn hiện
 * đúng cái tên ấy — người soạn tra tài liệu bằng chính nó.
 *
 * ⚠ `boolean` là ô CHỌN ba trạng thái, không phải công tắc. Một công tắc chỉ nói
 * được `true`/`false` và không nói được "bỏ trống" — mà bỏ trống là trạng thái
 * có nghĩa: engine đọc `argBoolean(...) ?? true`, tức mặc định khác `false`.
 * Dùng công tắc thì người soạn không bao giờ chọn được mặc định đó.
 */
/** Hai giá trị `argBoolean` đọc. Không phải chữ hiển thị nên không có khoá dịch. */
const BOOLEAN_VALUES = ['true', 'false'] as const;

export function ObjectiveArgGeneric(props: {
  readonly spec: ProblemArgSpec;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly issues: readonly FieldIssue[];
  readonly path: string;
  readonly controlId: string;
}): ReactElement {
  const { spec } = props;
  const label = spec.optional
    ? t('problem.objective-arg-field-tuy-chon', { propsSpecLabel: spec.name })
    : spec.name;
  const error = issueFor(props.issues, props.path);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.controlId}>{label}</Label>

      {spec.oneOf !== undefined ? (
        <Select
          {...(props.value === '' ? {} : { value: props.value })}
          onValueChange={props.onChange}
        >
          <SelectTrigger id={props.controlId}>
            <SelectValue placeholder={t('problem.objective-arg-generic-chon-mot-gia-tri')} />
          </SelectTrigger>
          <SelectContent>
            {spec.oneOf.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : spec.kind === 'boolean' ? (
        <Select
          {...(props.value === '' ? {} : { value: props.value })}
          onValueChange={props.onChange}
        >
          <SelectTrigger id={props.controlId}>
            <SelectValue placeholder={t('problem.objective-arg-generic-de-mac-dinh')} />
          </SelectTrigger>
          <SelectContent>
            {/*
              Dựng từ MẢNG chứ không viết hai thẻ có chữ sẵn: cổng phủ chữ của
              `packages/copy` quét mọi chuỗi trong JSX và đòi nó có khoá dịch.
              `true`/`false` là GIÁ TRỊ của engine, không phải chữ cho người đọc,
              nên chúng không có khoá — và không nên có.
            */}
            {BOOLEAN_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : spec.kind === 'lines' ? (
        <Textarea
          id={props.controlId}
          rows={4}
          value={props.value}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
          /*
           * Mỗi dòng là một phần tử. Nói ra ở đây vì `coerceGenericArg` cắt theo
           * xuống dòng, và một người soạn gõ cả đoạn vào một dòng sẽ nhận một
           * mảng một phần tử — chấm trượt mà không có dòng nào nói vì sao.
           */
          placeholder={t('problem.objective-arg-generic-moi-dong-mot-phan-tu')}
        />
      ) : (
        <Input
          id={props.controlId}
          inputMode={spec.kind === 'number' ? 'numeric' : 'text'}
          value={props.value}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
        />
      )}

      {error !== null && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
