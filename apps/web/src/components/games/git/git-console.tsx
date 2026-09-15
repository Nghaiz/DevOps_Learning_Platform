'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { BookOpen, CornerDownLeft, Search, X } from 'lucide-react';
import { GIT_COMMANDS, GIT_VERBS, type OutputLine } from '@devops-platform/games';

export function OutputLog({ output }: { readonly output: readonly OutputLine[] }): ReactElement {
  const logRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (follow.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [output]);
  return (
    <div
      ref={logRef}
      className="git-output-log"
      role="log"
      aria-label="Kết quả lệnh"
      aria-live="polite"
      tabIndex={0}
      onScroll={(event) => {
        const log = event.currentTarget;
        follow.current = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      }}
    >
      {output.length === 0 && (
        <p className="git-terminal-empty">
          Chào mừng đến kho Git của bạn. Gõ lệnh để bắt đầu.
          <br />
          Mở Thư viện lệnh để tra cú pháp · ↑↓ lịch sử · Ctrl/Cmd + Z hoàn tác
        </p>
      )}
      {output.map((line, i) => (
        <div key={String(i) + ':' + line.text} className={TONE_CLASS[line.tone]}>
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
  readonly onSubmit: (command: string) => void;
  readonly onUndo: () => void;
  readonly placeholder?: string;
  readonly allowedCommands?: readonly string[] | null;
}
export function CommandBar({
  onSubmit,
  onUndo,
  placeholder,
  allowedCommands = null,
}: CommandBarProps): ReactElement {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<readonly string[]>([]);
  const [historyAt, setHistoryAt] = useState<number | null>(null);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [search, setSearch] = useState('');
  const draft = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const commands = GIT_VERBS.filter(
    (verb) =>
      (allowedCommands === null || allowedCommands.includes(verb)) &&
      (verb.includes(search.toLowerCase()) ||
        GIT_COMMANDS[verb].summary.toLowerCase().includes(search.toLowerCase())),
  );
  const submit = useCallback(() => {
    const raw = input.trim();
    if (!raw) return;
    onSubmit(raw);
    setHistory((items) => [raw, ...items]);
    setHistoryAt(null);
    setInput('');
    draft.current = '';
    inputRef.current?.focus();
  }, [input, onSubmit]);
  return (
    <>
      {referenceOpen && (
        <section
          className="git-command-reference"
          aria-label="Thư viện lệnh Git"
          id={id + '-reference'}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setReferenceOpen(false);
              inputRef.current?.focus();
            }
          }}
        >
          <header>
            <span>THƯ VIỆN LỆNH GIT</span>
            <button
              type="button"
              aria-label="Đóng thư viện lệnh"
              onClick={() => {
                setReferenceOpen(false);
                inputRef.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </header>
          <p>
            Chọn để điền tên lệnh, bổ sung tham số theo cú pháp rồi nhấn Enter. Chỉ hiển thị các
            lệnh được phép trong nhiệm vụ.
          </p>
          <label className="git-reference-search">
            <Search size={14} />
            <input
              aria-label="Tìm lệnh Git"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm lệnh hoặc chức năng…"
            />
          </label>
          {commands.length === 0 && <p>Không có lệnh phù hợp.</p>}
          {commands.map((verb) => (
            <button
              type="button"
              key={verb}
              onClick={() => {
                setInput('git ' + verb + ' ');
                setHistoryAt(null);
                setReferenceOpen(false);
                inputRef.current?.focus();
              }}
            >
              <code>{GIT_COMMANDS[verb].usage}</code>
              <small>{GIT_COMMANDS[verb].summary}</small>
            </button>
          ))}
        </section>
      )}
      <form
        className="git-command-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={id}>$</label>
        <input
          id={id}
          ref={inputRef}
          name="git-command"
          value={input}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder ?? 'Nhập lệnh Git…'}
          onChange={(event) => {
            setInput(event.target.value);
            setHistoryAt(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              if (historyAt === null) draft.current = input;
              const next = historyAt === null ? 0 : Math.min(historyAt + 1, history.length - 1);
              if (history[next] !== undefined) {
                setHistoryAt(next);
                setInput(history[next]);
              }
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (historyAt === null) return;
              const next = historyAt - 1;
              if (next < 0) {
                setHistoryAt(null);
                setInput(draft.current);
              } else {
                setHistoryAt(next);
                setInput(history[next] ?? '');
              }
            } else if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              onUndo();
            } else if (event.key === 'Escape') {
              setReferenceOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="git-button"
          aria-label="Thư viện lệnh"
          aria-expanded={referenceOpen}
          aria-controls={id + '-reference'}
          onClick={() => setReferenceOpen((open) => !open)}
        >
          <BookOpen size={16} />
          <span className="git-reference-label">Thư viện lệnh</span>
        </button>
        <button
          type="submit"
          className="git-button git-button-primary"
          disabled={!input.trim()}
          aria-label="Chạy lệnh"
        >
          <span className="git-send-label">Chạy</span>
          <CornerDownLeft size={16} />
        </button>
      </form>
    </>
  );
}
