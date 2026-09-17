'use client';

import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Button } from '@devops-platform/ui';
import {
  mergeStageCatalogue,
  readWorkflowYaml,
  writeWorkflowYaml,
  type CicdHydrateSources,
  type CicdLevel,
  type CicdPlayerOverrides,
} from '@devops-platform/games';

import { YamlEditor } from '../shared/yaml-editor';
import { CicdCheatsheet } from './cicd-cheatsheet';
import { CicdOverridesPanel } from './cicd-overrides-panel';
import { CicdResultPanel } from './cicd-result-panel';
import { formatNumber, formatSeconds, runWorkflow, type CicdRunOutcome } from './cicd-run';
import { CicdSnippetBar } from './cicd-snippet-bar';

/**
 * Màn chơi một level CI/CD — 19.E.1 → 19.E.5.
 *
 * Bố cục: đề bài trên, ô soạn YAML bên trái, kết quả bên phải, lịch sử dưới
 * cùng. Ô soạn và kết quả đứng CẠNH nhau chứ không nối tiếp, vì vòng lặp học ở
 * đây là "sửa một cạnh ⇒ xem ba trục nhúc nhích": bắt người chơi cuộn giữa hai
 * thứ họ đang so sánh là làm hỏng chính vòng lặp đó.
 *
 * ⛔ Không gọi mạng. Engine, bộ quét YAML và bộ chấm đều chạy trong bộ nhớ trình
 * duyệt, giống hệt hai game kia (AC-2 của P17 đo bằng network trace).
 */

export interface CicdLevelScreenProps {
  readonly level: CicdLevel;
  readonly onExit: () => void;
  readonly onNext?: () => void;
}

interface AttemptEntry {
  readonly n: number;
  readonly outcome: CicdRunOutcome;
}

export function CicdLevelScreen({ level, onExit, onNext }: CicdLevelScreenProps): ReactElement {
  /*
   * Văn bản khởi điểm là workflow ban đầu ĐƯỢC IN RA, không phải một chuỗi viết
   * tay: hai bản sẽ trôi khỏi nhau ngay lần đầu ai đó sửa dữ liệu level, và bản
   * viết tay không có cách nào báo là nó đã lạc hậu.
   */
  const [yaml, setYaml] = useState(() => writeWorkflowYaml(level.initialWorkflow).yaml);
  const [overrides, setOverrides] = useState<CicdPlayerOverrides>({});
  const [outcome, setOutcome] = useState<CicdRunOutcome | null>(null);
  const [history, setHistory] = useState<readonly AttemptEntry[]>([]);
  const [hintsShown, setHintsShown] = useState(0);

  /*
   * Bảng ghép gom stage từ CẢ BA workflow (ban đầu + hai lời giải). Không có nó,
   * một job mà người chơi tự thêm sẽ không tìm thấy mẫu nào để lấy `durationTicks`
   * / `flake` / `cache`, và sẽ chạy với mặc định trung tính — tức thêm việc mà ba
   * trục không nhúc nhích.
   */
  const sources: CicdHydrateSources = useMemo(
    () => ({
      baseline: level.initialWorkflow,
      catalogue: mergeStageCatalogue(level.initialWorkflow, level.solutionWorkflow, level.altSolutionWorkflow),
    }),
    [level],
  );

  /*
   * Workflow đang soạn, cho bảng núm. YAML dở dang (chưa đọc được) thì rơi về bản
   * chuẩn: danh sách núm co về tạm thời, nhưng giá trị đã đặt nằm trong
   * `overrides` theo id nên không mất khi YAML đọc được trở lại.
   */
  const current = useMemo(() => {
    const doc = readWorkflowYaml(yaml);
    return doc.ok ? doc.workflow : level.initialWorkflow;
  }, [yaml, level]);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const chay = (): void => {
    const ketQua = runWorkflow({
      yaml,
      sourcesFor: () => sources,
      knownFor: () => [level.initialWorkflow, level.solutionWorkflow, level.altSolutionWorkflow],
      editable: level.editable,
      overrides,
      workload: level.workload,
      evaluation: level.evaluation,
      objectives: level.objectives,
    });
    setOutcome(ketQua);
    setHistory((truoc) => [...truoc, { n: truoc.length + 1, outcome: ketQua }]);
  };

  /*
   * Tập RỖNG chứ không `undefined`: `exactOptionalPropertyTypes` cấm truyền
   * `undefined` tường minh vào một prop tuỳ chọn, và tập rỗng nói đúng ý nghĩa
   * cần nói — không dòng nào bị tô.
   */
  const errorLines: ReadonlySet<number> =
    outcome?.kind === 'parse-error'
      ? new Set(outcome.errors.map((diagnostic) => diagnostic.line))
      : new Set<number>();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onExit}>
              ← Danh sách màn
            </Button>
            <span className="font-mono text-xs text-muted-foreground">{level.id}</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">{level.title}</h1>
          <p className="text-sm text-muted-foreground">{level.mission}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={chay}>Chạy thử</Button>
          {onNext !== undefined && outcome?.kind === 'scored' && outcome.won ? (
            <Button variant="secondary" onClick={onNext}>
              Màn tiếp →
            </Button>
          ) : null}
        </div>
      </header>

      <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
        {level.brief}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex h-80 flex-col">
            <YamlEditor
              value={yaml}
              onChange={setYaml}
              ariaLabel={`Workflow YAML của màn ${level.title}`}
              errorLines={errorLines}
              showLineNumbers
              textareaRef={editorRef}
            />
          </div>

          <CicdSnippetBar
            runnerClassIds={level.workload.runners.map((pool) => pool.id)}
            editorRef={editorRef}
            onInsert={setYaml}
            value={yaml}
          />

          <CicdOverridesPanel
            editable={level.editable}
            current={current}
            sources={sources}
            workload={level.workload}
            overrides={overrides}
            onChange={setOverrides}
          />
        </div>

        <div className="flex flex-col gap-4">
          {outcome === null ? (
            <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              Bấm “Chạy thử” để mô phỏng {level.evaluation.passes} lượt và xem ba trục.
            </p>
          ) : (
            <CicdResultPanel
              outcome={outcome}
              objectives={level.objectives}
              thresholds={level.thresholds}
              showVerdict
            />
          )}

          <AttemptHistory history={history} />

          <section className="flex flex-col gap-2" aria-label="Gợi ý">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Gợi ý
              </h3>
              {hintsShown < level.hints.length ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setHintsShown((n) => n + 1);
                  }}
                >
                  Mở gợi ý {hintsShown + 1}/{level.hints.length}
                </Button>
              ) : null}
            </div>
            {hintsShown === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa mở gợi ý nào.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {level.hints.slice(0, hintsShown).map((hint, index) => (
                  <li key={index} className="text-sm text-muted-foreground">
                    {hint}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2" aria-label="Bài học">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Bài học
            </h3>
            <p className="text-sm text-muted-foreground">{level.teaching.primer}</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {level.teaching.takeaways.map((takeaway, index) => (
                <li key={index} className="text-sm text-muted-foreground">
                  {takeaway}
                </li>
              ))}
            </ul>
          </section>

          <CicdCheatsheet entries={level.teaching.cheatsheet} />
        </div>
      </div>
    </div>
  );
}

/**
 * Lịch sử các lượt chạy của màn này — 19.E.5.
 *
 * Sống trong state của màn, không `localStorage`: nó phục vụ vòng lặp "sửa một
 * thứ rồi so với lượt trước", và vòng lặp đó kết thúc khi người chơi rời màn.
 *
 * Ba trục hiện đủ ở MỖI dòng, không chỉ một cột "điểm": cả điểm của bảng này là
 * thấy được lượt nào đổi trục nào — lượt vừa rồi nhanh hơn nhưng tốn hơn thì
 * hàng đó phải nói ra cả hai.
 */
function AttemptHistory({ history }: { readonly history: readonly AttemptEntry[] }): ReactElement {
  return (
    <section className="flex flex-col gap-2" aria-label="Lịch sử các lượt chạy">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Lịch sử ({history.length})
      </h3>
      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa chạy lượt nào.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {[...history].reverse().map((entry) => (
            <li
              key={entry.n}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-xs"
            >
              <span className="font-mono text-muted-foreground">#{entry.n}</span>
              {entry.outcome.kind === 'parse-error' ? (
                <span className="text-destructive">
                  Không quét được YAML ({entry.outcome.errors.length} lỗi)
                </span>
              ) : entry.outcome.kind === 'engine-error' ? (
                <span className="text-destructive">Workflow không chạy được</span>
              ) : entry.outcome.kind === 'shape-error' ? (
                <span className="text-destructive">Job không khớp màn — chưa chấm</span>
              ) : entry.outcome.kind === 'empty' ? (
                <span className="text-muted-foreground">Chưa có job nào để chạy</span>
              ) : (
                <>
                  <span className={entry.outcome.won ? 'text-success' : 'text-warning'}>
                    {entry.outcome.won ? 'Đạt' : 'Chưa đạt'}
                  </span>
                  <span className="text-muted-foreground">
                    ① {formatSeconds(entry.outcome.axes.leadTimeSeconds)}
                  </span>
                  <span className="text-muted-foreground">
                    ② {formatNumber(entry.outcome.axes.throughputPerHour)}/giờ
                  </span>
                  <span className="text-muted-foreground">
                    ③ {formatNumber(entry.outcome.axes.runnerMinutes)} runner-phút
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
