'use client';

import { useCallback, useMemo, useState, type ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import {
  BUILDER_CANNOT_EXPRESS,
  CUSTOM_LEVEL_ID_PREFIX,
  DIFFICULTIES,
  GIT_PREDICATE_NAMES,
  GIT_THEORY_IDS,
  checkSolvable,
  draftFromLevel,
  draftToLevel,
  levelDraftIssues,
  levelFromJson,
  levelToJson,
  type DraftIssue,
  type Difficulty,
  type GitLevel,
  type GitObjective,
  type GitPredicateName,
  type GitTeaching,
  type LevelDraft,
  type SolvabilityReport,
  type WorldSpec,
} from '@devops-platform/games';

import { ISSUE_TEXT, LIMIT_TEXT } from './builder-copy';
import { SaveProblemPanel } from './save-problem-panel';
import { PREDICATE_ARGS, missingArgs } from './predicate-args';
import {
  exportFileName,
  formatAllowedCommands,
  linesToList,
  listToLines,
  parseAllowedCommands,
} from './draft-state';

/**
 * Một mục tra nhanh của `teaching.cheatsheet`.
 *
 * Suy ra từ `GitTeaching` chứ không khai lại: `GitCheatSheetEntry` không nằm
 * trong barrel `packages/games`, và barrel đó là tệp lead giữ. Một `interface`
 * chép tay ở đây sẽ trùng hình dạng hôm nay và lệch vào ngày ai đó thêm trường.
 */
type CheatSheetEntry = GitTeaching['cheatsheet'][number];

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  basic: 'Cơ bản',
  intermediate: 'Trung bình',
  advanced: 'Nâng cao',
};

const SELECT_CLASS =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * **Level Builder** — §18.E, dựng thành một chế độ của màn sandbox.
 *
 * Sandbox là chỗ duy nhất trong sản phẩm mà người ta dựng được một cây git bất
 * kỳ bằng lệnh thật. Builder không dựng lại khả năng đó; nó chỉ CHỤP kết quả:
 * `worldToSpec(world)` biến thế giới đang hiện thành một `WorldSpec`, và hai nút
 * ở §E.1 quyết định spec đó là trạng thái đầu hay cây đích.
 *
 * ## Ba thứ trên màn này là lời hứa, không phải trang trí
 *
 *  1. **Giới hạn của Builder hiện ngay khối đầu.** `phase-18.md` §18.E dặn thẳng
 *     "không giấu trong tài liệu". Danh sách đọc từ `BUILDER_CANNOT_EXPRESS`,
 *     nên câu trên màn không trôi khỏi thứ lõi thật sự không diễn đạt được.
 *  2. **Nút E.7 nói đúng phạm vi của nó.** `checkSolvable` chạy chuỗi lời giải
 *     người soạn tự khai và hỏi nó có đạt hết mục tiêu bắt buộc không. Nó KHÔNG
 *     trả lời "level này có giải được không" — câu đó cần duyệt một không gian
 *     lệnh vô hạn. Nhãn nút, tiêu đề khối và câu giải thích đều nói đúng chừng
 *     ấy, và câu giải thích nằm cạnh nút chứ không nằm trong tài liệu.
 *  3. **Danh sách lỗi là `levelDraftIssues`, không phải một bộ kiểm thứ hai.**
 *     Viết lại phép kiểm ở tầng giao diện là dựng hai định nghĩa của "bản nháp
 *     đã xong", và chúng sẽ lệch nhau. Component chỉ dịch mã lỗi sang câu.
 *
 * ⛔ **0 lời gọi backend** (AC-2), giữ nguyên từ màn sandbox: xuất là
 * `JSON.stringify` tại chỗ, nhập là `JSON.parse` tại chỗ, tải về là một `Blob`
 * dựng trong trình duyệt. Không đường nào chạm mạng.
 */

export interface GitLevelBuilderProps {
  /**
   * Chụp thế giới ĐANG hiện trong sandbox thành spec.
   *
   * Hàm chứ không phải giá trị: chụp lúc bấm nút, không chụp lúc render. Truyền
   * một `WorldSpec` dựng sẵn ở mỗi lần vẽ lại sẽ dựng một object mới sau mỗi
   * lệnh người dùng gõ, và `useMemo` nào bám vào nó cũng mất tác dụng.
   */
  readonly captureSpec: () => WorldSpec;
  readonly draft: LevelDraft;
  readonly onDraftChange: (next: LevelDraft) => void;
  /**
   * E.6 — mở level vừa dựng bằng ĐÚNG màn chơi mà người chơi thật sẽ thấy.
   *
   * Nhận một `GitLevel` chứ không nhận bản nháp: chỗ gọi chỉ được mời chơi thử
   * một thứ đã qua `draftToLevel`, nên "chơi thử một level còn lỗi" không diễn
   * đạt được ở tầng kiểu.
   */
  readonly onPlayTest: (level: GitLevel) => void;
}

export function GitLevelBuilder({
  captureSpec,
  draft,
  onDraftChange,
  onPlayTest,
}: GitLevelBuilderProps): ReactElement {
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [report, setReport] = useState<SolvabilityReport | null>(null);

  const issues = useMemo(() => levelDraftIssues(draft), [draft]);
  const level = useMemo(() => draftToLevel(draft), [draft]);

  const patch = useCallback(
    (fields: Partial<LevelDraft>) => {
      onDraftChange({ ...draft, ...fields });
      // Một báo cáo E.7 gắn với bản nháp đã sinh ra nó. Bản nháp đổi thì báo cáo
      // cũ mô tả một level không còn tồn tại, và để nó nằm đó là để người soạn
      // đọc một kết quả đã hết hạn như thể nó còn đúng.
      setReport(null);
    },
    [draft, onDraftChange],
  );

  const runCheck = useCallback(() => {
    if (level === null) return;
    setReport(checkSolvable(level, level.solutionCommands));
  }, [level]);

  const doImport = useCallback(() => {
    const parsed = levelFromJson(importText);
    if (parsed === null) {
      setImportError(
        'Không đọc được chuỗi này. Nó phải là một bản xuất level của chính Builder, và nội dung bên trong phải qua được mọi phép kiểm ở dưới.',
      );
      return;
    }
    setImportError(null);
    setImportText('');
    setReport(null);
    onDraftChange(draftFromLevel(parsed));
  }, [importText, onDraftChange]);

  const exported = level === null ? '' : levelToJson(level);

  const download = useCallback(() => {
    if (exported === '') return;
    /*
     * Tải về bằng `Blob` + `URL.createObjectURL` chứ không bằng `data:` URI:
     * một level đủ lớn vượt giới hạn độ dài URL của trình duyệt, và lúc đó nút
     * hỏng trong im lặng. `revokeObjectURL` ngay sau khi bấm vì tệp đã được đọc
     * xong tại thời điểm đó.
     */
    const blob = new Blob([exported], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFileName(draft);
    anchor.click();
    URL.revokeObjectURL(url);
  }, [exported, draft]);

  return (
    <div
      className="git-builder-panel git-builder-content flex flex-col gap-5"
      data-testid="git-builder"
    >
      <BuilderLimits />

      {/* ── E.1 · chụp trạng thái ──────────────────────────────────────── */}
      <section aria-labelledby="builder-chup" className="flex flex-col gap-2">
        <h3 id="builder-chup" className="text-sm font-semibold text-foreground">
          Trạng thái đầu và cây đích
        </h3>
        <p className="text-xs text-muted-foreground">
          Dựng cây bằng lệnh git ở ô dưới cùng, rồi chụp nó vào một trong hai ô.
        </p>
        <div className="flex flex-wrap gap-2">
          <BuilderButton
            onClick={() => {
              patch({ setup: captureSpec() });
            }}
            testId="git-builder-set-setup"
          >
            Đặt làm trạng thái đầu
          </BuilderButton>
          <BuilderButton
            onClick={() => {
              patch({ target: captureSpec() });
            }}
            testId="git-builder-set-target"
          >
            Đặt làm đích
          </BuilderButton>
          <BuilderButton
            onClick={() => {
              patch({ target: null });
            }}
            disabled={draft.target === null}
          >
            Xoá đích
          </BuilderButton>
        </div>
        <p className="text-xs text-muted-foreground" data-testid="git-builder-capture-state">
          Trạng thái đầu: {countCommits(draft.setup)} commit · Cây đích:{' '}
          {draft.target === null ? 'chưa đặt' : `${countCommits(draft.target)} commit`}
        </p>
      </section>

      {/* ── E.3 (phần lõi) · đề bài ────────────────────────────────────── */}
      <section aria-labelledby="builder-de-bai" className="flex flex-col gap-3">
        <h3 id="builder-de-bai" className="text-sm font-semibold text-foreground">
          Đề bài
        </h3>
        <Field
          id="builder-id"
          label="Mã level"
          hint={`Phải mở đầu bằng ${CUSTOM_LEVEL_ID_PREFIX}`}
          value={draft.id}
          onChange={(id) => {
            patch({ id });
          }}
        />
        <Field
          id="builder-title"
          label="Tiêu đề"
          value={draft.title}
          onChange={(title) => {
            patch({ title });
          }}
        />
        <Field
          id="builder-mission"
          label="Nhiệm vụ"
          hint="Một câu, dòng chữ thường trực duy nhất trên màn chơi"
          value={draft.mission}
          onChange={(mission) => {
            patch({ mission });
          }}
        />
        <AreaField
          id="builder-brief"
          label="Đề bài đầy đủ"
          hint="Bối cảnh và việc cần làm. Không nói cách làm."
          rows={4}
          value={draft.brief}
          onChange={(brief) => {
            patch({ brief });
          }}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="builder-chapter" className="text-xs font-medium text-foreground">
            Chương
          </label>
          <select
            id="builder-chapter"
            value={draft.chapter}
            onChange={(e) => {
              patch({ chapter: Number(e.target.value) as 1 | 2 | 3 });
            }}
            className={SELECT_CLASS}
          >
            <option value={1}>1 · Nắn lịch sử</option>
            <option value={2}>2 · Làm việc nhóm</option>
            <option value={3}>3 · Cứu hộ</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="builder-difficulty" className="text-xs font-medium text-foreground">
            Độ khó
          </label>
          {/*
            Ba bậc, và nó CỐ Ý khác bốn bậc của `PROBLEM_DIFFICULTIES`. Builder là
            một *level* builder nên nó giữ thang của level; chỗ nào cần đi sang
            thang kia thì khai một bảng tường minh (`phase-18-exec.md` §1.3).
          */}
          <select
            id="builder-difficulty"
            value={draft.difficulty}
            onChange={(e) => {
              patch({ difficulty: e.target.value as Difficulty });
            }}
            className={SELECT_CLASS}
          >
            {DIFFICULTIES.map((name) => (
              <option key={name} value={name}>
                {DIFFICULTY_LABEL[name]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="builder-theory" className="text-xs font-medium text-foreground">
            Bài lý thuyết đi kèm
          </label>
          <p className="text-[10px] text-muted-foreground">
            Chọn một trong 32 bài đã có, hoặc để trống. Builder không tạo bài lý thuyết mới: chúng
            là tệp markdown trong kho, không phải dữ liệu của level.
          </p>
          <select
            id="builder-theory"
            value={draft.theoryId ?? ''}
            onChange={(e) => {
              patch({ theoryId: e.target.value === '' ? null : e.target.value });
            }}
            className={SELECT_CLASS}
          >
            <option value="">Không có bài đọc</option>
            {GIT_THEORY_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ── Giới hạn và chấm điểm ──────────────────────────────────────── */}
      <section aria-labelledby="builder-gioi-han-lenh" className="flex flex-col gap-3">
        <h3 id="builder-gioi-han-lenh" className="text-sm font-semibold text-foreground">
          Giới hạn và chấm điểm
        </h3>
        <AreaField
          id="builder-allowed"
          label="Tập lệnh cho phép"
          hint="Mỗi dòng một động từ git. ĐỂ TRỐNG nghĩa là cho dùng mọi lệnh."
          rows={3}
          mono
          value={formatAllowedCommands(draft.allowedCommands)}
          onChange={(text) => {
            patch({ allowedCommands: parseAllowedCommands(text) });
          }}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="builder-par" className="text-xs font-medium text-foreground">
            Số lệnh chuẩn
          </label>
          <p className="text-[10px] text-muted-foreground">
            Dùng để chấm điểm, KHÔNG dùng để giới hạn. Người chơi gõ nhiều hơn vẫn qua bài.
          </p>
          <input
            id="builder-par"
            type="number"
            min={0}
            value={draft.par}
            onChange={(e) => {
              /*
               * `Number('')` ra `0`, không ra `NaN`, nên ô trống thành `par: 0` chứ
               * không thành một `NaN` lẻn vào JSON xuất ra. `NaN` qua
               * `JSON.stringify` thành `null`, và `looksLikeLevel` sẽ từ chối bản
               * xuất của chính ta lúc nhập lại — một vòng hỏng mà không ô nào bắt.
               */
              patch({ par: Number(e.target.value) });
            }}
            className={SELECT_CLASS}
          />
        </div>
      </section>

      <ObjectiveEditor
        objectives={draft.objectives}
        onChange={(objectives) => {
          patch({ objectives });
        }}
      />

      <section aria-labelledby="builder-loi-giai" className="flex flex-col gap-3">
        <h3 id="builder-loi-giai" className="text-sm font-semibold text-foreground">
          Lời giải mẫu
        </h3>
        <AreaField
          id="builder-solution"
          label="Chuỗi lệnh lời giải"
          hint="Mỗi dòng một lệnh. Đây là thứ nút kiểm ở dưới chạy."
          rows={5}
          mono
          value={listToLines(draft.solutionCommands)}
          onChange={(text) => {
            patch({ solutionCommands: linesToList(text) });
          }}
        />
        <AreaField
          id="builder-alt-solution"
          label="Lời giải thứ hai"
          hint="Khác ĐƯỜNG ĐI, không chỉ khác thứ tự hai lệnh độc lập. Đây là bằng chứng level chấm theo TRẠNG THÁI chứ không theo lệnh đã gõ."
          rows={4}
          mono
          value={listToLines(draft.altSolutionCommands)}
          onChange={(text) => {
            patch({ altSolutionCommands: linesToList(text) });
          }}
        />
      </section>

      {/* ── Gợi ý ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="builder-goi-y" className="flex flex-col gap-3">
        <h3 id="builder-goi-y" className="text-sm font-semibold text-foreground">
          Gợi ý
        </h3>
        <AreaField
          id="builder-hints"
          label="Danh sách gợi ý"
          hint="Mỗi dòng một gợi ý. Thứ tự là thứ tự mở, nên gợi ý sau phải cụ thể hơn gợi ý trước."
          rows={4}
          value={listToLines(draft.hints)}
          onChange={(text) => {
            patch({ hints: linesToList(text) });
          }}
        />
      </section>

      <TeachingEditor
        teaching={draft.teaching}
        onChange={(teaching) => {
          patch({ teaching });
        }}
      />

      <DraftIssueList issues={issues} />

      <SolvabilityPanel report={report} blocked={level === null} onRun={runCheck} />

      {/* ── E.6 · chơi thử ─────────────────────────────────────────────── */}
      <section aria-labelledby="builder-choi-thu" className="flex flex-col gap-2">
        <h3 id="builder-choi-thu" className="text-sm font-semibold text-foreground">
          Chơi thử
        </h3>
        <p className="text-xs text-muted-foreground">
          Mở level này bằng đúng màn chơi người chơi sẽ thấy. Trong đó có thêm một nút chạy lời giải
          mẫu để xem chuỗi lệnh đi qua từng bước.
        </p>
        <div>
          <BuilderButton
            testId="git-builder-play-test"
            disabled={level === null}
            onClick={() => {
              if (level !== null) onPlayTest(level);
            }}
          >
            Chơi thử level này
          </BuilderButton>
        </div>
      </section>

      {/* ── E.4 · xuất và nhập ─────────────────────────────────────────── */}
      <section aria-labelledby="builder-xuat" className="flex flex-col gap-2">
        <h3 id="builder-xuat" className="text-sm font-semibold text-foreground">
          Xuất level
        </h3>
        <label htmlFor="builder-export" className="sr-only">
          Chuỗi JSON của level đang dựng
        </label>
        <textarea
          id="builder-export"
          data-testid="git-builder-export"
          readOnly
          rows={6}
          value={exported}
          placeholder="Bản nháp còn lỗi nên chưa xuất được. Xem danh sách ở trên."
          className="w-full rounded-md border border-input bg-muted p-2 font-mono text-[10px] text-muted-foreground"
        />
        <div>
          <BuilderButton
            onClick={download}
            disabled={exported === ''}
            testId="git-builder-download"
          >
            Tải tệp JSON về
          </BuilderButton>
        </div>
      </section>

      <section aria-labelledby="builder-nhap" className="flex flex-col gap-2">
        <h3 id="builder-nhap" className="text-sm font-semibold text-foreground">
          Nhập level
        </h3>
        <label htmlFor="builder-import" className="sr-only">
          Dán chuỗi JSON của một level đã xuất
        </label>
        <textarea
          id="builder-import"
          data-testid="git-builder-import"
          rows={4}
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
          }}
          placeholder="Dán chuỗi đã xuất vào đây"
          className="w-full rounded-md border border-input bg-card p-2 font-mono text-[10px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <div>
          <BuilderButton onClick={doImport} disabled={importText.trim() === ''}>
            Nhập
          </BuilderButton>
        </div>
        {importError !== null && (
          <p
            role="alert"
            data-testid="git-builder-import-error"
            className="text-xs text-destructive"
          >
            {importError}
          </p>
        )}
      </section>

      {/* ── E.5 · lưu thành bài tập ─────────────────────────── */}
      <SaveProblemPanel draft={draft} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Giới hạn của Builder — hiện TRÊN MÀN, theo `phase-18.md` §18.E
// ═══════════════════════════════════════════════════════════════════════════

function BuilderLimits(): ReactElement {
  return (
    <section
      aria-labelledby="builder-gioi-han"
      data-testid="git-builder-limits"
      className="rounded-md border border-input bg-muted/40 p-3"
    >
      <h3 id="builder-gioi-han" className="mb-1 text-sm font-semibold text-foreground">
        Builder không dựng được hai loại level này
      </h3>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {BUILDER_CANNOT_EXPRESS.map((limit) => (
          <li key={limit} className="text-xs text-muted-foreground">
            {t(LIMIT_TEXT[limit])}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Mục tiêu
// ═══════════════════════════════════════════════════════════════════════════

function ObjectiveEditor({
  objectives,
  onChange,
}: {
  readonly objectives: readonly GitObjective[];
  readonly onChange: (next: readonly GitObjective[]) => void;
}): ReactElement {
  const replace = (index: number, next: GitObjective): void => {
    onChange(objectives.map((o, i) => (i === index ? next : o)));
  };

  return (
    <section aria-labelledby="builder-muc-tieu" className="flex flex-col gap-3">
      <h3 id="builder-muc-tieu" className="text-sm font-semibold text-foreground">
        Mục tiêu
      </h3>
      <p className="text-xs text-muted-foreground">
        Một mục tiêu là một testcase. Level cần ít nhất một mục bắt buộc, nếu không thì verdict đạt
        không bao giờ tới.
      </p>

      {objectives.map((objective, index) => (
        <fieldset
          key={`objective-${String(index)}`}
          className="flex flex-col gap-2 rounded-md border border-input p-3"
        >
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            Mục tiêu {index + 1}
          </legend>
          <Field
            id={`builder-objective-id-${String(index)}`}
            label="Mã mục tiêu"
            value={objective.id}
            onChange={(id) => {
              replace(index, { ...objective, id });
            }}
          />
          <Field
            id={`builder-objective-label-${String(index)}`}
            label="Câu mô tả"
            value={objective.label}
            onChange={(label) => {
              replace(index, { ...objective, label });
            }}
          />
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`builder-objective-check-${String(index)}`}
              className="text-xs font-medium text-foreground"
            >
              Vị từ chấm
            </label>
            <select
              id={`builder-objective-check-${String(index)}`}
              value={objective.check}
              onChange={(e) => {
                // Đổi vị từ thì BỎ tham số cũ. Xem khối chú thích của `ArgEditor`.
                const { args: _discarded, ...rest } = objective;
                replace(index, { ...rest, check: e.target.value as GitPredicateName });
              }}
              className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {GIT_PREDICATE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <ArgEditor
            index={index}
            objective={objective}
            onChange={(next) => {
              replace(index, next);
            }}
          />
          <div className="flex items-center gap-2">
            <input
              id={`builder-objective-required-${String(index)}`}
              type="checkbox"
              checked={objective.required}
              onChange={(e) => {
                replace(index, { ...objective, required: e.target.checked });
              }}
              className="size-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <label
              htmlFor={`builder-objective-required-${String(index)}`}
              className="text-xs text-foreground"
            >
              Bắt buộc (bỏ chọn thì đây là mục thưởng)
            </label>
          </div>
          <div>
            <BuilderButton
              onClick={() => {
                onChange(objectives.filter((_, i) => i !== index));
              }}
            >
              Xoá mục tiêu này
            </BuilderButton>
          </div>
        </fieldset>
      ))}

      <div>
        <BuilderButton
          testId="git-builder-add-objective"
          onClick={() => {
            onChange([
              ...objectives,
              {
                id: `muc-tieu-${String(objectives.length + 1)}`,
                label: '',
                check: 'refExists',
                required: true,
              },
            ]);
          }}
        >
          Thêm mục tiêu
        </BuilderButton>
      </div>
    </section>
  );
}

/**
 * Ô nhập tham số của vị từ đang chọn — §18.E.2.
 *
 * ## Vì sao không phải một ô khoá/giá trị tự do
 *
 * `evaluatePredicate` đọc tham số qua `argString`/`argNumber`/... và **im lặng**
 * khi thiếu hoặc sai kiểu: vị từ trả `false`, và trên màn người soạn thấy một
 * mục tiêu không bao giờ đạt, không kèm một dòng nào nói vì sao. Một ô tự do đẩy
 * nguyên cái bẫy đó sang người dùng: gõ `refs` thay vì `ref`, hoặc gõ `"3"` thay
 * vì `3`, và level hỏng theo đúng kiểu khó lần ra nhất.
 *
 * Nên ô này dựng ĐÚNG những trường mà vị từ đọc, đúng kiểu, và cảnh báo khi một
 * tham số BẮT BUỘC còn trống. Danh sách trường tới từ `PREDICATE_ARGS`, thứ có ô
 * gác đọc thẳng `predicates.ts` để không trôi khỏi engine.
 *
 * ## Đổi vị từ thì XOÁ tham số cũ
 *
 * Giữ lại là chở theo rác: `{ ref: 'main' }` còn nguyên sau khi đổi sang
 * `stashCount` sẽ nằm trong JSON xuất ra, `evaluatePredicate` bỏ qua nó, và
 * không cổng nào báo. Người đọc tệp level sau này sẽ mất thời gian tìm xem `ref`
 * ở đó để làm gì.
 */
function ArgEditor({
  index,
  objective,
  onChange,
}: {
  readonly index: number;
  readonly objective: GitObjective;
  readonly onChange: (next: GitObjective) => void;
}): ReactElement | null {
  const specs = PREDICATE_ARGS[objective.check];
  const missing = missingArgs(objective.check, objective.args);

  if (specs.length === 0) {
    return objective.check === 'graphShapeMatches' ? (
      <p className="text-[10px] text-muted-foreground">
        Vị từ này không nhận tham số. Nó so hình dạng DAG với CÂY ĐÍCH ở khối trên, nên hãy chắc là
        bạn đã đặt đích.
      </p>
    ) : (
      <p className="text-[10px] text-muted-foreground">Vị từ này không nhận tham số.</p>
    );
  }

  const setArg = (name: string, value: unknown): void => {
    onChange({ ...objective, args: { ...objective.args, [name]: value } });
  };

  return (
    <div className="flex flex-col gap-2">
      {specs.map((spec) => {
        const id = `builder-objective-arg-${String(index)}-${spec.name}`;
        const raw = objective.args?.[spec.name];
        if (spec.kind === 'boolean') {
          return (
            <div key={spec.name} className="flex items-center gap-2">
              <input
                id={id}
                type="checkbox"
                checked={raw === true}
                onChange={(e) => {
                  setArg(spec.name, e.target.checked);
                }}
                className="size-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              <label htmlFor={id} className="font-mono text-xs text-foreground">
                {spec.name}
              </label>
            </div>
          );
        }
        if (spec.kind === 'lines') {
          return (
            <AreaField
              key={spec.name}
              id={id}
              label={spec.name}
              hint="Mỗi dòng một dòng nội dung của file."
              rows={3}
              mono
              value={Array.isArray(raw) ? (raw as string[]).join('\n') : ''}
              onChange={(text) => {
                setArg(spec.name, text.split('\n'));
              }}
            />
          );
        }
        return (
          <div key={spec.name} className="flex flex-col gap-1">
            <label htmlFor={id} className="font-mono text-xs text-foreground">
              {spec.name}
            </label>
            <input
              id={id}
              type={spec.kind === 'number' ? 'number' : 'text'}
              autoComplete="off"
              value={typeof raw === 'string' || typeof raw === 'number' ? String(raw) : ''}
              onChange={(e) => {
                /*
                 * Ô số gửi đi `number`, không gửi chuỗi: `argNumber` từ chối mọi
                 * thứ không phải `number` hữu hạn, nên một `'3'` lọt vào args sẽ
                 * làm vị từ trả `false` mãi mãi mà JSON xuất ra trông vẫn hợp lệ.
                 * Ô trống gửi `null` chứ không gửi `0` — `0` là một giá trị có
                 * nghĩa (`stashCount: 0`), nên đoán nó thay người soạn là sai.
                 */
                if (spec.kind !== 'number') {
                  setArg(spec.name, e.target.value);
                  return;
                }
                setArg(spec.name, e.target.value === '' ? null : Number(e.target.value));
              }}
              className={SELECT_CLASS}
            />
          </div>
        );
      })}
      {missing.length > 0 && (
        <p
          className="text-[10px] text-destructive"
          data-testid={`git-builder-missing-arg-${String(index)}`}
        >
          Còn trống tham số bắt buộc: {missing.join(', ')}. Thiếu chúng thì vị từ này trả &quot;chưa
          đạt&quot; ở mọi trạng thái, và engine không nói ra lý do.
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tầng dạy học
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Soạn `teaching`, và NÓI RA rằng màn chơi Git hôm nay chưa hiện nó.
 *
 * Đo 2026-09-15: không chỗ nào trong `apps/web` đọc `GitLevel.teaching` — lời gọi
 * duy nhất tới `.teaching` là của arena k8s, trên kiểu level của nó. Trường này
 * vẫn đáng soạn vì nó đi theo tệp level xuất ra và `GitTeaching` đòi nó, nhưng
 * để người soạn viết một bài dẫn 250 từ mà không nói trước rằng chưa ai thấy nó
 * là lấy công của họ đổi lấy một ô trống.
 *
 * Câu đó nằm TRÊN MÀN chứ không trong chú thích này, cùng một lý lẽ với hai giới
 * hạn của Builder ở khối đầu.
 */
function TeachingEditor({
  teaching,
  onChange,
}: {
  readonly teaching: GitTeaching;
  readonly onChange: (next: GitTeaching) => void;
}): ReactElement {
  const replaceEntry = (index: number, next: CheatSheetEntry): void => {
    onChange({
      ...teaching,
      cheatsheet: teaching.cheatsheet.map((entry, i) => (i === index ? next : entry)),
    });
  };

  return (
    <section aria-labelledby="builder-day-hoc" className="flex flex-col gap-3">
      <h3 id="builder-day-hoc" className="text-sm font-semibold text-foreground">
        Tầng dạy học
      </h3>
      <p className="text-xs text-muted-foreground" data-testid="git-builder-teaching-note">
        Màn chơi Git hôm nay chưa hiện phần này. Nó đi theo tệp level bạn xuất ra, để dùng được ngay
        khi màn chơi mọc thêm chỗ hiện nó. Bài lý thuyết ở ô trên thì hiện được ngay.
      </p>
      <AreaField
        id="builder-primer"
        label="Bài dẫn trước khi chơi"
        hint="Markdown, tối đa 250 từ. KHÔNG phải lời giải."
        rows={4}
        value={teaching.primer}
        onChange={(primer) => {
          onChange({ ...teaching, primer });
        }}
      />
      <AreaField
        id="builder-takeaways"
        label="Đúc kết sau khi thắng"
        hint="Mỗi dòng một ý, mỗi ý một câu."
        rows={3}
        value={listToLines(teaching.takeaways)}
        onChange={(text) => {
          onChange({ ...teaching, takeaways: linesToList(text) });
        }}
      />

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-foreground">Mục tra nhanh</p>
        {teaching.cheatsheet.map((entry, index) => (
          <fieldset
            key={`cheat-${String(index)}`}
            className="flex flex-col gap-2 rounded-md border border-input p-2"
          >
            <legend className="px-1 text-[10px] text-muted-foreground">Mục {index + 1}</legend>
            <Field
              id={`builder-cheat-command-${String(index)}`}
              label="Lệnh"
              value={entry.command}
              onChange={(command) => {
                replaceEntry(index, { ...entry, command });
              }}
            />
            <Field
              id={`builder-cheat-explain-${String(index)}`}
              label="Giải thích"
              value={entry.explain}
              onChange={(explain) => {
                replaceEntry(index, { ...entry, explain });
              }}
            />
            <div>
              <BuilderButton
                onClick={() => {
                  onChange({
                    ...teaching,
                    cheatsheet: teaching.cheatsheet.filter((_, i) => i !== index),
                  });
                }}
              >
                Xoá mục này
              </BuilderButton>
            </div>
          </fieldset>
        ))}
        <div>
          <BuilderButton
            onClick={() => {
              onChange({
                ...teaching,
                cheatsheet: [...teaching.cheatsheet, { command: '', explain: '' }],
              });
            }}
          >
            Thêm mục tra nhanh
          </BuilderButton>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Danh sách lỗi của bản nháp
// ═══════════════════════════════════════════════════════════════════════════

function DraftIssueList({ issues }: { readonly issues: readonly DraftIssue[] }): ReactElement {
  if (issues.length === 0) {
    return (
      <p className="text-xs text-success" data-testid="git-builder-issues">
        Bản nháp đã đủ để xuất thành level.
      </p>
    );
  }
  return (
    <section aria-labelledby="builder-loi" data-testid="git-builder-issues">
      <h3 id="builder-loi" className="mb-2 text-sm font-semibold text-foreground">
        Bản nháp còn thiếu
      </h3>
      <ul className="flex flex-col gap-1">
        {issues.map((issue, index) => (
          <li
            key={`${issue.field}:${issue.code}:${issue.detail ?? ''}:${String(index)}`}
            className="text-xs text-destructive"
          >
            {t(ISSUE_TEXT[issue.code])}
            {/*
              `detail` là thứ người soạn tự gõ (mã mục tiêu, tên vị từ, tên lệnh),
              nên nó KHÔNG đi qua `packages/copy` — xem khối chú thích ở
              `surfaces/author.ts`. In nó trong thẻ `code` bên cạnh câu.
            */}
            {issue.detail !== undefined && (
              <>
                {' '}
                <code className="rounded bg-muted px-1 font-mono">{issue.detail}</code>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// E.7 · kiểm lời giải mẫu
// ═══════════════════════════════════════════════════════════════════════════

function SolvabilityPanel({
  report,
  blocked,
  onRun,
}: {
  readonly report: SolvabilityReport | null;
  readonly blocked: boolean;
  readonly onRun: () => void;
}): ReactElement {
  return (
    <section
      aria-labelledby="builder-kiem"
      data-testid="git-builder-check"
      className="flex flex-col gap-2 rounded-md border border-input p-3"
    >
      <h3 id="builder-kiem" className="text-sm font-semibold text-foreground">
        {t('author.builder.check.run')}
      </h3>
      {/*
        Câu phạm vi nằm NGAY dưới tiêu đề và TRƯỚC nút, không nằm dưới kết quả.
        `phase-18.md` §18.E dặn không giấu giới hạn trong tài liệu, và một câu đặt
        sau kết quả là một câu người ta đọc sau khi đã tin vào kết quả.
      */}
      <p className="text-xs text-muted-foreground">{t('author.builder.check.scope')}</p>
      <div>
        <BuilderButton onClick={onRun} disabled={blocked} testId="git-builder-run-check">
          {t('author.builder.check.run')}
        </BuilderButton>
      </div>
      {blocked && (
        <p className="text-xs text-muted-foreground">{t('author.builder.check.blocked')}</p>
      )}
      {report !== null && (
        <div className="flex flex-col gap-2" data-testid="git-builder-check-report">
          <p
            className={report.accepted ? 'text-xs text-success' : 'text-xs text-destructive'}
            role="status"
          >
            {report.accepted
              ? t('author.builder.check.pass', {
                  passed: report.passedCount,
                  total: report.totalCount,
                })
              : t('author.builder.check.fail', {
                  passed: report.passedCount,
                  total: report.totalCount,
                })}
          </p>
          {report.unmet.length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground">
                {t('author.builder.check.unmet')}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {report.unmet.map((objective) => (
                  <li key={objective.id} className="text-xs text-destructive">
                    <code className="rounded bg-muted px-1 font-mono">{objective.id}</code>{' '}
                    {objective.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.rejected.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">{t('author.builder.check.rejected')}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {report.rejected.map((rejected, index) => (
                  <li
                    key={`${rejected.command}:${String(index)}`}
                    className="font-mono text-[10px] text-warning"
                  >
                    {rejected.command} → [{rejected.code}] {rejected.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Nguyên liệu nhỏ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Số commit của một spec, để người soạn biết mình vừa chụp cái gì.
 *
 * KHÔNG gọi `buildWorld`: spec có thể đang hỏng (đó chính là một trong các issue
 * mà `levelDraftIssues` báo), và một component ném lúc render vì dữ liệu hỏng là
 * một trang trắng thay cho một dòng lỗi.
 */
function countCommits(spec: WorldSpec): number {
  return spec.commits?.length ?? 0;
}

function BuilderButton({
  children,
  onClick,
  disabled,
  testId,
}: {
  readonly children: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly testId?: string;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled ?? false}
      data-testid={testId}
      className="rounded-md border border-input px-3 py-1.5 text-xs text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      {hint !== undefined && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      <input
        id={id}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
    </div>
  );
}

function AreaField({
  id,
  label,
  hint,
  rows,
  value,
  mono,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly rows: number;
  readonly value: string;
  readonly mono?: boolean;
  readonly onChange: (next: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      {hint !== undefined && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={
          mono === true
            ? 'w-full rounded-md border border-input bg-card p-2 font-mono text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
            : 'w-full rounded-md border border-input bg-card p-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
        }
      />
    </div>
  );
}
