'use client';

import { t } from '@devops-platform/copy';
import { useId, type ReactElement, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Checkbox, Label } from '@devops-platform/ui';
import {
  SANDBOX_TOOLS,
  SCENARIO_CAPABILITIES,
  type SandboxTool,
  type ScenarioCapability,
} from '@devops-platform/shared-types/scenario';
import { fieldPathProps } from './studio/field-anchor';

/**
 * Hai nhóm chọn NHIỀU của mục Sandbox: bộ công cụ cài thêm và capability.
 *
 * `fieldset`/`legend` chứ không `Field`: `Field` cấp đúng một `id` cho đúng một
 * control. Một nhóm tám ô kiểm cần một nhãn NHÓM, và `legend` là thứ trình đọc
 * màn hình đọc trước mỗi ô con; `aria-label` trên một `div` thì không.
 *
 * Mỗi công cụ có một dòng mô tả, không chỉ cái tên: `duf`, `fd`, `delta` không
 * tự nói ra chúng làm gì, và người soạn đoán theo tên sẽ chọn thừa (mỗi lượt
 * chọn là một lượt cài gói trong pod của MỌI người học bài đó) hoặc chọn thiếu.
 * Mô tả nối vào ô kiểm bằng `aria-describedby`, vì nằm ngay dưới nhãn thì mắt
 * thấy nhưng trình đọc màn hình chỉ nghe được khi có liên kết đó.
 *
 * Ô đã chọn tô nền xanh tuyến CI/CD bằng `has-[...]`, tức CSS đọc thẳng
 * `data-state` của Radix: không có state React thứ hai để lệch với ô kiểm.
 */

const TOOL_DESCRIPTIONS: Readonly<Record<SandboxTool, string>> = {
  btop: t('author.draft-meta-fields-theo-doi-cpu-ram-va-tien-trinh-theo-thoi-gian-thuc-ban-de-nhin-cua-top'),
  tldr: t('author.draft-meta-fields-vi-du-dung-nhanh-cho-mot-lenh-thay-cho-viec-doc-het-trang-man'),
  ripgrep: t('author.draft-meta-fields-tim-chuoi-trong-ca-cay-thu-muc-rat-nhanh-lenh-go-la-rg'),
  fd: t('author.draft-meta-fields-tim-file-theo-ten-voi-cu-phap-ngan-hon-find-lenh-go-la-fd'),
  duf: t('author.draft-meta-fields-xem-dung-luong-dia-con-trong-theo-tung-phan-vung-dang-bang'),
  ncdu: t('author.draft-meta-fields-duyet-thu-muc-theo-dung-luong-de-tim-cho-dang-chiem-dia'),
  delta: t('author.draft-meta-fields-to-mau-va-canh-cot-cho-git-diff-de-doc-phan-khac-biet-hon'),
  yq: t('author.draft-meta-fields-doc-va-sua-yaml-json-tu-dong-lenh-hay-dung-voi-manifest-kubernetes'),
};

const CHECKED_TINT = 'has-[[data-state=checked]]:bg-line-cicd/12';

function toggled<T>(list: readonly T[], item: T, checked: boolean): readonly T[] {
  return checked ? [...list, item] : list.filter((entry) => entry !== item);
}

export function ToolsetGroup(props: {
  readonly value: readonly SandboxTool[];
  readonly onChange: (next: readonly SandboxTool[]) => void;
  readonly error?: string | null | undefined;
  readonly disabled?: boolean | undefined;
}): ReactElement {
  const id = useId();
  return (
    <ChoiceGroup
      path="toolset"
      legend={t('author.draft-meta-fields-bo-cong-cu-them-cho-bai-nay')}
      hint={t('author.draft-meta-fields-mac-dinh-khong-bat-gi-sandbox-da-co-san-bo-lenh-thuong-dung-chi-chon-thu-no')}
      error={props.error}
    >
      <div className="grid gap-px border border-border bg-border @xl:grid-cols-2">
        {SANDBOX_TOOLS.map((tool) => {
          const boxId = `${id}-${tool}`;
          return (
            <div
              key={tool}
              className={`relative flex items-start gap-3 bg-background px-3 py-3 transition-colors duration-150 hover:bg-muted ${CHECKED_TINT}`}
            >
              <Checkbox
                id={boxId}
                checked={props.value.includes(tool)}
                disabled={props.disabled}
                aria-describedby={`${boxId}-hint`}
                className="relative z-10 mt-0.5"
                onCheckedChange={(state) => {
                  props.onChange(toggled(props.value, tool, state === true));
                }}
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label htmlFor={boxId} className="font-mono text-sm font-medium after:absolute after:inset-0">
                  {tool}
                </Label>
                <p id={`${boxId}-hint`} className="text-xs leading-relaxed text-muted-foreground">
                  {TOOL_DESCRIPTIONS[tool]}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ChoiceGroup>
  );
}

export function CapabilityGroup(props: {
  readonly value: readonly ScenarioCapability[];
  readonly onChange: (next: readonly ScenarioCapability[]) => void;
  readonly error?: string | null | undefined;
  readonly disabled?: boolean | undefined;
}): ReactElement {
  const id = useId();
  return (
    <ChoiceGroup
      path="capabilities"
      legend={t('author.draft-meta-fields-capability-sandbox-phai-co')}
      hint={
        <>
          {t('author.draft-meta-fields-chon-thieu-thi-nguoi-hoc-gap')}{' '}
          <code className="font-mono text-foreground">{t('author.draft-meta-fields-command-not-found')}</code>{' '}
          {t('author.draft-meta-fields-giua-bai-chon-thua-thi-bai-chiem-mot-sandbox-nang-hon-muc-can')}
        </>
      }
      error={props.error}
    >
      <div className="flex flex-wrap gap-2">
        {SCENARIO_CAPABILITIES.map((capability) => {
          const boxId = `${id}-${capability}`;
          return (
            <div
              key={capability}
              className={`relative flex h-10 items-center gap-2 border border-border px-3 transition-colors duration-150 hover:border-ink has-[[data-state=checked]]:border-line-cicd ${CHECKED_TINT}`}
            >
              <Checkbox
                id={boxId}
                checked={props.value.includes(capability)}
                disabled={props.disabled}
                className="relative z-10"
                onCheckedChange={(state) => {
                  props.onChange(toggled(props.value, capability, state === true));
                }}
              />
              <Label htmlFor={boxId} className="font-mono text-xs font-medium after:absolute after:inset-0">
                {capability}
              </Label>
            </div>
          );
        })}
      </div>
    </ChoiceGroup>
  );
}

function ChoiceGroup(props: {
  readonly path: string;
  readonly legend: string;
  readonly hint: ReactNode;
  readonly error?: string | null | undefined;
  readonly children: ReactNode;
}): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-2"
      aria-describedby={props.error == null ? hintId : `${hintId} ${errorId}`}
      {...fieldPathProps(props.path)}
    >
      <legend className="mb-1 text-[13px] font-semibold text-foreground">{props.legend}</legend>
      <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
        {props.hint}
      </p>
      <div className="pt-1">{props.children}</div>
      {props.error != null && (
        <p id={errorId} className="flex animate-rise items-start gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{props.error}</span>
        </p>
      )}
    </fieldset>
  );
}
