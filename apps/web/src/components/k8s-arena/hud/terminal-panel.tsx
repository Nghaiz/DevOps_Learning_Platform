'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { SquareTerminal, X } from 'lucide-react';
import { Kbd, cn } from '@devops-platform/ui';
import type { ObjectView } from '@devops-platform/games';
import { applySuggestion, suggestTokens } from './terminal-suggest.ts';
import { TerminalSuggestionList } from './terminal-suggestion-list.tsx';
import { TerminalTranscript, type TranscriptLine } from './terminal-transcript.tsx';
import { useCommandHistory } from './terminal-history.ts';

/**
 * Lệnh do nơi khác chèn vào (bấm một dòng trong ngăn tra cứu).
 *
 * Mang `issuedAt` chứ không chỉ một chuỗi, cùng lý do đã ghi cho `CameraCommand`
 * trong hợp đồng: chèn LẠI đúng một lệnh là một SỰ KIỆN thứ hai, mà nếu mô hình
 * hoá bằng prop trạng thái thì lần bấm thứ hai không đổi prop nào và rơi vào hư
 * không.
 */
export interface TerminalInsert {
  readonly command: string;
  readonly issuedAt: number;
}

export interface TerminalPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Chạy lệnh, trả về văn bản đã định dạng sẵn theo kiểu kubectl thật. */
  readonly onRun: (command: string) => string;
  readonly listObjects: () => readonly ObjectView[];
  readonly insert: TerminalInsert | null;
}

/** Bao nhiêu khối kết quả giữ trên màn. Cắt để DOM không phình vô hạn trong một lượt chơi dài. */
const TRANSCRIPT_LIMIT = 100;

/**
 * Terminal trượt lên từ đáy.
 *
 * Bản cũ (`command-bar.tsx`) là một `<input>` LUÔN hiện giữa màn hình — nó chiếm
 * chỗ của cảnh 3D suốt lượt chơi kể cả khi người chơi đang dùng chuột. Ở đây nó
 * ẩn cho tới khi bấm dấu huyền, và Esc trả màn hình lại.
 *
 * ## Luật phím, viết ra vì hai nhóm phím tranh nhau mũi tên
 *
 * Mũi tên lên/xuống vừa là lịch sử lệnh (thói quen terminal) vừa là cách chọn
 * trong danh sách gợi ý. Ai thắng được quyết định bằng thứ ĐANG HIỆN: có gợi ý
 * trên màn thì mũi tên đi trong gợi ý; không có (ô trống, hoặc không khớp gì)
 * thì mũi tên đi trong lịch sử. Quy tắc này QUAN SÁT ĐƯỢC — người dùng nhìn thấy
 * danh sách nên đoán đúng phím sẽ làm gì, thay vì phải nhớ một tổ hợp.
 */
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
  const inputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);
  const appliedInsertRef = useRef(0);
  const history = useCommandHistory();

  const suggestions = open ? suggestTokens(input, listObjects()) : [];
  const active = suggestions[Math.min(highlight, suggestions.length - 1)] ?? null;

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (insert !== null && insert.issuedAt !== appliedInsertRef.current) {
      appliedInsertRef.current = insert.issuedAt;
      setInput(insert.command);
      setHighlight(0);
      inputRef.current?.focus();
    }
  }, [insert]);

  const run = (): void => {
    const command = input.trim();
    if (command === '') {
      return;
    }
    history.push(command);
    const output = onRun(command);
    setLines((previous) =>
      [...previous, { id: nextIdRef.current++, command, output }].slice(-TRANSCRIPT_LIMIT),
    );
    setInput('');
    setHighlight(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      // Chặn lan lên `window`: bộ nghe phím tắt toàn cục cũng nghe Escape, và
      // một lần bấm không được đóng hai lớp.
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Enter') {
      run();
      return;
    }
    if (event.key === 'Tab' && active !== null) {
      event.preventDefault();
      setInput(applySuggestion(input, active.value));
      setHighlight(0);
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    if (suggestions.length > 0) {
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((value) => (value + delta + suggestions.length) % suggestions.length);
      return;
    }
    const recalled = history.walk(event.key === 'ArrowUp' ? 1 : -1);
    if (recalled !== null) {
      setInput(recalled);
    }
  };

  return (
    <section
      aria-label="Terminal kubectl"
      inert={!open}
      className={cn(
        'absolute right-0 bottom-0 left-0 z-30 flex h-72 flex-col',
        'border-t border-border bg-card/95 shadow-elevation-3 backdrop-blur-sm',
        'transition-transform duration-(--motion-base) ease-out',
        open ? 'pointer-events-auto translate-y-0' : 'pointer-events-none translate-y-full',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <SquareTerminal className="size-4 text-primary" aria-hidden />
        <span className="text-xs font-semibold text-foreground">Terminal</span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <Kbd>Tab</Kbd> hoàn thành · <Kbd>Esc</Kbd> đóng
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng terminal"
          className="rounded-sm p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </header>

      <TerminalTranscript lines={lines} />

      <TerminalSuggestionList suggestions={suggestions} highlight={highlight} />

      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <span aria-hidden className="font-mono text-xs text-primary">
          $
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setHighlight(0);
            history.resetCursor();
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          aria-label="Gõ lệnh kubectl"
          placeholder="kubectl get pods"
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </section>
  );
}
