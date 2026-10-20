'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Check, Copy, CornerDownLeft, OctagonX } from 'lucide-react';
import type { CodeAction } from '@devops-platform/scenario/content-blocks';
import { cn } from '../cn.ts';
import { SCROLL_REGION_FOCUS } from './scroll-region.ts';

/** Câu chữ của khối mã. Gói `ui` không phụ thuộc `copy`, nên trang truyền vào. */
export interface CodeBlockLabels {
  readonly run: string;
  readonly runInterrupt: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyFailed: string;
  readonly region: (language: string) => string;
}

/** Bản mặc định cho nơi gọi chưa truyền nhãn (xem trước của trang soạn bài). */
export const DEFAULT_CODE_BLOCK_LABELS: CodeBlockLabels = {
  run: 'Chạy',
  runInterrupt: 'Ngắt và chạy',
  copy: 'Chép',
  copied: 'Đã chép',
  copyFailed: 'Chép không được',
  region: (language) => `Khối mã ${language}, cuộn ngang bằng phím mũi tên`,
};

export interface CodeBlockProps {
  readonly code: string;
  readonly language: string | null;
  readonly action: CodeAction;
  readonly inline: boolean;
  readonly onExec?: ((command: string, interrupt: boolean) => void) | undefined;
  readonly execEnabled?: boolean | undefined;
  /** Vì sao nút chạy đang khoá. Hiện thành chữ cạnh nút, không chỉ là `title`. */
  readonly execDisabledReason?: string | null | undefined;
  readonly labels?: CodeBlockLabels | undefined;
}

type CopyStatus = 'idle' | 'success' | 'error';

function ActionButton({
  onClick,
  disabled,
  title,
  describedBy,
  tone = 'plain',
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string | undefined;
  describedBy?: string | undefined;
  tone?: 'plain' | 'run';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-describedby={describedBy}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-none px-2.5 font-mono text-xs',
        'transition-[background-color,color,transform] duration-[var(--motion-fast)] ease-out',
        'motion-safe:active:translate-y-px',
        tone === 'run'
          ? 'bg-ink text-ink-foreground hover:brightness-110'
          : 'bg-transparent text-foreground hover:bg-border',
        'disabled:cursor-not-allowed disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        '[&_svg]:size-3.5',
      )}
    >
      {children}
    </button>
  );
}

const PLAIN_LANGUAGES: ReadonlySet<string> = new Set(['text', 'plaintext', 'plain', 'txt']);

export function CodeBlock({
  code,
  language,
  action,
  inline,
  onExec,
  execEnabled = true,
  execDisabledReason = null,
  labels = DEFAULT_CODE_BLOCK_LABELS,
}: CodeBlockProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const reasonId = useId();

  // Tự về trạng thái nghỉ sau ~2s để nút không kẹt ở "Đã chép".
  useEffect(() => {
    if (copyStatus === 'idle') {
      return;
    }
    const timer = setTimeout(() => setCopyStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  const handleCopy = (): void => {
    // `writeText` có thể bị từ chối (thiếu quyền, context không an toàn). Không
    // nuốt lỗi: nút đổi sang trạng thái lỗi để người học biết là chưa chép được.
    navigator.clipboard.writeText(code).then(
      () => setCopyStatus('success'),
      () => setCopyStatus('error'),
    );
  };

  const handleExec = (): void => {
    onExec?.(code, action === 'exec-interrupt');
  };

  const showCopy = action === 'copy';
  // Ẩn hẳn khi `onExec` vắng (tính năng không có ở đây), khác với khoá tạm
  // thời khi terminal chưa sẵn sàng (nút vẫn hiện, kèm lý do).
  const showExec = (action === 'exec' || action === 'exec-interrupt') && onExec !== undefined;
  const reason = execEnabled ? null : execDisabledReason;
  const execLabel = action === 'exec-interrupt' ? labels.runInterrupt : labels.run;
  const ExecIcon = action === 'exec-interrupt' ? OctagonX : CornerDownLeft;
  const copyLabel =
    copyStatus === 'success' ? labels.copied : copyStatus === 'error' ? labels.copyFailed : labels.copy;
  const CopyIcon = copyStatus === 'success' ? Check : Copy;

  const codeEl = (
    <code
      className={cn(
        'font-mono text-foreground',
        inline ? 'bg-muted px-1.5 py-0.5 text-[0.85em]' : 'block whitespace-pre',
      )}
    >
      {code}
    </code>
  );

  if (inline) {
    // Mảnh giữa câu: span chứ không phải khối rộng hết dòng.
    return (
      <span className="inline-flex items-center gap-1 align-middle">
        {codeEl}
        {showCopy && (
          <ActionButton onClick={handleCopy}>
            <CopyIcon aria-hidden="true" />
            {copyLabel}
          </ActionButton>
        )}
        {showExec && (
          <ActionButton
            onClick={handleExec}
            disabled={!execEnabled}
            title={reason ?? undefined}
            tone="run"
          >
            <ExecIcon aria-hidden="true" />
            {execLabel}
          </ActionButton>
        )}
      </span>
    );
  }

  return (
    <div className="my-3 border border-border bg-muted">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1">
        {/* "text" là nhãn vô nghĩa với người đọc: chỉ in tên ngôn ngữ thật (bash, yaml…). */}
        {language !== null && !PLAIN_LANGUAGES.has(language.toLowerCase()) ? (
          <span className="type-label text-muted-foreground">{language}</span>
        ) : (
          <span aria-hidden="true" />
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showExec && reason !== null && (
            <span id={reasonId} className="font-mono text-xs text-muted-foreground">
              {reason}
            </span>
          )}
          {showCopy && (
            <ActionButton onClick={handleCopy}>
              <CopyIcon aria-hidden="true" />
              {copyLabel}
            </ActionButton>
          )}
          {showExec && (
            <ActionButton
              onClick={handleExec}
              disabled={!execEnabled}
              describedBy={reason === null ? undefined : reasonId}
              tone="run"
            >
              <ExecIcon aria-hidden="true" />
              {execLabel}
            </ActionButton>
          )}
        </div>
      </div>
      {/* Vùng cuộn phải vào được bằng bàn phím: lý do ở `scroll-region.ts`. */}
      <pre
        tabIndex={0}
        role="group"
        aria-label={labels.region(language ?? 'text')}
        className={cn('overflow-x-auto px-3 py-2.5 text-sm leading-relaxed', SCROLL_REGION_FOCUS)}
      >
        {codeEl}
      </pre>
    </div>
  );
}
