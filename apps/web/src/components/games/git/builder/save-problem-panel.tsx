'use client';

/**
 * Panel lưu bản nháp thành một bài tập — §18.E.5, đường xuất THỨ HAI của Builder.
 *
 * ## ⛔ Đây là lời gọi mạng DUY NHẤT của cả trụ cột game, và nó phải ở lại như vậy
 *
 * `app/games/layout.tsx` cố ý KHÔNG cấp `TrpcQueryProvider`, và file đó tồn tại
 * gần như chỉ để nói lý do: *"game phải chạy với 0 lời gọi backend"*, đo bằng
 * network trace của Playwright (`e2e/games.spec.ts` § "0 lời gọi backend trong
 * lúc chơi"). Panel này không phá ô đó, và nó không phá bằng cách may mắn:
 *
 *  1. **Không dùng React Query.** Client tRPC ở `lib/trpc.ts` là bản THUẦN
 *     (`createTRPCClient` + `httpBatchLink`), không cần provider nào. Tiền lệ là
 *     trang `/session`, và `lib/trpc.ts` đã ghi rõ vì sao nó không kèm TanStack.
 *  2. **Nhập ĐỘNG, trong chính hàm xử lý bấm nút.** `import()` nằm trong
 *     `onSave` nên `@trpc/client` không có một byte nào trong bundle đầu của
 *     `/games/git`, và tầng mạng theo nghĩa đen KHÔNG TỒN TẠI cho tới lúc người
 *     soạn bấm Lưu. Nhập tĩnh ở đầu file vẫn giữ được ô e2e (nó không bấm nút
 *     nào ở đây), nhưng nó biến "không gọi mạng" từ một tính chất CẤU TRÚC thành
 *     một tính chất tình cờ, và tình cờ thì lần sau ai đó phá mà không ai thấy.
 *
 * ## Màn game KHÔNG bắt đăng nhập, mà `problems.create` thì đòi tài khoản soạn bài
 *
 * `/games` không nằm trong `PROTECTED_PATHS` của `proxy.ts` (cùng khối chú thích
 * ở `games/layout.tsx`), nên một khách vãng lai mở được Builder. `problems.create`
 * là `authorProcedure`, nên cú bấm của họ nhận `UNAUTHORIZED`. Đó là hành vi
 * ĐÚNG, và việc của panel là nói ra bằng tiếng Việt thay vì ném một mã lỗi lên
 * màn. Câu đó cũng nằm sẵn ở `author.builder.save.scope`, TRƯỚC khi họ soạn xong
 * ba ô, chứ không đợi tới lúc bấm.
 *
 * ## Hai mảng song song không bao giờ lệch, vì chúng được DỰNG từ bản nháp
 *
 * `ProblemExtras.hintPenalties` và `.objectiveVisible` phải song song theo chỉ số
 * với `draft.hints` / `draft.objectives`. Panel không giữ chúng thành hai mảng
 * độc lập rồi hy vọng đồng bộ: nó giữ một bảng tra và DỰNG mảng theo đúng độ dài
 * của bản nháp ở mỗi lần vẽ. Nên hai mã lỗi `*-lech-so-luong` của
 * `problemSaveIssues` KHÔNG với tới được từ giao diện này, và đó là chủ ý: chúng
 * gác hợp đồng của hàm thuần cho mọi chỗ gọi khác, không gác cái panel này.
 *
 * `visible` mặc định `true` và điểm trừ mặc định `0`. Cả hai là hướng AN TOÀN:
 * không giấu gì, không tính tiền gì. Mặc định ngược lại sẽ âm thầm biến mọi
 * testcase thành testcase ẩn và mọi gợi ý thành gợi ý có giá.
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import { problemTopicLabels, type LevelDraft } from '@devops-platform/games';

import { parseTags } from '../../../../app/author/problems/text-tools';
import { SAVE_ISSUE_TEXT, SAVE_LOSS_TEXT } from './builder-copy';
import {
  draftToProblemBody,
  problemSaveIssues,
  problemSaveLosses,
  slugFromTitle,
  type ProblemExtras,
} from './draft-to-problem';

/** Trần của `problemBodyShape.topics`. Ô chọn khoá luôn, không đợi Zod nói. */
const MAX_TOPICS = 3;

type SaveStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'done'; readonly code: string }
  | { readonly kind: 'error'; readonly message: string };

const INPUT_CLASS =
  'rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function SaveProblemPanel({ draft }: { readonly draft: LevelDraft }): ReactElement {
  const [topics, setTopics] = useState<readonly string[]>([]);
  const [tagText, setTagText] = useState('');
  /**
   * Điểm trừ theo CHỈ SỐ gợi ý, không theo id.
   *
   * `GitLevel.hints` là mảng chuỗi trần và không có id nào để bám, nên chỉ số là
   * khoá duy nhất có sẵn — cùng khoá mà `draftToProblemBody` dùng để sinh
   * `goi-y-N`. Hệ quả phải nói ra: chèn một gợi ý vào GIỮA danh sách sẽ đẩy giá
   * của mọi gợi ý sau nó lệch đi một ô. Bản nháp không chở id thì không có cách
   * nào tránh; người soạn kiểm lại cột giá sau khi chèn.
   */
  const [penalties, setPenalties] = useState<Readonly<Record<number, number>>>({});
  /** Id mục tiêu bị ẩn. Theo ID chứ không theo chỉ số: id ổn định khi sắp lại. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const topicOptions = useMemo(() => Object.entries(problemTopicLabels('git')), []);

  const extras: ProblemExtras = useMemo(
    () => ({
      topics,
      tags: parseTags(tagText),
      hintPenalties: draft.hints.map((_, index) => penalties[index] ?? 0),
      objectiveVisible: draft.objectives.map((objective) => !hidden.has(objective.id)),
    }),
    [topics, tagText, penalties, hidden, draft],
  );

  const issues = useMemo(() => problemSaveIssues(draft, extras), [draft, extras]);
  /*
   * KHÔNG đưa vào `disabled` của nút Lưu. Mất mát là thứ để ĐỌC, không phải thứ
   * để sửa — khoá nút vì nó sẽ đóng đường xuất thứ hai của Builder cho một bản
   * nháp hoàn toàn hợp lệ. Xem `draft-to-problem.ts` § `ProblemSaveLossCode`.
   */
  const losses = useMemo(() => problemSaveLosses(draft), [draft]);
  const slug = slugFromTitle(draft.title);

  const toggleTopic = useCallback((id: string) => {
    setStatus({ kind: 'idle' });
    setTopics((current) =>
      current.includes(id)
        ? current.filter((topic) => topic !== id)
        : // Bỏ qua khi đã đủ ba thay vì cho chọn rồi báo lỗi: ô đánh dấu thứ tư
          // đã `disabled`, nên nhánh này chỉ với tới được từ bàn phím.
          current.length >= MAX_TOPICS
          ? current
          : [...current, id],
    );
  }, []);

  const save = useCallback(async () => {
    const body = draftToProblemBody(draft, extras);
    if (body === null) {
      // Nút đã `disabled`; đây là chốt ở tầng kiểu, không phải một nhánh chạy.
      return;
    }
    setStatus({ kind: 'saving' });
    /*
     * Nhập ĐỘNG — xem khối đầu file. `lib/trpc` kéo `@trpc/client` theo, và
     * `/games/git` không được mang nó trong bundle đầu.
     */
    const { trpc, describeTrpcError, trpcErrorCode } = await import('../../../../lib/trpc');
    try {
      const saved = await trpc.problems.create.mutate(body);
      setStatus({ kind: 'done', code: saved.code });
    } catch (error) {
      setStatus({
        kind: 'error',
        message:
          trpcErrorCode(error) === 'UNAUTHORIZED'
            ? t('author.builder.save.unauthorized')
            : describeTrpcError(error),
      });
    }
  }, [draft, extras]);

  return (
    <section aria-labelledby="builder-luu-bai" className="git-builder-publish flex flex-col gap-3">
      <h3 id="builder-luu-bai" className="text-sm font-semibold text-foreground">
        Lưu thành bài tập
      </h3>
      <p className="text-xs text-muted-foreground" data-testid="git-builder-save-scope">
        {t('author.builder.save.scope')}
      </p>

      {/* ── Chủ đề ───────────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2 rounded-md border border-input p-3">
        <legend className="px-1 text-xs font-medium text-foreground">
          Chủ đề (chọn một tới ba)
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {topicOptions.map(([id, label]) => {
            const checked = topics.includes(id);
            return (
              <div key={id} className="flex items-center gap-2">
                <input
                  id={`builder-topic-${id}`}
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && topics.length >= MAX_TOPICS}
                  onChange={() => {
                    toggleTopic(id);
                  }}
                  className="size-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                />
                <label htmlFor={`builder-topic-${id}`} className="text-xs text-foreground">
                  {label}
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* ── Tag ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <label htmlFor="builder-tags" className="text-xs font-medium text-foreground">
          Tag
        </label>
        <p className="text-[10px] text-muted-foreground">
          Phân loại tự do, ngăn bằng dấu phẩy. Bỏ dấu và chuyển thành gạch nối tự động.
        </p>
        <input
          id="builder-tags"
          value={tagText}
          autoComplete="off"
          onChange={(e) => {
            setStatus({ kind: 'idle' });
            setTagText(e.target.value);
          }}
          className={`w-full ${INPUT_CLASS}`}
        />
      </div>

      {/* ── Giá gợi ý ────────────────────────────────────────────────────── */}
      {draft.hints.length > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-md border border-input p-3">
          <legend className="px-1 text-xs font-medium text-foreground">Điểm trừ mỗi gợi ý</legend>
          <p className="text-[10px] text-muted-foreground">
            Gợi ý của level thì miễn phí vì level DẠY. Gợi ý của bài tập có giá vì bài tập THỬ. Để 0
            nếu muốn miễn phí.
          </p>
          {draft.hints.map((hint, index) => (
            <div key={`penalty-${String(index)}`} className="flex items-center gap-2">
              <label
                htmlFor={`builder-penalty-${String(index)}`}
                className="flex-1 truncate text-xs text-foreground"
              >
                {hint}
              </label>
              <input
                id={`builder-penalty-${String(index)}`}
                type="number"
                min={0}
                max={1000}
                step={1}
                value={penalties[index] ?? 0}
                onChange={(e) => {
                  setStatus({ kind: 'idle' });
                  const next = Number(e.target.value);
                  setPenalties((current) => ({ ...current, [index]: next }));
                }}
                className={`w-24 ${INPUT_CLASS}`}
              />
            </div>
          ))}
        </fieldset>
      )}

      {/* ── Testcase ẩn ──────────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2 rounded-md border border-input p-3">
        <legend className="px-1 text-xs font-medium text-foreground">
          Mục tiêu nào hiện trước khi nộp
        </legend>
        <p className="text-[10px] text-muted-foreground">
          Bỏ đánh dấu để giấu một mục tiêu cho tới khi người làm nộp. Đây KHÔNG phải cờ &quot;bắt
          buộc&quot; của level: mọi testcase đều chặn, ẩn hay hiện cũng vậy.
        </p>
        {draft.objectives.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">Bản nháp chưa có mục tiêu nào.</p>
        ) : (
          draft.objectives.map((objective) => (
            <div key={objective.id} className="flex items-center gap-2">
              <input
                id={`builder-visible-${objective.id}`}
                type="checkbox"
                checked={!hidden.has(objective.id)}
                onChange={(e) => {
                  setStatus({ kind: 'idle' });
                  setHidden((current) => {
                    const next = new Set(current);
                    if (e.target.checked) next.delete(objective.id);
                    else next.add(objective.id);
                    return next;
                  });
                }}
                className="size-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              <label
                htmlFor={`builder-visible-${objective.id}`}
                className="text-xs text-foreground"
              >
                {objective.label === '' ? objective.id : objective.label}
              </label>
            </div>
          ))
        )}
      </fieldset>

      <p className="text-[10px] text-muted-foreground" data-testid="git-builder-save-slug">
        Đường dẫn sinh từ tiêu đề: <code>{slug === '' ? '(chưa có)' : slug}</code>
      </p>

      {issues.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5" data-testid="git-builder-save-issues">
          {issues.map((issue) => (
            <li key={`${issue.code}-${issue.detail ?? ''}`} className="text-xs text-destructive">
              {t(SAVE_ISSUE_TEXT[issue.code])}
              {issue.detail !== undefined && (
                <>
                  {' '}
                  <code>{issue.detail}</code>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {losses.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5" data-testid="git-builder-save-losses">
          {losses.map((loss) => (
            <li key={loss.code} className="text-xs text-warning">
              {t(SAVE_LOSS_TEXT[loss.code])}
              {loss.detail !== undefined && (
                <>
                  {' '}
                  <code>{loss.detail}</code>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div>
        <button
          type="button"
          data-testid="git-builder-save-problem"
          disabled={issues.length > 0 || status.kind === 'saving'}
          onClick={() => {
            void save();
          }}
          className="rounded-md border border-input px-3 py-1.5 text-xs text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status.kind === 'saving' ? 'Đang lưu...' : t('author.builder.save.run')}
        </button>
      </div>

      {status.kind === 'done' && (
        <p role="status" data-testid="git-builder-save-done" className="text-xs text-foreground">
          {t('author.builder.save.done', { code: status.code })}
        </p>
      )}
      {status.kind === 'error' && (
        <p role="alert" data-testid="git-builder-save-error" className="text-xs text-destructive">
          {status.message}
        </p>
      )}
    </section>
  );
}
