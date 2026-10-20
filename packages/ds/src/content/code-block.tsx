'use client';

import { useEffect, useId, useState } from 'react';
import type { CodeAction } from '@devops-platform/scenario/content-blocks';
import { cn } from '../cn.ts';
import { Icon } from '../icons/icon.tsx';
import type { ContentLabels } from './labels.ts';

export interface CodeBlockProps {
  readonly code: string;
  readonly language: string | null;
  readonly action: CodeAction;
  readonly inline: boolean;
  readonly labels: ContentLabels;
  readonly onExec?: ((command: string, interrupt: boolean) => void) | undefined;
  readonly execEnabled?: boolean | undefined;
  readonly execDisabledReason?: string | null | undefined;
}

type CopyStatus = 'idle' | 'success' | 'error';

/** Tên ngôn ngữ "text" vô nghĩa với người đọc: chỉ in tên thật (bash, yaml…). */
const PLAIN_LANGUAGES: ReadonlySet<string> = new Set(['text', 'plaintext', 'plain', 'txt']);

/**
 * Khối lệnh trong bài. Nền tối như chính terminal bên cạnh, để mắt nối được "lệnh
 * này sẽ chạy ở kia". Nút Chạy gửi lệnh sang terminal; nút Chép đổi thành dấu tích
 * trong hai giây.
 */
export function CodeBlock({ code, language, action, inline, labels, onExec, execEnabled = true, execDisabledReason = null }: CodeBlockProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const reasonId = useId();

  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = setTimeout(() => setCopyStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  const copy = (): void => {
    navigator.clipboard.writeText(code).then(
      () => setCopyStatus('success'),
      () => setCopyStatus('error'),
    );
  };
  const exec = (): void => onExec?.(code, action === 'exec-interrupt');

  const showCopy = action === 'copy' || ((action === 'exec' || action === 'exec-interrupt') && onExec === undefined);
  const showExec = (action === 'exec' || action === 'exec-interrupt') && onExec !== undefined;
  const reason = execEnabled ? null : execDisabledReason;
  const execLabel = action === 'exec-interrupt' ? labels.runInterrupt : labels.run;
  const copyLabel = copyStatus === 'success' ? labels.copied : copyStatus === 'error' ? labels.copyFailed : labels.copy;

  const runButton = showExec ? (
    <button
      type="button"
      onClick={exec}
      disabled={!execEnabled}
      title={reason ?? undefined}
      aria-describedby={reason === null || inline ? undefined : reasonId}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium',
        'bg-acc-solid text-on-solid transition-[background-color,transform] duration-150 motion-safe:active:scale-[0.96]',
        'hover:bg-[color-mix(in_oklch,var(--acc-solid),var(--ink)_14%)] disabled:cursor-not-allowed disabled:bg-well-2 disabled:text-ink-3',
      )}
    >
      <Icon name={action === 'exec-interrupt' ? 'stop' : 'enter'} size={14} strokeWidth={2} />
      {execLabel}
    </button>
  ) : null;

  const copyButton = showCopy ? (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs transition-colors duration-150',
        inline ? 'text-ink-2 hover:bg-well-2 hover:text-ink' : 'text-[var(--code-dim)] hover:bg-white/10 hover:text-[var(--code-ink)]',
      )}
    >
      <Icon name={copyStatus === 'success' ? 'check' : 'copy'} size={14} />
      <span aria-live="polite">{copyLabel}</span>
    </button>
  ) : null;

  if (inline) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
        <code className="rounded-xs bg-well-2 px-1.5 py-0.5 font-mono text-[0.88em] text-ink">{code}</code>
        {copyButton}
        {runButton}
      </span>
    );
  }

  const named = language !== null && !PLAIN_LANGUAGES.has(language.toLowerCase());
  return (
    <div className="my-4 overflow-hidden rounded-md bg-[var(--code-bg)] text-[var(--code-ink)]">
      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-white/8 px-3 py-1">
        <span className="text-xs text-[var(--code-dim)]">{named ? language : null}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showExec && reason !== null ? (
            <span id={reasonId} className="text-xs text-[var(--code-dim)]">
              {reason}
            </span>
          ) : null}
          {copyButton}
          {runButton}
        </div>
      </div>
      <pre
        tabIndex={0}
        role="group"
        aria-label={labels.codeRegion(language ?? 'text')}
        className="relative overflow-x-auto px-4 py-3 text-[13px] leading-relaxed outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <code className="block whitespace-pre font-mono">{code}</code>
      </pre>
    </div>
  );
}
