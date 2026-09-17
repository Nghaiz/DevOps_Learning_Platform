'use client';

import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Button } from '@devops-platform/ui';
import { CI_LEVELS, readWorkflowYaml, type CicdPlayerOverrides, type WorkflowSpec } from '@devops-platform/games';

import { YamlEditor } from '../shared/yaml-editor';
import { CicdOverridesPanel } from './cicd-overrides-panel';
import { CicdResultPanel } from './cicd-result-panel';
import { runWorkflow, type CicdEditableParts, type CicdRunOutcome } from './cicd-run';
import { CicdSnippetBar } from './cicd-snippet-bar';

const WORKFLOW_RONG: WorkflowSpec = { name: '', stages: [] };

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
 * Mọi phần mà BẤT KỲ màn nào cho sửa — suy từ dữ liệu màn, không chép tay.
 *
 * `packages/games` không xuất `EDITABLE_PARTS`, và một bản chép tay bảy chuỗi ở
 * đây sẽ đúng hôm nay rồi trôi khỏi bản gốc trong im lặng: thêm một phần mới vào
 * hợp đồng thì bản thứ hai không biết, và bàn thử vẫn hiện một núm mà
 * `hydrateWorkflow` lặng lẽ bỏ qua.
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
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  /*
   * Bảng núm dùng ĐÚNG nguồn mà lượt chạy dùng: chính workflow vừa đọc (xem đầu
   * file). Bản trước đưa bảng núm `initialWorkflow` của màn đầu — một workflow
   * RỖNG — trong khi lượt chạy ghép từ YAML, nên danh sách núm và thứ được chấm
   * nói về hai workflow khác nhau.
   */
  const current = useMemo(() => {
    const doc = readWorkflowYaml(yaml);
    return doc.ok ? doc.workflow : WORKFLOW_RONG;
  }, [yaml]);

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

  /*
   * Tập RỖNG chứ không `undefined` khi chưa có lỗi: `exactOptionalPropertyTypes`
   * cấm truyền `undefined` tường minh vào một prop tuỳ chọn, và một tập rỗng nói
   * đúng ý nghĩa cần nói — không dòng nào bị tô.
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
              textareaRef={editorRef}
            />
          </div>
          <CicdSnippetBar
            runnerClassIds={SAN_DO.workload.runners.map((pool) => pool.id)}
            editorRef={editorRef}
            value={yaml}
            onInsert={setYaml}
          />
          <CicdOverridesPanel
            editable={MOI_PHAN_SUA_DUOC}
            current={current}
            sources={{ baseline: current, catalogue: current }}
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
