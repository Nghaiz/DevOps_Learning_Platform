'use client';

import type { ReactElement } from 'react';
import { cacheOverrideKey } from '@devops-platform/games';
import type {
  CacheSpec,
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
 * Hợp đồng engine thì có cả hai (`StageSpec.retries`, `StepSpec.cache`), và các
 * màn C06–C11 + C14 dạy đúng hai thứ đó. Nên chúng đi vào engine qua
 * `CicdPlayerOverrides`, và bảng này là chỗ người chơi đặt chúng.
 *
 * ⚠ Bảng CHỈ hiện khi `level.editable` cho phép. Cho người chơi vặn một núm mà
 * `hydrateWorkflow` sẽ lặng lẽ bỏ qua còn tệ hơn là không có núm: họ sẽ vặn, thấy
 * ba trục không đổi, và kết luận sai về cách hệ thống hoạt động.
 */

export interface CicdOverridesPanelProps {
  readonly editable: CicdEditableParts;
  /** Nguồn tên job + tên bước. Level: workflow ban đầu. Sandbox: chính bản đang soạn. */
  readonly baseline: WorkflowSpec;
  /** Nguồn MẪU cache — thường là bảng ghép (ban đầu + lời giải), nơi có `savesTicks` thật. */
  readonly catalogue: WorkflowSpec;
  readonly workload: WorkloadSpec;
  readonly overrides: CicdPlayerOverrides;
  readonly onChange: (next: CicdPlayerOverrides) => void;
}

export function CicdOverridesPanel({
  editable,
  baseline,
  catalogue,
  workload,
  overrides,
  onChange,
}: CicdOverridesPanelProps): ReactElement | null {
  const choRetries = editable.includes('retries');
  const choCache = editable.includes('cache');
  if (!choRetries && !choCache) {
    return null;
  }

  /*
   * Chỉ những bước mà bảng ghép CÓ mẫu cache mới hiện. `savesTicks` là dữ liệu
   * của level (cache tiết kiệm được bao nhiêu phụ thuộc bước đó làm gì), không
   * phải thứ người chơi bịa ra — nên bước không có mẫu thì không có gì để bật.
   */
  const buocCoCache = catalogue.stages.flatMap((stage) =>
    stage.steps
      .filter((step) => step.cache !== undefined)
      .map((step) => ({ stageId: stage.id, stageName: stage.name, step, cache: step.cache as CacheSpec })),
  );

  const datRetry = (stageId: string, value: number): void => {
    onChange({ ...overrides, retries: { ...overrides.retries, [stageId]: value } });
  };

  const datCache = (key: string, value: CacheSpec | null): void => {
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
          <ul className="flex flex-col gap-2">
            {baseline.stages.map((stage) => (
              <li key={stage.id} className="flex items-center justify-between gap-3">
                <label htmlFor={`retry-${stage.id}`} className="text-sm text-foreground">
                  {stage.name}{' '}
                  <span className="font-mono text-xs text-muted-foreground">{stage.id}</span>
                </label>
                <input
                  id={`retry-${stage.id}`}
                  type="number"
                  min={0}
                  max={5}
                  step={1}
                  value={overrides.retries?.[stage.id] ?? stage.retries}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    /*
                     * Ô số rỗng cho `NaN`, và `NaN` đi vào `StageSpec.retries`
                     * làm engine lặp một số lần không xác định. Kẹp tại đây,
                     * chỗ giá trị vào hệ, chứ không tin ô nhập.
                     */
                    datRetry(stage.id, Number.isFinite(parsed) ? Math.min(5, Math.max(0, parsed)) : 0);
                  }}
                  className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {choCache ? (
        <section className="flex flex-col gap-3" aria-label="Cache">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cache</h4>
          <p className="text-xs text-muted-foreground">
            Khoá cache quyết định lúc nào dùng lại được. Khoá quá rộng ⇒ dùng lại một bản đã cũ.
            Khoá quá hẹp ⇒ gần như không bao giờ trúng, và cache thành một bước tốn thêm thời gian.
          </p>
          {buocCoCache.length === 0 ? (
            <p className="text-xs text-muted-foreground">Màn này không có bước nào cache được.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {buocCoCache.map(({ stageId, stageName, step, cache }) => {
                const key = cacheOverrideKey(stageId, step.id);
                const hienTai = overrides.cache?.[key];
                const bat = hienTai === undefined ? true : hienTai !== null;
                const keyParts = hienTai == null ? cache.keyParts : hienTai.keyParts;
                return (
                  <li key={key} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        id={`cache-on-${key}`}
                        type="checkbox"
                        checked={bat}
                        onChange={(event) => {
                          datCache(
                            key,
                            event.target.checked
                              ? { ...cache, keyParts: cache.keyParts, invalidatedBy: cache.keyParts }
                              : null,
                          );
                        }}
                        className="size-4 accent-primary"
                      />
                      <label htmlFor={`cache-on-${key}`} className="text-sm text-foreground">
                        {stageName} → {step.name}
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Trúng cache tiết kiệm {cache.savesTicks} tick.
                    </p>
                    {bat ? (
                      <fieldset className="flex flex-col gap-1">
                        <legend className="text-xs text-muted-foreground">
                          Khoá cache gồm những đầu vào nào
                        </legend>
                        {workload.inputs.map((input) => {
                          const chon = keyParts.includes(input.id);
                          return (
                            <label
                              key={input.id}
                              className="flex items-center gap-2 text-xs text-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={chon}
                                onChange={(event) => {
                                  const next = event.target.checked
                                    ? [...keyParts, input.id]
                                    : keyParts.filter((id) => id !== input.id);
                                  /*
                                   * `invalidatedBy` đi cùng `keyParts` chứ không
                                   * là một núm thứ hai: với một người mới học,
                                   * "cái gì tạo nên khoá" và "cái gì làm khoá
                                   * hết hiệu lực" là MỘT ý, và tách ra thành hai
                                   * ô tick chỉ tạo cơ hội đặt chúng lệch nhau —
                                   * một trạng thái không dạy được gì.
                                   */
                                  datCache(key, { ...cache, keyParts: next, invalidatedBy: next });
                                }}
                                className="size-3.5 accent-primary"
                              />
                              {input.label}{' '}
                              <span className="text-muted-foreground">
                                (đổi mỗi {input.changesEvery} commit)
                              </span>
                            </label>
                          );
                        })}
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
