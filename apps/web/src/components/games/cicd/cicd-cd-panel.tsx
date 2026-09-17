'use client';

import type { ReactElement, ReactNode } from 'react';
import {
  BAD_RELEASE_RESPONSES,
  RELEASE_STRATEGIES,
  SECRET_FORMS,
  type CanaryPolicy,
  type CdPolicyPart,
  type CicdCdPolicies,
  type CicdLevelCd,
  type GitOpsPolicy,
  type ReleasePolicy,
  type SecretForm,
} from '@devops-platform/games';

/**
 * Bảng núm chương CD — chính sách phát hành, đối soát, che bí mật (19.G).
 *
 * ## ⛔ Chỉ hiện núm level MỞ
 *
 * Danh sách núm đọc thẳng `cd.editable`. Hiện một núm level khoá là nói dối
 * người chơi: `runLevelCd` bỏ qua giá trị đó (`mergeCdPolicies`), nên họ xoay
 * núm mà kết quả không nhúc nhích. C18/C19/C20 KHOÁ chiến lược có chủ ý — mở ra
 * là ba bài thành một bài "chọn blue-green".
 *
 * ## Không điền mặc định
 *
 * Bảng giữ nguyên hình dạng `CicdCdPolicies`, khởi đầu từ `cd.initial`. Chọn một
 * chiến lược mà level không khai tham số thì bộ mô phỏng báo `missing-strategy-params`
 * — lỗi người chơi phải thấy, không phải chỗ để lén điền một bộ số họ chưa chọn.
 *
 * Nhãn chiến lược/đường phục hồi là từ vựng ngành (rolling, blue-green, canary),
 * giữ nguyên tiếng Anh như bài lý thuyết.
 */

export interface CicdCdPanelProps {
  readonly cd: CicdLevelCd;
  readonly value: CicdCdPolicies;
  readonly onChange: (next: CicdCdPolicies) => void;
}

const NHAN_PHUC_HOI: Readonly<Record<(typeof BAD_RELEASE_RESPONSES)[number], string>> = {
  rollback: 'Lùi về bản cũ (rollback)',
  'roll-forward': 'Dựng bản sửa rồi tiến (roll-forward)',
};

const NHAN_DANG: Readonly<Record<SecretForm, string>> = {
  raw: 'nguyên văn',
  base64: 'base64',
  url: 'mã hoá URL',
  reversed: 'đảo ngược',
};

const O_SO =
  'w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function CicdCdPanel({ cd, value, onChange }: CicdCdPanelProps): ReactElement | null {
  if (cd.editable.length === 0) {
    return null;
  }
  const mo = (part: CdPolicyPart): boolean => cd.editable.includes(part);
  const release = value.release;
  const gitops = value.gitops;
  const masking = value.masking;

  const datRelease = (patch: Partial<ReleasePolicy>): void => {
    if (release === undefined) return;
    onChange({ ...value, release: { ...release, ...patch } });
  };
  const datCanary = (patch: Partial<CanaryPolicy>): void => {
    if (release?.canary === undefined) return;
    datRelease({ canary: { ...release.canary, ...patch } });
  };
  const datGitOps = (patch: Partial<GitOpsPolicy>): void => {
    if (gitops === undefined) return;
    onChange({ ...value, gitops: { ...gitops, ...patch } });
  };

  const truongGitOps = cd.gitops?.scenario.initial.map((entry) => entry.field) ?? [];
  const biMat = cd.masking?.scenario.secrets ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted px-4 py-3" data-testid="cicd-cd-panel">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">Bảng điều khiển phát hành</h3>
        <p className="text-xs text-muted-foreground">
          Những chính sách này không nằm trong workflow. Chúng chạy trên kịch bản của màn cùng lượt “Chạy thử”.
        </p>
      </div>

      {release !== undefined && (mo('release.strategy') || mo('release.onBadRelease') || mo('release.rolling') || mo('release.canary')) ? (
        <section className="flex flex-col gap-3" aria-label="Phát hành">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phát hành</h4>

          {mo('release.strategy') ? (
            <ChonMot
              legend="Chiến lược phát hành"
              name="cd-strategy"
              options={RELEASE_STRATEGIES.map((s) => ({ value: s, label: s }))}
              selected={release.strategy}
              onSelect={(strategy) => {
                datRelease({ strategy });
              }}
            />
          ) : null}

          {mo('release.onBadRelease') ? (
            <ChonMot
              legend="Khi phát hiện bản lỗi"
              name="cd-on-bad"
              options={BAD_RELEASE_RESPONSES.map((r) => ({ value: r, label: NHAN_PHUC_HOI[r] }))}
              selected={release.onBadRelease}
              onSelect={(onBadRelease) => {
                datRelease({ onBadRelease });
              }}
            />
          ) : null}

          {mo('release.rolling') && release.rolling !== undefined ? (
            <O
              id="cd-rolling-batch"
              label="Rolling: số máy thay mỗi đợt"
              value={release.rolling.batchSize}
              onValue={(batchSize) => {
                datRelease({ rolling: { batchSize } });
              }}
            />
          ) : null}

          {mo('release.canary') && release.canary !== undefined ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm text-foreground">Canary</legend>
              <O id="cd-canary-weight" label="% lưu lượng vào bản ứng viên" value={release.canary.weightPercent} onValue={(weightPercent) => { datCanary({ weightPercent }); }} />
              <O id="cd-canary-interval" label="Độ dài một khoảng đo (giây)" value={release.canary.intervalSeconds} onValue={(intervalSeconds) => { datCanary({ intervalSeconds }); }} />
              <O id="cd-canary-intervals" label="Số khoảng đo trước khi quyết" value={release.canary.intervals} onValue={(intervals) => { datCanary({ intervals }); }} />
              <O
                id="cd-canary-delta"
                label="Ngưỡng hủy: lỗi canary cao hơn nhóm đối chứng (điểm %)"
                value={Math.round(release.canary.maxErrorRateDelta * 10000) / 100}
                step={0.1}
                onValue={(diem) => {
                  /*
                   * Chia một SỐ NGUYÊN cho 10000, không `diem / 100`: `0.7 / 100`
                   * ra 0.006999…, khác literal `0.007` của level, và ngưỡng canary
                   * so nhân chéo chính xác nên lệch một ulp là lệch verdict.
                   */
                  datCanary({ maxErrorRateDelta: Math.round(diem * 100) / 10000 });
                }}
              />
            </fieldset>
          ) : null}
        </section>
      ) : null}

      {gitops !== undefined && (mo('gitops.reconcileEvery') || mo('gitops.selfHeal') || mo('gitops.ignoreFields')) ? (
        <section className="flex flex-col gap-3" aria-label="Đối soát">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Đối soát</h4>
          {mo('gitops.reconcileEvery') ? (
            <O
              id="cd-reconcile"
              label="Chu kỳ đối soát (giây)"
              value={gitops.reconcileEverySeconds}
              onValue={(reconcileEverySeconds) => {
                datGitOps({ reconcileEverySeconds });
              }}
            />
          ) : null}
          {mo('gitops.selfHeal') ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={gitops.selfHeal}
                onChange={(event) => {
                  datGitOps({ selfHeal: event.target.checked });
                }}
                className="size-4 accent-primary"
              />
              Tự sửa khi phát hiện lệch
            </label>
          ) : null}
          {mo('gitops.ignoreFields') ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm text-foreground">Trường không đối soát</legend>
              {truongGitOps.map((field) => (
                <label key={field} className="flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={gitops.ignoreFields.includes(field)}
                    onChange={(event) => {
                      datGitOps({
                        ignoreFields: event.target.checked
                          ? [...gitops.ignoreFields, field]
                          : gitops.ignoreFields.filter((f) => f !== field),
                      });
                    }}
                    className="size-3.5 accent-primary"
                  />
                  <span className="font-mono">{field}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
        </section>
      ) : null}

      {masking !== undefined && mo('masking.masked') ? (
        <section className="flex flex-col gap-2" aria-label="Che bí mật">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Che bí mật trong log</h4>
          <p className="text-xs text-muted-foreground">Bộ che chỉ thay những chuỗi đã đăng ký dưới đây.</p>
          {biMat.map((secret) => (
            <fieldset key={secret.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <legend className="font-mono text-xs text-foreground">{secret.id}</legend>
              {SECRET_FORMS.map((form) => {
                const dangKy = masking.masked.some((m) => m.secret === secret.id && m.form === form);
                return (
                  <label key={form} className="flex items-center gap-1.5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={dangKy}
                      onChange={(event) => {
                        onChange({
                          ...value,
                          masking: {
                            masked: event.target.checked
                              ? [...masking.masked, { secret: secret.id, form }]
                              : masking.masked.filter((m) => !(m.secret === secret.id && m.form === form)),
                          },
                        });
                      }}
                      className="size-3.5 accent-primary"
                    />
                    {NHAN_DANG[form]}
                  </label>
                );
              })}
            </fieldset>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ChonMot<T extends string>({
  legend,
  name,
  options,
  selected,
  onSelect,
}: {
  readonly legend: string;
  readonly name: string;
  readonly options: readonly { readonly value: T; readonly label: ReactNode }[];
  readonly selected: T;
  readonly onSelect: (value: T) => void;
}): ReactElement {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm text-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="radio"
              name={name}
              checked={selected === option.value}
              onChange={() => {
                onSelect(option.value);
              }}
              className="size-4 accent-primary"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Một ô số. Ô rỗng cho `NaN` và `NaN` đi thẳng vào bộ mô phỏng — bộ mô phỏng
 * NÉM với giá trị ngoài miền, và lượt chạy hiện đúng lời báo đó (`cd-error`).
 * Không kẹp ở đây: kẹp là lặng lẽ chấm một con số người chơi không gõ.
 */
function O({
  id,
  label,
  value,
  onValue,
  step = 1,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly onValue: (value: number) => void;
  readonly step?: number;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => {
          onValue(event.target.value === '' ? Number.NaN : Number(event.target.value));
        }}
        className={O_SO}
      />
    </div>
  );
}
