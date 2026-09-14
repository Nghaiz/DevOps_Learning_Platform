'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { ArrowUpRight, Eraser, SquareTerminal, X } from 'lucide-react';
import type { ObjectView } from '@devops-platform/games';
import { applySuggestion, suggestTokens } from './terminal-suggest';
import { TerminalSuggestionList } from './terminal-suggestion-list';
import { TerminalTranscript, type TranscriptLine } from './terminal-transcript';
import { useCommandHistory } from './terminal-history';

export interface TerminalInsert {
  readonly command: string;
  readonly issuedAt: number;
  /**
   * `true` ⇒ CHẠY luôn, không chỉ điền vào ô.
   *
   * Đây là đường đi của các nút hành động trong bảng thông số (Xem log, Mô tả
   * chi tiết…). Chúng phải hiện KẾT QUẢ, và terminal là chỗ duy nhất trong arena
   * có chỗ in kết quả — xem khối tài liệu đầu `inspector-action-list.ts` về lý
   * do chúng không thể đi qua `dispatch`.
   *
   * Điền-mà-không-chạy vẫn giữ nguyên cho ngăn tra cứu: ở đó mục đích là mời
   * người học ĐỌC rồi tự bấm Enter, tức chính cú bấm đó là phần bài học.
   */
  readonly autoRun?: boolean;
}

export interface TerminalPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Chạy lệnh, trả về văn bản đã định dạng sẵn theo kiểu kubectl thật. */
  readonly onRun: (command: string) => string;
  readonly listObjects: () => readonly ObjectView[];
  readonly insert: TerminalInsert | null;
}

/** A fixed shell: output and completions never push the command line or the arena. */
export function TerminalPanel({
  open,
  onClose,
  onRun,
  listObjects,
  insert,
}: TerminalPanelProps): ReactElement {
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<readonly TranscriptLine[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const nextId = useRef(0);
  const appliedInsert = useRef(0);
  const listId = useId();
  const { push, walk, resetCursor } = useCommandHistory();
  const suggestions = open && !dismissed ? suggestTokens(input, listObjects()) : [];
  const activeIndex = Math.min(highlight, suggestions.length - 1);
  const active = suggestions[activeIndex];

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      if (document.activeElement === inputRef.current)
        previousFocus.current?.focus({ preventScroll: true });
    };
  }, [open]);

  const execute = useCallback(
    (command: string) => {
      if (!command.trim()) return;
      if (command.trim() === 'clear') {
        setLines([]);
        setInput('');
        return;
      }
      push(command);
      const output = onRun(command);
      const line = { id: ++nextId.current, command, output };
      setLines((previous) => [...previous, line].slice(-100));
      setInput('');
      setHighlight(0);
      setDismissed(false);
    },
    [onRun, push],
  );

  useEffect(() => {
    if (!insert || insert.issuedAt === appliedInsert.current) return;
    appliedInsert.current = insert.issuedAt;
    if (insert.autoRun) execute(insert.command);
    else setInput(insert.command);
    setHighlight(0);
    setDismissed(false);
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [insert, execute, open]);

  function complete(value: string): void {
    setInput(applySuggestion(input, value));
    setHighlight(0);
    setDismissed(false);
    inputRef.current?.focus({ preventScroll: true });
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      setLines([]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (suggestions.length) setDismissed(true);
      else onClose();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      execute(input.trim());
    } else if (event.key === 'Tab' && active) {
      event.preventDefault();
      complete(active.value);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (suggestions.length && !event.altKey)
        setHighlight(
          (value) =>
            (value + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) %
            suggestions.length,
        );
      else {
        const command = walk(event.key === 'ArrowUp' ? 1 : -1);
        if (command !== null) {
          setInput(command);
          setDismissed(true);
        }
      }
    }
  }
  return (
    <section
      aria-label="Terminal kubectl"
      inert={!open}
      aria-hidden={!open}
      data-open={open}
      className="arena-terminal"
    >
      <header className="arena-terminal-header">
        <SquareTerminal size={17} aria-hidden />
        <strong>kubectl</strong>
        <span className="arena-terminal-session">CLUSTER CONSOLE</span>
        <span className="arena-terminal-hint">Tab hoàn thành · Alt + ↑ lịch sử · Esc đóng</span>
        <button
          type="button"
          onClick={() => setLines([])}
          aria-label="Xoá màn hình terminal"
          title="Xoá màn hình (Ctrl+L)"
        >
          <Eraser size={16} />
        </button>
        <button type="button" onClick={onClose} aria-label="Đóng terminal">
          <X size={18} />
        </button>
      </header>
      <div className="arena-terminal-body">
        <div className="arena-terminal-output">
          {lines.length === 0 ? (
            <div className="arena-terminal-welcome">
              <span>ĐIỀU KHIỂN CỤM BẰNG LỆNH</span>
              <p>
                Bắt đầu với <code>kubectl get pods</code>
              </p>
              <small>Gợi ý dựa trên tài nguyên trong cụm. Chọn để điền, Enter để chạy.</small>
            </div>
          ) : null}
          <TerminalTranscript lines={lines} />
        </div>
        <aside
          className="arena-terminal-completions"
          aria-label="Gợi ý lệnh"
          hidden={suggestions.length === 0}
        >
          <span className="arena-terminal-section-title">HOÀN THÀNH LỆNH</span>
          <TerminalSuggestionList
            id={listId}
            suggestions={suggestions}
            highlight={highlight}
            onPick={complete}
          />
        </aside>
      </div>
      <form
        className="arena-terminal-input"
        onSubmit={(event) => {
          event.preventDefault();
          execute(input.trim());
        }}
      >
        <span aria-hidden>❯</span>
        <input
          ref={inputRef}
          value={input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={active ? `${listId}-${activeIndex}` : undefined}
          onChange={(event) => {
            setInput(event.target.value);
            setHighlight(0);
            setDismissed(false);
            resetCursor();
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          aria-label="Gõ lệnh kubectl"
          placeholder="kubectl get pods"
        />
        <button type="submit" disabled={!input.trim()} aria-label="Chạy lệnh">
          <span>Chạy</span>
          <ArrowUpRight size={16} />
        </button>
      </form>
    </section>
  );
}
