'use client';

import { useCallback, useState, type ReactElement } from 'react';

import type { OutputLine } from '@devops-platform/games';

/**
 * Bảng ghi lệnh + ô nhập, dùng chung cho **màn chơi level** và **màn sandbox**.
 *
 * Tách ra khỏi `git-game.tsx` vì hai màn dùng y hệt nhau phần này, và phần này
 * mang ba thứ dễ hỏng nếu sao chép: nhãn `$` mà ô nghiệm thu AC-L bám vào, vòng
 * duyệt lịch sử bằng ↑↓, và `Ctrl+Z` hoàn tác. Hai bản sao là hai chỗ để chúng
 * lệch nhau.
 *
 * ⚠ Lịch sử lệnh và ô nhập là trạng thái CỦA RIÊNG thanh này, không phải của
 * phiên chơi. Nâng chúng lên màn cha chỉ để rồi truyền ngược xuống là cách làm
 * cả hai màn phải nhớ cùng một thứ.
 */

export function OutputLog({ output }: { readonly output: readonly OutputLine[] }): ReactElement {
  return (
    <div
      className="max-h-40 overflow-auto px-4 py-2 font-mono text-xs"
      role="log"
      aria-label="Kết quả lệnh"
      aria-live="polite"
    >
      {output.map((line, i) => (
        <div key={`${String(i)}:${line.text}`} className={TONE_CLASS[line.tone]}>
          {line.text}
        </div>
      ))}
    </div>
  );
}

const TONE_CLASS: Record<OutputLine['tone'], string> = {
  plain: 'text-muted-foreground',
  success: 'text-success',
  warn: 'text-warning',
  error: 'text-destructive',
  hint: 'text-status-progress',
};

export interface CommandBarProps {
  /** Gọi khi người chơi Enter một dòng khác rỗng. */
  readonly onSubmit: (command: string) => void;
  /** Gọi khi người chơi bấm Ctrl+Z (hoặc Cmd+Z). */
  readonly onUndo: () => void;
  readonly placeholder?: string;
}

export function CommandBar({ onSubmit, onUndo, placeholder }: CommandBarProps): ReactElement {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<readonly string[]>([]);
  const [historyAt, setHistoryAt] = useState<number | null>(null);

  const submit = useCallback(() => {
    const raw = input.trim();
    if (raw === '') return;
    onSubmit(raw);
    setHistory((h) => [raw, ...h]);
    setHistoryAt(null);
    setInput('');
  }, [input, onSubmit]);

  return (
    <form
      className="flex items-center gap-2 border-t border-input px-4 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="git-command" className="font-mono text-sm text-muted-foreground">
        $
      </label>
      <input
        id="git-command"
        name="git-command"
        value={input}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder ?? 'git status'}
        onChange={(e) => {
          setInput(e.target.value);
        }}
        onKeyDown={(e) => {
          // ↑↓ duyệt lịch sử lệnh (17.I.3). Ctrl+Z hoàn tác một bước.
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const next = historyAt === null ? 0 : Math.min(historyAt + 1, history.length - 1);
            if (history[next] !== undefined) {
              setHistoryAt(next);
              setInput(history[next]);
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyAt === null) return;
            const next = historyAt - 1;
            if (next < 0) {
              setHistoryAt(null);
              setInput('');
            } else {
              setHistoryAt(next);
              setInput(history[next] ?? '');
            }
          } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onUndo();
          }
        }}
        className="flex-1 bg-transparent font-mono text-sm text-foreground focus-visible:outline-none"
      />
    </form>
  );
}
