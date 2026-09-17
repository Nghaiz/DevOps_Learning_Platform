'use client';

import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { Button, MarkdownView } from '@devops-platform/ui';
import {
  mergeStageCatalogue,
  readWorkflowYaml,
  writeWorkflowYaml,
  type CicdCdPolicies,
  type CicdHydrateSources,
  type CicdLevel,
  type CicdPlayerOverrides,
  type InstanceKey,
  type TheoryDoc,
} from '@devops-platform/games';

import { YamlEditor } from '../shared/yaml-editor';
import { CicdCdPanel } from './cicd-cd-panel';
import { CicdCheatsheet } from './cicd-cheatsheet';
import { CicdOverridesPanel } from './cicd-overrides-panel';
import { CicdResultPanel } from './cicd-result-panel';
import { formatNumber, formatSeconds, runWorkflow, type CicdRunOutcome } from './cicd-run';
import { CicdSnippetBar } from './cicd-snippet-bar';
import type { CicdSceneInteraction, CicdSceneProps } from './scene-props';
import { CicdAxesPanel } from './hud/cicd-axes-panel';
import { CicdField } from './hud/cicd-field';
import { CicdHudPanel } from './hud/cicd-hud-panel';
import { CicdMinimap } from './hud/cicd-minimap';
import { buildCicdScene, firstRun, sceneWorkflow } from './hud/cicd-scene-model';
import { CicdTopBar, type CicdQualityTier } from './hud/cicd-top-bar';
import { useHudPanels, type CicdPanelId } from './hud/use-hud-panels';
import { useRendererMode } from './hud/use-renderer-mode';

/**
 * Màn chơi một level CI/CD — 19.D.4, dựng lại trên bố cục TOÀN MÀN HÌNH.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BỐ CỤC LÀ HỢP ĐỒNG, KHÔNG PHẢI THẨM MỸ (quyết định #3 của chủ dự án)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sân chơi chiếm trọn vùng dưới thanh trên cùng, đúng như `k8s-arena`. Mọi bảng
 * là **lớp phủ nổi trên sân**, định vị tuyệt đối. Người chơi thu được HẾT và còn
 * lại một sân trống hoàn toàn.
 *
 * ⛔ Bố cục cũ `grid lg:grid-cols-2` (ô soạn nửa trái, kết quả nửa phải) đã bị
 * BỎ HẲN, và ⛔ màn chơi của game Git — cảnh nằm trong một thẻ hẹp, chia đôi với
 * ô soạn — bị cấm làm nguồn tham chiếu. AC-D7 đo điều này bằng số đo hình học
 * trên `CICD_SCENE_TESTIDS.field`, với đối chứng dương là bố cục chia đôi phải
 * làm ô đó ĐỎ.
 *
 * ⚠ Vỏ lớp phủ đặt `pointer-events-none`; từng bảng tự bật lại
 * `pointer-events-auto`. Thiếu luật này thì một `div` trong suốt phủ toàn sân
 * nuốt mọi cú bấm xuống cảnh — người chơi bấm một node và không gì xảy ra.
 *
 * ⛔ Không gọi mạng. Engine, bộ quét YAML và bộ chấm chạy trong bộ nhớ trình
 * duyệt (AC-D6 đo bằng network trace, KỂ CẢ khi bật 3D).
 */

export interface CicdLevelScreenProps {
  readonly level: CicdLevel;
  /** Bài lý thuyết của màn. `null` khi level không khai `theoryId`. */
  readonly theory: TheoryDoc | null;
  readonly onExit: () => void;
  readonly onNext?: () => void;
}

interface AttemptEntry {
  readonly n: number;
  readonly outcome: CicdRunOutcome;
}

export function CicdLevelScreen({
  level,
  theory,
  onExit,
  onNext,
}: CicdLevelScreenProps): ReactElement {
  /*
   * Văn bản khởi điểm là workflow ban đầu ĐƯỢC IN RA, không phải một chuỗi viết
   * tay: hai bản sẽ trôi khỏi nhau ngay lần đầu ai đó sửa dữ liệu level, và bản
   * viết tay không có cách nào báo là nó đã lạc hậu.
   */
  const [yaml, setYaml] = useState(() => writeWorkflowYaml(level.initialWorkflow).yaml);
  const [overrides, setOverrides] = useState<CicdPlayerOverrides>({});
  /*
   * Chính sách CD khởi đầu từ `cd.initial` của level, cùng lý do văn bản YAML
   * khởi đầu từ `initialWorkflow`: bản chép tay sẽ trôi khỏi dữ liệu level.
   */
  const [cdPolicies, setCdPolicies] = useState<CicdCdPolicies>(() => level.cd?.initial ?? {});
  const [outcome, setOutcome] = useState<CicdRunOutcome | null>(null);
  const [history, setHistory] = useState<readonly AttemptEntry[]>([]);
  const [hintsShown, setHintsShown] = useState(0);
  const [showTheory, setShowTheory] = useState(false);

  const [selectedId, setSelectedId] = useState<InstanceKey | null>(null);
  const [hoveredId, setHoveredId] = useState<InstanceKey | null>(null);
  const [quality, setQuality] = useState<CicdQualityTier>('high');

  const panels = useHudPanels(level.chapter);
  /*
   * `has3d: true` — barrel `scene3d/` có thật trong bản dựng này. `fallback:
   * '2d'` vì kế hoạch §19.D.2 gọi cảnh 2D là **chế độ mặc định, không phải bản
   * dự phòng**: người chơi mới không bị đẩy vào đường nặng hơn mà không ai chọn.
   */
  const rendererMode = useRendererMode({ has3d: true, fallback: '2d' });

  /*
   * Bảng ghép gom stage từ CẢ BA workflow (ban đầu + hai lời giải). Không có nó,
   * một job mà người chơi tự thêm sẽ không tìm thấy mẫu nào để lấy `durationTicks`
   * / `flake` / `cache`, và sẽ chạy với mặc định trung tính — tức thêm việc mà ba
   * trục không nhúc nhích.
   */
  const sources: CicdHydrateSources = useMemo(
    () => ({
      baseline: level.initialWorkflow,
      catalogue: mergeStageCatalogue(
        level.initialWorkflow,
        level.solutionWorkflow,
        level.altSolutionWorkflow,
      ),
    }),
    [level],
  );

  /*
   * Workflow đang soạn, cho bảng núm VÀ cho cảnh. YAML dở dang (chưa đọc được)
   * thì rơi về bản chuẩn: danh sách núm co về tạm thời, nhưng giá trị đã đặt nằm
   * trong `overrides` theo id nên không mất khi YAML đọc được trở lại.
   */
  const current = useMemo(() => {
    const doc = readWorkflowYaml(yaml);
    return doc.ok ? doc.workflow : level.initialWorkflow;
  }, [yaml, level]);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const chay = useCallback((): void => {
    const ketQua = runWorkflow({
      yaml,
      sourcesFor: () => sources,
      knownFor: () => [level.initialWorkflow, level.solutionWorkflow, level.altSolutionWorkflow],
      editable: level.editable,
      overrides,
      workload: level.workload,
      evaluation: level.evaluation,
      objectives: level.objectives,
      ...(level.cd === undefined ? {} : { cd: { level: level.cd, edited: cdPolicies } }),
    });
    setOutcome(ketQua);
    setHistory((truoc) => [...truoc, { n: truoc.length + 1, outcome: ketQua }]);
    /*
     * Mở bảng kết quả khi có kết quả. Người chơi vừa bấm "Chạy thử" thì thứ họ
     * đợi là ba trục và danh sách mục tiêu — bắt họ bấm thêm một nút nữa để thấy
     * chính thứ vừa yêu cầu là một cú bấm thừa, mỗi lượt.
     */
    panels.open('result');
  }, [yaml, sources, level, overrides, cdPolicies, panels]);

  /*
   * Tập RỖNG chứ không `undefined`: `exactOptionalPropertyTypes` cấm truyền
   * `undefined` tường minh vào một prop tuỳ chọn, và tập rỗng nói đúng ý nghĩa
   * cần nói — không dòng nào bị tô.
   */
  const errorLines: ReadonlySet<number> =
    outcome?.kind === 'parse-error'
      ? new Set(outcome.errors.map((diagnostic) => diagnostic.line))
      : new Set<number>();

  const run = useMemo(() => firstRun(outcome), [outcome]);
  const model = useMemo(
    () =>
      buildCicdScene({
        workflow: sceneWorkflow(outcome, current),
        run,
        yAxis: level.chapter,
      }),
    [outcome, current, run, level.chapter],
  );

  const onSelect = useCallback(
    (id: InstanceKey | null) => {
      setSelectedId(id);
      if (id !== null) panels.open('inspector');
    },
    [panels],
  );

  const interaction: CicdSceneInteraction = useMemo(
    () => ({ selectedId, hoveredId, onSelect, onHover: setHoveredId }),
    [selectedId, hoveredId, onSelect],
  );

  const scene: CicdSceneProps | null = model.ok
    ? {
        view: model.view,
        placement: model.placement,
        interaction,
        label: `Đồ thị đường ống của màn ${level.title}`,
      }
    : null;

  const selectedNode =
    scene === null || selectedId === null
      ? null
      : (scene.view.nodes.find((node) => node.instance === selectedId) ?? null);

  /*
   * Công tắc lớp phủ: chỉ hiện bảng nào level này THẬT SỰ có. Một công tắc mở ra
   * một bảng rỗng là một nút nói dối — và ở chương CI thì bảng núm CD đúng là
   * rỗng.
   */
  const panelIds: readonly CicdPanelId[] = [
    'editor',
    'mission',
    'inspector',
    'result',
    'tools',
    'learn',
    'minimap',
  ];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <CicdField
        scene={scene}
        emptyNote={model.ok ? '' : model.note}
        mode={rendererMode.resolved.mode}
        quality={quality}
      />

      <CicdTopBar
        levelId={level.id}
        title={level.title}
        chapter={level.chapter}
        resolved={rendererMode.resolved}
        onMode={rendererMode.choose}
        quality={quality}
        onQuality={setQuality}
        panels={panels.state}
        panelIds={panelIds}
        onTogglePanel={panels.toggle}
        onCloseAllPanels={panels.closeAll}
        onRun={chay}
        onHelp={() => {
          panels.toggle('learn');
        }}
        onExit={onExit}
        {...(onNext === undefined ? {} : { onNext })}
      />

      {/* Lớp phủ. Vỏ không nhận chuột; từng bảng tự bật lại. */}
      <div className="pointer-events-none absolute inset-x-0 top-14 bottom-0 z-20">
        <CicdAxesPanel
          outcome={outcome}
          className="absolute top-3 left-1/2 -translate-x-1/2"
        />

        {panels.state.editor ? (
          <CicdHudPanel
            title="Ô soạn workflow"
            onClose={() => {
              panels.close('editor');
            }}
            className="absolute inset-y-3 left-3 w-[min(30rem,42vw)]"
            bodyClassName="flex flex-col gap-3 overflow-hidden"
            testId="cicd-panel-editor"
          >
            <div className="flex min-h-0 flex-1 flex-col">
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
          </CicdHudPanel>
        ) : null}

        <div className="absolute inset-y-3 right-3 flex w-[min(26rem,38vw)] flex-col gap-3 overflow-y-auto">
          {panels.state.mission ? (
            <CicdHudPanel
              title="Đề bài"
              onClose={() => {
                panels.close('mission');
              }}
              className="max-h-[45vh] shrink-0"
              testId="cicd-panel-mission"
            >
              <p className="text-sm font-medium text-foreground">{level.mission}</p>
              <div className="mt-2 text-sm text-muted-foreground">
                <MarkdownView markdown={level.brief} resolveAssetUrl={() => null} />
              </div>
              <ul className="mt-3 flex flex-col gap-1">
                {level.objectives.map((objective) => (
                  <li key={objective.id} className="text-xs text-muted-foreground">
                    <span className="font-mono">{objective.required ? '◆' : '◇'}</span>{' '}
                    {objective.label}
                  </li>
                ))}
              </ul>
            </CicdHudPanel>
          ) : null}

          {panels.state.inspector ? (
            <CicdHudPanel
              title="Thông số job"
              onClose={() => {
                panels.close('inspector');
              }}
              className="max-h-[45vh] shrink-0"
              testId="cicd-panel-inspector"
            >
              {selectedNode === null ? (
                <p className="text-xs text-muted-foreground">
                  Chưa chọn job nào. Bấm một node trên sân, hoặc chọn một chấm trên bản đồ thu
                  nhỏ.
                </p>
              ) : (
                <dl className="flex flex-col gap-1 text-xs">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Job</dt>
                    <dd className="font-mono text-foreground">{selectedNode.name}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Trạng thái</dt>
                    <dd className="text-foreground">{selectedNode.state}</dd>
                  </div>
                </dl>
              )}
            </CicdHudPanel>
          ) : null}

          {panels.state.result ? (
            <CicdHudPanel
              title="Kết quả"
              onClose={() => {
                panels.close('result');
              }}
              className="max-h-[60vh] shrink-0"
              testId="cicd-panel-result"
            >
              {outcome === null ? (
                <p className="text-sm text-muted-foreground">
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

              <section className="mt-3 flex flex-col gap-2" aria-label="Gợi ý">
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
            </CicdHudPanel>
          ) : null}

          {panels.state.tools ? (
            <CicdHudPanel
              title="Bảng núm"
              onClose={() => {
                panels.close('tools');
              }}
              className="max-h-[55vh] shrink-0"
              testId="cicd-panel-tools"
            >
              <CicdOverridesPanel
                editable={level.editable}
                current={current}
                sources={sources}
                workload={level.workload}
                overrides={overrides}
                onChange={setOverrides}
              />
              {level.cd === undefined ? null : (
                <div className="mt-3">
                  <CicdCdPanel cd={level.cd} value={cdPolicies} onChange={setCdPolicies} />
                </div>
              )}
            </CicdHudPanel>
          ) : null}

          {panels.state.learn ? (
            <CicdHudPanel
              title="Bài học"
              onClose={() => {
                panels.close('learn');
              }}
              className="max-h-[55vh] shrink-0"
              testId="cicd-panel-learn"
            >
              <p className="text-sm text-muted-foreground">{level.teaching.primer}</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                {level.teaching.takeaways.map((takeaway, index) => (
                  <li key={index} className="text-sm text-muted-foreground">
                    {takeaway}
                  </li>
                ))}
              </ul>
              {theory === null ? null : (
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-expanded={showTheory}
                    onClick={() => {
                      setShowTheory((dangMo) => !dangMo);
                    }}
                  >
                    Bài lý thuyết: {theory.frontmatter.title} · {theory.frontmatter.readMinutes}{' '}
                    phút
                  </Button>
                  {showTheory ? (
                    <div className="rounded-lg border border-border px-4 py-3" data-testid="cicd-theory">
                      <MarkdownView markdown={theory.body} resolveAssetUrl={() => null} />
                    </div>
                  ) : null}
                </div>
              )}
              <div className="mt-3">
                <CicdCheatsheet entries={level.teaching.cheatsheet} />
              </div>
            </CicdHudPanel>
          ) : null}

          {panels.state.minimap ? (
            <CicdHudPanel
              title="Bản đồ"
              onClose={() => {
                panels.close('minimap');
              }}
              className="mt-auto shrink-0"
              testId="cicd-panel-minimap"
            >
              {scene === null ? (
                <p className="text-xs text-muted-foreground">Chưa có đồ thị để thu nhỏ.</p>
              ) : (
                <CicdMinimap scene={scene} />
              )}
            </CicdHudPanel>
          ) : null}
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
    <section className="mt-3 flex flex-col gap-2" aria-label="Lịch sử các lượt chạy">
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
              ) : entry.outcome.kind === 'cd-error' ? (
                <span className="text-destructive">Chính sách CD không hợp lệ</span>
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
