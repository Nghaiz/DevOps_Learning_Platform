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

import { CicdCdPanel } from './cicd-cd-panel';
import { CicdCheatsheet } from './cicd-cheatsheet';
import { CicdOverridesPanel } from './cicd-overrides-panel';
import { CicdResultPanel } from './cicd-result-panel';
import { formatNumber, formatSeconds, runWorkflow, type CicdRunOutcome } from './cicd-run';
import { CicdSnippetBar } from './cicd-snippet-bar';
import type { CicdSceneInteraction, CicdSceneProps } from './scene-props';
import type { HintReveal } from '../../../lib/use-hint-reveal';
import { CicdAxesPanel } from './hud/cicd-axes-panel';
import { CicdAxisIntro, useAxisIntro } from './hud/cicd-axis-intro';
import { CicdEditorDrawer } from './hud/cicd-editor-drawer';
import { CicdField } from './hud/cicd-field';
import { CicdHudPanel } from './hud/cicd-hud-panel';
import { CicdInspector } from './hud/cicd-inspector';
import { CicdMinimap } from './hud/cicd-minimap';
import { CicdMissionCard } from './hud/cicd-mission-card';
import { buildCicdScene, firstRun, sceneWorkflow } from './hud/cicd-scene-model';
import type { CicdHotkey } from './hud/cicd-keymap';
import { CicdTopBar, type CicdQualityTier } from './hud/cicd-top-bar';
import { useHudKeyboard } from './hud/use-hud-keyboard';
import { CICD_PANEL_IDS, useHudPanels, type CicdPanelId } from './hud/use-hud-panels';
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

/**
 * Chế độ LÀM BÀI OJ — 19.J.3. Vắng ⇒ màn chơi level bình thường.
 *
 * ⛔ Sự có mặt của prop này đổi MỘT bất biến của màn hình: lượt "Chạy thử" tại
 * chỗ thôi là phép chấm. Client không có `check` của testcase (§18.B.4 cắt nó ở
 * máy chủ), nên không có gì để chấm tại chỗ — lượt chạy chỉ còn cho ba trục và
 * chẩn đoán engine. Verdict chỉ tới từ `problems.tryGrade`.
 *
 * Hai hệ quả cưỡng chế ngay trong thân component, đừng gỡ:
 *  1. `runWorkflow` nhận danh sách mục tiêu RỖNG (`checkObjective` sẽ ném trên
 *     một `check` rỗng — xem `cicd-oj-level.ts`).
 *  2. Bảng kết quả nhận `showVerdict: false`, nên không vẽ chữ "Đạt" của một
 *     phép chấm không hề chạy.
 */
export interface CicdOjScreenProps {
  /** Bài có đủ testcase để nộp không. OJ luôn chấm trên máy chủ. */
  readonly gradable: boolean;
  /** Câu nói ra giới hạn, hiện TRÊN MÀN khi `gradable` là `false`. */
  readonly notice: string | null;
  readonly submitLabel: string;
  readonly submitDisabled: boolean;
  /**
   * Nộp lượt chơi hiện tại.
   *
   * ⛔ Nhận CẢ BA mảnh, vì `CicdGameAction.evaluate` chở cả ba và chúng phải đến
   * từ CÙNG một khoảnh khắc. Màn hình này là chỗ duy nhất giữ đủ ba, nên nếu
   * chữ ký chỉ chở `yaml` thì bảng núm lại rơi ra ngoài nhật ký — đúng khe mà
   * 19.J.1 vừa đóng.
   */
  readonly onSubmit: (nop: {
    readonly yaml: string;
    readonly overrides: CicdPlayerOverrides;
    readonly cd: CicdCdPolicies | null;
  }) => void;
  /** Dòng kết quả máy chủ trả về, hoặc câu lỗi. `null` = chưa nộp lần nào. */
  readonly result: string | null;
  /** Tên testcase chưa qua, theo lần chấm gần nhất của máy chủ. */
  readonly failedLabels: readonly string[];
  /**
   * Trạng thái xin chữ gợi ý từ máy chủ, theo chỉ số.
   *
   * Bài OJ nạp qua `problems.byCode`, và đường đó CHE chữ của gợi ý chưa mở
   * (§18.B.4) — nên `level.hints` ở chế độ này toàn chuỗi rỗng.
   */
  readonly hintReveals: ReadonlyMap<number, HintReveal>;
  /** Xin chữ gợi ý thứ `index`; `null` ⇒ ĐỪNG mở gợi ý (không trừ điểm). */
  readonly onRevealHint: (index: number) => Promise<string | null>;
}

export interface CicdLevelScreenProps {
  readonly level: CicdLevel;
  /** Bài lý thuyết của màn. `null` khi level không khai `theoryId`. */
  readonly theory: TheoryDoc | null;
  readonly onExit: () => void;
  readonly onNext?: () => void;
  /** Chế độ làm bài OJ. Vắng ⇒ màn chơi level. Xem `CicdOjScreenProps`. */
  readonly oj?: CicdOjScreenProps;
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
  oj,
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
   * Màn chuyển tiếp trục Y (D.5.1). Tự hiện ĐÚNG MỘT LẦN khi vào chương CD, và
   * mở lại được từ nút Trợ giúp ở cả hai chương — xem `cicd-axis-intro.tsx`.
   */
  const intro = useAxisIntro(level.chapter);

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
      /*
       * ⛔ RỖNG ở chế độ làm bài, và đây là một ràng buộc RUNTIME chứ không phải
       * một lựa chọn hiển thị.
       *
       * `level.objectives` của một bài OJ mang `check: ''` — máy chủ cắt tên vị
       * từ trước khi dữ liệu rời nó (§18.B.4). `checkObjective` tra
       * `CICD_PREDICATES['']` rồi GỌI kết quả, nên một danh sách không rỗng ở
       * đây ném `TypeError` giữa lượt chơi và người làm nhận một trang trắng.
       *
       * Danh sách đầy đủ vẫn đi tới bảng mục tiêu để HIỆN tiêu chí — hiện và
       * chấm là hai việc khác nhau, và ở chế độ này chỉ máy chủ làm việc thứ hai.
       */
      objectives: oj === undefined ? level.objectives : [],
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
  }, [yaml, sources, level, overrides, cdPolicies, panels, oj]);

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

  /*
   * Phím tắt (D.4.8). ⚠ Đây là lớp THỨ HAI: mọi thao tác dưới đây đều đã có một
   * `<button>` thật trong luồng Tab (công tắc lớp phủ và nút 2D/3D ở thanh trên,
   * chọn node ở bản đồ thu nhỏ). Một phím tắt không ai nhìn thấy không phải một
   * đường đi được — nên vế "bàn phím đủ cho mọi thao tác" do những cái nút đó
   * đóng, còn bảng phím chỉ rút ngắn đường.
   */
  const onHotkey = useCallback(
    (hotkey: CicdHotkey) => {
      const action = hotkey.action;
      switch (action.kind) {
        case 'run':
          chay();
          return;
        case 'panel': {
          /*
           * `action.panel` khai kiểu `string` chứ không `CicdPanelId`: bảng phím
           * là dữ liệu thuần và không được biết tới module lớp phủ (import vòng).
           * Thu hẹp bằng cách TRA trong tập thật — một id gõ sai thì không làm
           * gì, thay vì mở một bảng không tồn tại.
           */
          const id = CICD_PANEL_IDS.find((panel) => panel === action.panel);
          if (id !== undefined) panels.toggle(id);
          return;
        }
        case 'close-all':
          panels.closeAll();
          return;
        case 'mode':
          rendererMode.choose(action.mode);
          return;
        case 'deselect':
          setSelectedId(null);
          return;
        case 'help':
          intro.show();
          return;
      }
    },
    [chay, panels, rendererMode, intro],
  );
  useHudKeyboard(onHotkey);

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
   * Công tắc lớp phủ đọc thẳng tập thật, không chép một danh sách thứ hai: thêm
   * một bảng mà quên thêm công tắc là bảng đó không có cách nào bật lên, và
   * không gì báo.
   */
  const panelIds: readonly CicdPanelId[] = CICD_PANEL_IDS;

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
        onHelp={intro.show}
        onExit={onExit}
        {...(onNext === undefined ? {} : { onNext })}
      />

      {/* Lớp phủ. Vỏ không nhận chuột; từng bảng tự bật lại. */}
      <div className="pointer-events-none absolute inset-x-0 top-14 bottom-0 z-20">
        {/*
         * Thanh nộp bài — LUÔN hiện ở chế độ OJ, không đi qua hệ công tắc bảng.
         *
         * Nó không phải một bảng tuỳ chọn: nộp bài là lý do người dùng mở màn
         * hình này. Một công tắc có thể tắt sẽ cho phép trạng thái "đang làm bài
         * mà không thấy nút nộp", và người làm không có cách nào đoán rằng nút
         * ấy nằm sau một menu.
         */}
        {oj !== undefined ? (
          <CicdOjBar
            oj={oj}
            onSubmit={() => {
              oj.onSubmit({ yaml, overrides, cd: level.cd === undefined ? null : cdPolicies });
            }}
          />
        ) : null}

        <CicdAxesPanel
          outcome={outcome}
          className="absolute top-3 left-1/2 -translate-x-1/2"
        />

        <CicdEditorDrawer
          open={panels.state.editor}
          onOpen={() => {
            panels.open('editor');
          }}
          onClose={() => {
            panels.close('editor');
          }}
          yaml={yaml}
          onYaml={setYaml}
          ariaLabel={`Workflow YAML của màn ${level.title}`}
          errorLines={errorLines}
          textareaRef={editorRef}
          footer={
            <CicdSnippetBar
              runnerClassIds={level.workload.runners.map((pool) => pool.id)}
              editorRef={editorRef}
              onInsert={setYaml}
              value={yaml}
            />
          }
        />

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
              <CicdMissionCard
                mission={level.mission}
                brief={level.brief}
                objectives={level.objectives}
                outcome={outcome}
              />
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
              <CicdInspector node={selectedNode} run={run} selectedId={selectedId} />
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
                  /*
                   * ⛔ `false` ở chế độ làm bài. Lượt chạy tại chỗ KHÔNG chấm gì
                   * (danh sách mục tiêu truyền cho `runWorkflow` là rỗng), nên
                   * `outcome.won` ở đây luôn `true` một cách vô nghĩa — vẽ chữ
                   * "Đạt" từ nó là nói với người làm rằng họ đã giải xong bài
                   * trong khi máy chủ chưa hề chấm.
                   *
                   * Cùng đường mà bàn thử đi, vì cùng lý do: không có ngưỡng
                   * đạt/trượt nào để đọc.
                   */
                  showVerdict={oj === undefined}
                />
              )}

              <AttemptHistory history={history} chamTaiCho={oj === undefined} />

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
                        /*
                         * ⛔ Ở chế độ OJ, XIN TRƯỚC rồi mới đếm. `useHintReveal`
                         * trả `null` khi máy chủ từ chối, và tăng bộ đếm trước
                         * lời từ chối đó sẽ hiện một ô gợi ý RỖNG — người làm
                         * mất điểm cho một dòng chữ không tồn tại.
                         */
                        if (oj === undefined) {
                          setHintsShown((n) => n + 1);
                          return;
                        }
                        void oj.onRevealHint(hintsShown).then((text) => {
                          if (text !== null) setHintsShown((n) => n + 1);
                        });
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
                        {/*
                         * Ở chế độ OJ `level.hints` toàn chuỗi rỗng — chữ thật
                         * tới từ máy chủ qua `hintReveals`, vì `problems.byCode`
                         * che gợi ý chưa mở (§18.B.4).
                         */}
                        {oj === undefined ? hint : chuGoiY(oj.hintReveals.get(index))}
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

      {/*
       * Màn chuyển tiếp trục Y (D.5.1). Nằm NGOÀI vỏ lớp phủ vì nó không phải
       * một lớp phủ: nó che kín sân và nhận tiêu điểm, đúng như một hộp thoại.
       */}
      {intro.open ? <CicdAxisIntro chapter={level.chapter} onDismiss={intro.dismiss} /> : null}
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
/**
 * Thanh nộp bài của chế độ OJ — nút nộp, dòng verdict, danh sách testcase trượt.
 *
 * ⚠ Mọi chữ ở đây là TIẾNG VỌNG của máy chủ. Component này không suy ra verdict,
 * không đếm `passed/total`, không đoán `AC` từ bất cứ thứ gì nó thấy trên màn —
 * `cicd-problem.tsx` dựng câu chữ từ `toVerdictView`, nguồn DUY NHẤT được phép
 * suy verdict (§18.B.5 và AC-J1). Một phép suy thứ hai ở đây sẽ trôi khỏi bản
 * gốc và nói khác nó, trên cùng một màn hình.
 *
 * `aria-live="polite"` trên dòng kết quả: người dùng bàn phím và trình đọc màn
 * hình bấm nộp rồi không có gì báo là kết quả đã về — nút đổi chữ thành "Đang
 * chấm…" rồi đổi lại, và một vùng không live thì im lặng suốt.
 */
function CicdOjBar({
  oj,
  onSubmit,
}: {
  readonly oj: CicdOjScreenProps;
  readonly onSubmit: () => void;
}): ReactElement {
  return (
    <section
      aria-label="Nộp bài"
      data-testid="cicd-oj-bar"
      /*
       * ⛔ BOTTOM-CENTER, và vị trí này là kết quả của một phép đo chứ không phải
       * một lựa chọn thẩm mỹ.
       *
       * Bản đầu đặt ở `right-3 bottom-3` và nút nộp KHÔNG BẤM ĐƯỢC: cột bảng bên
       * phải là `absolute inset-y-3 right-3 … overflow-y-auto`, tức nó phủ TRỌN
       * chiều cao mép phải và nuốt mọi cú bấm xuống dưới. Playwright bắt được
       * ("subtree intercepts pointer events"); mắt thì không, vì thanh vẫn hiện
       * ra đầy đủ và trông hoàn toàn bình thường.
       *
       * `z-30` nâng trên lớp phủ (`z-20`) để một bảng mở rộng không che lại nút.
       * Mép trái ở giữa chiều cao là ngăn kéo ô soạn, mép trên giữa là bảng ba
       * trục — nên đáy-giữa là vùng còn trống thật sự.
       */
      className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex max-w-sm -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-card/95 p-3 shadow-lg"
    >
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={oj.submitDisabled}
          onClick={onSubmit}
          data-testid="cicd-oj-submit"
        >
          {oj.submitLabel}
        </Button>
        {oj.notice === null ? null : (
          <p className="text-xs text-muted-foreground">{oj.notice}</p>
        )}
      </div>

      <p aria-live="polite" data-testid="cicd-oj-result" className="text-sm">
        {oj.result ?? 'Chưa nộp lần nào. Ba trục ở trên là của lượt chạy thử, không phải điểm bài.'}
      </p>

      {oj.failedLabels.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-warning">
          {oj.failedLabels.map((label, index) => (
            <li key={index}>{label}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AttemptHistory({
  history,
  chamTaiCho,
}: {
  readonly history: readonly AttemptEntry[];
  /**
   * Lượt chạy tại chỗ có chấm mục tiêu không.
   *
   * `false` ở chế độ làm bài OJ: `runWorkflow` nhận danh sách mục tiêu rỗng, nên
   * `outcome.won` luôn `true` và chữ "Đạt" ở đây sẽ là một lời nói dối trên MỌI
   * dòng lịch sử — kể cả những lượt mà máy chủ vừa trả WA. Ba trục vẫn thật và
   * vẫn hiện; chỉ chữ phán xét biến mất.
   */
  readonly chamTaiCho: boolean;
}): ReactElement {
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
                  {chamTaiCho ? (
                    <span className={entry.outcome.won ? 'text-success' : 'text-warning'}>
                      {entry.outcome.won ? 'Đạt' : 'Chưa đạt'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Đã chạy</span>
                  )}
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

/**
 * Chữ của một gợi ý đã xin, theo pha.
 *
 * `HintReveal` là union ba pha, và chỉ pha `ready` mới có chữ. Đọc thẳng
 * `.text` bằng optional-chaining sẽ cho `undefined` ở hai pha kia rồi rơi về một
 * dấu ba chấm cho CẢ pha lỗi — người dùng nhìn thấy "đang tải" vĩnh viễn cho một
 * lời gọi đã hỏng, và không có đường nào biết để thử lại.
 */
function chuGoiY(reveal: HintReveal | undefined): string {
  if (reveal === undefined) return '…';
  if (reveal.phase === 'ready') return reveal.text;
  if (reveal.phase === 'error') return `Chưa lấy được gợi ý: ${reveal.message}`;
  return 'Đang lấy gợi ý…';
}
