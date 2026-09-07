'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { CodeAction, ExecTarget } from '@devops-platform/scenario/content-blocks';
import { cn } from '../cn.ts';
import { SCROLL_REGION_FOCUS } from './scroll-region.ts';

/**
 * Tuỳ chọn đi kèm một lượt bấm nút chạy (hợp đồng §C2).
 *
 * Đây là THAY THẾ của tham số thứ hai kiểu `boolean` cũ, không phải một dạng
 * song song. Giữ cả hai chữ ký là để một call-site cũ — vốn đọc tham số thứ
 * hai như `interrupt` — nhận nguyên một object và coi nó là truthy: nút "Chạy"
 * thường lặng lẽ gửi Ctrl+C trước mỗi lệnh, và không có gì đỏ ở bất cứ đâu.
 */
export interface ExecOptions {
  readonly interrupt: boolean;
  /** null = terminal đang hoạt (Terminal 1 nếu người dùng đang ở tab Editor). */
  readonly target: ExecTarget | null;
}

export interface CodeBlockProps {
  readonly code: string;
  readonly language: string | null;
  readonly action: CodeAction;
  readonly inline: boolean;
  /** Đích thực thi bài học khai tường minh (`{{exec T2}}`). `null` = terminal đang hoạt. */
  readonly target: ExecTarget | null;
  /** `undefined` = ẩn hẳn nút chạy (khác với `execEnabled: false` = hiện nhưng disable). */
  readonly onExec?: ((command: string, options: ExecOptions) => void) | undefined;
  /** Mặc định `true`. */
  readonly execEnabled?: boolean | undefined;
}

/**
 * Nhãn NGẮN in trên nút, và tên ĐẦY ĐỦ cho trình đọc màn hình.
 *
 * `Record<ExecTarget, …>` chứ không phải `Record<string, …>`: khi Lane B thêm
 * `'terminal-3'` vào union, hai bảng này đỏ ngay ở `tsc` thay vì lặng lẽ trả
 * `undefined` rồi in ra một nút không có đích.
 */
const TARGET_BADGE: Record<ExecTarget, string> = {
  'terminal-1': 'T1',
  'terminal-2': 'T2',
};

const TARGET_NAME: Record<ExecTarget, string> = {
  'terminal-1': 'Terminal 1',
  'terminal-2': 'Terminal 2',
};

type CopyStatus = 'idle' | 'success' | 'error';

const COPY_LABEL: Record<CopyStatus, string> = {
  idle: 'Chép',
  success: 'Đã chép',
  error: 'Chép thất bại',
};

/** Nút hành động dùng chung — kích thước nhỏ, một style cho cả inline lẫn khối. */
function ActionButton({
  onClick,
  disabled,
  title,
  ariaLabel,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string | undefined;
  /**
   * Đè TÊN TRỢ NĂNG của nút. Bỏ trống ⇒ tên đến từ chữ bên trong nút, đúng như
   * trước. Chỉ truyền khi chữ bên trong CHƯA nói đủ — ví dụ badge "T2" là ký
   * hiệu nhìn bằng mắt, đọc lên nghe như "tê hai".
   */
  ariaLabel?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded px-2 text-xs font-medium',
        'bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Khối code CÓ HÀNH ĐỘNG — kết quả của `parseContentBlocks` (packages/scenario)
 * khi gặp hậu tố `{{copy}}`/`{{exec}}`/`{{exec interrupt}}`. Fence THƯỜNG (không
 * hậu tố) không bao giờ tới đây — chúng ở lại trong `ContentBlock.kind ===
 * 'markdown'` và do MarkdownView vẽ (không nút, không tương tác).
 */
export function CodeBlock({
  code,
  language,
  action,
  inline,
  target,
  onExec,
  execEnabled = true,
}: CodeBlockProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');

  // Tự reset sau ~2s để nút không kẹt mãi ở "Đã chép"/"Chép thất bại".
  useEffect(() => {
    if (copyStatus === 'idle') {
      return;
    }
    const timer = setTimeout(() => setCopyStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  const handleCopy = (): void => {
    // `navigator.clipboard.writeText` CÓ THỂ reject (thiếu quyền, context không
    // an toàn — http thường, iframe bị chặn permission). Bắt bằng tham số thứ
    // hai của `.then`, KHÔNG nuốt lỗi trong im lặng — người học phải thấy nút
    // đổi sang trạng thái lỗi thay vì tưởng đã chép mà thực ra không.
    navigator.clipboard.writeText(code).then(
      () => setCopyStatus('success'),
      () => setCopyStatus('error'),
    );
  };

  const handleExec = (): void => {
    onExec?.(code, { interrupt: action === 'exec-interrupt', target });
  };

  const showCopy = action === 'copy';
  // Ẩn hẳn (không render) khi onExec undefined — khác với execEnabled=false
  // (vẫn render nhưng disabled). Hai trạng thái này truyền đạt hai điều khác
  // nhau cho người học: "tính năng này không tồn tại ở đây" vs "có nhưng chưa
  // dùng được lúc này".
  const showExec = (action === 'exec' || action === 'exec-interrupt') && onExec !== undefined;
  const execTitle = execEnabled ? undefined : 'Terminal chưa sẵn sàng — đợi terminal kết nối rồi thử lại.';
  const execLabel = action === 'exec-interrupt' ? 'Ngắt & chạy' : 'Chạy';

  /*
    Bài học viết `{{exec T2}}` là có CHỦ Ý SƯ PHẠM: lệnh này phải chạy ở một
    terminal khác cái đang nhìn. Người học cần biết điều đó TRƯỚC khi bấm —
    bấm rồi mới thấy màn hình nhảy sang tab khác là mất mạch, và tệ hơn là họ
    không nối được "vì sao nó chạy ở đằng kia" với nội dung bài.

    Vì vậy đích hiện ở HAI kênh song song, không phải một:

    - badge "T1"/"T2" in trên nút — kênh nhìn bằng mắt;
    - `aria-label` đầy đủ ("Chạy ở Terminal 2") — kênh trợ năng. Không thể
      trông vào badge cho kênh này: `aria-label` mặc định của nút sẽ là chữ
      ghép "Chạy T2", mà "T2" đọc lên là hai ký tự rời, không phải một đích.

    Badge dùng `border-current` — cùng màu với chữ của nút, nên nó không giới
    thiệu một cặp màu MỚI cần đo tương phản: chữ badge nằm trên đúng nền của
    nút, cặp đã được `theme/tokens.contract.test.ts` gác sẵn.
  */
  const targetBadge = target === null ? null : (
    <span
      aria-hidden
      className="ml-1 rounded-sm border border-current px-1 font-mono text-[0.9em] leading-none"
    >
      {TARGET_BADGE[target]}
    </span>
  );
  const execAriaLabel = target === null ? undefined : `${execLabel} ở ${TARGET_NAME[target]}`;

  const codeEl = (
    <code
      className={cn(
        'font-mono text-foreground',
        inline ? 'rounded bg-muted px-1.5 py-0.5 text-[0.85em]' : 'block whitespace-pre',
      )}
    >
      {code}
    </code>
  );

  if (inline) {
    // Mảnh giữa câu — span, KHÔNG phải card full-width (nội dung scenario đặt
    // nó giữa câu văn, xem MarkdownView § isMidSentenceFragment).
    return (
      <span className="inline-flex items-center gap-1 align-middle">
        {codeEl}
        {showCopy && (
          <ActionButton onClick={handleCopy} className="bg-muted text-foreground hover:bg-accent">
            {COPY_LABEL[copyStatus]}
          </ActionButton>
        )}
        {showExec && (
          <ActionButton
            onClick={handleExec}
            disabled={!execEnabled}
            title={execTitle}
            ariaLabel={execAriaLabel}
            className="bg-muted text-foreground hover:bg-accent"
          >
            {execLabel}
            {targetBadge}
          </ActionButton>
        )}
      </span>
    );
  }

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-muted">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{language ?? 'text'}</span>
        <div className="flex gap-1.5">
          {showCopy && <ActionButton onClick={handleCopy}>{COPY_LABEL[copyStatus]}</ActionButton>}
          {showExec && (
            <ActionButton
              onClick={handleExec}
              disabled={!execEnabled}
              title={execTitle}
              ariaLabel={execAriaLabel}
            >
              {execLabel}
              {targetBadge}
            </ActionButton>
          )}
        </div>
      </div>
      {/*
        `tabIndex`/`role`/`aria-label`: vùng cuộn phải vào được bằng bàn phím —
        lý do đầy đủ + phép đo tương phản ở `scroll-region.ts`.
      */}
      <pre
        tabIndex={0}
        role="group"
        aria-label={`Khối mã ${language ?? 'text'} — cuộn ngang bằng phím mũi tên`}
        className={cn('overflow-x-auto px-3 py-2 text-sm', SCROLL_REGION_FOCUS)}
      >
        {codeEl}
      </pre>
    </div>
  );
}
