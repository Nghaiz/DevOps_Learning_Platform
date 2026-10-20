'use client';

import { useId, type ReactElement, type ReactNode } from 'react';
import { Icon, cn, type IconName } from '@devops-platform/ds';
import { count } from '@devops-platform/copy';

/**
 * Cột kiểm tra bên PHẢI của trình soạn: lỗi, độ sẵn sàng xuất bản, ghi chú.
 *
 * Bên phải chứ không bên trái: luật của chủ dự án cấm cột trái ĐIỀU HƯỚNG, và cột này
 * không điều hướng trang, nó soi biểu mẫu. Trên màn hẹp nó xếp xuống dưới nội dung, vì
 * người soạn trên điện thoại đọc biểu mẫu trước, bảng kiểm sau.
 */
export function InspectorRail(props: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <aside
      aria-label={props.label}
      className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-32 lg:max-h-[calc(100dvh-9rem)] lg:self-start lg:overflow-y-auto lg:pb-6"
    >
      {props.children}
    </aside>
  );
}

export type RailTone = 'plain' | 'accent' | 'ok' | 'warn' | 'bad';

const RAIL_BOX: Readonly<Record<RailTone, string>> = {
  plain: 'border-t border-rule pt-4',
  accent: 'border border-t-2 border-rule border-t-acc-mid bg-paper px-4 py-4',
  ok: 'border border-t-2 border-rule border-t-ok-mid bg-paper px-4 py-4',
  warn: 'border border-t-2 border-rule border-t-warn-mid bg-paper px-4 py-4',
  bad: 'border border-t-2 border-rule border-t-bad-mid bg-paper px-4 py-4',
};

const RAIL_ICON: Readonly<Record<RailTone, { readonly name: IconName; readonly tone: string }>> = {
  plain: { name: 'info', tone: 'text-ink-3' },
  accent: { name: 'lightbulb', tone: 'text-acc-ink' },
  ok: { name: 'success', tone: 'text-ok-ink' },
  warn: { name: 'warning', tone: 'text-warn-ink' },
  bad: { name: 'danger', tone: 'text-bad-ink' },
};

/** Một khối trong cột kiểm: biểu tượng theo sắc, tiêu đề, nội dung. */
export function RailSection(props: {
  readonly title: string;
  readonly tone?: RailTone;
  readonly children: ReactNode;
}): ReactElement {
  const id = useId();
  const tone = props.tone ?? 'plain';
  const icon = RAIL_ICON[tone];
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3 transition-colors duration-200', RAIL_BOX[tone])}>
      <h2 id={id} className="flex items-center gap-2 text-sm font-medium text-ink">
        <Icon name={icon.name} size={16} className={icon.tone} />
        {props.title}
      </h2>
      <div className="flex flex-col gap-3 text-sm text-ink-2">{props.children}</div>
    </section>
  );
}

/**
 * Một lỗi đã đổi sang ngôn ngữ người soạn.
 *
 * `field` là TÊN Ô người đọc được ("Bước 2, Script chấm"), không phải đường dữ liệu
 * (`steps[1].verifyScript`). Bản cũ in thẳng đường dữ liệu trong khối mã, và người
 * soạn phải tự dịch nó ngược về một ô trên màn hình.
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
      <p className="font-medium text-bad-ink">{count('author.issues.title', props.issues.length)}</p>
      <ol className="flex flex-col border-t border-rule">
        {props.issues.map((issue, index) => (
          <li key={`${issue.path}#${String(index)}`} className="border-b border-rule">
            {issue.jumpable ? (
              <button
                type="button"
                onClick={() => {
                  props.onJump(issue.path);
                }}
                className="group flex w-full items-start gap-2 rounded-sm py-2.5 text-left outline-none focus-visible:outline-solid transition-colors duration-150 hover:bg-well focus-visible:outline-2 focus-visible:outline-focus"
              >
                <IssueText issue={issue} />
                <Icon
                  name="arrow-up-right"
                  size={16}
                  className="mt-0.5 shrink-0 text-ink-3 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
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
      <span className="font-medium text-ink">{issue.field}</span>
      <span className="text-bad-ink">{issue.message}</span>
    </span>
  );
}
