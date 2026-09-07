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
        <legend className="text-sm font-medium text-foreground">Bộ công cụ thêm cho bài này</legend>
        <p className="text-xs text-muted-foreground">
          Mặc định không bật gì — sandbox đã có sẵn bộ lệnh thường dùng. Chỉ chọn thứ nội dung bài
          thật sự gõ tới: mỗi công cụ là một lượt cài trong pod lúc mở phiên.
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

/**
 * Một dòng mô tả cho mỗi công cụ, bằng TIẾNG VIỆT và nói CÔNG DỤNG.
 *
 * Không phải trang trí: `duf` / `fd` / `delta` / `yq` là tên không tự giải
 * thích, và một danh sách tám cái tên trần buộc người soạn chọn bằng cách đoán.
 * Nêu luôn tên LỆNH khi nó khác tên gói (`ripgrep` → `rg`) — đó là thứ họ sẽ
 * thật sự gõ vào nội dung bài, và là chỗ lệch dễ mất thời gian nhất.
 */
const TOOL_DESCRIPTIONS: Readonly<Record<SandboxTool, string>> = {
  btop: 'Theo dõi CPU, RAM và tiến trình theo thời gian thực — bản dễ nhìn của top.',
  tldr: 'Ví dụ dùng nhanh cho một lệnh, thay cho việc đọc hết trang man.',
  ripgrep: 'Tìm chuỗi trong cả cây thư mục, rất nhanh. Lệnh gõ là rg.',
  fd: 'Tìm file theo tên với cú pháp ngắn hơn find. Lệnh gõ là fd.',
  duf: 'Xem dung lượng đĩa còn trống theo từng phân vùng, dạng bảng.',
  ncdu: 'Duyệt thư mục theo dung lượng để tìm chỗ đang chiếm đĩa.',
  delta: 'Tô màu và canh cột cho git diff, dễ đọc phần khác biệt hơn.',
  yq: 'Đọc và sửa YAML/JSON từ dòng lệnh — hay dùng với manifest Kubernetes.',
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
