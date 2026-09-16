'use client';

import { useState, type ReactElement } from 'react';
import { Button } from '@devops-platform/ui';
import { CI_LEVELS, type CicdPlayerOverrides } from '@devops-platform/games';

import { YamlEditor } from '../shared/yaml-editor';
import { CicdOverridesPanel } from './cicd-overrides-panel';
import { CicdResultPanel } from './cicd-result-panel';
import { runWorkflow, type CicdEditableParts, type CicdRunOutcome } from './cicd-run';
import { appendSnippet, cicdSnippets } from './cicd-snippets';

/**
 * Bàn thử tự do — workflow trắng, chạy bao nhiêu lượt cũng được, không mục tiêu.
 *
 * ## ⛔ NGUỒN GHÉP Ở ĐÂY LÀ CHÍNH WORKFLOW NGƯỜI CHƠI VỪA SOẠN
 *
 * Ở màn chơi, `baseline` là workflow ban đầu của level và `catalogue` là bảng
 * ghép từ ba workflow dữ liệu — đó là chỗ `durationTicks`, `flake`, `cache` quay
 * về sau khi YAML làm rơi chúng.
 *
 * Bàn thử không có level nào, nên không có bảng nào để tra. Truyền
 * `{ baseline: parsed, catalogue: parsed }` là cách nói "không có gì để khôi
 * phục, lấy đúng thứ vừa đọc được". Mượn `initialWorkflow` của một level nào đó
 * làm baseline sẽ lặng lẽ tiêm thời lượng và tỉ lệ chập chờn của MÀN ĐÓ vào mọi
 * job trùng tên ở đây — và người chơi sẽ thấy ba trục nhảy vì một lý do không
 * có trên màn hình.
 *
 * Cái giá: mọi job ở bàn thử chạy với mặc định trung tính của bộ đọc YAML. Đó
 * là điều đúng cho một chỗ thử cú pháp và thử hình dạng đồ thị.
 *
 * ## Vì sao workload mượn của màn đầu
 *
 * `WorkloadSpec` (kho máy, đầu vào, lịch commit) không viết được bằng YAML và
 * không phải thứ đang dạy ở đây. Mượn của màn đầu cho một sân đo có thật, ổn
 * định, và ba commit — đủ để thông lượng KHÔNG chỉ là nghịch đảo của lead time.
 */

const SAN_DO = CI_LEVELS[0];

/**
 * Moi phan ma BAT KY man nao cho sua — suy tu du lieu man, khong chep tay.
 *
 * `packages/games` khong xuat `EDITABLE_PARTS`, va mot ban chep tay bay chuoi o
 * day se dung hom nay roi trôi khoi ban goc trong im lang: them mot phan moi vao
 * hop dong thi ban thu hai khong biet, va ban thu va o soan van nhan mot nut ma
 * `hydrateWorkflow` lang le bo qua.
 */
const MOI_PHAN_SUA_DUOC: CicdEditableParts = [
  ...new Set(CI_LEVELS.flatMap((level) => level.editable)),
];

const YAML_KHOI_DIEM = [
  'name: ban-thu',
  'jobs:',
  '  clone:',
  `    runs-on: ${SAN_DO?.workload.runners[0]?.id ?? 'linux'}`,
  '    steps:',
  '      - name: Tải mã',
  '        run: git fetch --depth 1',
  '',
].join('\n');

export interface CicdSandboxProps {
  readonly onExit: () => void;
}

export function CicdSandbox({ onExit }: CicdSandboxProps): ReactElement {
  const [yaml, setYaml] = useState(YAML_KHOI_DIEM);
  const [overrides, setOverrides] = useState<CicdPlayerOverrides>({});
  const [outcome, setOutcome] = useState<CicdRunOutcome | null>(null);
  const [runs, setRuns] = useState(0);

  if (SAN_DO === undefined) {
    /*
     * `CI_LEVELS` rỗng nghĩa là dữ liệu màn chưa nạp — không có kho máy, không
     * có lịch commit, nên không có gì để mô phỏng. Nói ra điều đó thay vì vẽ
     * một ô soạn mà nút chạy không bao giờ ra số.
     */
    return (
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Danh sách màn
        </Button>
        <p className="text-sm text-muted-foreground">
          Chưa có dữ liệu màn nào, nên bàn thử không có sân đo để chạy.
        </p>
      </div>
    );
  }

  const snippets = cicdSnippets(SAN_DO.workload.runners.map((pool) => pool.id));

  /*
   * Tap RONG chu khong `undefined` khi chua co loi: `exactOptionalPropertyTypes`
   * cam truyen `undefined` tuong minh vao mot prop tuy chon, va mot tap rong noi
   * dung y nghia can noi — khong dong nao bi to.
   */
  const errorLines: ReadonlySet<number> =
    outcome?.kind === 'parse-error'
      ? new Set(outcome.errors.map((diagnostic) => diagnostic.line))
      : new Set<number>();

  const chay = (): void => {
    setOutcome(
      runWorkflow({
        yaml,
        // Không có bảng dữ liệu nào để khôi phục — xem khối chú thích đầu file.
        sourcesFor: (parsed) => ({ baseline: parsed, catalogue: parsed }),
        // Bàn thử mở MỌI phần: không có bài nào đang khoá thứ gì lại.
        editable: MOI_PHAN_SUA_DUOC,
        overrides,
        workload: SAN_DO.workload,
        evaluation: SAN_DO.evaluation,
        objectives: [],
      }),
    );
    setRuns((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onExit}>
              ← Danh sách màn
            </Button>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Bàn thử tự do</h1>
          <p className="text-sm text-muted-foreground">
            Không mục tiêu, không giới hạn số lượt. Kho máy và lịch commit mượn của màn đầu để có
            một sân đo ổn định; mọi job chạy với thời lượng mặc định.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Đã chạy {runs} lượt</span>
          <Button onClick={chay}>Chạy thử</Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex h-80 flex-col">
            <YamlEditor
              value={yaml}
              onChange={setYaml}
              ariaLabel="Workflow YAML của bàn thử tự do"
              errorLines={errorLines}
              showLineNumbers
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {snippets.map((snippet) => (
              <Button
                key={snippet.id}
                variant="outline"
                size="sm"
                title={snippet.explain}
                onClick={() => {
                  setYaml((truoc) => appendSnippet(truoc, snippet.yaml));
                }}
              >
                {snippet.label}
              </Button>
            ))}
          </div>
          <CicdOverridesPanel
            editable={MOI_PHAN_SUA_DUOC}
            baseline={SAN_DO.initialWorkflow}
            catalogue={SAN_DO.initialWorkflow}
            workload={SAN_DO.workload}
            overrides={overrides}
            onChange={setOverrides}
          />
        </div>

        <div className="flex flex-col gap-4">
          {outcome === null ? (
            <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              Bấm “Chạy thử” để mô phỏng và xem ba trục.
            </p>
          ) : (
            <CicdResultPanel
              outcome={outcome}
              objectives={[]}
              thresholds={SAN_DO.thresholds}
              showVerdict={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
