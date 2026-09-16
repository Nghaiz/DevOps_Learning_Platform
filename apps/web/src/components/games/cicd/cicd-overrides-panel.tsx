'use client';

import type { ReactElement } from 'react';
import { cacheControls, retryControls } from '@devops-platform/games';
import type {
  CicdCacheChoice,
  CicdHydrateSources,
  CicdPlayerOverrides,
  WorkflowSpec,
  WorkloadSpec,
} from '@devops-platform/games';

import type { CicdEditableParts } from './cicd-run';

/**
 * Bảng phụ cho hai thứ **KHÔNG viết được bằng YAML** — 19.E.
 *
 * ## Vì sao chúng phải có một bảng riêng
 *
 * Từ vựng mà `cicd/yaml-read.ts` nhận là từ vựng GitHub Actions: `jobs`,
 * `needs`, `runs-on`, `steps`, `continue-on-error`, `strategy.matrix`. Trong đó
 * KHÔNG có khoá nào chở được số lần chạy lại của một job, và cũng không có khoá
 * nào chở được khoá cache — vì ở GitHub Actions thật, cả hai đều không phải
 * trường của workflow: chạy lại là một nút trên giao diện, còn cache là một
 * action bên thứ ba với đối số riêng.
 *
 * ## ⛔ Danh sách núm KHÔNG dựng ở đây
 *
 * Núm nào hiện là do `retryControls` / `cacheControls` (`packages/games`) quyết,
 * và ô test "lời giải đi tới được bằng giao diện" gọi CHÍNH hai hàm đó. Bản
 * trước dựng danh sách trong JSX, và hai lỗi sống trong khoảng hở ấy mà không ô
 * nào đỏ: núm cache gửi `invalidatedBy = keyParts` (thứ hợp đồng cấm), và núm
 * retries chỉ liệt kê stage của bản chuẩn nên job người chơi tự thêm không chỉnh
 * được. Thêm logic chọn núm vào file này là mở lại đúng khoảng hở đó.
 *
 * ⚠ `current` phải là workflow đọc từ YAML đang soạn, và `sources` phải là ĐÚNG
 * nguồn mà lượt chạy dùng — một núm tính trên nguồn khác nguồn chấm là một núm
 * nói dối về thứ nó điều khiển.
 */

export interface CicdOverridesPanelProps {
  readonly editable: CicdEditableParts;
  /** Workflow đọc từ YAML đang soạn (hoặc bản chuẩn khi YAML chưa đọc được). */
  readonly current: WorkflowSpec;
  readonly sources: CicdHydrateSources;
  readonly workload: WorkloadSpec;
  readonly overrides: CicdPlayerOverrides;
  readonly onChange: (next: CicdPlayerOverrides) => void;
}

export function CicdOverridesPanel({
  editable,
  current,
  sources,
  workload,
  overrides,
  onChange,
}: CicdOverridesPanelProps): ReactElement | null {
  const choRetries = editable.includes('retries');
  const choCache = editable.includes('cache');
  if (!choRetries && !choCache) {
    return null;
  }

  const nutRetries = retryControls(current, sources, editable);
  const nutCache = cacheControls(current, sources, editable);

  const datRetry = (stageId: string, value: number): void => {
    onChange({ ...overrides, retries: { ...overrides.retries, [stageId]: value } });
  };

  const datCache = (key: string, value: CicdCacheChoice | null): void => {
    onChange({ ...overrides, cache: { ...overrides.cache, [key]: value } });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted px-4 py-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">Núm không nằm trong YAML</h3>
        <p className="text-xs text-muted-foreground">
          Hai thứ dưới đây không có khoá tương ứng trong workflow, nên chúng đặt ở đây và đi thẳng
          vào engine cùng lượt chạy.
        </p>
      </div>

      {choRetries ? (
        <section className="flex flex-col gap-2" aria-label="Số lần chạy lại">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Chạy lại khi hỏng
          </h4>
          <p className="text-xs text-muted-foreground">
            Chạy lại cứu được lỗi chập chờn của hạ tầng. Nó KHÔNG cứu được một lỗi thật — chỉ làm
            lượt chạy lâu hơn và tốn thêm runner-phút.
          </p>
          {nutRetries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Workflow chưa có job nào.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {nutRetries.map((nut) => (
                <li key={nut.stageId} className="flex items-center justify-between gap-3">
                  <label htmlFor={`retry-${nut.stageId}`} className="text-sm text-foreground">
                    {nut.stageName}{' '}
                    <span className="font-mono text-xs text-muted-foreground">{nut.stageId}</span>
                  </label>
                  <input
                    id={`retry-${nut.stageId}`}
                    type="number"
                    min={0}
                    max={5}
                    step={1}
                    value={overrides.retries?.[nut.stageId] ?? nut.defaultRetries}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      /*
                       * Ô số rỗng cho `NaN`, và `NaN` đi vào `StageSpec.retries`
                       * làm engine lặp một số lần không xác định. Kẹp tại đây,
                       * chỗ giá trị vào hệ, chứ không tin ô nhập.
                       */
                      datRetry(nut.stageId, Number.isFinite(parsed) ? Math.min(5, Math.max(0, parsed)) : 0);
                    }}
                    className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {choCache ? (
        <section className="flex flex-col gap-3" aria-label="Cache">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cache</h4>
          <p className="text-xs text-muted-foreground">
            Bạn chọn khoá cache băm vào những đầu vào nào. Thứ nội dung cache THẬT SỰ phụ thuộc là sự
            thật của màn và không sửa được — khoá rộng hơn nó thì hiếm khi trúng, hẹp hơn nó thì có
            ngày trúng phải một bản đã ôi.
          </p>
          {nutCache.length === 0 ? (
            <p className="text-xs text-muted-foreground">Không bước nào đang có mặt cache được.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {nutCache.map((nut) => {
                const chon = overrides.cache?.[nut.key];
                const bat = chon === undefined ? nut.defaultOn : chon !== null;
                const keyParts = chon == null ? nut.defaultKeyParts : chon.keyParts;
                return (
                  <li key={nut.key} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        id={`cache-on-${nut.key}`}
                        type="checkbox"
                        checked={bat}
                        onChange={(event) => {
                          datCache(nut.key, event.target.checked ? { keyParts } : null);
                        }}
                        className="size-4 accent-primary"
                      />
                      <label htmlFor={`cache-on-${nut.key}`} className="text-sm text-foreground">
                        {nut.stageName} → {nut.stepName}
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Trúng cache tiết kiệm tối đa {nut.template.savesTicks} tick.
                    </p>
                    {bat ? (
                      <fieldset className="flex flex-col gap-1">
                        <legend className="text-xs text-muted-foreground">
                          Khoá cache gồm những đầu vào nào
                        </legend>
                        {workload.inputs.map((input) => (
                          <label key={input.id} className="flex items-center gap-2 text-xs text-foreground">
                            <input
                              type="checkbox"
                              checked={keyParts.includes(input.id)}
                              onChange={(event) => {
                                datCache(nut.key, {
                                  keyParts: event.target.checked
                                    ? [...keyParts, input.id]
                                    : keyParts.filter((id) => id !== input.id),
                                });
                              }}
                              className="size-3.5 accent-primary"
                            />
                            {input.label}{' '}
                            <span className="text-muted-foreground">(đổi mỗi {input.changesEvery} commit)</span>
                          </label>
                        ))}
                      </fieldset>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
