'use client';

import { useId, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@devops-platform/ui';
import { count } from '@devops-platform/copy';

/**
 * Cột kiểm tra bên PHẢI của trình soạn: lỗi, độ sẵn sàng xuất bản, ghi chú.
 *
 * Bên phải chứ không bên trái: luật của chủ dự án cấm cột trái ĐIỀU HƯỚNG, và
 * cột này không điều hướng trang, nó soi biểu mẫu. Trên màn hẹp nó xếp xuống
 * dưới nội dung, vì người soạn trên điện thoại đọc biểu mẫu trước, bảng kiểm sau.
 */
export function InspectorRail(props: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <aside
      aria-label={props.label}
      className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-36 lg:max-h-[calc(100dvh-10rem)] lg:self-start lg:overflow-y-auto lg:pb-6"
    >
      {props.children}
    </aside>
  );
}

export type RailTone = 'plain' | 'accent' | 'ok' | 'warn' | 'bad';

const RAIL_TONE: Readonly<Record<RailTone, string>> = {
  plain: 'border-t border-foreground',
  accent: 'border-t-4 border-line-cicd',
  ok: 'border-t-4 border-success',
  warn: 'border-t-4 border-warning',
  bad: 'border-t-4 border-destructive',
};

/** Một khối trong cột kiểm: vạch màu trên đầu (như biển ga), nhãn mono, nội dung. */
export function RailSection(props: {
  readonly title: string;
  readonly tone?: RailTone;
  readonly children: ReactNode;
}): ReactElement {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn('flex flex-col gap-3 pt-3 transition-colors duration-200', RAIL_TONE[props.tone ?? 'plain'])}
    >
      <h2 id={id} className="type-label text-muted-foreground">
        {props.title}
      </h2>
      <div className="flex flex-col gap-3 text-sm text-foreground">{props.children}</div>
    </section>
  );
}

/**
 * Một lỗi đã đổi sang ngôn ngữ người soạn.
 *
 * `field` là TÊN Ô người đọc được ("Bước 2 · Script chấm"), không phải đường dữ
 * liệu (`steps[1].verifyScript`). Bản cũ in thẳng đường dữ liệu trong khối mã,
 * và người soạn phải tự dịch nó ngược về một ô trên màn hình.
 */
export interface StudioIssue {
  readonly path: string;
  readonly field: string;
  readonly message: string;
  /** `false` khi `path` không ứng với ô nào trên biểu mẫu (lỗi cấp bài, lỗi máy chủ). */
  readonly jumpable: boolean;
}

/** Danh sách lỗi trong cột kiểm. Mỗi lỗi nhảy được là một nút đưa focus về ô của nó. */
export function IssueList(props: {
  readonly issues: readonly StudioIssue[];
  readonly onJump: (path: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-destructive">{count('author.issues.title', props.issues.length)}</p>
      <ol className="flex flex-col border-t border-border">
        {props.issues.map((issue, index) => (
          <li
            key={`${issue.path}#${String(index)}`}
            className="stagger animate-rise border-b border-border"
            style={{ '--i': index } as CSSProperties}
          >
            {issue.jumpable ? (
              <button
                type="button"
                onClick={() => {
                  props.onJump(issue.path);
                }}
                className="group flex w-full items-start gap-2 py-2.5 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <IssueText issue={issue} />
                <ArrowUpRight
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </button>
            ) : (
              <div className="flex items-start gap-2 py-2.5">
                <IssueText issue={issue} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function IssueText({ issue }: { readonly issue: StudioIssue }): ReactElement {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-1">
      <span className="font-medium text-foreground">{issue.field}</span>
      <span className="text-destructive">{issue.message}</span>
    </span>
  );
}
