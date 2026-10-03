'use client';

/**
 * Panel lưu bản nháp thành một bài tập, §18.E.5, đường xuất THỨ HAI của Builder.
 *
 * ## ⛔ Đây là lời gọi mạng DUY NHẤT của cả trụ cột game, và nó phải ở lại như vậy
 *
 * `app/games/layout.tsx` cố ý KHÔNG cấp `TrpcQueryProvider`, và file đó tồn tại
 * gần như chỉ để nói lý do: *"game phải chạy với 0 lời gọi backend"*, đo bằng
 * network trace của Playwright (`e2e/games.spec.ts` § "0 lời gọi backend trong
 * lúc chơi"). Panel này không phá ô đó, và nó không phá bằng cách may mắn:
 *
 *  1. **Không dùng React Query.** Client tRPC ở `lib/trpc.ts` là bản THUẦN
 *     (`createTRPCClient` + `httpBatchLink`), không cần provider nào.
 *  2. **Nhập ĐỘNG, trong chính hàm xử lý bấm nút.** `import()` nằm trong
 *     `save` nên `@trpc/client` không có một byte nào trong bundle đầu của
 *     `/games/git`, và tầng mạng theo nghĩa đen KHÔNG TỒN TẠI cho tới lúc người
 *     soạn bấm Lưu. Nhập tĩnh ở đầu file vẫn giữ được ô e2e (nó không bấm nút
 *     này), nhưng nó biến "không gọi mạng" từ tính chất CẤU TRÚC thành tính chất
 *     tình cờ. Ô gác: `save-problem-promises.test.ts`.
 *
 * ## Màn game KHÔNG bắt đăng nhập, mà `problems.create` thì đòi tài khoản soạn bài
 *
 * `/games` không nằm trong `PROTECTED_PATHS` của `proxy.ts`, nên một khách vãng
 * lai mở được Builder và cú bấm của họ nhận `UNAUTHORIZED`. Đó là hành vi ĐÚNG;
 * việc của panel là nói ra bằng tiếng Việt thay vì ném một mã lỗi lên màn. Câu
 * đó cũng nằm sẵn ở `author.builder.save.scope`, TRƯỚC khi họ soạn xong.
 *
 * ## Hai mảng song song không bao giờ lệch, vì chúng được DỰNG từ bản nháp
 *
 * `ProblemExtras.hintPenalties` và `.objectiveVisible` phải song song theo chỉ số
 * với `draft.hints` / `draft.objectives`. Panel giữ một bảng tra và DỰNG mảng
 * theo đúng độ dài của bản nháp ở mỗi lần vẽ, nên hai mã `*-lech-so-luong` của
 * `problemSaveIssues` không với tới được từ giao diện này; chúng gác hợp đồng
 * của hàm thuần cho mọi chỗ gọi khác. `visible` mặc định `true`, điểm trừ mặc
 * định `0`: không giấu gì, không tính tiền gì.
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { CircleCheck, Save, TriangleAlert } from 'lucide-react';

import { t } from '@devops-platform/copy';
import { problemTopicLabels, type LevelDraft } from '@devops-platform/games';
import { Button } from '@devops-platform/ui';

import { parseTags } from '../../../../app/author/problems/text-tools';
import { SAVE_ISSUE_TEXT, SAVE_LOSS_TEXT } from './builder-copy';
import {
  draftToProblemBody,
  problemSaveIssues,
  problemSaveLosses,
  slugFromTitle,
  type ProblemExtras,
} from './draft-to-problem';
import {
  MAX_TOPICS,
  PenaltyLedger,
  TagField,
  TopicPicker,
  VisibilityList,
} from './save-problem-fields';

type SaveStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'done'; readonly code: string }
  | { readonly kind: 'error'; readonly message: string };

const IDLE: SaveStatus = { kind: 'idle' };

export function SaveProblemPanel({ draft }: { readonly draft: LevelDraft }): ReactElement {
  const [topics, setTopics] = useState<readonly string[]>([]);
  const [tagText, setTagText] = useState('');
  /**
   * Điểm trừ theo CHỈ SỐ gợi ý, cùng khoá mà `draftToProblemBody` dùng để sinh
   * `goi-y-N`. Hệ quả phải nói ra: chèn một gợi ý vào GIỮA danh sách đẩy giá của
   * mọi gợi ý sau nó lệch một ô. Bản nháp không chở id gợi ý nên không tránh
   * được; người soạn kiểm lại cột giá sau khi chèn.
   */
  const [penalties, setPenalties] = useState<Readonly<Record<number, number>>>({});
  /** Id mục tiêu bị ẩn. Theo ID chứ không theo chỉ số: id ổn định khi sắp lại. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState<SaveStatus>(IDLE);

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
   * để sửa: khoá nút vì nó sẽ đóng đường xuất thứ hai của Builder cho một bản
   * nháp hoàn toàn hợp lệ. Xem `draft-to-problem.ts` § `ProblemSaveLossCode`.
   */
  const losses = useMemo(() => problemSaveLosses(draft), [draft]);
  const slug = slugFromTitle(draft.title);

  const toggleTopic = useCallback((id: string) => {
    setStatus(IDLE);
    setTopics((current) =>
      current.includes(id)
        ? current.filter((topic) => topic !== id)
        : // Bỏ qua khi đã đủ ba thay vì cho chọn rồi báo lỗi: chip thứ tư đã
          // `disabled`, nên nhánh này chỉ với tới được nếu ai đó gỡ cờ đó.
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
    // Nhập ĐỘNG, xem khối đầu file: `/games/git` không được mang `@trpc/client`
    // trong bundle đầu.
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
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-foreground" data-testid="git-builder-save-scope">
        {t('author.builder.save.scope')}
      </p>

      <TopicPicker options={topicOptions} selected={topics} onToggle={toggleTopic} />
      <TagField
        value={tagText}
        onChange={(next) => {
          setStatus(IDLE);
          setTagText(next);
        }}
      />
      <PenaltyLedger
        hints={draft.hints}
        penalties={penalties}
        onChange={(index, value) => {
          setStatus(IDLE);
          setPenalties((current) => ({ ...current, [index]: value }));
        }}
      />
      <VisibilityList
        objectives={draft.objectives}
        hidden={hidden}
        onChange={(id, visible) => {
          setStatus(IDLE);
          setHidden((current) => {
            const next = new Set(current);
            if (visible) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
      />

      <div
        className="flex items-baseline justify-between gap-3 border-y border-border py-2.5"
        data-testid="git-builder-save-slug"
      >
        <span className="type-label shrink-0 text-muted-foreground">
          {t('author.builder.save.slug')}
        </span>
        {slug === '' ? (
          <span className="text-sm text-muted-foreground">
            {t('author.builder.save.slug-empty')}
          </span>
        ) : (
          <code className="min-w-0 truncate font-mono text-sm text-foreground">{slug}</code>
        )}
      </div>

      {issues.length > 0 && (
        <ul className="flex flex-col gap-1.5" data-testid="git-builder-save-issues">
          {issues.map((issue) => (
            <li
              key={`${issue.code}-${issue.detail ?? ''}`}
              className="flex animate-rise gap-2.5 text-sm leading-relaxed text-destructive"
            >
              <span aria-hidden className="mt-2 size-2 shrink-0 bg-destructive" />
              <span>
                {t(SAVE_ISSUE_TEXT[issue.code])}
                {issue.detail !== undefined && (
                  <>
                    {' '}
                    <code className="bg-muted px-1 font-mono text-xs">{issue.detail}</code>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {losses.length > 0 && (
        <ul className="flex flex-col gap-1.5 bg-muted p-3" data-testid="git-builder-save-losses">
          {losses.map((loss) => (
            <li key={loss.code} className="flex gap-2.5 text-sm leading-relaxed text-warning">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {t(SAVE_LOSS_TEXT[loss.code])}
                {loss.detail !== undefined && (
                  <>
                    {' '}
                    <code className="font-mono text-xs">{loss.detail}</code>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button
          data-testid="git-builder-save-problem"
          iconLeft={<Save aria-hidden />}
          loading={status.kind === 'saving'}
          disabled={issues.length > 0}
          onClick={() => {
            void save();
          }}
        >
          {t('author.builder.save.run')}
        </Button>
      </div>

      {status.kind === 'saving' && (
        <p role="status" className="sr-only">
          {t('author.builder.save.saving')}
        </p>
      )}
      {status.kind === 'done' && (
        <p
          role="status"
          data-testid="git-builder-save-done"
          className="flex animate-rise gap-2 text-sm leading-relaxed text-success"
        >
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{t('author.builder.save.done', { code: status.code })}</span>
        </p>
      )}
      {status.kind === 'error' && (
        <p
          role="alert"
          data-testid="git-builder-save-error"
          className="flex animate-rise gap-2 text-sm leading-relaxed text-destructive"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{status.message}</span>
        </p>
      )}
    </div>
  );
}
