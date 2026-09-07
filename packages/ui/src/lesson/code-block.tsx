'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { CodeAction } from '@devops-platform/scenario/content-blocks';
import { cn } from '../cn.ts';
import { SCROLL_REGION_FOCUS } from './scroll-region.ts';

export interface CodeBlockProps {
  readonly code: string;
  readonly language: string | null;
  readonly action: CodeAction;
  readonly inline: boolean;
  /**
   * `undefined` = ẩn hẳn nút chạy (khác với `execEnabled: false` = hiện nhưng
   * disable). Tham số thứ hai là `interrupt` — CHỈ một `boolean`, xem §Y3.
   */
  readonly onExec?: ((command: string, interrupt: boolean) => void) | undefined;
  /** Mặc định `true`. */
  readonly execEnabled?: boolean | undefined;
}

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
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
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
    onExec?.(code, action === 'exec-interrupt');
  };

  const showCopy = action === 'copy';
  // Ẩn hẳn (không render) khi onExec undefined — khác với execEnabled=false
  // (vẫn render nhưng disabled). Hai trạng thái này truyền đạt hai điều khác
  // nhau cho người học: "tính năng này không tồn tại ở đây" vs "có nhưng chưa
  // dùng được lúc này".
  const showExec = (action === 'exec' || action === 'exec-interrupt') && onExec !== undefined;
  const execTitle = execEnabled ? undefined : 'Terminal chưa sẵn sàng — đợi terminal kết nối rồi thử lại.';
  const execLabel = action === 'exec-interrupt' ? 'Ngắt & chạy' : 'Chạy';

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
            className="bg-muted text-foreground hover:bg-accent"
          >
            {execLabel}
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
            <ActionButton onClick={handleExec} disabled={!execEnabled} title={execTitle}>
              {execLabel}
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
