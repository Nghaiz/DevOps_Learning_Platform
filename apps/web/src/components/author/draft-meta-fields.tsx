'use client';

import type { ReactElement } from 'react';
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
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import {
  SANDBOX_TIER_NAMES,
  SCENARIO_CAPABILITIES,
  SCENARIO_DIFFICULTIES,
  type ScenarioCapability,
} from '@devops-platform/shared-types/scenario';
import type { DraftFormState, FieldIssue } from './draft-form';
import { Field, TextAreaField, TextField, issueFor } from './field';

/**
 * Phần metadata của form soạn bài — dựng từ CHÍNH `contentDraftInput`.
 *
 * Danh sách giá trị của mỗi ô chọn đọc thẳng từ `SCENARIO_DIFFICULTIES`,
 * `SANDBOX_TIER_NAMES`, `SCENARIO_CAPABILITIES` của `shared-types`. Gõ tay ba
 * mảng đó ở đây là dựng một bản sao sẽ lệch ở lần đầu tiên ai đó thêm một tier —
 * và triệu chứng sẽ là "ô chọn thiếu một mục", thứ không ai truy về file này.
 *
 * ## Ô nào hiện, theo loại nội dung
 *
 * Ba schema xuất bản đòi những thứ khác nhau. Hiện đủ mọi ô cho mọi loại là mời
 * người soạn điền `passThresholdPercent` cho một bài học rồi thắc mắc vì sao nó
 * không có tác dụng.
 */

const RADIX_UNSET = 'chua-chon';

export function DraftMetaFields(props: {
  readonly kind: ContentKind;
  readonly value: DraftFormState;
  readonly onChange: (next: DraftFormState) => void;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
}): ReactElement {
  const { kind, value, onChange, issues, disabled } = props;
  const patch = (part: Partial<DraftFormState>): void => {
    onChange({ ...value, ...part });
  };

  return (
    <div className="flex flex-col gap-5">
      <TextField
        label="Tiêu đề"
        value={value.title}
        onChange={(title) => {
          patch({ title });
        }}
        error={issueFor(issues, 'title')}
        disabled={disabled}
        placeholder="Ví dụ: Chẩn đoán tiến trình ngốn CPU"
      />

      <TextAreaField
        label="Mô tả"
        rows={2}
        value={value.description}
        onChange={(description) => {
          patch({ description });
        }}
        hint="Một câu hiện trên thẻ ở trang danh mục. Bỏ trống cũng được."
        disabled={disabled}
      />

      {kind !== 'playground' && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Độ khó"
            hint={
              kind === 'lesson'
                ? 'Bắt buộc khi xuất bản — schema bài học không nhận giá trị trống.'
                : 'Bắt buộc khi xuất bản — schema lab không nhận giá trị trống.'
            }
          >
            {({ id, describedBy }) => (
              <Select
                value={value.difficulty === '' ? RADIX_UNSET : value.difficulty}
                {...(disabled === true ? { disabled: true } : {})}
                onValueChange={(next) => {
                  patch({
                    difficulty: next === RADIX_UNSET ? '' : (next as DraftFormState['difficulty']),
                  });
                }}
              >
                <SelectTrigger id={id} aria-describedby={describedBy}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RADIX_UNSET}>Chưa chọn</SelectItem>
                  {SCENARIO_DIFFICULTIES.map((level) => (
                    <SelectItem key={level} value={level}>
                      {DIFFICULTY_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <TextField
            label="Thời lượng ước tính (phút)"
            value={value.estimatedMinutes}
            inputMode="numeric"
            onChange={(estimatedMinutes) => {
              patch({ estimatedMinutes });
            }}
            error={issueFor(issues, 'estimatedMinutes')}
            hint="Bỏ trống nếu chưa ước tính được."
            disabled={disabled}
          />
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tier sandbox" hint="Cụm hiện chạy sysbox; hai tier còn lại chưa có node nào phục vụ.">
          {({ id, describedBy }) => (
            <Select
              value={value.tier}
              {...(disabled === true ? { disabled: true } : {})}
              onValueChange={(tier) => {
                patch({ tier: tier as DraftFormState['tier'] });
              }}
            >
              <SelectTrigger id={id} aria-describedby={describedBy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SANDBOX_TIER_NAMES.map((tier) => (
                  <SelectItem key={tier} value={tier}>
                    {tier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Giao diện" hint="IDE mở thêm khung soạn thảo cạnh terminal (layout ide của P6).">
          {({ id, describedBy }) => (
            <Select
              value={value.interfaceLayout === '' ? RADIX_UNSET : 'ide'}
              {...(disabled === true ? { disabled: true } : {})}
              onValueChange={(next) => {
                patch({ interfaceLayout: next === 'ide' ? 'ide' : '' });
              }}
            >
              <SelectTrigger id={id} aria-describedby={describedBy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={RADIX_UNSET}>Terminal thường</SelectItem>
                <SelectItem value="ide">IDE (nội dung | editor | terminal)</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <TextField
        label="Backend image id"
        value={value.backendImageId}
        onChange={(backendImageId) => {
          patch({ backendImageId });
        }}
        error={issueFor(issues, 'backendImageId')}
        hint="Nguyên văn imageid của upstream. Giữ để truy nguyên; nó KHÔNG quyết định sandbox chạy gì — phần đó do capability bên dưới."
        disabled={disabled}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Capability sandbox phải có</legend>
        <p className="text-xs text-muted-foreground">
          Chọn thiếu thì người học gặp <code className="font-mono">command not found</code> giữa bài; chọn thừa
          thì bài chiếm một sandbox nặng hơn mức cần.
        </p>
        <div className="flex flex-wrap gap-4 pt-1">
          {SCENARIO_CAPABILITIES.map((capability) => (
            <CapabilityBox
              key={capability}
              capability={capability}
              checked={value.capabilities.includes(capability)}
              disabled={disabled}
              onToggle={(checked) => {
                patch({
                  capabilities: checked
                    ? [...value.capabilities, capability]
                    : value.capabilities.filter((item) => item !== capability),
                });
              }}
            />
          ))}
        </div>
      </fieldset>

      {kind === 'lab' && (
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Mốc đạt (%)"
            value={value.passThresholdPercent}
            inputMode="numeric"
            onChange={(passThresholdPercent) => {
              patch({ passThresholdPercent });
            }}
            error={issueFor(issues, 'passThresholdPercent')}
            hint="Tính theo tổng trọng số các task đã đạt. Bắt buộc khi xuất bản lab."
            disabled={disabled}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lab-leaderboard">Bảng xếp hạng</Label>
            <div className="flex items-center gap-2 pt-1.5">
              <Switch
                id="lab-leaderboard"
                checked={value.leaderboard}
                disabled={disabled}
                onCheckedChange={(leaderboard) => {
                  patch({ leaderboard });
                }}
              />
              <span className="text-sm text-muted-foreground">
                {value.leaderboard ? 'Bật cho lab này' : 'Tắt (mặc định của nền tảng)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {kind === 'playground' && (
        <TextField
          label="TTL phiên (giây)"
          value={value.ttlSeconds}
          inputMode="numeric"
          onChange={(ttlSeconds) => {
            patch({ ttlSeconds });
          }}
          error={issueFor(issues, 'ttlSeconds')}
          hint="300–7200. Con số này hiện cho người học TRƯỚC khi họ bấm Bắt đầu, nên đặt quá trần là một lời hứa hạ tầng sẽ phá."
          disabled={disabled}
        />
      )}
    </div>
  );
}

const DIFFICULTY_LABELS: Readonly<Record<(typeof SCENARIO_DIFFICULTIES)[number], string>> = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

function CapabilityBox(props: {
  readonly capability: ScenarioCapability;
  readonly checked: boolean;
  readonly disabled?: boolean | undefined;
  readonly onToggle: (checked: boolean) => void;
}): ReactElement {
  const id = `capability-${props.capability}`;
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={(state) => {
          props.onToggle(state === true);
        }}
      />
      <Label htmlFor={id} className="font-normal">
        {props.capability}
      </Label>
    </div>
  );
}
