'use client';

import { t } from '@devops-platform/copy';
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
  SANDBOX_TOOLS,
  SCENARIO_CAPABILITIES,
  SCENARIO_DIFFICULTIES,
  type SandboxTool,
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
        label={t('author.draft-meta-fields-tieu-de')}
        value={value.title}
        onChange={(title) => {
          patch({ title });
        }}
        error={issueFor(issues, 'title')}
        disabled={disabled}
        placeholder={t('author.draft-meta-fields-vi-du-chan-doan-tien-trinh-ngon-cpu')}
      />

      <TextAreaField
        label={t('author.problem.tab.statement')}
        rows={2}
        value={value.description}
        onChange={(description) => {
          patch({ description });
        }}
        hint={t(
          'author.draft-meta-fields-mot-cau-hien-tren-the-o-trang-danh-muc-bo-trong-cung-duoc',
        )}
        disabled={disabled}
      />

      {kind !== 'playground' && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t('author.draft-meta-fields-do-kho')}
            hint={
              kind === 'lesson'
                ? t(
                    'author.draft-meta-fields-bat-buoc-khi-xuat-ban-schema-bai-hoc-khong-nhan-gia-tri-trong',
                  )
                : t(
                    'author.draft-meta-fields-bat-buoc-khi-xuat-ban-schema-lab-khong-nhan-gia-tri-trong',
                  )
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
                  <SelectItem value={RADIX_UNSET}>
                    {t('author.draft-meta-fields-chua-chon')}
                  </SelectItem>
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
            label={t('author.draft-meta-fields-thoi-luong-uoc-tinh-phut')}
            value={value.estimatedMinutes}
            inputMode="numeric"
            onChange={(estimatedMinutes) => {
              patch({ estimatedMinutes });
            }}
            error={issueFor(issues, 'estimatedMinutes')}
            hint={t('author.draft-meta-fields-bo-trong-neu-chua-uoc-tinh-duoc')}
            disabled={disabled}
          />
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t('author.draft-meta-fields-tier-sandbox')}
          hint={t(
            'author.draft-meta-fields-cum-hien-chay-sysbox-hai-tier-con-lai-chua-co-node-nao-phuc-vu',
          )}
        >
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

        <Field
          label={t('author.draft-meta-fields-giao-dien')}
          hint={t(
            'author.draft-meta-fields-ide-mo-them-khung-soan-thao-canh-terminal-layout-ide-cua-p6',
          )}
        >
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
                <SelectItem value={RADIX_UNSET}>
                  {t('author.draft-meta-fields-terminal-thuong')}
                </SelectItem>
                <SelectItem value="ide">
                  {t('author.draft-meta-fields-ide-noi-dung-editor-terminal')}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      {/*
        Bộ công cụ — nhóm chọn NHIỀU, mặc định KHÔNG chọn gì.

        `fieldset`/`legend` chứ không `Field`: `Field` cấp đúng một `id` cho đúng
        một control (nó dựng cho `Select` ngay trên). Một nhóm 8 ô kiểm cần một
        nhãn NHÓM, và `legend` là thứ trình đọc màn hình đọc trước mỗi ô con —
        `aria-label` trên một `div` thì không. Cùng khuôn với nhóm capability
        ngay dưới, nên hai nhóm trên cùng form không hành xử khác nhau.

        Mỗi công cụ có một dòng mô tả, không chỉ cái tên: `duf`, `fd`, `delta`
        không tự nói ra chúng làm gì, và người soạn đoán theo tên sẽ chọn thừa
        (mỗi lượt chọn là một lượt cài gói trong pod của MỌI người học bài đó)
        hoặc chọn thiếu.
      */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          {t('author.draft-meta-fields-bo-cong-cu-them-cho-bai-nay')}
        </legend>
        <p className="text-xs text-muted-foreground">
          {t(
            'author.draft-meta-fields-mac-dinh-khong-bat-gi-sandbox-da-co-san-bo-lenh-thuong-dung-chi-chon-thu-no',
          )}
        </p>
        <div className="grid gap-x-6 gap-y-3 pt-1 sm:grid-cols-2">
          {SANDBOX_TOOLS.map((tool) => (
            <ToolBox
              key={tool}
              tool={tool}
              checked={value.toolset.includes(tool)}
              disabled={disabled}
              onToggle={(checked) => {
                patch({
                  toolset: checked
                    ? [...value.toolset, tool]
                    : value.toolset.filter((item) => item !== tool),
                });
              }}
            />
          ))}
        </div>
      </fieldset>

      <TextField
        label={t('author.draft-meta-fields-backend-image-id')}
        value={value.backendImageId}
        onChange={(backendImageId) => {
          patch({ backendImageId });
        }}
        error={issueFor(issues, 'backendImageId')}
        hint={t(
          'author.draft-meta-fields-nguyen-van-imageid-cua-upstream-giu-de-truy-nguyen-no-khong-quyet-dinh-sand',
        )}
        disabled={disabled}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          {t('author.draft-meta-fields-capability-sandbox-phai-co')}
        </legend>
        <p className="text-xs text-muted-foreground">
          {t('author.draft-meta-fields-chon-thieu-thi-nguoi-hoc-gap')}{' '}
          <code className="font-mono">{t('author.draft-meta-fields-command-not-found')}</code>{' '}
          {t(
            'author.draft-meta-fields-giua-bai-chon-thua-thi-bai-chiem-mot-sandbox-nang-hon-muc-can',
          )}
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
            label={t('author.draft-meta-fields-moc-dat')}
            value={value.passThresholdPercent}
            inputMode="numeric"
            onChange={(passThresholdPercent) => {
              patch({ passThresholdPercent });
            }}
            error={issueFor(issues, 'passThresholdPercent')}
            hint={t(
              'author.draft-meta-fields-tinh-theo-tong-trong-so-cac-task-da-dat-bat-buoc-khi-xuat-ban-lab',
            )}
            disabled={disabled}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lab-leaderboard">{t('author.draft-meta-fields-bang-xep-hang')}</Label>
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
                {value.leaderboard
                  ? t('author.draft-meta-fields-bat-cho-lab-nay')
                  : t('author.draft-meta-fields-tat-mac-dinh-cua-nen-tang')}
              </span>
            </div>
          </div>
        </div>
      )}

      {kind === 'playground' && (
        <TextField
          label={t('author.draft-meta-fields-ttl-phien-giay')}
          value={value.ttlSeconds}
          inputMode="numeric"
          onChange={(ttlSeconds) => {
            patch({ ttlSeconds });
          }}
          error={issueFor(issues, 'ttlSeconds')}
          hint={t(
            'author.draft-meta-fields-300-toi-7200-con-so-nay-hien-cho-nguoi-hoc-truoc-khi-ho-bam-bat-dau-nen-dat',
          )}
          disabled={disabled}
        />
      )}
    </div>
  );
}

const DIFFICULTY_LABELS: Readonly<Record<(typeof SCENARIO_DIFFICULTIES)[number], string>> = {
  beginner: t('common.difficulty.beginner'),
  intermediate: t('common.difficulty.intermediate'),
  advanced: t('common.difficulty.advanced'),
};

/**
 * Một dòng mô tả cho mỗi công cụ, bằng TIẾNG VIỆT và nói CÔNG DỤNG.
 *
 * Không phải trang trí: `duf` / `fd` / `delta` / `yq` là tên không tự giải
 * thích, và một danh sách tám cái tên trần buộc người soạn chọn bằng cách đoán.
 * Nêu luôn tên LỆNH khi nó khác tên gói (`ripgrep` → `rg`) — đó là thứ họ sẽ
 * thật sự gõ vào nội dung bài, và là chỗ lệch dễ mất thời gian nhất.
 */
const TOOL_DESCRIPTIONS: Readonly<Record<SandboxTool, string>> = {
  btop: t(
    'author.draft-meta-fields-theo-doi-cpu-ram-va-tien-trinh-theo-thoi-gian-thuc-ban-de-nhin-cua-top',
  ),
  tldr: t('author.draft-meta-fields-vi-du-dung-nhanh-cho-mot-lenh-thay-cho-viec-doc-het-trang-man'),
  ripgrep: t('author.draft-meta-fields-tim-chuoi-trong-ca-cay-thu-muc-rat-nhanh-lenh-go-la-rg'),
  fd: t('author.draft-meta-fields-tim-file-theo-ten-voi-cu-phap-ngan-hon-find-lenh-go-la-fd'),
  duf: t('author.draft-meta-fields-xem-dung-luong-dia-con-trong-theo-tung-phan-vung-dang-bang'),
  ncdu: t('author.draft-meta-fields-duyet-thu-muc-theo-dung-luong-de-tim-cho-dang-chiem-dia'),
  delta: t('author.draft-meta-fields-to-mau-va-canh-cot-cho-git-diff-de-doc-phan-khac-biet-hon'),
  yq: t(
    'author.draft-meta-fields-doc-va-sua-yaml-json-tu-dong-lenh-hay-dung-voi-manifest-kubernetes',
  ),
};

function ToolBox(props: {
  readonly tool: SandboxTool;
  readonly checked: boolean;
  readonly disabled?: boolean | undefined;
  readonly onToggle: (checked: boolean) => void;
}): ReactElement {
  const id = `toolset-${props.tool}`;
  // Mô tả nối vào ô kiểm bằng `aria-describedby`: đọc bằng mắt thì nó nằm ngay
  // dưới nhãn, còn trình đọc màn hình chỉ nghe được nó nếu có liên kết này —
  // thiếu nó thì người dùng screen reader nhận đúng tám cái tên trần, tức đúng
  // vấn đề mà dòng mô tả sinh ra để giải quyết.
  const describedBy = `${id}-hint`;
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={props.checked}
        disabled={props.disabled}
        aria-describedby={describedBy}
        className="mt-0.5"
        onCheckedChange={(state) => {
          props.onToggle(state === true);
        }}
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="font-mono font-normal">
          {props.tool}
        </Label>
        <p id={describedBy} className="text-xs text-muted-foreground">
          {TOOL_DESCRIPTIONS[props.tool]}
        </p>
      </div>
    </div>
  );
}

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
