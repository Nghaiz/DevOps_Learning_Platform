'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import { cn } from '@devops-platform/ui';
import { HUD_SCROLL_HIDDEN } from './top-bar.tsx';

export interface TranscriptLine {
  readonly id: number;
  readonly command: string;
  readonly output: string;
}

export interface TerminalTranscriptProps {
  readonly lines: readonly TranscriptLine[];
}

/**
 * Vùng kết quả của terminal.
 *
 * Tự giữ ref cuộn thay vì nhận từ trên xuống: "cuộn xuống đáy sau mỗi khối kết
 * quả" là hành vi của CHÍNH vùng này, và đẩy nó lên component cha buộc cha phải
 * biết vùng con cuộn ra sao — thứ nó không có việc gì phải biết.
 */
export function TerminalTranscript({ lines }: TerminalTranscriptProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Terminal đọc từ dưới lên: dòng mới nhất phải nằm trong tầm mắt, không phải ở đáy một vùng cuộn.
  useEffect(() => {
    const node = scrollRef.current;
    if (node !== null) {
      node.scrollTop = node.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        'min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-xs',
        HUD_SCROLL_HIDDEN,
      )}
    >
      {lines.map((line) => (
        <div key={line.id} className="mb-2">
          <p className="text-muted-foreground">
            <span className="text-primary">$ </span>
            {line.command}
          </p>
          {/*
            `whitespace-pre` chứ không `pre-wrap`: `parseKubectl` trả về bảng đã
            canh cột bằng dấu cách, và cho phép bẻ dòng là phá thẳng hàng của
            đúng cái bảng mà người học cần đọc theo cột. Tràn ngang thì cuộn
            ngang — trong một khung riêng, không phải cả trang.
          */}
          <pre className={cn('overflow-x-auto whitespace-pre text-foreground', HUD_SCROLL_HIDDEN)}>
            {line.output}
          </pre>
        </div>
      ))}
    </div>
  );
}
